# QuantLab 金融計算仕様書 (v0.2 / Phase 1)

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
- `Close` … **配当未調整**(確認済み: 7203.T の Adj/Close は 0.969→1.0、AAPL は 0.997→1.0)。**分割調整済み**かどうかは未確認 → Phase 3 で NVDA(2024-06 1:10)、7203.T(2021-10 1:5)の分割日前後でテストする
- `Adj Close` … 分割 + 配当調整済み
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
```python
class Strategy(ABC):
    id: str
    def param_schema(self) -> list[ParamSpec]          # UI のフォーム生成に使う
    def validate_params(self, params) -> dict           # 型・範囲・相互関係のチェック
    def min_bars(self, params) -> int                   # ウォームアップに必要な本数
    def generate_signals(self, df, params) -> pd.Series # s_t ∈ {0,1}, dtype int8
```
- 指標が NaN の期間は `s_t = 0`
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

「上抜け」の定義: `a_{t-1} <= b_{t-1}` かつ `a_t > b_t`。
クロス系は**イベント型**(期間開始時点で既に短期>長期でも、クロスが起きるまで買わない)。

### 4.3 ウォームアップ
分析開始日より前に `min_bars` 本以上のデータを取得して指標を計算する。
**シグナルはウォームアップ期間にも計算するが、売買は分析開始日以降のみ。**
(過去データを使うだけなので Look-ahead ではない)
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
- percent_equity: `budget = cash * sizing_value`(ノーポジ時は E = cash)
- fixed_shares: `qty = sizing_value`
- 共通: `qty` を `lot_size` の倍数に切り下げ、`fill*qty + fee <= cash` になるまで `lot_size` ずつ減らす
- `qty == 0` → 注文は**スキップ**し、`skipped_orders` に理由(`insufficient_cash`)を記録する。エラーにはしない

### 5.5 資産推移
`E_t = cash_t + q_t * C_t`。初日の `E = initial_capital`。

### 5.6 期間終了時のポジション
最終終値で時価評価し、取引は `status="open"` で記録する。**勝率・PF は決済済みの取引だけで計算する。**

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

## 変更履歴
- v0.1 (2026-11-23): 初版
- v0.2 (2026-11-23): 実データ確認の結果を反映。tz の扱い(§1.1)、配当未調整の確認と分割確認の方法(§2.1)
