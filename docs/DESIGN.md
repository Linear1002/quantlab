# QuantLab システム設計 (v0.1)

## 1. 全体構成

```
[Browser] ── Next.js (frontend/, :3000)
                │  fetch (JSON)
                ▼
          FastAPI (backend/app, :8000)
           ├─ api/        HTTPの入口(入力チェック→呼び出し→レスポンス整形だけ)
           ├─ data/       MarketDataProvider(Yahoo実装)+キャッシュ+検証
           ├─ db/         SQLAlchemy(SQLite → PostgreSQL移行可)
           └─ services/   データ取得→戦略→エンジン→指標 をつなぐ
                │
                ▼
          quant/  ← 純粋な計算ライブラリ。FastAPI・DBに依存しない
           ├─ adjust.py, indicators.py, strategies/, engine.py, metrics.py
```

依存の向き: `api → services → (data, db, quant)`。**quant は他のどれにも依存しない。**
これにより、quant 単体で pytest が回り、将来は CUDA 版に差し替えられる。

## 2. データ取得の抽象化
`app/data/base.py`
```python
class MarketDataProvider(ABC):
    name: str
    def search(self, query: str, market: Market | None) -> list[SymbolInfo]
    def get_quote(self, symbol: str) -> Quote
    def get_ohlcv(self, symbol: str, start: date, end: date, interval: Interval) -> pd.DataFrame
```
- 例外: `ProviderError` を基底に、`SymbolNotFoundError`, `RateLimitError`, `ProviderUnavailableError`
- 実装の切り替えは環境変数 `QUANTLAB_DATA_PROVIDER=yahoo`(`app/data/factory.py`)
- キャッシュ(`app/data/cache.py`)は Provider を包むデコレータとして作り、どの Provider にも使えるようにする

## 3. API(予定)
| Method | Path | 内容 | Phase |
|---|---|---|---|
| GET | /api/health | 起動確認 | 1 |
| GET | /api/stocks/search?q=&market= | 銘柄検索 | 3 |
| GET | /api/stocks/{symbol}/quote | 最新株価 | 3 |
| GET | /api/stocks/{symbol}/history?start=&end=&interval= | OHLCV | 3 |
| GET | /api/strategies | 戦略一覧+パラメータ仕様 | 4 |
| POST | /api/backtests | 実行(結果を保存してIDを返す) | 5 |
| GET | /api/backtests | 履歴一覧 | 7 |
| GET | /api/backtests/{id} | 結果の再表示 | 7 |
| DELETE | /api/backtests/{id} | 削除 | 7 |

エラーレスポンスの形式は統一する: `{"error": {"code": "SYMBOL_NOT_FOUND", "message": "...", "detail": {...}}}`

## 4. DB(SQLite、SQLAlchemy 2.0)
- `ohlcv_cache(provider, symbol, interval, date, open, high, low, close, adj_close, volume, fetched_at)` PK=(provider,symbol,interval,date)
- `backtest_runs(id, created_at, symbol, strategy_id, params_json, config_json, start, end, metrics_json, result_blob, data_provider, engine_version)`
  - `engine_version` を保存しておき、エンジンを直した後に古い結果と見分けられるようにする
- 移行は Alembic を Phase 7 で導入する。SQLite 固有の型は使わない

## 5. フロントエンド
- Next.js App Router、TypeScript strict
- 画面: `/`(Dashboard), `/stocks`, `/strategies`, `/backtest`, `/results/[id]`, `/history`, `/settings`
- 状態: 3ステップ(銘柄→戦略→実行)の選択内容は zustand で保持し、localStorage にも保存する
- APIの型: FastAPI の OpenAPI から `openapi-typescript` で `lib/api-types.ts` を自動生成する(手書きによるズレを防ぐ)

## 6. 環境・秘密情報
- `.env`(git 管理外)と `.env.example`(管理対象)
- Yahoo は APIキー不要。将来のキーは `QUANTLAB_*` 環境変数で読み込み、フロントエンドには絶対に渡さない

## 7. 利用条件メモ
yfinance は非公式ライブラリで、Yahoo の規約上は個人利用が前提。公開・課金を始める前に、商用ライセンスのあるデータ元に差し替える(Provider を差し替えるだけで済む設計にしてある)。
