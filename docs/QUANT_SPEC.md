# QuantLab 金融計算仕様書 (v0.4 / Phase 5)

> この文書が「正」。`backend/quant/` の実装とテストはこの仕様に従う。
> 仕様を変えるときは、先にこの文書を更新し、変更理由を「変更履歴」に書く。

---

## 0. 用語と記号

| 記号 | 意味 |
|---|---|
| `t` | バー(日足なら1営業日)のインデックス。0 が最古 |
| `O_t, H_t, L_t, C_t` | **調整済み**の始値・高値・安値・終値(§2) |
| `V_t` | 出来高 |
| `s_t` | 戦略が返す「目標ポジション」。t の終値時点までの情報だけで決まる。long-only なので {0, 1} |
| `q_t` | t の終値時点で保有している株数(整数) |
| `cash_t` | t の終値時点の現金 |
| `E_t` | t の終値時点の資産 = `cash_t + q_t * C_t` |
| `P` | 年率換算係数。日足 252、週足 52、月足 12 |

---

## 1. 入力データ(OHLCV)

### 1.1 形式
`pandas.DataFrame`

- index: `DatetimeIndex`。tz なし、取引所現地の日付。**昇順・重複なし**
  - Yahoo は tz 付き(Asia/Tokyo, America/New_York)で返すため、Provider 側で `tz_localize(None)` して**現地日付をそのまま残す**。`tz_convert` はしない(米国株の日付が1日ずれるため)
- columns: `open, high, low, close, adj_close, volume`(すべて float64。volume は float でも可)

### 1.2 `validate_ohlcv(df) -> pd.DataFrame`
ファイル: `backend/app/data/validation.py`

| チェック | 違反時 |
|---|---|
| 必須列がそろっている | `DataValidationError` |
| index が DatetimeIndex、重複なし | 重複は `DataValidationError`(勝手に消さない) |
| 昇順 | 昇順でなければ **並べ替えて返す**(情報は失われないため) |
| open/high/low/close/adj_close > 0 | `DataValidationError` |
| high >= max(open, close), low <= min(open, close) | 許容誤差 1e-6 相対。超えたら `DataValidationError` |
| volume >= 0 | `DataValidationError` |
| OHLC に NaN の行 | **行ごと除外**し、除外した日付を `warnings` として返す(Yahoo は休場日に NaN 行を返すことがあるため) |

戻り値: `(clean_df, warnings: list[str])`

---

## 2. 株式分割・配当の調整

### 2.1 Yahoo のデータ仕様(2026-11-23 に実データで一部確認済み)
- `Close` … **分割調整済み・配当未調整**(2026-11-23 に実データで確認済み)
  - 分割: NVDA(2024-06 1:10)、7203.T(2021-10 1:5)とも、分割日の前後で Close が跳ばない
  - 配当: Adj Close / Close は過去ほど小さく、配当落ち日に段差がある
- `Adj Close` の丸め: Yahoo の Adj Close は丸められているので、配当の無い日でも調整係数が 1e-6 程度ゆれる(例: 0.992041 → 0.992042 → 0.992041)。リターンへの影響は 1e-6 程度で無視できる
- `Open/High/Low` … 分割調整済み・配当未調整
- `Volume` … 分割調整済み

### 2.2 調整方法 `adjust_ohlc(df, mode) -> pd.DataFrame`
ファイル: `backend/quant/adjust.py`

- `mode="total_return"`(デフォルト):
  `f_t = adj_close_t / close_t`、`O_t = open_t * f_t`(H, L, C も同様。`C_t = adj_close_t`)
  → 配当再投資を仮定したリターンになる。シグナルとリターンの基準が一致する。
- `mode="split_only"`: Yahoo の open/high/low/close をそのまま使う。配当収入は**無視**(過小評価になることを UI で明示)。

### 2.3 既知の限界(UI の注記に出す)
- `total_return` モードでは、過去の価格が実際の約定価格より低く表示される(配当の分だけ)。取引履歴の価格は「調整後価格」と明記する。
- 単元株(100株)の判定も調整後価格で行うので、実際に必要な資金とわずかにずれる。

