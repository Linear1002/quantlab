"""指標の正確性テスト。期待値はすべて手計算できる小さなデータで作っている。"""

import math

import numpy as np
import pandas as pd
import pytest

from quant import indicators as ind
from quant.errors import InvalidParameterError

NAN = np.nan


def s(*values):
    return pd.Series(
        values, dtype="float64", index=pd.date_range("2024-01-01", periods=len(values))
    )


def assert_series(actual, expected, tol=1e-9):
    np.testing.assert_allclose(
        actual.to_numpy(), np.array(expected, dtype=float), atol=tol, equal_nan=True
    )


# ---- SMA / EMA ---------------------------------------------------------


def test_sma():
    assert_series(ind.sma(s(1, 2, 3, 4, 5), 3), [NAN, NAN, 2, 3, 4])


def test_ema_seeded_with_sma():
    # α = 2/(3+1) = 0.5。位置2の初期値 = (1+2+3)/3 = 2
    # 位置3: 0.5*4 + 0.5*2 = 3、位置4: 0.5*5 + 0.5*3 = 4
    assert_series(ind.ema(s(1, 2, 3, 4, 5), 3), [NAN, NAN, 2, 3, 4])


def test_ema_non_trivial():
    # α = 2/(2+1) = 2/3。初期値 = (10+20)/2 = 15
    # 位置2: 2/3*40 + 1/3*15 = 31.6667、位置3: 2/3*10 + 1/3*31.6667 = 17.2222
    assert_series(ind.ema(s(10, 20, 40, 10), 2), [NAN, 15, 31.666666667, 17.222222222], tol=1e-6)


def test_ema_with_leading_nan():
    assert_series(ind.ema(s(NAN, NAN, 1, 2, 3, 4), 3), [NAN, NAN, NAN, NAN, 2, 3])


def test_ema_rejects_nan_in_middle():
    with pytest.raises(InvalidParameterError):
        ind.ema(s(1, 2, NAN, 4, 5), 2)


def test_ema_too_short_is_all_nan():
    assert ind.ema(s(1, 2), 3).isna().all()


# ---- RSI ---------------------------------------------------------------


def test_rsi_hand_computed():
    # 変化: +1, +1, -1, -1(n=2)
    # 位置2: 平均上昇 (1+1)/2=1, 平均下落 0 → 100
    # 位置3: 上昇 (1*1+0)/2=0.5, 下落 (0*1+1)/2=0.5 → 50
    # 位置4: 上昇 (0.5+0)/2=0.25, 下落 (0.5+1)/2=0.75 → 100-100/(1+1/3)=25
    assert_series(ind.rsi(s(1, 2, 3, 2, 1), 2), [NAN, NAN, 100, 50, 25])


def test_rsi_flat_is_50_and_bounds():
    assert_series(ind.rsi(s(5, 5, 5, 5), 2), [NAN, NAN, 50, 50])
    rng = np.random.default_rng(0)
    r = ind.rsi(pd.Series(100 + rng.normal(0, 1, 300).cumsum()), 14).dropna()
    assert ((r >= 0) & (r <= 100)).all()


def test_rsi_matches_reference_loop():
    """別の書き方(素直な for ループ)で計算した RSI と一致すること。"""
    rng = np.random.default_rng(1)
    x = 100 + rng.normal(0, 1, 120).cumsum()
    n = 14
    ref = [NAN] * len(x)
    gains = [max(x[i] - x[i - 1], 0) for i in range(1, len(x))]
    losses = [max(x[i - 1] - x[i], 0) for i in range(1, len(x))]
    ag, al = sum(gains[:n]) / n, sum(losses[:n]) / n
    ref[n] = 100 - 100 / (1 + ag / al)
    for i in range(n, len(gains)):
        ag = (ag * (n - 1) + gains[i]) / n
        al = (al * (n - 1) + losses[i]) / n
        ref[i + 1] = 100 - 100 / (1 + ag / al)
    assert_series(ind.rsi(pd.Series(x), n), ref, tol=1e-9)


