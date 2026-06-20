# 艦これ遠征プランナー — プロジェクトメモ

## 公開URL
https://seizan-0811.github.io/kancolle-expedition-proposer/

## リポジトリ
https://github.com/Seizan-0811/kancolle-expedition-proposer

## 概要
kc-web から所持艦娘データを取り込み、複数遠征への同時編成を自動提案するツール。
Vue 3 + TypeScript + Vite 製。GitHub Actions で main ブランチ push 時に自動デプロイ。

## 開発コマンド
```bash
npm run dev      # 開発サーバー起動
npm run build    # 型チェック + ビルド (dist/ に出力)
```

## デプロイフロー
`git push origin main` → GitHub Actions が自動ビルド → GitHub Pages に反映（数分）

## 主要ファイル
| ファイル | 役割 |
|---|---|
| `src/ExpeditionProposer.vue` | メインUI（タブ、艦娘リスト、提案表示） |
| `src/expeditionMatcher.ts` | 編成マッチングアルゴリズム |
| `src/types.ts` | 型定義 |
| `src/shipStats.ts` | ステータス計算 |
| `data/expeditions.json` | 遠征条件データ（22件） |

## 参照サイト
- [kc-web（制空権シミュレータ v2）](https://noro6.github.io/kc-web/) — 艦娘データのインポート元
- [ぜかましねっと — マンスリー遠征条件一覧](https://zekamashi.net/kancolle-kouryaku/new-ensei/)
- [ぜかましねっと — 遠征の基礎知識](https://zekamashi.net/kancolle-kouryaku/ensei-kihon/)

## 実装のポイント

### kc-web からのデータ取得
ブックマークレット（推奨）または DevTools コンソールスニペットで取得。
`store.state.ships`（MasterShip）+ `store.state.shipStock` を参照。

### ステータス計算
装備は考慮せず**基本ステータス + 近代化改修ボーナスのみ**。
```typescript
asw   = min_asw   + Math.floor((asw   - min_asw)   * lv / 99)
scout = min_scout + Math.floor((scout - min_scout) * lv / 99)
```

### 大発動艇制約
`minDaihatsu: 2` を全遠征に設定。`findCandidates` のバックトラック内でハード制約として判定。
候補がなければ制約なしにフォールバック。

### マッチングアルゴリズム
1. 全艦娘で候補数を計算 → 候補が少ない（難しい）遠征から処理
2. 残り艦娘から毎回再計算して割り当て（重複なし）

## git 操作の注意
- VS Code などエディタを開いたままだと `.git/index.lock` 競合が起きることがある
- 操作前にエディタを閉じるか、Git 自動フェッチを無効化する
- サンドボックス（Claude）からは lock ファイルを削除できないため、ユーザー側で対処が必要
