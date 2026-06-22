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
  15: 10, // AO  補給艦
  16: 20, // AV  水母
  17: 10, // LHA 揚陸艦
  18: 20, // CVB 装甲空母
  20: 0,  // AS  潜水母艦
  21: 25, // CT  練巡
  22: 0,  // AR  工作艦
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
  15:  0, // AO  補給艦
  16: 10, // AV  水母
  17:  0, // LHA 揚陸艦
  18:  0, // CVB 装甲空母
  20: 20, // AS  潜水母艦 (ソナー系装備可)
  21: 15, // CT  練巡
  22:  0, // AR  工作艦
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
  flagshipType?: string,
): OwnedShip[][] {
  const results: OwnedShip[][] = [];
  // 候補が 1 件も見つからない場合でもバックトラックが全組み合わせを走破しないよう
  // イテレーション上限を設ける。有効な編成が存在する場合は先頭候補がすぐ見つかる
  // （残艦娘は火力降順ソート済み）ため、上限に達することは通常ない。
  let iterations = 0;
  const MAX_ITER = 100_000;

  // 必須艦種エントリをリストに展開する (複数必要な艦種は複数エントリ)
  const required: string[] = [];
  for (const [abbr, count] of Object.entries(pattern)) {
    if (count != null) {
      for (let i = 0; i < count; i++) {
        required.push(abbr);
      }
    }
  }

  // -----------------------------------------------------------------------
  // minDaihatsu 早期不可能判定
  // -----------------------------------------------------------------------
  // fillFreeSlots は必須スロットを埋めた後に「minCount - chosen.length」枠だけ
  // 自由枠を追加する（最低艦数を確保するための必須自由枠）。
  // 必須艦種スロット + 必須自由枠の合計で実現できる大発最大数が minDaihatsu を
  // 下回る場合、どの組み合わせを試しても commitFleet が必ず失敗するため
  // バックトラック（高コスト）を開始する前に空を返す。
  //
  // 例: D2（AS×1+SS×3, minShipCount=5, minDaihatsu=2）
  //   必須自由枠 = 5 - 4 = 1, AS/SS は大発不可 → 大発上限 = 0 + 1 = 1 < 2 → 早期リターン
  if (minDaihatsu > 0) {
    // 必須スロットから実現できる大発数の上限（各艦種で canDaihatsu=true の艦の数と
    // 必要数の小さい方を合算）
    let maxDaihatsuFromRequired = 0;
    for (const [abbr, count] of Object.entries(pattern)) {
      const n = count ?? 0;
      const d = ships.filter((s) => matchesShipTypeAbbr(s, abbr) && s.canDaihatsu).length;
      maxDaihatsuFromRequired += Math.min(n, d);
    }
    // 必須自由枠（minCount に達するまでの追加枠）から実現できる大発数の上限
    const mandatoryFreeSlots = Math.max(0, minCount - required.length);
    const availableDaihatsu = ships.filter((s) => s.canDaihatsu).length;
    const maxDaihatsuFromFree = Math.min(availableDaihatsu, mandatoryFreeSlots);

    if (maxDaihatsuFromRequired + maxDaihatsuFromFree < minDaihatsu) {
      return [];
    }
  }

  // 必須枠を満たしつつ自由枠も埋めるバックトラック
  // current: 現在選択中の艦娘インデックス (ships への参照)
  const chosen: number[] = [];
  const usedIndices = new Set<number>();

  function backtrack(reqIdx: number): void {
    if (results.length >= maxResults) return;
    if (++iterations > MAX_ITER) return;

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
      if (iterations > MAX_ITER) return;
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
      // 必須艦数を確保した後、残りの上限枠（オプション枠）に大発可能艦を追加する。
      // 大発動艇は遠征報酬にボーナスを与えるため、空き枠がある限り追加を試みる。
      // ships は tier0（DD 優先）でソート済みのため、最初に見つかる大発可能艦は
      // 自然と大発可能 DD になる。
      // 再帰的に試みることで、空き枠の数だけ大発艦を積み上げる（最大 maxExtra 枠）。
      if (maxExtra > 0) {
        for (let i = 0; i < ships.length; i++) {
          if (results.length >= maxResults) break;
          if (usedIndices.has(i)) continue;
          if (!ships[i].canDaihatsu) continue;
          chosen.push(i);
          usedIndices.add(i);
          fillFreeSlots(0, maxExtra - 1); // さらにオプション枠を試みる（再帰）
          chosen.pop();
          usedIndices.delete(i);
          break; // 1 隻追加できれば終了（必須枠の組み合わせ多様性を維持）
        }
      }
      commitFleet(); // 大発追加なし（またはオプション枠なし）でも必ず commit
      return;
    }
    if (maxExtra <= 0) return; // これ以上追加できない
    if (iterations > MAX_ITER) return;
    // 第1パス: 大発可能艦を優先して自由枠に選ぶ
    // 第2パス: 大発可能艦がいない場合のみ任意の艦にフォールバック
    for (const requireDaihatsu of [true, false]) {
      for (let i = 0; i < ships.length; i++) {
        if (results.length >= maxResults) return;
        if (iterations > MAX_ITER) return;
        if (usedIndices.has(i)) continue;
        if (requireDaihatsu && !ships[i].canDaihatsu) continue;
        chosen.push(i);
        usedIndices.add(i);
        const prevCount = results.length;
        fillFreeSlots(need - 1, maxExtra - 1);
        chosen.pop();
        usedIndices.delete(i);
        // 自由枠は必須枠の組み合わせ多様性を確保するため 1 件見つかれば終了
        // → 各必須枠組み合わせから最大 1 候補を生成し、より多くの必須枠パターンを試す
        if (results.length > prevCount) return;
      }
    }
  }

  function commitFleet(): void {
    const fleet = chosen.map((i) => ships[i]);
    // 同一艦（改装形態違い含む）の重複チェック
    // 艦名から改装サフィックスを除いた基本艦名で比較する
    // 例: 最上改二 / 最上改二特 → 最上、瑞鶴改二甲 → 瑞鶴、Gambier Bay Mk.II → Gambier Bay
    const baseNames = fleet.map((s) =>
      s.name
        .replace(/改[二三四]?[特甲乙丙]?$/, '')
        .replace(/\s*Mk\.\s*I{1,3}$/i, '')
        .trim(),
    );
    if (new Set(baseNames).size !== baseNames.length) return;
    // 旗艦の決定:
    //   flagshipType が指定されている場合は、その艦種の中で最高レベルの艦を旗艦にする
    //   指定がない場合は最高レベルの艦を旗艦にする（従来の挙動）
    let sorted: OwnedShip[];
    if (flagshipType) {
      const flagshipCandidates = fleet.filter((s) => matchesShipTypeAbbr(s, flagshipType));
      if (flagshipCandidates.length === 0) return; // 旗艦候補なし → 無効
      const flagship = flagshipCandidates.reduce((best, s) => (s.level > best.level ? s : best));
      sorted = [flagship, ...fleet.filter((s) => s !== flagship).sort((a, b) => b.level - a.level)];
    } else {
      sorted = [...fleet].sort((a, b) => b.level - a.level);
    }
    // 旗艦レベルチェック
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
        exp.flagshipType,
      ).length;
    }
    // 火力要件が高い遠征は候補数スコアを減らして優先処理（高火力艦を先に確保）
    const fireReq = exp.statRequirements?.fire ?? 0;
    if (fireReq >= 500) score = Math.floor(score * 0.3);
    else if (fireReq >= 300) score = Math.floor(score * 0.6);
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
    // ソート優先順位（バックトラックが試す順序 = 自由枠で最初に選ばれる順序）:
    //   tier 0: DD / asw>0 の DE（最優先 — 燃費◎、汎用性高）
    //   tier 1: その他の非高コスト艦（CL, CA, CVL, AV 等）
    //   tier 2: 高コスト艦（戦艦・正規/装甲空母）
    //   同 tier 内は火力降順
    const remaining = availableShips
      .filter((s) => !assignedShipIds.has(shipKey(s)))
      .sort((a, b) => {
        const tierOf = (s: OwnedShip) => {
          if (s.shipTypeId === 2 || (s.shipTypeId === 1 && (s.stats?.asw ?? 0) > 0)) return 0;
          if (EXPENSIVE_TYPES.has(s.shipTypeId)) return 2;
          return 1;
        };
        const tA = tierOf(a), tB = tierOf(b);
        if (tA !== tB) return tA - tB;
        return (b.stats?.fire ?? 0) - (a.stats?.fire ?? 0);
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
          expedition.flagshipType,
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
          0,
          expedition.flagshipType,
        );
        allCandidates.push(...candidates);
        if (allCandidates.length >= 20) break;
      }
    }

    // ソート優先順位:
    //   1. 高コスト艦 (戦艦・正規/装甲空母) を含まない艦隊を優先
    //   2. DD / DE（海防戦艦除く = asw > 0 の DE）の人数が多い艦隊を優先
    //   3. スタット比降順（火力・対潜要件への近さ）
    // パフォーマンス: ソート前にキーを一括計算してキャッシュする

    // DD または asw > 0 の DE（海防戦艦を除く）を優先艦と定義
    const isPreferred = (s: OwnedShip) =>
      s.shipTypeId === 2 || (s.shipTypeId === 1 && (s.stats?.asw ?? 0) > 0);

    const fireReq = expedition.statRequirements?.fire ?? 0;
    const aswReq  = expedition.statRequirements?.asw  ?? 0;
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
        const bonus = fleet.reduce((sum, s) =>
          (s.stats?.asw ?? 0) === 0 ? sum : sum + (EQUIPMENT_ASW_BONUS[s.shipTypeId] ?? 0), 0);
        ratio += (fleetStats.asw + bonus) / aswReq;
      }
      if (fireReq === 0 && aswReq === 0) return 1;
      return ratio;
    };
    const keys = allCandidates.map((fleet) => {
      const fuelList = fleet.map((s) => s.fuel).filter((f): f is number => f != null);
      const totalFuel = fuelList.length === fleet.length ? fuelList.reduce((a, b) => a + b, 0) : null;
      return {
        fleet,
        hasExpensive:   fleet.some((s) => EXPENSIVE_TYPES.has(s.shipTypeId)) ? 1 : 0,
        preferredCount: fleet.filter(isPreferred).length,
        statRatio:      computeStatRatio(fleet),
        totalFuel,
      };
    });
    keys.sort((a, b) => {
      // 1. 高コスト艦なしを優先
      if (a.hasExpensive !== b.hasExpensive) return a.hasExpensive - b.hasExpensive;
      // 2. DD/DE（海防戦艦除く）の人数が多い艦隊を優先
      if (a.preferredCount !== b.preferredCount) return b.preferredCount - a.preferredCount;
      // 3. スタット比降順（差が 0.05 以上の場合のみ優先; それ以下は燃料で判断）
      const ratioDiff = b.statRatio - a.statRatio;
      if (Math.abs(ratioDiff) >= 0.05) return ratioDiff;
      // 4. 燃料消費昇順（少ない方を優先; fuel データがない場合はスキップ）
      if (a.totalFuel != null && b.totalFuel != null && a.totalFuel !== b.totalFuel) {
        return a.totalFuel - b.totalFuel;
      }
      return ratioDiff;
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
    const equipAswBonus  = chosen.reduce((sum, s) =>
      (s.stats?.asw ?? 0) === 0 ? sum : sum + (EQUIPMENT_ASW_BONUS[s.shipTypeId] ?? 0), 0);
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
      0,
      expedition.flagshipType,
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
      const equipAswBonus  = fleet.reduce((sum, s) =>
        (s.stats?.asw ?? 0) === 0 ? sum : sum + (EQUIPMENT_ASW_BONUS[s.shipTypeId] ?? 0), 0);
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
