import numpy as np
import pandas as pd
import pytest

from app.data.base import DataValidationError
from app.data.validation import validate_ohlcv


def make_df(n=5, start="2024-01-01"):
    idx = pd.date_range(start, periods=n, freq="B", name="date")
    close = np.linspace(100, 104, n)
    return pd.DataFrame(
        {
            "open": close - 0.5,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "adj_close": close * 0.98,
            "volume": 1000.0,
        },
        index=idx,
    )


def test_valid_data_passes_unchanged():
    df = make_df()
    out, warnings = validate_ohlcv(df)
    pd.testing.assert_frame_equal(out, df)
    assert warnings == []


def test_input_is_not_modified():
    df = make_df()
    df.iloc[2, 0] = np.nan
    before = df.copy()
    validate_ohlcv(df)
    pd.testing.assert_frame_equal(df, before)


def test_missing_column_raises():
    with pytest.raises(DataValidationError, match="必須の列"):
        validate_ohlcv(make_df().drop(columns="adj_close"))


def test_duplicate_dates_raise():
    df = make_df()
    df.index = pd.DatetimeIndex([df.index[0], *df.index[:-1]], name="date")
    with pytest.raises(DataValidationError, match="重複"):
        validate_ohlcv(df)


def test_tz_aware_index_raises():
    df = make_df()
    df.index = df.index.tz_localize("Asia/Tokyo")
    with pytest.raises(DataValidationError, match="タイムゾーン"):
        validate_ohlcv(df)


def test_unsorted_is_sorted_with_warning():
    df = make_df().iloc[::-1]
    out, warnings = validate_ohlcv(df)
    assert out.index.is_monotonic_increasing
    assert any("並べ替え" in w for w in warnings)


def test_nan_price_rows_are_dropped_with_warning():
    df = make_df()
    df.iloc[1, df.columns.get_loc("close")] = np.nan
    out, warnings = validate_ohlcv(df)
    assert len(out) == 4
    assert df.index[1] not in out.index
    assert any("2024-01-02" in w for w in warnings)


def test_nan_volume_becomes_zero_with_warning():
    df = make_df()
    df.iloc[0, df.columns.get_loc("volume")] = np.nan
    out, warnings = validate_ohlcv(df)
    assert out["volume"].iloc[0] == 0
    assert warnings


@pytest.mark.parametrize("col,value", [("close", 0.0), ("low", -1.0), ("adj_close", np.inf)])
def test_non_positive_or_inf_price_raises(col, value):
    df = make_df()
    df.iloc[0, df.columns.get_loc(col)] = value
    with pytest.raises(DataValidationError):
        validate_ohlcv(df)


def test_negative_volume_raises():
    df = make_df()
    df.iloc[0, df.columns.get_loc("volume")] = -5
    with pytest.raises(DataValidationError, match="出来高"):
        validate_ohlcv(df)


def test_high_below_close_raises():
    df = make_df()
    df.iloc[3, df.columns.get_loc("high")] = df["close"].iloc[3] - 0.1
    with pytest.raises(DataValidationError, match="高値・安値"):
        validate_ohlcv(df)


def test_tiny_float_error_is_tolerated():
    df = make_df()
    # high が close よりごくわずかに小さい(浮動小数点の丸め誤差レベル)のは許す
    df.iloc[0, df.columns.get_loc("high")] = df["close"].iloc[0] * (1 - 1e-9)
    validate_ohlcv(df)


def test_empty_after_dropping_returns_empty():
    df = make_df(2)
    df["close"] = np.nan
    out, warnings = validate_ohlcv(df)
    assert out.empty and warnings