---

## 3. テクニカル指標
ファイル: `backend/quant/indicators.py`
共通ルール:
- 入力は `pd.Series`(float)、出力は同じ index の `pd.Series`
- **t の値は t 以前のデータだけで決まる**(`shift(-k)` や中心化 rolling は禁止)
- 計算に必要な本数がそろわない期間は `NaN`
- 期間パラメータ `n` は整数かつ `n >= 1`(RSI は `n >= 2`)。違反すると `InvalidParameterError`

| 関数 | 定義 | 最初に値が出る位置 |
|---|---|---|
| `sma(x, n)` | 直近 n 本の単純平均 | `n-1` |
| `ema(x, n)` | `α = 2/(n+1)`。位置 `n-1` の初期値を `sma(x, n)` とし、以後 `e_t = α x_t + (1-α) e_{t-1}` | `n-1` |
| `rsi(x, n)` | Wilder 式。`Δ_t = x_t - x_{t-1}`、gain = max(Δ,0)、loss = max(-Δ,0)。位置 n の初期値を直近 n 個の単純平均とし、以後 `avg_t = (avg_{t-1}(n-1) + v_t)/n`。`RSI = 100 - 100/(1+avg_gain/avg_loss)`。avg_loss=0 かつ avg_gain>0 → 100、両方 0 → 50 | `n` |
| `macd(x, fast, slow, signal)` | `line = ema(x,fast) - ema(x,slow)`、`sig = ema(line, signal)`(line の NaN 以降で計算)、`hist = line - sig`。`fast < slow` でなければ `InvalidParameterError` | line: `slow-1`、sig: `slow+signal-2` |
| `bollinger(x, n, k)` | `mid = sma(x,n)`、`sd = 母標準偏差(ddof=0)`、`upper/lower = mid ± k*sd`。`k > 0` | `n-1` |
| `roc(x, n)` | `x_t / x_{t-n} - 1` | `n` |
| `zscore(x, n)` | `(x_t - sma(x,n)_t) / sd_t`(ddof=0)。sd=0 のとき NaN | `n-1` |

---

## 4. 戦略(シグナル生成)
ファイル: `backend/quant/strategies/*.py`

### 4.1 インターフェース
戦略は「売買の**きっかけ(イベント)**」だけを返し、ポジションの状態管理は共通関数が行う。
```python
class Strategy(ABC):
    id: str
    def param_schema(self) -> list[ParamSpec]               # UI のフォーム生成に使う
    def validate_params(self, params) -> dict                # 型・範囲・相互関係のチェック。既定値を補う
    def min_bars(self, params) -> int                        # 指標が最初に有効になるまでの本数
    def events(self, df, params) -> tuple[Series, Series]    # (entry, exit) の bool 列

def generate_signals(strategy, df, params, trade_start=None) -> pd.Series  # s_t ∈ {0,1}, int8
```
- `events`: entry[t] = 「t の終値時点で買いの条件を満たす」、exit[t] = 「売りの条件を満たす」。指標が NaN のバーは両方 False
- `generate_signals`: 状態機械。`trade_start` より前は必ず 0。`trade_start` 以降、ノーポジで entry → 1、保有中で exit → 0
  - 同じバーで entry と exit が両方 True のとき: ノーポジなら買わない、保有中なら売る(慎重な側に倒す)
- **「s_t は C_t の確定後に決まる」**。約定はエンジンが t+1 の始値で行う(§5)

