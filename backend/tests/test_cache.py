from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pytest

from app.data.base import Interval, MarketDataProvider
from app.data.cache import CachedProvider
from app.db.session import make_engine


class CountingProvider(MarketDataProvider):
    """呼ばれた回数と期間を記録する偽のデータ元。

    adj_factor を変えると「配当で調整後終値が変わった」状況を作れる。
    """

    name = "fake"

    def __init__(self):
        self.calls: list[tuple[date, date]] = []
        self.adj_factor = 0.9

    def search(self, query, market=None):
        return []

    def get_quote(self, symbol):
        raise NotImplementedError

    def get_ohlcv(self, symbol, start, end, interval):
        self.calls.append((start, end))
        idx = pd.bdate_range(start, end, name="date")
        close = pd.Series(range(100, 100 + len(idx)), index=idx, dtype=float)
        return pd.DataFrame(
            {
                "open": close,
                "high": close + 1,
                "low": close - 1,
                "close": close,
                "adj_close": close * self.adj_factor,
                "volume": 1.0,
            }
        )


class Clock:
    def __init__(self):
        self.t = datetime(2026, 1, 10, tzinfo=UTC)

    def __call__(self):
        return self.t


@pytest.fixture
def setup(tmp_path):
    inner, clock = CountingProvider(), Clock()
    cached = CachedProvider(inner, make_engine(f"sqlite:///{tmp_path}/c.db"), now=clock)
    return inner, cached, clock


D = Interval.DAILY


def test_second_request_inside_range_uses_cache(setup):
    inner, cached, _ = setup
    a = cached.get_ohlcv("7203.T", date(2024, 1, 1), date(2024, 3, 31), D)
    b = cached.get_ohlcv("7203.T", date(2024, 2, 1), date(2024, 2, 29), D)
    assert len(inner.calls) == 1
    pd.testing.assert_frame_equal(b, a.loc["2024-02-01":"2024-02-29"], check_freq=False)


def test_symbol_case_shares_cache(setup):
    inner, cached, _ = setup
    cached.get_ohlcv("aapl", date(2024, 1, 1), date(2024, 1, 31), D)
    cached.get_ohlcv("AAPL", date(2024, 1, 1), date(2024, 1, 31), D)
    assert len(inner.calls) == 1


def test_intervals_are_cached_separately(setup):
    inner, cached, _ = setup
    cached.get_ohlcv("X", date(2024, 1, 1), date(2024, 1, 31), D)
    cached.get_ohlcv("X", date(2024, 1, 1), date(2024, 1, 31), Interval.WEEKLY)
    assert len(inner.calls) == 2


def test_expired_cache_is_refetched(setup):
    inner, cached, clock = setup
    cached.get_ohlcv("X", date(2024, 1, 1), date(2024, 1, 31), D)
    clock.t += timedelta(hours=13)
    cached.get_ohlcv("X", date(2024, 1, 1), date(2024, 1, 31), D)
    assert len(inner.calls) == 2


def test_extending_range_refetches_union_and_replaces_adjusted_prices(setup):
    """範囲を広げたら、古い範囲も含めて取り直し、調整後終値が混ざらないこと。"""
    inner, cached, _ = setup
    cached.get_ohlcv("X", date(2024, 2, 1), date(2024, 2, 29), D)
    inner.adj_factor = 0.8  # この間に配当があって、過去の調整後終値が変わったとする
    df = cached.get_ohlcv("X", date(2024, 1, 1), date(2024, 2, 29), D)

    assert inner.calls[-1] == (date(2024, 1, 1), date(2024, 2, 29))  # 和集合を取り直した
    ratio = df["adj_close"] / df["close"]
    assert ratio.round(10).nunique() == 1  # 新旧の値が混ざっていない
    # 次の要求はキャッシュから。値も新しい係数のまま
    again = cached.get_ohlcv("X", date(2024, 2, 1), date(2024, 2, 10), D)
    assert len(inner.calls) == 2
    assert (again["adj_close"] / again["close"]).round(10).unique().tolist() == [0.8]


def test_cache_returns_only_requested_range(setup):
    _, cached, _ = setup
    df = cached.get_ohlcv("X", date(2024, 1, 10), date(2024, 1, 12), D)
    assert df.index.min() >= pd.Timestamp("2024-01-10")
    assert df.index.max() <= pd.Timestamp("2024-01-12")
