# 進捗

## Phase 1: 要件整理・技術選定・システム設計・環境構築 (2026-11-23)

### 実装したもの
- 設計書 `docs/DESIGN.md`、金融計算仕様書 `docs/QUANT_SPEC.md`(指標・戦略・約定・サイズ・指標計算の入出力と例外)
- backend: uv プロジェクト、FastAPI(`/api/health`)、統一エラー形式、`MarketDataProvider` 抽象クラスと例外、`BacktestConfig`(範囲チェックのみ)
- frontend: Next.js 16 + Tailwind v4、API クライアント `src/lib/api.ts`、接続確認画面
- テスト: pytest 14件、Playwright E2E 2件(PC / スマホ幅)
- `scripts/check_yahoo.py`: 実データの取得と Yahoo のデータ仕様を確認するスクリプト

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| pytest | 14 passed |
| ruff check / format | OK |
| tsc / eslint / next build | OK |
| Playwright (desktop, mobile) | 2 passed |
| Yahoo 実データ取得(WSL2) | OK: 7203.T 243行 / AAPL 251行 |
| pytest(WSL2, Python 3.12) | 14 passed |

### 未解決の課題
1. Close が分割調整済みかどうかの確認(配当未調整・tz 付きは確認済み)→ Phase 3
2. shadcn/ui の初期化(クラウド環境から ui.shadcn.com に接続できないため)→ Phase 2 の最初に WSL2 で実行
3. pytest の StarletteDeprecationWarning(httpx → httpx2 への移行)。実害はない。後で対応する

## Phase 2: デザインシステム・画面構築 (2026-11-23)

### 実装したもの
- デザイントークン(`globals.css`)と `docs/DESIGN_SYSTEM.md`
- サイドバー(PC)/ ドロワーメニュー(スマホ)、7画面のルーティング、404ページ
- 3ステップ表示 `RunStrip`(選択状態を zustand + localStorage で保持)
- 未実装の画面は EmptyState で「何が無いか・何ができるようになるか」を表示(ダミーの数値は出さない)

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| tsc / eslint / next build | OK |
| Playwright(desktop / mobile) | 10 passed |
| 目視確認(スクリーンショット) | PC 1440px、スマホ Pixel 7 |

### 未解決の課題
1. shadcn init が `layout.tsx` に Google Fonts の読み込みを追加していたので削除した(`geist` パッケージで統一)。今後 `shadcn add` を使うときも、layout.tsx が書き換えられていないか確認する
2. 銘柄・戦略を選ぶ UI はまだ無い(Phase 3 / 4)。RunStrip の表示確認は、E2E テストで localStorage に直接値を入れて行っている
3. pytest の StarletteDeprecationWarning(Phase 1 から継続)