### 4.2 売買ルール(すべて long-only)
| 戦略 | 買い(0→1) | 売り(1→0) | パラメータ(デフォルト) |
|---|---|---|---|
| SMA Crossover | 短期SMAが長期SMAを**上抜けたバー** | 下抜けたバー | short=20, long=50(short<long) |
| EMA Crossover | 同上(EMA) | 同上 | short=12, long=26 |
| RSI | RSI < lower | RSI > upper | n=14, lower=30, upper=70(0<lower<upper<100) |
| MACD | line が signal を上抜け | 下抜け | 12, 26, 9 |
| Bollinger Bands | C < lower | C > mid | n=20, k=2.0 |
| Momentum | ROC(n) > th のとき保有 | ROC(n) <= th | n=60, th=0.0 |
| Mean Reversion | z < -entry_z | z >= -exit_z | n=20, entry_z=2.0, exit_z=0.0(exit_z<entry_z) |
| Buy and Hold | 最初の有効バー | 売らない | なし |

「上抜け」の定義: `a_{t-1} <= b_{t-1}` かつ `a_t > b_t`(t-1 と t の両方で a, b が有効なこと)。
クロス系は**イベント型**(期間開始時点で既に短期>長期でも、クロスが起きるまで買わない)。
Momentum は「条件を満たしている間は保有」なので、entry = 条件成立、exit = 条件不成立 とする(状態機械に通すと同じ結果になる)。
Buy and Hold は entry = 常に True、exit = 常に False。

### 4.3 ウォームアップ
分析開始日より前に `min_bars` 本以上のデータを取得して指標を計算する。
**指標はウォームアップ期間から計算するが、状態機械は分析開始日(`trade_start`)から動かす。**
(過去データを使うだけなので Look-ahead ではない。ウォームアップ中に起きたクロスで、初日から保有状態になることもない)
ウォームアップ分が取れない場合は、取れる範囲で計算し、`warnings` に記録する。

---

## 5. バックテストエンジン
ファイル: `backend/quant/engine.py`

### 5.1 設定 `BacktestConfig`
| 項目 | 型 | デフォルト | 制約 |
|---|---|---|---|
| initial_capital | float | 1,000,000 | > 0 |
| commission_rate | float | 0.0005(0.05%) | 0 <= x < 0.1 |
| commission_min | float | 0 | >= 0 |
| slippage_bps | float | 5(0.05%) | 0 <= x < 1000 |
| sizing_mode | "percent_equity" / "fixed_shares" | percent_equity | |
| sizing_value | float | 1.0(=100%) | percent: (0,1]、fixed: >0 の整数 |
| lot_size | int | 日本株 100 / 米国株 1 | >= 1 |
| price_mode | "total_return" / "split_only" | total_return | |
| long_only | bool | True | Phase 5 では True 固定 |

### 5.2 約定ルール(Look-ahead 防止の核)
1. バー t の終値後に `s_t` を見る
2. `s_t != (q_t > 0)` なら、**バー t+1 の始値**で注文を約定させる
3. 最終バーで出たシグナルは約定しない(`pending_signal` として結果に記録)

### 5.3 約定価格・手数料
- 買い: `fill = O_{t+1} * (1 + slip)`、売り: `fill = O_{t+1} * (1 - slip)`(`slip = slippage_bps / 10000`)
- 手数料: `fee = max(commission_min, fill * qty * commission_rate)`(1回の注文ごと)

### 5.4 ポジションサイズ(買い時のみ。売りは全株売却)
- percent_equity: `qty = floor(cash * sizing_value / fill / lot_size) * lot_size`(ノーポジ時は E = cash)
- fixed_shares: `qty = floor(sizing_value / lot_size) * lot_size`
- 共通: `fill*qty + fee <= cash` になるまで `lot_size` ずつ減らす
  - fixed_shares で株数を減らした場合は `reduced_orders` に記録する(指定した株数で買えていないことを隠さない)
- `qty == 0` → 注文は**スキップ**し、`skipped_orders` に理由(`insufficient_cash`)を記録する。エラーにはしない
- **スキップした後も `s = 1` が続いていれば、次のバーでもう一度買いを試みる**(目標ポジションに追いつこうとする)。
  そのため、買いの約定がシグナルの日より何日も遅れることがある(その分は `skipped_orders` に残る)

