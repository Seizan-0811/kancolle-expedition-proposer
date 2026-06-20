# kc-web データ形式・構成 調査メモ

調査日: 2026-06-20  
調査対象: https://github.com/noro6/kc-web (mainブランチ)

---

## LICENSE について

GitHub API (`/repos/noro6/kc-web`) で確認したところ、`"license": null` であった。  
つまり **LICENSEファイルが存在しない = 著作権はデフォルトで noro6 氏に帰属** (All Rights Reserved 相当)。

### 方針
- コードの直接コピー・流用は **行わない**
- データ構造・アルゴリズムの参考は可 (アイデアの流用)
- `src/classes/constants/expeditions.ts` の EXPEDITIONS 定数は「遠征条件の一次ソース」として参照したが、JSONとして独自作成した (`data/expeditions.json`)

---

## プロジェクト構成

```
src/
  App.vue           - ルートコンポーネント (Vue 3 + Vuetify)
  main.ts           - エントリポイント
  classes/
    interfaces/
      master.ts     - マスタデータ型定義 (MasterShip, MasterItem 等)
      shipBase.ts   - 艦娘基底インタフェース
    saveData/
      saveData.ts   - セーブデータ管理クラス
    constants/
      enums.ts      - SHIP_TYPE 等の enum 定義
      expeditions.ts - 遠征定数 (EXPEDITIONS)
      ships.ts      - 艦種一覧 (SHIP_TYPES_* 等)
    fleet/          - 艦隊・艦娘クラス
    item/           - 装備クラス
    ...
```

---

## 主要な型定義

### MasterShip (`src/classes/interfaces/master.ts`)

```typescript
interface MasterShip {
  id: number;       // 艦娘ID
  type: number;     // 艦種ID (SHIP_TYPE enum 参照)
  name: string;
  yomi: string;
  fire: number;     // 最大火力
  torpedo: number;
  anti_air: number; // 最大対空
  armor: number;
  luck: number;
  max_luck: number;
  min_scout: number;  // 最小索敵 (Lv1)
  scout: number;      // 最大索敵 (Lv99)
  min_asw: number;    // 最小対潜 (Lv1)
  asw: number;        // 最大対潜 (Lv99)
  // ... その他多数
}
```

### セーブデータ内の艦娘 (SavedShip, `src/classes/saveData/saveData.ts`)

```typescript
interface SavedShip {
  i: number;     // 艦娘マスタID
  is: Item[];    // 装備スロット
  lv?: number;   // レベル
  hp?: number;   // 現在HP (最大HP = master.max_hp)
  as?: number;   // 対潜値 (素値 + 改修ボーナス)
  lu?: number;   // 運
  aa?: number;   // 対空値
  ex?: Item;     // 補強増設
  ac?: boolean;  // アクティブフラグ
  es?: boolean;  // 随伴艦フラグ
  ar?: number;   // 出撃海域 (イベント札)
  un?: number;   // ユニークID (所持情報の識別子)
  re?: boolean;  // 補強増設スロットの空き
  sp?: number;   // 海色リボン(1) / 白たすき(2)
}
```

### セーブデータ内の装備 (SavedItem)

```typescript
interface SavedItem {
  i: number;   // 装備マスタID
  s?: number;  // 搭載数
  r?: number;  // 改修値
  l?: number;  // 熟練度 (0〜120)
}
```

### SaveData 全体構造

```
SaveData (ディレクトリまたはファイル)
  ├── id: string
  ├── name: string
  ├── manager: string   ← CalcManager を JSON.stringify したもの
  ├── isDirectory: boolean
  └── childItems: SaveData[]  ← ディレクトリの場合

CalcManager (manager を JSON.parse したもの)
  ├── fleetInfo: FleetInfo
  │     └── fleets: Fleet[]
  │           └── ships: Ship[]   ← 艦娘インスタンス
  ├── airbaseInfo: AirbaseInfo
  └── battleInfo: BattleInfo
```

ブラウザの localStorage キー: `saveData` (JSON 文字列)

---

## SHIP_TYPE enum (`src/classes/constants/enums.ts`)

| 略称 | 値 | 正式名 |
|------|-----|-------|
| DE   | 1  | 海防艦 |
| DD   | 2  | 駆逐艦 |
| CL   | 3  | 軽巡洋艦 |
| CLT  | 4  | 重雷装巡洋艦 |
| CA   | 5  | 重巡洋艦 |
| CAV  | 6  | 航空巡洋艦 |
| CVL  | 7  | 軽空母 |
| FBB  | 8  | 高速戦艦 |
| BB   | 9  | 戦艦 |
| BBV  | 10 | 航空戦艦 |
| CV   | 11 | 正規空母 |
| SS   | 13 | 潜水艦 |
| SSV  | 14 | 潜水空母 |
| AV   | 16 | 水上機母艦 |
| AS   | 20 | 潜水母艦 |
| CT   | 21 | 練習巡洋艦 |

---

## EXPEDITIONS 定数形式 (`src/classes/constants/expeditions.ts`)

kc-web は内部的に遠征条件を以下の形式で保持している:

```typescript
{
  world: number;           // ワールド番号
  id: string;              // 遠征ID ("A4", "B2", "42" など)
  name: string;            // 遠征名
  statuses: {              // 必要ステータス (艦隊合計値)
    fire?: number;
    antiAir?: number;
    asw?: number;
    scout?: number;
  };
  types: Array<{           // 必要艦種 (OR条件の配列)
    [shipTypeAbbr: string]: number   // 各艦種の最低必要数
  }>;
  minFlagshipLv: number;   // 旗艦最低レベル
  totalLevel: number;      // 艦隊合計レベル最低値
  minCount: number;        // 最低艦数
}
```

`types` はOR条件: 配列内のどれか1パターンを満たせばよい。  
各パターン内は最低必要数を指定 (残りは自由枠)。

kc-web の EXPEDITIONS に含まれる遠征 ID 一覧:  
A2, A3, A4, A5, A6, B1, B2, B3, B4, B5, B6, 41, 42, 43, 44, 45, 46, D1, D2, D3, E1, E2

---

## stat 計算式

### 対潜・索敵のレベル補間

```
asw(lv) = min_asw + floor((asw_max - min_asw) * lv / 99)
scout(lv) = min_scout + floor((scout_max - min_scout) * lv / 99)
```

火力・対空は装備による補正が主であるため、素値のみでは正確な計算が困難。

### 遠征での艦隊ステータス計算

```
艦隊合計fire    = Σ ship.fire + Σ equipment.fire
艦隊合計antiAir = Σ ship.anti_air + Σ equipment.antiAir
艦隊合計asw     = Σ ship.asw(lv) + Σ equipment.asw
艦隊合計scout   = Σ ship.scout(lv) + Σ equipment.scout
```

---

## kc-web からのデータインポート方針

kc-web はブラウザのローカルストレージ (`localStorage.saveData`) にセーブデータを保存している。

このツールへのインポート手順（想定）:
1. kc-web をブラウザで開く
2. DevTools > Application > Local Storage > `saveData` の値をコピー
3. このツールにペーストしてインポート

インポート後:
- SaveData ツリーを再帰的に走査してすべての fleet を取得
- 各 fleet の ships を抽出し、uniqueId で重複排除
- 結果を OwnedShip[] 形式に変換して編成提案ロジックに渡す
