/**
 * 艦種略称 → kc-web の SHIP_TYPE enum と対応
 * CL は CLT (雷巡) / CT (練巡) も許容する場合に配列で持つ
 */
export type ShipTypeAbbr = 'DE' | 'DD' | 'CL' | 'CLT' | 'CA' | 'CAV' | 'CVL' | 'ECVL' | 'CV' | 'SS' | 'SSV' | 'AV' | 'AS' | 'CT';

/** 艦種略称 → kc-web の SHIP_TYPE 値の対応マップ */
export const SHIP_TYPE_IDS: Record<ShipTypeAbbr, number[]> = {
  DE:   [1],
  DD:   [2],
  CL:   [3, 4, 21],  // 軽巡・雷巡・練巡
  CLT:  [4],
  CA:   [5, 6],      // 重巡・航巡
  CAV:  [6],
  CVL:  [7],
  ECVL: [7],         // 護衛空母 (kc-web では CVL 相当として扱う)
  CV:   [7, 11, 18], // 空母全般 (水母含む便宜上; 遠征44では CV=水母/護衛空母もOK)
  SS:   [13, 14],    // 潜水・潜水空母
  SSV:  [14],
  AV:   [16],
  AS:   [20],
  CT:   [21],
};

/** 遠征で必要な最低艦種構成の 1 パターン */
export type RequiredTypePattern = Partial<Record<ShipTypeAbbr, number>>;

/** 遠征ステータス要求 (艦隊合計値) */
export interface StatRequirements {
  fire: number;
  antiAir: number;
  asw: number;
  scout: number;
}

/** 報酬 */
export interface Rewards {
  fuel: number;
  ammo: number;
  steel: number;
  bauxite: number;
  screw?: number;
}

/** 遠征条件 (data/expeditions.json の 1 エントリに対応) */
export interface Expedition {
  world: number;
  id: string;
  name: string;
  durationMinutes: number;
  minShipCount: number;
  minFlagshipLv: number;
  totalLevel: number;
  /** OR 条件: 配列内どれか 1 パターンを満たせばよい */
  requiredTypes: RequiredTypePattern[];
  statRequirements: StatRequirements;
  rewards: Rewards;
  prerequisiteIds: string[];
  /** 燃料消費率 (%) — 各艦の最大燃料に乗じる。推定値: マンスリー遠征は全て 20 */
  fuelRate: number;
  /** 弾薬消費率 (%) — 各艦の最大弾薬に乗じる。推定値: マンスリー遠征は全て 20 */
  ammoRate: number;
  /**
   * 大発動艇系を装備可能な艦娘の最低人数
   * 省略または 0 の場合は制約なし。満たせない場合は制約なしにフォールバック。
   */
  minDaihatsu?: number;
  note: string;
}

/** data/expeditions.json のトップレベル形式 */
export interface ExpeditionsJson {
  expeditions: Expedition[];
}

// ---------------------------------------------------------------------------
// 所持艦娘データ
// ---------------------------------------------------------------------------

/**
 * 所持艦娘の基本情報
 * kc-web の SavedShip + MasterShip から必要な情報を抽出したもの
 */
export interface OwnedShip {
  /** 艦娘マスタ ID */
  masterId: number;
  /** kc-web 内ユニーク ID (重複排除用; 不明の場合は 0) */
  uniqueId: number;
  /** 艦種 ID (SHIP_TYPE enum 値) */
  shipTypeId: number;
  /** 艦娘名 */
  name: string;
  /** レベル */
  level: number;
  /**
   * 艦隊単独ステータス (装備込みの推定値または実測値)
   * 値が不明の場合は undefined (マッチング時に素値推定を試みる)
   */
  stats?: ShipStats;
  /** 最大燃料 (MasterShip.fuel) — 消費計算用 */
  fuel?: number;
  /** 最大弾薬 (MasterShip.ammo) — 消費計算用 */
  ammo?: number;
  /** 大発動艇系 (カテゴリ 24) を装備可能か */
  canDaihatsu?: boolean;
}

/** 艦娘の各ステータス値 (遠征計算に使う 4 つ) */
export interface ShipStats {
  fire: number;
  antiAir: number;
  asw: number;
  scout: number;
}

// ---------------------------------------------------------------------------
// マッチング結果
// ---------------------------------------------------------------------------

/** 1 つの遠征に対する編成提案 */
export interface FleetSuggestion {
  expeditionId: string;
  expeditionName: string;
  /** 提案する艦隊 (旗艦が先頭) */
  ships: OwnedShip[];
  /** ステータス条件をすべて満たしているか (stats が未定義の場合は null) */
  meetsStatRequirements: boolean | null;
  /** 艦隊合計ステータス (stats がある場合のみ計算) */
  totalStats: ShipStats | null;
  /** 推定燃料消費量 (fuel が未定義の場合は null) */
  consumedFuel: number | null;
  /** 推定弾薬消費量 (ammo が未定義の場合は null) */
  consumedAmmo: number | null;
}

/** 複数遠征の同時提案結果 */
export interface MatchResult {
  suggestions: FleetSuggestion[];
  /** 条件を満たす編成が見つからなかった遠征 ID */
  unmatched: string[];
}

// ---------------------------------------------------------------------------
// kc-web インポート用の簡略型
// ---------------------------------------------------------------------------

/** kc-web の localStorage saveData から抽出した生の艦娘情報 */
export interface RawKcwebShip {
  /** 艦娘マスタ ID (SavedShip.i) */
  masterId: number;
  /** ユニーク ID (SavedShip.un) */
  uniqueId?: number;
  /** レベル (SavedShip.lv) */
  level?: number;
}

/** kc-web の MasterShip から必要なフィールドだけ抽出した型 */
export interface ShipMasterMinimal {
  id: number;
  type: number;
  name: string;
  fire: number;
  anti_air: number;
  min_asw: number;
  asw: number;
  min_scout: number;
  scout: number;
}
