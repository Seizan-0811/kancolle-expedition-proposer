/**
 * 艦娘ステータス計算ユーティリティ
 *
 * kc-web の MasterShip データをもとに、指定レベルでの艦娘ステータスを計算する。
 * 装備ボーナスは含まない (素値のみ)。実際の遠征成功可否は装備込み値で判断する必要がある。
 */

import type { ShipMasterMinimal, ShipStats } from './types';

/**
 * 対潜・索敵のレベル補間計算
 * 式: min_val + floor((max_val - min_val) * level / 99)
 */
function interpolateByLevel(minVal: number, maxVal: number, level: number): number {
  if (maxVal <= minVal) return minVal;
  return minVal + Math.floor(((maxVal - minVal) * Math.min(level, 99)) / 99);
}

/**
 * 艦娘の素ステータスをレベルに応じて計算する
 *
 * @param master - MasterShip の最低限フィールド
 * @param level  - 艦娘のレベル
 * @returns 遠征計算に使う 4 ステータス (装備なし・素値)
 */
export function calcBaseStats(master: ShipMasterMinimal, level: number): ShipStats {
  return {
    fire:    master.fire,
    antiAir: master.anti_air,
    asw:     interpolateByLevel(master.min_asw, master.asw, level),
    scout:   interpolateByLevel(master.min_scout, master.scout, level),
  };
}

/**
 * 艦隊全体のステータス合計を計算する
 */
export function sumFleetStats(shipStatsList: ShipStats[]): ShipStats {
  return shipStatsList.reduce(
    (acc, s) => ({
      fire:    acc.fire    + s.fire,
      antiAir: acc.antiAir + s.antiAir,
      asw:     acc.asw     + s.asw,
      scout:   acc.scout   + s.scout,
    }),
    { fire: 0, antiAir: 0, asw: 0, scout: 0 },
  );
}

/**
 * ステータス合計が遠征要求値を満たすか判定する
 */
export function meetsStats(
  total: ShipStats,
  required: { fire: number; antiAir: number; asw: number; scout: number },
): boolean {
  return (
    total.fire    >= required.fire    &&
    total.antiAir >= required.antiAir &&
    total.asw     >= required.asw     &&
    total.scout   >= required.scout
  );
}
