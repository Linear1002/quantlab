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
