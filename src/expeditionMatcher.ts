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
import { SHIP_TYPE_IDS } from './types';
import { sumFleetStats, meetsStats } from './shipStats';

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
  //         (スコア算出は少数サンプルで十分; 実割り当てには使わない)
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
      ).length;
    }
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
    const remaining = availableShips.filter((s) => !assignedShipIds.has(shipKey(s)));

    // 残り艦娘から複数候補を収集し、燃料消費が少ない順にソートして採用
    const allCandidates: OwnedShip[][] = [];
    for (const pattern of expedition.requiredTypes) {
      const candidates = findCandidates(
        remaining,
        pattern,
        expedition.minShipCount,
        6,
        expedition.minFlagshipLv,
        expedition.totalLevel,
        20, // 燃費ソートのために複数取得
      );
      allCandidates.push(...candidates);
      if (allCandidates.length >= 20) break;
    }

    // 大発装備可能艦娘が 2 隻以上の候補を優先プールへ (ソフト制約)
    // → 2 隻以上含む候補がない場合は制約なしにフォールバック
    const daihatsuPool = allCandidates.filter(
      (fleet) => fleet.filter((s) => s.canDaihatsu).length >= 2,
    );
    const sortTarget = daihatsuPool.length > 0 ? daihatsuPool : allCandidates;

    // 全艦の fuel が揃っている候補は燃料合計昇順、揃っていない候補は末尾へ
    sortTarget.sort((a, b) => {
      const hasA = a.every((s) => s.fuel != null);
      const hasB = b.every((s) => s.fuel != null);
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;
      const sumA = a.reduce((acc, s) => acc + s.fuel!, 0);
      const sumB = b.reduce((acc, s) => acc + s.fuel!, 0);
      return sumA - sumB;
    });

    // 燃費上位 PICK_TOP 件の中からランダムに1件選ぶ
    // → 条件を満たす候補内での選択なので要件は破綻しない
    const PICK_TOP = 3;
    const pool = sortTarget.slice(0, PICK_TOP);
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
    const meetsStat = totalStats ? meetsStats(totalStats, expedition.statRequirements) : null;

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
      meetsStat = meetsStats(totalStats, expedition.statRequirements);
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
