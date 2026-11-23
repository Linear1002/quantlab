# QuantLab デザインシステム (v0.1 / Phase 2)

実装: `frontend/src/app/globals.css`(トークン)、`frontend/src/components/`(部品)

## 1. 方針
- **主役は「銘柄 → 戦略 → 実行」の3ステップ表示(RunStrip)だけ。** 他の部分は静かに、規律よく作る
- 影やグラデーションは使わない。面の区切りは「背景色の差」と「1px の罫線」で表す
- 角丸は階層ごとに変える: 操作部品 6px / パネル 10px / 外枠 14px
- データが無いときに架空の値は出さない。「何が無いか」と「次に何をするか」を書く(EmptyState)
- 自動で動くアニメーションは使わない。動きは、ユーザーの操作に反応するもの(ステップ完了の下線、ナビの選択マーカー、メニューの開閉)だけ
- `prefers-reduced-motion` のときはアニメーションを止める

## 2. 色
| 名前 | 値 | 用途 |
|---|---|---|
| ink | #05070d | 一番奥の背景、サイドバー |
| navy | #0a1020 | パネル |
| panel | #0f172b | 一段上の面(入力欄など) |
| line / line-strong | #1c2740 / #2a3858 | 罫線 / 入力欄の枠 |
| text / muted / faint | #e7ebf3 / #8b95ad / #5d6782 | 本文 / 補足 / ラベル |
| blue | #4f7cff | 主要な操作(ボタン、フォーカス、現在のステップ) |
| cyan | #38cfe0 | 選択済み・完了・データの強調 |
| purple | #9a7bff | 戦略に関する要素 |
| gain / loss | #34d39a / #ff6b6b | 利益 / 損失(Settings で入れ替えられるようにする予定) |

チャートの系列色は `--chart-1..5`(blue, cyan, purple, amber, slate)の順で使う。

## 3. 文字
- 英数字: Geist(`geist` パッケージ。ビルド時にネットワークを使わない)
- 日本語: OS のフォントにフォールバック(Hiragino Sans → Noto Sans JP → Yu Gothic UI)
- 数字は全体で `tabular-nums`(等幅数字)にして、表の桁をそろえる
- サイズ: 12(ラベル)/ 14(本文)/ 15(ロゴ)/ 24〜28(ページ見出し h1)
- 英語ラベルのすべて大文字表記、見出しの一部だけ色を変える装飾は使わない

## 4. レイアウト
```
PC (md 以上)                          スマホ (md 未満)
┌────────┬───────────────────────┐    ┌───────────────────┐
│ Brand  │ [1 銘柄][2 戦略][3 実行] │    │ Brand         ≡   │
│        ├───────────────────────┤    ├───────────────────┤
│ nav    │ h1 + 説明              │    │ [1][2][3](短い表記)│
│        │ 本文(最大幅 6xl)       │    ├───────────────────┤
│        │                       │    │ h1 + 本文          │
└────────┴───────────────────────┘    └───────────────────┘
```
- 左揃え。本文の最大幅は `max-w-6xl`、説明文は `max-w-prose`
- サイドバーと RunStrip は sticky(スクロールしても残る)

## 5. 部品
| ファイル | 役割 |
|---|---|
| `components/layout/app-sidebar.tsx` | PC のサイドバーとロゴ(`Brand`) |
| `components/layout/mobile-nav.tsx` | スマホのヘッダーとドロワーメニュー(Base UI Dialog) |
| `components/layout/nav-links.tsx` | メニュー項目。選択中は左端に cyan の線 |
| `components/layout/run-strip.tsx` | 3ステップ表示。完了したステップは ✓ と cyan の下線 |
| `components/layout/page-header.tsx` | h1 と説明文 |
| `components/ui/panel.tsx` | 情報のまとまりを囲む面 |
| `components/ui/empty-state.tsx` | データが無いときの表示 |
| `lib/nav.ts` | メニュー項目の定義(順番・ラベル・説明) |
| `lib/store.ts` | 3ステップの選択内容(zustand + localStorage) |
