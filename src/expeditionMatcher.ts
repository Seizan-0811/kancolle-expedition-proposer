/**
 * 遠征編成マッチャー
 *
 * 所持艦娘のリストと遠征リストを受け取り、
 * 「同一艦娘が複数の遠征に重複しない」最適な同時編成を提案する。
 *
 * アルゴリズム:
 *   1. 各遠征について条件を満たす候補 (CandidateFleet) を列挙する
 *   2. 遠征の優先度順 (候補数が少ない順) にグリーディで艦娘を割り当てる
 *   3. 割り当てた艦娘は他の遠征から除外する
 *
 * 制約:
 *   - 装備の重複チェックは未実装 (Step3 の scope 外)
 *   - ステータス計算は stats フィールドが未提供の場合は null を返す
 */

import type {
  Expedition,
  OwnedShip,
  RequiredTypePattern,
  ShipStats,
  FleetSuggestion,
  MatchResult,
} from './types';

// ---------------------------------------------------------------------------
// 艦種別推定装備火力ボーナス
// ---------------------------------------------------------------------------
/**
 * 遠征要件の火力チェック時に加算する推定装備ボーナス。
 * 素ステータスだけでは火力要件を達成しにくいため、
 * 艦種ごとの典型的な装備による火力上乗せ分を見込む。
 */
const EQUIPMENT_FIRE_BONUS: Record<number, number> = {
  1:  10, // DE  海防艦   (小口径主砲×2 程度)
  2:  20, // DD  駆逐艦   (主砲×2 程度)
  3:  25, // CL  軽巡     (主砲×2〜3)
  4:  25, // CLT 雷巡     (主砲×2〜3)
  5:  40, // CA  重巡     (20.3cm×3 = +39〜45)
  6:  35, // CAV 航巡     (20.3cm×2〜3)
  7:  20, // CVL 軽母
  8:  80, // FBB 高速戦艦
  9:  80, // BB  戦艦
  10: 80, // BBV 航戦
  11: 20, // CV  空母
  13: 0,  // SS  潜水
  14: 0,  // SSV 潜水空母
  16: 20, // AV  水母
  18: 20, // CVB 装甲空母
  20: 0,  // AS  潜水母艦
  21: 25, // CT  練巡
};

// ---------------------------------------------------------------------------
// 艦種別推定装備対潜ボーナス
// ---------------------------------------------------------------------------
/**
 * 遠征要件の対潜チェック時に加算する推定装備ボーナス。
 * 艦種ごとの典型的な対潜装備（ソナー×2＋爆雷など）による上乗せ分を見込む。
 */
const EQUIPMENT_ASW_BONUS: Record<number, number> = {
  1:  30, // DE  海防艦   (ソナー×2＋爆雷 程度)
  2:  35, // DD  駆逐艦   (ソナー×2＋爆雷 程度)
  3:  20, // CL  軽巡     (ソナー×1〜2)
  4:  15, // CLT 雷巡
  5:  10, // CA  重巡     (ソナー×1 程度)
  6:  10, // CAV 航巡
  7:  15, // CVL 軽母     (対潜哨戒機)
  8:   0, // FBB 高速戦艦
  9:   0, // BB  戦艦
  10: 10, // BBV 航戦     (水上機による対潜)
  11:  0, // CV  空母
  13: 20, // SS  潜水      (潜水艦搭載電探&水中探信儀 等 ×1〜2)
  14: 20, // SSV 潜水空母 (同上)
  16: 10, // AV  水母
  18:  0, // CVB 装甲空母
  20: 20, // AS  潜水母艦 (ソナー系装備可)
  21: 15, // CT  練巡
};
import { SHIP_TYPE_IDS } from './types';
import { sumFleetStats, meetsStats } from './shipStats';

// ---------------------------------------------------------------------------
// 高コスト艦種 (燃費が高いため可能な限り避ける)
// ---------------------------------------------------------------------------
/**
 * FBB=8, BB=9, BBV=10: 戦艦系
 * CV=11, CVB=18: 正規空母・装甲空母
 * CVL(7)・AV(16) は低コストとして扱い、同じスロットを埋められる場合に優先する
 */
const EXPENSIVE_TYPES = new Set([8, 9, 10, 11, 18]);

// ---------------------------------------------------------------------------
// 艦種判定ヘルパー
// ---------------------------------------------------------------------------

/**
 * 艦娘が指定の艦種略称に該当するか判定する
 */