# ---- MACD / Bollinger / ROC / Zスコア -------------------------------------


def test_macd_structure():
    rng = np.random.default_rng(2)
    x = pd.Series(100 + rng.normal(0, 1, 100).cumsum())
    line, sig, hist = ind.macd(x, 3, 6, 4)
    assert_series(line, ind.ema(x, 3) - ind.ema(x, 6))
    assert line.first_valid_index() == 5  # slow - 1
    assert sig.first_valid_index() == 8  # slow + signal - 2
    assert_series(hist, line - sig)


def test_bollinger_population_std():
    mid, up, lo = ind.bollinger(s(1, 2, 3), 3, 2.0)
    sd = math.sqrt(2 / 3)  # 母標準偏差(ddof=0)
    assert_series(mid, [NAN, NAN, 2])
    assert_series(up, [NAN, NAN, 2 + 2 * sd])
    assert_series(lo, [NAN, NAN, 2 - 2 * sd])


def test_roc():
    assert_series(ind.roc(s(100, 110, 121, 99), 2), [NAN, NAN, 0.21, -0.1])


def test_zscore_and_zero_std():
    sd = math.sqrt(2 / 3)
    assert_series(ind.zscore(s(1, 2, 3), 3), [NAN, NAN, 1 / sd])
    assert ind.zscore(s(4, 4, 4, 4), 3).isna().all()


# ---- 交差 --------------------------------------------------------------


def test_cross_above_and_below():
    a = s(1, 2, 3, 3, 1, NAN, 5)
    b = s(2, 2, 2, 3, 2, 2, 2)
    # 位置2: 前日 2<=2、当日 3>2 → 上抜け。位置4: 前日 3>=3、当日 1<2 → 下抜け
    # 位置6: 前日が NaN なので判定しない
    assert ind.cross_above(a, b).tolist() == [False, False, True, False, False, False, False]
    assert ind.cross_below(a, b).tolist() == [False, False, False, False, True, False, False]


# ---- 入力チェック ---------------------------------------------------------


@pytest.mark.parametrize(
    "call",
    [
        lambda x: ind.sma(x, 0),
        lambda x: ind.sma(x, 2.5),
        lambda x: ind.sma(x, True),
        lambda x: ind.rsi(x, 1),
        lambda x: ind.macd(x, 26, 12, 9),
        lambda x: ind.bollinger(x, 20, 0),
        lambda x: ind.zscore(x, 1),
    ],
)
def test_invalid_parameters(call):
    with pytest.raises(InvalidParameterError):
        call(s(1, 2, 3, 4, 5))


# ---- 未来を見ていないこと -------------------------------------------------

INDICATORS = {
    "sma": lambda x: ind.sma(x, 10),
    "ema": lambda x: ind.ema(x, 10),
    "rsi": lambda x: ind.rsi(x, 14),
    "macd": lambda x: ind.macd(x, 12, 26, 9)[1],
    "boll": lambda x: ind.bollinger(x, 20, 2)[2],
    "roc": lambda x: ind.roc(x, 20),
    "z": lambda x: ind.zscore(x, 20),
}


@pytest.mark.parametrize("name", INDICATORS)
def test_indicators_do_not_look_ahead(name):
    """t 以降のデータを書き換えても、t より前の値が変わらないこと。"""
    rng = np.random.default_rng(3)
    x = pd.Series(100 + rng.normal(0, 1, 200).cumsum())
    full = INDICATORS[name](x)
    for k in (40, 90, 150):
        future_changed = x.copy()
        future_changed.iloc[k:] = 100 + rng.normal(0, 5, len(x) - k).cumsum()
        changed = INDICATORS[name](future_changed)
        pd.testing.assert_series_equal(changed.iloc[:k], full.iloc[:k])
