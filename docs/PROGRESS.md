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

### 実データでの検証(WSL2)
- トヨタ(7203.T)× SMA Crossover、2021-11-24〜2026-11-20、初期資金 100万円
- アプリのコードを使わず yfinance から直接 Buy and Hold を計算 → 最終資産 1,733,662.1 円。アプリの 1,733,662 円と一致
  (データ取得・配当調整・翌日始値約定・スリッページ・手数料・単元の処理が正しいことを確認)

### 未解決の課題
1. 結果は sessionStorage にだけ保存(タブを閉じると消える)→ Phase 7 で DB に保存
2. グラフ(資産推移・ドローダウン・売買ポイント・月別/年別・分布)と取引履歴の表 → Phase 6
3. 調整後価格(配当込み)で約定させているので、取引履歴の価格は実際の約定価格より少し低い(付録・画面に注記予定)
4. 株数の計算は「その時点の現金」を基準にしている。複数銘柄・部分売却は未対応(仕様の範囲外)

## Phase 6: 結果分析・グラフ (2026-11-23)

### 実装したもの
- 資産推移(戦略 vs Buy and Hold、初期資金の基準線、ホバーで日付・資産・損益率・保有株数)
- ドローダウン(2系列)
- 株価チャートと売買ポイント(約定日に印。価格は約定価格と同じ調整済み基準)
- 年別リターン(2系列の棒グラフ)、月別リターン(年×月の表、戦略/B&H 切り替え)
- リターン分布(保有中の日次リターンのヒストグラム、平均・標準偏差・上昇割合)
- 取引履歴の表(手数料込みの損益・リターン・保有期間・状態)
- backend: 系列に調整済み OHLC、B&H の月別・年別リターンを追加(同じ計算方法で比べるため)