function matchesShipTypeAbbr(ship: OwnedShip, abbr: string): boolean {
  const allowed = SHIP_TYPE_IDS[abbr as keyof typeof SHIP_TYPE_IDS];
  if (!allowed) return false;
  return allowed.includes(ship.shipTypeId);
}

// ---------------------------------------------------------------------------
// 候補艦隊の生成
// ---------------------------------------------------------------------------

/**
 * 1 つの required type パターンに対してバックトラック法で有効な編成候補を生成する。
 *
 * @param ships          - 利用可能な艦娘リスト
 * @param pattern        - 必要艦種パターン (e.g. { CL: 1, DD: 2 })
 * @param minCount       - 最低艦数
 * @param maxCount       - 最大艦数 (通常 6)
 * @param minFlagshipLv  - 旗艦最低レベル
 * @param totalLevel     - 艦隊合計レベル最低値
 * @param maxResults     - 返す候補の最大数 (探索が爆発しないよう制限)
 * @returns 有効な編成の配列 (各編成は艦娘リスト; 先頭が旗艦候補)
 */
function findCandidates(
  ships: OwnedShip[],
  pattern: RequiredTypePattern,
  minCount: number,
  maxCount: number,
  minFlagshipLv: number,
  totalLevel: number,
  maxResults = 20,
  minDaihatsu = 0,
): OwnedShip[][] {
  const results: OwnedShip[][] = [];

  // 必須艦種エントリをリストに展開する (複数必要な艦種は複数エントリ)
  const required: string[] = [];
  for (const [abbr, count] of Object.entries(pattern)) {
    if (count != null) {
      for (let i = 0; i < count; i++) {
        required.push(abbr);
      }
    }
  }

  // 必須枠を満たしつつ自由枠も埋めるバックトラック
  // current: 現在選択中の艦娘インデックス (ships への参照)
  const chosen: number[] = [];
  const usedIndices = new Set<number>();

  function backtrack(reqIdx: number): void {
    if (results.length >= maxResults) return;

    if (reqIdx === required.length) {
      // 必須艦種がすべて確定 → 自由枠を埋めて最低艦数を確保
      const freeSlots = minCount - chosen.length;
      if (freeSlots <= 0) {
        // すでに最低艦数以上 → 記録
        commitFleet();
        return;
      }
      // 自由枠を埋める (任意の艦種)
      fillFreeSlots(freeSlots, maxCount - chosen.length);
      return;
    }

    const abbr = required[reqIdx];
    for (let i = 0; i < ships.length; i++) {
      if (results.length >= maxResults) return;
      if (usedIndices.has(i)) continue;
      if (!matchesShipTypeAbbr(ships[i], abbr)) continue;
      chosen.push(i);
      usedIndices.add(i);
      backtrack(reqIdx + 1);
      chosen.pop();
      usedIndices.delete(i);
    }
  }

  function fillFreeSlots(need: number, maxExtra: number): void {
    if (need <= 0) {
      commitFleet();
      return;
    }
    if (maxExtra <= 0) return; // これ以上追加できない
    for (let i = 0; i < ships.length; i++) {
      if (results.length >= maxResults) return;
      if (usedIndices.has(i)) continue;
      chosen.push(i);
      usedIndices.add(i);
      fillFreeSlots(need - 1, maxExtra - 1);
      chosen.pop();
      usedIndices.delete(i);
    }
  }

  function commitFleet(): void {
    const fleet = chosen.map((i) => ships[i]);
    // 旗艦レベルチェック (先頭艦が旗艦)
    // 旗艦は最大レベルの艦を優先する => フリートをソート後に先頭を確認
    const sorted = [...fleet].sort((a, b) => b.level - a.level);
    if (sorted[0].level < minFlagshipLv) return;
    // 合計レベルチェック
    const lvSum = fleet.reduce((s, sh) => s + sh.level, 0);
    if (lvSum < totalLevel) return;
    // 大発装備可能艦娘の最低人数チェック
    if (minDaihatsu > 0) {
      const dCount = fleet.filter((s) => s.canDaihatsu).length;
      if (dCount < minDaihatsu) return;
    }
    results.push(sorted);
  }

  backtrack(0);
  return results;
}

// ---------------------------------------------------------------------------
// 遠征マッチャー本体
// ---------------------------------------------------------------------------

