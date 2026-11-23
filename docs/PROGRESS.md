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

## Phase 3: 株価データ取得 (2026-11-23)

### 実装したもの
- `app/data/yahoo.py` YahooProvider(検索・最新株価・OHLCV)。yfinance の例外を統一エラーに変換、tz を外して現地日付に
- `app/data/jp_master.py` + `scripts/update_jpx_master.py`: JPX 公式の上場銘柄一覧で日本語名・コード検索
- `app/data/cache.py`: SQLite キャッシュ(12時間、範囲拡張時は和集合を取り直して調整後終値の不整合を防ぐ)
- `app/data/validation.py`: OHLCV 検証(QUANT_SPEC §1.2)
- `app/data/fixture.py`: E2E 用の合成データ(画面に警告を表示)
- API: `/api/stocks/search`, `/{symbol}/quote`, `/{symbol}/history`。エラーは全て統一形式
- 画面: 銘柄検索(キーボード操作・市場絞り込み)、最新株価、期間・時間軸の選択、ローソク足+出来高チャート

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| pytest | 80 passed(network 5件は未実行) |
| ruff / tsc / eslint / next build | OK |
| Playwright(desktop / mobile) | 22 passed |

### 未解決の課題
1. **Yahoo 実データでの確認が未実施**: `uv run pytest -m network -v`(分割調整・配当調整・検索)を WSL2 で実行する
2. JPX 一覧の CSV は WSL2 で作成が必要(`scripts/update_jpx_master.py`)
3. キャッシュから読んだ場合は「欠損行を除外しました」の警告が出ない(欠損行は保存時に除外済みのため)。実害はないが、Phase 8 で見直す
4. 最新株価は日足の最終行から作っているので、取引時間中の値の遅延時間は Yahoo 次第(画面には日付を表示)

## Phase 4: 指標・投資戦略 (2026-11-23)

### 設計変更(QUANT_SPEC v0.3)
- 仕様の矛盾を解消: 「ウォームアップ中のクロスで、分析初日から保有状態になる」問題
- 戦略は売買の「きっかけ」(entry / exit)だけを返し、ポジション管理は共通の状態機械 `generate_signals()` が `trade_start` から行う

### 実装したもの
- `quant/indicators.py`: sma, ema(SMA で初期化), rsi(Wilder), macd, bollinger(ddof=0), roc, zscore, cross_above / cross_below
- `quant/adjust.py`: 分割・配当調整(total_return / split_only)
- `quant/strategies/`: 8戦略 + レジストリ + 状態機械
- API: `GET /api/strategies`, `POST /api/strategies/{id}/signals`(ウォームアップ込みで取得 → 調整 → シグナル)
- 画面: 戦略カード(スマホは詳細を折りたたみ)、パラメータ入力(範囲チェック)、シグナルのチャート表示

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| pytest | 186 passed(network 5件は未実行) |
| ruff / tsc / eslint / next build | OK |
| Playwright(desktop / mobile) | 34 passed |

主なテスト: 指標の手計算一致、RSI の別実装との一致、全指標・全戦略の Look-ahead テスト(前方切り捨て・未来の改ざん)、min_bars の妥当性、状態機械の境界条件

### 未解決の課題
1. ~~Phase 3 の network テスト~~ → WSL2 で実行。分割調整 OK。配当テストは「Adj Close の丸めによる 1e-6 のゆれ」で失敗したため、許容誤差を入れて修正(再実行待ち)
   - あわせて yfinance 1.8 で非推奨になった `raise_errors=True` を `yf.config.debug.hide_exceptions = False` に置き換え
2. シグナル確認のチャートは「分割調整済み・配当未調整」の価格、シグナルの判定は「配当込みの調整後価格」。日付は一致するが、価格の水準は少しずれる(画面に注記済み)
3. 1つのパラメータを打つたびに API を呼ぶ(入力の確定を待たない)。今は軽いので問題ないが、Phase 8 で入力の遅延(debounce)を検討

## Phase 5: バックテストエンジン (2026-11-23)

### 進め方
1. 仕様の未確定部分を決めて QUANT_SPEC v0.4 に追記(株数の計算式、買えなかったときの再試行、未決済取引・pending_signal、初日の扱い)
2. 7本のデータで約定・手数料・資産推移を手計算した表を作り(付録A)、別のスクリプトで再計算して確認(取引2のリターンの誤記 5.83479% → 5.83476% をここで発見・修正)
3. その表を期待値とするテストを**先に**書き、失敗することを確認してから実装

### 実装したもの
- `quant/engine.py`: `simulate()`(NumPy 配列だけで動く中核。GPU 化の差し替え対象)、`buy_quantity()`(手数料込みで買える最大株数を直接計算)、`run_backtest()`(入力チェック・取引の組み立て)
- `quant/metrics.py`: Total Return / CAGR / Volatility / Sharpe / Sortino / MDD / Win Rate / PF / 取引数、ドローダウン系列、月別・年別リターン
- `quant/models.py`: Trade / OrderNote / BacktestResult
- `app/services/backtest.py`: 取得 → 調整 → シグナル → エンジン → 指標。Buy and Hold を同じ条件で実行
- API: `POST /api/backtests`
- 画面: バックテスト設定(市場ごとの既定値、%・bps の単位変換、入力チェック)、結果ページ(戦略と B&H の指標比較)

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| pytest | 240 passed(network 5件は WSL2 で 5 passed 済み) |
| ruff / tsc / eslint / next build | OK |
| Playwright(desktop / mobile) | 46 passed |

主なテスト: 付録Aとの完全一致、翌日始値での約定、単元・最低手数料・資金不足時の再試行、ランダムな10ケースでの不変条件(資産 = 現金 + 株数 × 終値、現金 ≥ 0、最終資産 = 初期資金 + 損益合計、保有状態 = 前日のシグナル)、未来の改ざんで過去の資産が変わらないこと、「戦略 = Buy and Hold」のとき比較結果が完全一致すること

### 未解決の課題
1. 結果は sessionStorage にだけ保存(タブを閉じると消える)→ Phase 7 で DB に保存
2. グラフ(資産推移・ドローダウン・売買ポイント・月別/年別・分布)と取引履歴の表 → Phase 6
3. 調整後価格(配当込み)で約定させているので、取引履歴の価格は実際の約定価格より少し低い(付録・画面に注記予定)
4. 株数の計算は「その時点の現金」を基準にしている。複数銘柄・部分売却は未対応(仕様の範囲外)
