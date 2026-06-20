/**
 * kc-web データインポーター
 *
 * kc-web の localStorage ("saveData") に保存されたセーブデータを解析し、
 * 所持艦娘リスト (OwnedShip[]) に変換する。
 *
 * ## 使い方
 *   1. kc-web をブラウザで開く
 *   2. DevTools > Application > Local Storage > saveData の値をコピー
 *   3. importFromKcwebLocalStorage(json, masterShips) を呼び出す
 *
 * ## 注意
 *   - kc-web にはゲーム全所持艦娘の一覧機能はない。
 *     セーブデータ内の各フリート構成に含まれる艦娘のみを抽出する。
 *   - 同一艦娘 (uniqueId が同じ) が複数フリートに入っている場合は重複排除する。
 *   - MasterShip データは呼び出し元が用意する必要がある (マスタ JSON を参照のこと)。
 */

import type { OwnedShip, ShipMasterMinimal } from './types';
import { calcBaseStats } from './shipStats';

// ---------------------------------------------------------------------------
// kc-web の localStorage データ形式 (参照のみ; 型は最小限定義)
// ---------------------------------------------------------------------------

interface KcSavedItem {
  i: number;
}

interface KcSavedShip {
  i: number;       // masterId
  is: KcSavedItem[];
  lv?: number;
  un?: number;     // uniqueId
}

interface KcSavedFleet {
  ships: KcSavedShip[];
}

interface KcSavedFleetInfo {
  fleets: KcSavedFleet[];
}

interface KcSavedManager {
  fleetInfo: KcSavedFleetInfo;
}

interface KcSaveDataNode {
  id: string;
  isDirectory: boolean;
  manager: string;           // JSON.stringify(CalcManager) または空文字
  childItems: KcSaveDataNode[];
}

// ---------------------------------------------------------------------------
// 再帰ツリー走査
// ---------------------------------------------------------------------------

/**
 * SaveData ツリーを再帰的に走査し、すべてのフリートの ship 情報を収集する
 */
function collectRawShips(node: KcSaveDataNode): KcSavedShip[] {
  const ships: KcSavedShip[] = [];

  if (!node.isDirectory && node.manager) {
    try {
      const manager = JSON.parse(node.manager) as KcSavedManager;
      const fleets = manager?.fleetInfo?.fleets ?? [];
      for (const fleet of fleets) {
        for (const ship of fleet.ships ?? []) {
          if (ship.i > 0) ships.push(ship);
        }
      }
    } catch {
      // パース失敗は無視
    }
  }

  for (const child of node.childItems ?? []) {
    ships.push(...collectRawShips(child));
  }

  return ships;
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * kc-web の localStorage 値 (文字列) から所持艦娘リストを作成する。
 *
 * @param localStorageJson - localStorage の "saveData" の値 (JSON 文字列)
 * @param masterShips      - MasterShip の最小フィールドの配列 (マスタ JSON から取得)
 * @returns OwnedShip[] (レベル不明の場合は level=1 とする)
 */
export function importFromKcwebLocalStorage(
  localStorageJson: string,
  masterShips: ShipMasterMinimal[],
): OwnedShip[] {
  let root: KcSaveDataNode;
  try {
    root = JSON.parse(localStorageJson) as KcSaveDataNode;
  } catch {
    throw new Error('kc-web セーブデータの JSON パースに失敗しました。');
  }

  const rawShips = collectRawShips(root);

  // uniqueId による重複排除 (uniqueId === 0 or undefined はマスタ ID で代替)
  const seen = new Map<string, KcSavedShip>();
  for (const s of rawShips) {
    const key = s.un != null && s.un > 0 ? `u:${s.un}` : `m:${s.i}`;
    if (!seen.has(key)) seen.set(key, s);
  }

  const masterMap = new Map(masterShips.map((m) => [m.id, m]));
  const result: OwnedShip[] = [];

  for (const [key, raw] of seen) {
    const master = masterMap.get(raw.i);
    if (!master) continue; // マスタにない艦娘はスキップ

    const level = raw.lv ?? 1;
    const stats = calcBaseStats(master, level);

    result.push({
      masterId:   raw.i,
      uniqueId:   raw.un ?? 0,
      shipTypeId: master.type,
      name:       master.name,
      level,
      stats,
    });
  }

  return result;
}

/**
 * 簡易インポート: 艦娘 ID とレベルの配列から OwnedShip[] を作成する。
 * マスタデータを持っている場合はステータスも計算する。
 *
 * @param entries      - [{ masterId, level }] の配列
 * @param masterShips  - ShipMasterMinimal[] (なければ [] でも可)
 */
export function importFromSimpleList(
  entries: { masterId: number; level: number; uniqueId?: number }[],
  masterShips: ShipMasterMinimal[],
): OwnedShip[] {
  const masterMap = new Map(masterShips.map((m) => [m.id, m]));
  return entries.map((entry, idx) => {
    const master = masterMap.get(entry.masterId);
    const stats = master ? calcBaseStats(master, entry.level) : undefined;
    return {
      masterId:   entry.masterId,
      uniqueId:   entry.uniqueId ?? -(idx + 1),
      shipTypeId: master?.type ?? 0,
      name:       master?.name ?? `艦娘#${entry.masterId}`,
      level:      entry.level,
      stats,
    };
  });
}