/**
 * 複数の遠征に対してまとめて編成を提案する。
 * 同一艦娘が 2 つ以上の遠征フリートに入らないよう制御する。
 *
 * アルゴリズム改訂:
 *   旧実装は全艦娘から最大 20 候補を事前計算し、その 20 件がすべて
 *   割り当て済みと被ると「不足」と誤判定していた。
 *   新実装は処理順序の決定 (難易度スコア) のみ全艦娘で行い、
 *   実際の候補生成は「その時点で残っている艦娘」から毎回再計算する。
 *
 * @param availableShips  - 所持艦娘リスト
 * @param expeditions     - 提案対象の遠征リスト
 * @returns MatchResult
 */
export function matchExpeditions(
  availableShips: OwnedShip[],
  expeditions: Expedition[],
): MatchResult {
  function shipKey(ship: OwnedShip): string {
    return ship.uniqueId > 0
      ? `u:${ship.uniqueId}`
      : `m:${ship.masterId}:${ship.name}`;
  }

  // Step 1: 全艦娘での候補数を難易度スコアとして計算し、処理順序を決める
  //         minDaihatsu 制約込みで候補を数えることで、大発確保が難しい遠征も
  //         スコアが低くなり自然に先に処理されるようになる
  //         さらに火力要件が高い遠征はスコアを下げて優先処理する
  //         （候補数が多くても火力達成が難しければ先に高火力艦を確保するべきため）
  const ranked = expeditions.map((exp) => {
    let score = 0;
    for (const pattern of exp.requiredTypes) {
      score += findCandidates(
        availableShips,
        pattern,
        exp.minShipCount,
        6,
        exp.minFlagshipLv,
        exp.totalLevel,
        5, // スコア用なので少数でよい
        exp.minDaihatsu ?? 0,
      ).length;
    }
    // 火力・対潜要件が高い遠征は候補数スコアを減らして優先処理（高ステータス艦を先に確保）
    const fireReq = exp.statRequirements?.fire ?? 0;
    const aswReq  = exp.statRequirements?.asw  ?? 0;
    if (fireReq >= 500 || aswReq >= 200) score = Math.floor(score * 0.3);
    else if (fireReq >= 300 || aswReq >= 100) score = Math.floor(score * 0.6);
    return { expedition: exp, score };
  });
  // 候補が少ない (難しい) 遠征を先に処理する
  ranked.sort((a, b) => a.score - b.score);

  // Step 2: 処理順に「残り艦娘」から候補を再計算して割り当て
  const assignedShipIds = new Set<string>();
  const suggestions: FleetSuggestion[] = [];
  const unmatched: string[] = [];

  for (const { expedition } of ranked) {
    // 未割当艦娘のみに絞り込む
    // ソート: 高コスト艦 (戦艦・正規/装甲空母) を後回しにし、同グループ内は
    //         火力・対潜の複合スコア降順（それぞれ遠征要件で正規化して合算）
    // → バックトラックが軽空母・駆逐等を先に試すため、最初の20候補が低コスト寄りになる
    const fireReq = expedition.statRequirements?.fire ?? 0;
    const aswReq  = expedition.statRequirements?.asw  ?? 0;
    const remaining = availableShips
      .filter((s) => !assignedShipIds.has(shipKey(s)))
      .sort((a, b) => {
        const expA = EXPENSIVE_TYPES.has(a.shipTypeId) ? 1 : 0;
        const expB = EXPENSIVE_TYPES.has(b.shipTypeId) ? 1 : 0;
        if (expA !== expB) return expA - expB; // 高コスト艦を後ろへ
        // 同グループ内: 火力＋対潜の複合スコア降順
        const scoreA = (fireReq > 0 ? ((a.stats?.fire ?? 0) + (EQUIPMENT_FIRE_BONUS[a.shipTypeId] ?? 0)) / fireReq * 1.5 : 0)
                     + (aswReq  > 0 ? ((a.stats?.asw  ?? 0) + (EQUIPMENT_ASW_BONUS [a.shipTypeId] ?? 0)) / aswReq        : 0);
        const scoreB = (fireReq > 0 ? ((b.stats?.fire ?? 0) + (EQUIPMENT_FIRE_BONUS[b.shipTypeId] ?? 0)) / fireReq * 1.5 : 0)
                     + (aswReq  > 0 ? ((b.stats?.asw  ?? 0) + (EQUIPMENT_ASW_BONUS [b.shipTypeId] ?? 0)) / aswReq        : 0);
        return scoreB - scoreA;
      });

    // 残り艦娘から候補を収集 (大発制約あり)
    // → 制約を満たす候補がなければ制約なしにフォールバック
    const minDaihatsu = expedition.minDaihatsu ?? 0;
    let allCandidates: OwnedShip[][] = [];

    if (minDaihatsu > 0) {
      for (const pattern of expedition.requiredTypes) {
        const candidates = findCandidates(
          remaining,
          pattern,
          expedition.minShipCount,
          6,
          expedition.minFlagshipLv,
          expedition.totalLevel,
          20,
          minDaihatsu,
        );
        allCandidates.push(...candidates);
        if (allCandidates.length >= 20) break;
      }
    }

    // 制約付き候補がなければ制約なしで再生成 (フォールバック)
    const daihatsuConstraintApplied = allCandidates.length > 0;
    if (allCandidates.length === 0) {
      for (const pattern of expedition.requiredTypes) {
        const candidates = findCandidates(
          remaining,
          pattern,
          expedition.minShipCount,
          6,
          expedition.minFlagshipLv,
          expedition.totalLevel,
          20,
        );
        allCandidates.push(...candidates);
        if (allCandidates.length >= 20) break;
      }
    }

    // ソート優先順位:
    //   1. 高コスト艦 (戦艦・正規/装甲空母) を含まない艦隊を優先
    //      → 軽空母・水母で代替できる場合はそちらを採用
    //   2. 高コスト艦なし同士: 有効火力比降順 → 燃費昇順
    //   3. 高コスト艦あり同士: 燃費昇順 (消費の少ない艦を優先) → 火力比降順
    // パフォーマンス: ソート前にキーを一括計算してキャッシュする
    // EXPENSIVE_TYPES はモジュールレベルで定義済み
    // fireReq / aswReq はこのループの先頭で宣言済み
    const computeStatRatio = (fleet: OwnedShip[]) => {
      const stats = fleet.map((s) => s.stats).filter((s): s is ShipStats => s != null);
      if (stats.length !== fleet.length) return 0;
      const fleetStats = sumFleetStats(stats);
      let ratio = 0;
      if (fireReq > 0) {
        const bonus = fleet.reduce((sum, s) => sum + (EQUIPMENT_FIRE_BONUS[s.shipTypeId] ?? 0), 0);
        ratio += (fleetStats.fire + bonus) / fireReq * 1.5;
      }
      if (aswReq > 0) {
        const bonus = fleet.reduce((sum, s) => sum + (EQUIPMENT_ASW_BONUS[s.shipTypeId] ?? 0), 0);
        ratio += (fleetStats.asw + bonus) / aswReq;
      }
      if (fireReq === 0 && aswReq === 0) return 1;
      return ratio;
    };
    const keys = allCandidates.map((fleet) => ({
      fleet,
      hasExpensive: fleet.some((s) => EXPENSIVE_TYPES.has(s.shipTypeId)) ? 1 : 0,
      fuel: fleet.every((s) => s.fuel != null)
        ? fleet.reduce((acc, s) => acc + s.fuel!, 0)
        : Infinity,
      statRatio: computeStatRatio(fleet),
    }));
    keys.sort((a, b) => {
      // 高コスト艦なしを優先
      if (a.hasExpensive !== b.hasExpensive) return a.hasExpensive - b.hasExpensive;
      if (a.hasExpensive === 0) {
        // 両方高コスト艦なし: 複合スタット比降順 → 燃費昇順
        const diff = b.statRatio - a.statRatio;
        if (Math.abs(diff) > 0.001) return diff;
        return a.fuel - b.fuel;
      } else {
        // 両方高コスト艦あり: 燃費昇順 → 複合スタット比降順
        if (a.fuel !== b.fuel) return a.fuel - b.fuel;
        return b.statRatio - a.statRatio;
      }
    });
    allCandidates = keys.map((k) => k.fleet);

    // 大発制約が有効な場合は決定的に最善候補を選ぶ (PICK_TOP=1)
    // フォールバック時のみランダム性を維持 (PICK_TOP=3)
    const PICK_TOP = daihatsuConstraintApplied ? 1 : 3;
    const pool = allCandidates.slice(0, PICK_TOP);
    const chosen: OwnedShip[] | null =
      pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

    if (!chosen) {
      unmatched.push(expedition.id);
      continue;
    }

    // 割り当て済みに追加
    for (const ship of chosen) {
      assignedShipIds.add(shipKey(ship));
    }

    // ステータス集計
    const statsList = chosen.map((s) => s.stats).filter((s): s is ShipStats => s != null);
    const totalStats = statsList.length === chosen.length ? sumFleetStats(statsList) : null;
    // 推定装備ボーナス（火力・対潜）を加味した有効ステータスで要件チェック (表示は素ステータスのまま)
    const equipFireBonus = chosen.reduce((sum, s) => sum + (EQUIPMENT_FIRE_BONUS[s.shipTypeId] ?? 0), 0);
    const equipAswBonus  = chosen.reduce((sum, s) => sum + (EQUIPMENT_ASW_BONUS [s.shipTypeId] ?? 0), 0);
    const effectiveStats = totalStats
      ? { ...totalStats, fire: totalStats.fire + equipFireBonus, asw: totalStats.asw + equipAswBonus }
      : null;
    const meetsStat = effectiveStats ? meetsStats(effectiveStats, expedition.statRequirements) : null;

    // 燃料・弾薬消費量 (全艦の値が揃っている場合のみ計算)
    const fuelList = chosen.map((s) => s.fuel).filter((f): f is number => f != null);
    const ammoList = chosen.map((s) => s.ammo).filter((a): a is number => a != null);
    const consumedFuel = fuelList.length === chosen.length
      ? Math.floor(fuelList.reduce((a, b) => a + b, 0) * expedition.fuelRate / 100)
      : null;
    const consumedAmmo = ammoList.length === chosen.length
      ? Math.floor(ammoList.reduce((a, b) => a + b, 0) * expedition.ammoRate / 100)
      : null;

    suggestions.push({
      expeditionId: expedition.id,
      expeditionName: expedition.name,
      ships: chosen,
      meetsStatRequirements: meetsStat,
      totalStats,
      consumedFuel,
      consumedAmmo,
    });
  }

  // 元の選択順序に戻して返す
  const expeditionOrder = expeditions.map((e) => e.id);
  suggestions.sort(
    (a, b) => expeditionOrder.indexOf(a.expeditionId) - expeditionOrder.indexOf(b.expeditionId),
  );

  return { suggestions, unmatched };
}

