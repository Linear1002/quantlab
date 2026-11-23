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

### 2.1 データ層の仕様(Phase 3)
| ファイル / 関数 | 入力 | 出力 | 例外・挙動 |
|---|---|---|---|
| `yahoo.py` `YahooProvider.get_ohlcv(symbol, start, end, interval)` | end は**その日を含む** | 列 `open..volume`、tz なしの昇順 DatetimeIndex(名前 `date`) | yfinance の end は「含まない」ので内部で end+1日を渡す。`YFRateLimitError`→`RateLimitError`、銘柄不明→`SymbolNotFoundError`、期間内データ無し→空 DataFrame、通信失敗→`ProviderUnavailableError` |
| `YahooProvider.get_quote(symbol)` | | 直近の日足最終行の終値(**配当未調整の実際の価格**)と前日比 | 取引時間中は「取引中の最新値」になる。`as_of` に日付を入れて、いつの値かを必ず表示する |
| `YahooProvider.search(query, market)` | 銘柄名・ティッカー・4桁コード | `SymbolInfo` のリスト(最大20件) | 日本語名・コードは JPX 一覧から、英語名・ティッカーは Yahoo 検索から探して統合する。株式と ETF 以外は除外。片方が失敗しても、もう片方に結果があれば返す |
| `jp_master.py` `JpMaster.search(query, limit)` | | 部分一致(コードは前方一致) | `backend/data/jpx_listed.csv` が無ければ日本語検索は無効(警告を出す)。CSV は `scripts/update_jpx_master.py` で JPX 公式の Excel から作る |
| `cache.py` `CachedProvider.get_ohlcv(...)` | | inner と同じ | §2.2 |
| `validation.py` `validate_ohlcv(df)` | | `(df, warnings)` | QUANT_SPEC §1.2 |
| `services/market.py` `load_history(...)` | | `(df, warnings)` | start > end は `InvalidRequestError`(400)。検証後に0行なら `NoDataError`(404) |

### 2.2 キャッシュの方針(重要)
- 同じ銘柄・時間軸について、「取得済みの期間」と「取得日時」を記録する
- 要求された期間が取得済みの期間に含まれていて、取得から **12時間以内**ならキャッシュから返す
- それ以外は、**取得済みの期間と要求された期間を合わせた範囲を丸ごと取り直し、古い行をすべて置き換える**
  - 理由: `Adj Close` は新しい配当が出るたびに過去の値まで書き換わる。古い行と新しい行を混ぜると調整係数がつながらず、リターンの計算が壊れる
- 銘柄検索と最新株価はキャッシュしない

### 2.3 テスト用データ元(fixture)
- `QUANTLAB_DATA_PROVIDER=fixture` のときだけ使う、**合成データ**のデータ元。E2E テストで Yahoo に依存しないために使う
- 銘柄名に「合成データ」と明記し、画面にも「テスト用の合成データです」という警告を必ず出す(実データと誤認させない)

## 3. API(予定)
| Method | Path | 内容 | Phase |
|---|---|---|---|
| GET | /api/health | 起動確認 | 1 |
| GET | /api/stocks/search?q=&market= | 銘柄検索 | 3 |
| GET | /api/stocks/{symbol}/quote | 最新株価 | 3 |
| GET | /api/stocks/{symbol}/history?start=&end=&interval= | OHLCV | 3 |
| GET | /api/strategies | 戦略一覧+パラメータ仕様 | 4 |
| POST | /api/strategies/{id}/signals | 選択中の銘柄・期間での売買シグナル(損益計算なし) | 4 |
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
