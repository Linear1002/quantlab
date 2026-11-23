import numpy as np
import pandas as pd
import pytest

from quant.adjust import adjust_ohlc
from quant.errors import InvalidParameterError


def frame():
    idx = pd.bdate_range("2024-01-01", periods=3)
    return pd.DataFrame(
        {
            "open": [100.0, 102.0, 104.0],
            "high": [101.0, 103.0, 106.0],
            "low": [99.0, 101.0, 103.0],
            "close": [100.0, 102.0, 105.0],
            # 位置1と2の間に配当 → 過去(位置0,1)の調整係数が 0.98
            "adj_close": [98.0, 99.96, 105.0],
            "volume": [10.0, 20.0, 30.0],
        },
        index=idx,
    )


def test_total_return_scales_ohlc_by_factor():
    out = adjust_ohlc(frame(), "total_return")
    np.testing.assert_allclose(out["close"], [98.0, 99.96, 105.0])
    np.testing.assert_allclose(out["open"], [98.0, 99.96, 104.0])
    np.testing.assert_allclose(out["high"], [98.98, 100.94, 106.0])
    np.testing.assert_allclose(out["low"], [97.02, 98.98, 103.0])
    np.testing.assert_allclose(out["volume"], [10, 20, 30])  # 出来高は変えない
    assert "adj_close" not in out.columns


def test_split_only_keeps_prices():
    out = adjust_ohlc(frame(), "split_only")
    pd.testing.assert_frame_equal(out, frame().drop(columns="adj_close"))


def test_input_not_modified_and_ohlc_consistent():
    df = frame()
    before = df.copy()
    out = adjust_ohlc(df)
    pd.testing.assert_frame_equal(df, before)
    assert (out["high"] >= out[["open", "close"]].max(axis=1)).all()
    assert (out["low"] <= out[["open", "close"]].min(axis=1)).all()


def test_returns_match_adj_close_returns():
    """調整後の終値リターンは Adj Close のリターンと一致する(配当込みのリターン)。"""
    out = adjust_ohlc(frame())
    pd.testing.assert_series_equal(
        out["close"].pct_change(), frame()["adj_close"].pct_change(), check_names=False
    )


def test_invalid_inputs():
    with pytest.raises(InvalidParameterError):
        adjust_ohlc(frame().drop(columns="adj_close"))
    bad = frame()
    bad.loc[bad.index[0], "adj_close"] = 0
    with pytest.raises(InvalidParameterError):
        adjust_ohlc(bad)
    with pytest.raises(ValueError):
        adjust_ohlc(frame(), "nope")