// ---------------------------------------------------------------------------
// 単一遠征向けヘルパー
// ---------------------------------------------------------------------------

/**
 * 指定した 1 つの遠征に対して編成候補を返す (重複チェックなし)。
 * 候補が多すぎる場合は上位 10 件を返す。
 */
export function suggestForOneExpedition(
  availableShips: OwnedShip[],
  expedition: Expedition,
): FleetSuggestion[] {
  const allCandidates: OwnedShip[][] = [];
  for (const pattern of expedition.requiredTypes) {
    const found = findCandidates(
      availableShips,
      pattern,
      expedition.minShipCount,
      6,
      expedition.minFlagshipLv,
      expedition.totalLevel,
      10,
    );
    allCandidates.push(...found);
    if (allCandidates.length >= 10) break;
  }

  return allCandidates.slice(0, 10).map((fleet) => {
    const statsList = fleet.map((s) => s.stats).filter((s): s is ShipStats => s != null);
    let totalStats: ShipStats | null = null;
    let meetsStat: boolean | null = null;
    if (statsList.length === fleet.length) {
      totalStats = sumFleetStats(statsList);
      const equipFireBonus = fleet.reduce((sum, s) => sum + (EQUIPMENT_FIRE_BONUS[s.shipTypeId] ?? 0), 0);
      const equipAswBonus  = fleet.reduce((sum, s) => sum + (EQUIPMENT_ASW_BONUS [s.shipTypeId] ?? 0), 0);
      meetsStat = meetsStats(
        { ...totalStats, fire: totalStats.fire + equipFireBonus, asw: totalStats.asw + equipAswBonus },
        expedition.statRequirements,
      );
    }
    const fuelList = fleet.map((s) => s.fuel).filter((f): f is number => f != null);
    const ammoList = fleet.map((s) => s.ammo).filter((a): a is number => a != null);
    const consumedFuel = fuelList.length === fleet.length
      ? Math.floor(fuelList.reduce((a, b) => a + b, 0) * expedition.fuelRate / 100)
      : null;
    const consumedAmmo = ammoList.length === fleet.length
      ? Math.floor(ammoList.reduce((a, b) => a + b, 0) * expedition.ammoRate / 100)
      : null;
    return {
      expeditionId: expedition.id,
      expeditionName: expedition.name,
      ships: fleet,
      meetsStatRequirements: meetsStat,
      totalStats,
      consumedFuel,
      consumedAmmo,
    };
  });
}