### 5.5 資産推移
`E_t = cash_t + q_t * C_t`。初日の `E = initial_capital`。

### 5.6 期間終了時のポジション
最終終値で時価評価し、取引は `status="open"` で記録する。**勝率・PF は決済済みの取引だけで計算する。**
- 未決済の取引: `exit_date` = 最終日、`exit_price` = 最終日の終値(スリッページなし)、`exit_fee` = 0。pnl は含み損益
- 最終バーで `s` と保有状態が食い違っている(= 翌日に売買するはずだった)場合は、`pending_signal`("buy" / "sell")として記録する

### 5.6.1 初日の扱い
分析期間の初日(バー 0)は約定できない(前日のシグナルが無いため)。`E_0 = initial_capital`。
最も早い約定はバー 1 の始値(バー 0 の終値で出たシグナル)。

### 5.7 例外
| 状況 | 挙動 |
|---|---|
| 分析期間のバーが 2 本未満 | `InsufficientDataError` |
| 設定値が範囲外 | `InvalidParameterError` |
| 取引ゼロ | 正常終了。trades=[]、資産は一定 |

### 5.8 GPU 化を見据えた構造
エンジンの中核は **NumPy 配列だけを受け取る純粋関数** `simulate(open, close, target, cfg) -> SimArrays` にする。
pandas の変換は外側の `run_backtest()` で行う。将来はこの `simulate` を Numba / CUDA カーネルに差し替え、「1スレッド = 1パラメータ組」で並列化する。

---

## 6. 取引記録 `Trade`
| 項目 | 定義 |
|---|---|
| entry_date / exit_date | 約定したバーの日付 |
| entry_price / exit_price | スリッページ込みの約定価格 |
| qty | 株数 |
| entry_fee / exit_fee | 手数料 |
| pnl | `(exit_price*qty - exit_fee) - (entry_price*qty + entry_fee)` |
| return | `pnl / (entry_price*qty + entry_fee)` |
| bars_held / days_held | バー数 / 暦日数 |
| status | "closed" / "open" |

---

## 7. パフォーマンス指標
ファイル: `backend/quant/metrics.py`
`r_t = E_t/E_{t-1} - 1`、`rf` = 無リスク金利(年率、デフォルト 0)、`rf_p = (1+rf)^(1/P) - 1`

| 指標 | 定義 | 計算できないとき |
|---|---|---|
| Total Return | `E_T/E_0 - 1` | — |
| CAGR | `(E_T/E_0)^(1/Y) - 1`、`Y = 暦日数/365.25` | Y<=0 → None |
| Volatility | `std(r, ddof=1) * √P` | 本数<2 → None |
| Sharpe | `mean(r - rf_p) / std(r, ddof=1) * √P` | std=0 → None |
| Sortino | `mean(r - rf_p) / DD * √P`、`DD = √mean(min(r - rf_p, 0)²)` | DD=0 → None |
| Max Drawdown | `min(E_t / max_{u<=t} E_u - 1)`(負の値) | — |
| Win Rate | 決済済みで pnl>0 の数 / 決済済みの数 | 0件 → None |
| Profit Factor | Σ(pnl>0) / \|Σ(pnl<0)\| | 0件 → None、損失ゼロ → +inf |
| Total Trades | 決済済み + 未決済 | — |

**None は UI で「—」と表示する。0 や架空の値で埋めない。**

月別・年別リターン: その月(年)の最後の E / 前月(年)の最後の E - 1(最初の月は E_0 が基準)。

---

## 8. Look-ahead Bias テスト方針
1. **前方切り捨て不変性**: 全戦略で `generate_signals(df[:k])` が `generate_signals(df)[:k]` と一致することを、複数の k で確認する
2. **未来の改ざん不変性**: t+1 以降の価格をランダムに書き換えても、t 以前の `s` と、t までの `E` が変わらないことを確認する
3. **約定タイミング**: 手計算した5〜10本の小さいデータで、約定日が「シグナルの翌バー」、約定価格が「その始値 ± スリッページ」になることを確認する

