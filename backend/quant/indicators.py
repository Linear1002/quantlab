"""テクニカル指標(QUANT_SPEC §3)。

共通ルール:
- 入力は float の pd.Series、出力は同じ index の pd.Series
- t の値は t 以前のデータだけで決まる(未来を見ない)
- 計算に必要な本数がそろわない期間は NaN
- 入力の先頭に NaN があってもよい(MACD のシグナル線のように、指標の指標を計算するため)。
  途中に NaN があるのは想定外なので InvalidParameterError
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant.errors import InvalidParameterError


def _check_period(n: int, minimum: int = 1, name: str = "n") -> None:
    if isinstance(n, bool) or not isinstance(n, (int, np.integer)) or n < minimum:
        raise InvalidParameterError(f"{name} must be an integer >= {minimum} (got {n!r})")


def _first_valid(x: np.ndarray) -> int:
    """最初の非 NaN の位置。以降に NaN があればエラー。全部 NaN なら len(x)。"""
    valid = ~np.isnan(x)
    if not valid.any():
        return len(x)
    f = int(np.argmax(valid))
    if not valid[f:].all():
        raise InvalidParameterError("input series has NaN after the first valid value")
    return f


def sma(x: pd.Series, n: int) -> pd.Series:
    """単純移動平均: 直近 n 本の平均。最初に値が出るのは位置 n-1。"""
    _check_period(n)
    return x.rolling(n, min_periods=n).mean()


def ema(x: pd.Series, n: int) -> pd.Series:
    """指数移動平均。α = 2/(n+1)。

    初期値は「最初の有効値から n 本の単純平均」とし、そこから e_t = α x_t + (1-α) e_{t-1}。
    (pandas の ewm(adjust=False) は初期値が「最初の1本」になり、序盤の値が変わるので使わない)
    """
    _check_period(n)
    v = x.to_numpy(dtype="float64")
    out = np.full(len(v), np.nan)
    f = _first_valid(v)
    seed = f + n - 1
    if seed < len(v):
        alpha = 2.0 / (n + 1)
        out[seed] = v[f : seed + 1].mean()
        for t in range(seed + 1, len(v)):
            out[t] = alpha * v[t] + (1 - alpha) * out[t - 1]
    return pd.Series(out, index=x.index)


def rsi(x: pd.Series, n: int = 14) -> pd.Series:
    """相対力指数(Wilder 式)。最初に値が出るのは位置 n。

    1. 変化 Δ_t = x_t - x_{t-1} を、上昇分 gain と下落分 loss に分ける
    2. 位置 n の平均は「直近 n 個の変化」の単純平均
    3. 以降は avg_t = (avg_{t-1} × (n-1) + 今回の値) / n で平滑化(Wilder の平滑化)
    4. RSI = 100 - 100 / (1 + avg_gain / avg_loss)
       avg_loss = 0 のとき: avg_gain > 0 なら 100、両方 0(値動きなし)なら 50
    """
    _check_period(n, minimum=2)
    v = x.to_numpy(dtype="float64")
    out = np.full(len(v), np.nan)
    f = _first_valid(v)
    if f + n >= len(v):
        return pd.Series(out, index=x.index)

    delta = np.diff(v[f:])  # delta[i] = v[f+i+1] - v[f+i]
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_g, avg_l = gain[:n].mean(), loss[:n].mean()

    def value(g: float, lo: float) -> float:
        if lo == 0:
            return 100.0 if g > 0 else 50.0
        return 100.0 - 100.0 / (1.0 + g / lo)

    out[f + n] = value(avg_g, avg_l)
    for i in range(n, len(delta)):
        avg_g = (avg_g * (n - 1) + gain[i]) / n
        avg_l = (avg_l * (n - 1) + loss[i]) / n
        out[f + i + 1] = value(avg_g, avg_l)
    return pd.Series(out, index=x.index)


def macd(
    x: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """MACD。戻り値は (MACD線, シグナル線, ヒストグラム)。

    MACD線 = EMA(fast) - EMA(slow)、シグナル線 = MACD線の EMA(signal)、ヒストグラム = 差。
    MACD線は位置 slow-1、シグナル線は位置 slow+signal-2 から値が出る。
    """
    _check_period(fast, name="fast")
    _check_period(slow, name="slow")
    _check_period(signal, name="signal")
    if fast >= slow:
        raise InvalidParameterError(f"fast ({fast}) must be < slow ({slow})")
    line = ema(x, fast) - ema(x, slow)
    sig = ema(line, signal)
    return line, sig, line - sig


def bollinger(x: pd.Series, n: int = 20, k: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    """ボリンジャーバンド。戻り値は (中心線, 上限, 下限)。

    中心線 = SMA(n)、標準偏差は母標準偏差(ddof=0。Bollinger 本人の定義に合わせる)。
    """
    _check_period(n)
    if not k > 0:
        raise InvalidParameterError(f"k must be > 0 (got {k})")
    mid = sma(x, n)
    sd = x.rolling(n, min_periods=n).std(ddof=0)
    return mid, mid + k * sd, mid - k * sd


def roc(x: pd.Series, n: int) -> pd.Series:
    """変化率(Rate of Change): x_t / x_{t-n} - 1。最初に値が出るのは位置 n。"""
    _check_period(n)
    return x / x.shift(n) - 1.0


def zscore(x: pd.Series, n: int) -> pd.Series:
    """移動平均からの乖離を標準偏差で割った値: (x_t - SMA_t) / sd_t(ddof=0)。

    sd = 0(n 本すべて同じ値)のときは割れないので NaN。
    """
    _check_period(n, minimum=2)
    mid = sma(x, n)
    sd = x.rolling(n, min_periods=n).std(ddof=0)
    return (x - mid) / sd.where(sd > 0)


def cross_above(a: pd.Series, b: pd.Series) -> pd.Series:
    """a が b を上抜けたバーで True: a_{t-1} <= b_{t-1} かつ a_t > b_t。どれかが NaN なら False。"""
    a1, b1 = a.shift(1), b.shift(1)
    valid = a.notna() & b.notna() & a1.notna() & b1.notna()
    return (valid & (a1 <= b1) & (a > b)).astype(bool)


def cross_below(a: pd.Series, b: pd.Series) -> pd.Series:
    """a が b を下抜けたバーで True: a_{t-1} >= b_{t-1} かつ a_t < b_t。"""
    a1, b1 = a.shift(1), b.shift(1)
    valid = a.notna() & b.notna() & a1.notna() & b1.notna()
    return (valid & (a1 >= b1) & (a < b)).astype(bool)
