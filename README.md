# QuantLab

株式の投資戦略を実データでバックテストする、定量分析 Web アプリ。

- 設計: [docs/DESIGN.md](docs/DESIGN.md)
- 金融計算の仕様(実装はこれに従う): [docs/QUANT_SPEC.md](docs/QUANT_SPEC.md)
- 進捗: [docs/PROGRESS.md](docs/PROGRESS.md)

## 構成
```
backend/   FastAPI + quant(金融計算ライブラリ)   … uv で管理
frontend/  Next.js + TypeScript + Tailwind          … npm で管理
docs/      設計書・仕様書
```

## セットアップ(WSL2 Ubuntu)

> プロジェクトは **WSL 側のホーム(例: `~/dev/quantlab`)に置く**こと。
> `/mnt/c/...`(Windows 側)に置くと、npm や Next.js がかなり遅くなる。

### 0. 必要なツール
```bash
# uv(Python のバージョンと依存を管理する)
curl -LsSf https://astral.sh/uv/install.sh | sh
# Node.js 22 LTS(nvm 経由)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
exec $SHELL && nvm install 22
```

### 1. Backend
```bash
cd backend
cp .env.example .env
uv sync                      # .venv を作って依存をインストール
uv run pytest                # テスト(14件が通ればOK)
uv run python scripts/check_yahoo.py   # 実データが取れるか確認
uv run python scripts/update_jpx_master.py   # 日本語の銘柄名検索用の一覧を作る(月1回程度)
uv run pytest -m network -v  # Yahoo の実データで分割・配当の扱いを確認
uv run uvicorn app.main:app --reload   # http://localhost:8000/docs
```

### 2. Frontend(別のターミナルで)
```bash
cd frontend
cp .env.example .env.local
npm ci
npx playwright install --with-deps chromium   # 初回だけ
npm run dev                  # http://localhost:3000
npm run test:e2e             # E2E(専用サーバーを 8001 / 3001 で自動起動。合成データを使う)
```

### VS Code
WSL の中で `code .` を実行して開く(左下に「WSL: Ubuntu」と表示されればOK)。
推奨拡張機能: Python, Ruff, ESLint, Tailwind CSS IntelliSense, Playwright Test

## よく使うコマンド
| 目的 | コマンド |
|---|---|
| backend テスト | `cd backend && uv run pytest` |
| backend lint | `uv run ruff check . && uv run ruff format --check .` |
| frontend 型チェック | `cd frontend && npm run typecheck` |
| frontend lint | `npm run lint` |
| API の型を自動生成 | `npm run gen:api`(backend 起動中に実行) |

## データについて
株価は yfinance(Yahoo Finance の非公式ライブラリ)で取得している。Yahoo の規約上は個人利用が前提。
一般公開や課金をする前に、商用利用が許可されたデータ元に差し替えること(`app/data/base.py` の `MarketDataProvider` を実装すれば差し替えられる)。