---

## 付録A: 手計算の例(test_engine.py の期待値)

設定: 初期資金 10,000、手数料 0.1%(最低なし)、スリッページ 100bps(1%)、percent_equity 100%、単元 1 株、split_only

| t | 日付 | 始値 | 終値 | s_t | その日の約定 | 現金 | 株数 | 資産 E_t |
|---|---|---|---|---|---|---|---|---|
| 0 | D0 | 100 | 100 | 1 | なし(初日) | 10,000 | 0 | 10,000 |
| 1 | D1 | 101 | 102 | 1 | 買い 97株 @102.01 | 95.13503 | 97 | 9,989.13503 |
| 2 | D2 | 104 | 105 | 0 | なし | 95.13503 | 97 | 10,280.13503 |
| 3 | D3 | 103 | 101 | 0 | 売り 97株 @101.97 | 9,976.33394 | 0 | 9,976.33394 |
| 4 | D4 | 99 | 98 | 1 | なし | 9,976.33394 | 0 | 9,976.33394 |
| 5 | D5 | 100 | 103 | 1 | 買い 98株 @101.00 | 68.43594 | 98 | 10,162.43594 |
| 6 | D6 | 106 | 107 | 1 | なし(最終日) | 68.43594 | 98 | 10,554.43594 |

計算の過程:
- D1 の買い: 約定価格 = 101 × 1.01 = 102.01。株数 = floor(10,000 / 102.01) = 98 → 98 × 102.01 = 9,996.98、手数料 9.99698、合計 10,006.97698 > 10,000 なので 1 株減らして 97 株。
  97 × 102.01 = 9,894.97、手数料 9.89497、合計 9,904.86497。現金 = 10,000 − 9,904.86497 = 95.13503
- D3 の売り: 約定価格 = 103 × 0.99 = 101.97。売却額 97 × 101.97 = 9,891.09、手数料 9.89109。現金 = 95.13503 + 9,891.09 − 9.89109 = 9,976.33394
- D5 の買い: 約定価格 = 100 × 1.01 = 101.00。株数 = floor(9,976.33394 / 101) = 98。98 × 101 = 9,898、手数料 9.898、合計 9,907.898(現金内に収まる)。現金 = 68.43594

取引:
| # | 買い | 売り | 株数 | 損益 | リターン | 状態 |
|---|---|---|---|---|---|---|
| 1 | D1 @102.01(手数料 9.89497) | D3 @101.97(手数料 9.89109) | 97 | −23.66606 | −0.23893% | 決済済み |
| 2 | D5 @101.00(手数料 9.898) | D6 終値 107 で評価 | 98 | +578.102 | +5.83476% | 未決済 |

- 取引1の損益 = (9,891.09 − 9.89109) − (9,894.97 + 9.89497) = 9,881.19891 − 9,904.86497 = −23.66606
- 取引2の損益 = 98 × 107 − 9,907.898 = 578.102
- Total Return = 10,554.43594 / 10,000 − 1 = 5.5443594%
- Win Rate = 0 / 1(決済済みのみ)= 0%、Profit Factor = 0 / 23.66606 = 0

## 変更履歴
- v0.1 (2026-11-23): 初版
- v0.2 (2026-11-23): 実データ確認の結果を反映。tz の扱い(§1.1)、配当未調整の確認と分割確認の方法(§2.1)
- v0.4 (2026-11-23): §5.4 株数の計算式、買えなかったときの再試行、fixed_shares の株数削減の記録。§5.6 未決済取引と pending_signal の値。§5.6.1 初日の扱い。付録A(手計算の例)
- v0.3.1 (2026-11-23): §2.1 を実データの確認結果で確定(分割調整済み・Adj Close の丸め)
- v0.3 (2026-11-23): §4.1 と §4.3 の矛盾を解消。「ウォームアップ中のクロスで初日から保有になる」問題を、戦略=イベント、状態管理=共通関数(trade_start から開始)に分けて解決