### 色の検証(dataviz の validator)
- 戦略 #8466f0 / Buy and Hold #2a9fb0。暗い背景 #0a1020 で明度・彩度・色覚多様性(ΔE 14.9)・通常視覚(ΔE 21.0)・コントラストすべて合格
- 最初の案(紫 #9a7bff / グレー #7d8aa6)は明度と彩度で不合格だったので変更

### 画面確認で直したこと
- 月別リターンの色: oklch で背景と混ぜると色相がずれて、プラスが青緑・マイナスが紫になっていた → srgb で混ぜて緑/赤に
- 取引履歴の価格の小数桁がそろっていなかった → 円は小数1桁に固定
- 軸のマイナス記号を表と同じ「−」に統一

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| pytest | 240 passed(年別リターンを掛け合わせると全体のリターンになることを追加で確認) |
| ruff / tsc / eslint / next build | OK |
| Playwright(desktop / mobile) | 53 passed、1 skipped(ホバーのテストはスマホでは対象外) |

### 未解決の課題
1. フロントエンドの計算(ヒストグラムのビン分け)に単体テストが無い → Phase 8 で vitest を入れる
2. 1万本を超える長期の日足では、Recharts の描画が重くなる可能性 → 実データで確認し、必要なら間引く
3. 結果の保存・履歴 → Phase 7

## Phase 7: 履歴保存・設定 (2026-11-23)

### 実装したもの
- DB: `backtest_runs` テーブル、Alembic の導入(マイグレーション 0001 / 0002、起動時に自動適用、既存 DB の引き継ぎ)
- `app/db/repository.py`: save_run / list_runs / get_run / delete_run
- API: 実行時に自動保存(`POST /api/backtests` が id を返す)、`GET /api/backtests`(一覧・ページ送り・銘柄で絞り込み)、`GET /api/backtests/{id}`(再表示)、`DELETE`、`/api/system/status`、`/api/system/cache`
- 画面: 結果の URL を `/results/{id}` に変更(sessionStorage は廃止)、`/results` は最新の結果へ移動、履歴(一覧・2段階削除・ページ送り)、ダッシュボードに最近5件、設定(損益の色・データの状態・キャッシュ削除・ブラウザ設定の初期化)

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| pytest | 249 passed(マイグレーションと定義の一致、旧 DB の引き継ぎ、保存 → 再表示で完全一致、失敗した実行は保存しない など) |
| ruff / tsc / eslint / next build | OK |
| Playwright(desktop / mobile) | 69 passed、1 skipped |

### 実装中に見つけて直したこと
- テストが本物の `quantlab.db` に書き込んでいた → conftest.py で全テストを一時 DB に
- E2E が普段の DB に合成データの結果を保存してしまう → E2E 専用の `.e2e.db` を毎回作り直す
- Next.js 16: 動的ページ(/results/[id])で URL を読む部品は Suspense が必要 → サイドバーと3ステップ表示を Suspense で包んだ
- 設定画面: 保存した色の設定の読み込み前に描画すると、サーバーの HTML と食い違ってクリックが効かない → 読み込み完了を待つ
- 履歴の表(スマホ): 画面読み上げ用の非表示テキスト(position: absolute)がスクロール枠の外にはみ出し、ページが横にずれていた → 枠に relative

### WSL2 で見つかった不具合と修正(2026-11-24)
- 症状: 起動直後の検索で 500 エラー。`table ohlcv_bars already exists` が毎回出る
- 原因: DB の準備(マイグレーション)を「最初のリクエスト時」に行っていたため、同時に来た複数のリクエストが並行して準備を実行し、
  中身が空の alembic_version だけが残った。さらに「旧 DB か」の判定が「記録テーブルの有無」だったので、空のテーブルを「適用済み」と誤判定して 0001 を再実行していた
- 修正: (1) 起動時(lifespan)に DB を準備 (2) マイグレーションと接続作成をロックで1回に (3) 判定を「記録(リビジョン)が入っているか」に変更 → 壊れた状態の DB も自動で直る
- 回帰テスト2件を追加(古いコードでは失敗、修正後は成功することを確認)。Python 3.12 でも再現 → 修正を確認

### 未解決の課題
1. 保存した結果は、後でエンジンを変えても再計算しない(engine_version で区別する)。古い形式の JSON を読めなくなった場合の対応は未実装
2. 履歴の並べ替え(リターン順など)は未対応(新しい順のみ)

## Phase 8: テスト・バグ修正・UI 改善 (2026-11-24)

### きっかけ
- 「数値がたくさん出てきてよく分からない」という利用者(翔)の声 → 元の指示書の「金融工学の知識が少ない人でも理解できる UI」が未達成だった

### 実装したもの
- **結果の読み方**(`lib/interpret.ts` + `components/results/interpretation-panel.tsx`): 指標から日本語の見出し・5項目(リターン/最大の下落/リスクあたりの効率/保有時間/取引の中身)・注意点(取引回数が少ない・期間が短い・合成データ・過剰最適化)を自動で作る。良い/悪いは色・アイコン・読み上げ用の言葉の3つで伝える
- 指標の意味を、スマホでも指標名の下に表示
- frontend の単体テスト(vitest): 28件(結果の読み方・ヒストグラム・表示形式・入力チェック)
- `./dev.sh`: backend と frontend を1コマンドで起動・停止(古いプロセスの自動停止、`--install`)
- アクセシビリティ: 補助テキストの色(faint)が WCAG AA の 4.5:1 に届いていなかった(3.2〜3.6)→ #76819d に変更(4.6〜4.9)

### 性能の確認(合成データ、日足)
| 期間 | 本数 | API | 結果ページの表示 | ホバー1回 | 結果の JSON |
|---|---|---|---|---|---|
| 5年 | 1,305 | 0.2 秒 | 1.5 秒 | 16ms | 354KB |
| 26年 | 7,015 | 0.5 秒 | 1.3 秒 | 16ms | 1.9MB |
→ 間引きは不要と判断

### 画面確認で直したこと
- 「結果の読み方」の見出しが、戦略そのものが損失(−37%)のときも「守りを重視した結果です」だけで、良い結果に読めた → 損失のときは必ず見出しに書く(テスト追加)

### テスト結果(クラウド作業環境)
| 項目 | 結果 |
|---|---|
| pytest | 251 passed |
| vitest | 28 passed |
| ruff / tsc / eslint / next build | OK |
| Playwright(desktop / mobile) | 71 passed、1 skipped |

### 未解決の課題(今後)
1. 長期間の結果は1件 2MB 近くになる。保存件数が増えると DB が大きくなる → 系列を圧縮して保存するか、古い結果の系列を間引く
2. pytest の StarletteDeprecationWarning(httpx → httpx2)。依存の入れ替えが必要で、作業環境の制限で未対応
3. 一般公開・課金をするなら、商用利用できるデータ元への差し替えが必須(Yahoo の規約)
4. GPU 版エンジン(simulate の CUDA 化)とパラメータ探索は、このアプリの次の段階
