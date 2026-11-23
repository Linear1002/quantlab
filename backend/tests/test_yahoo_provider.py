"""YahooProvider のテスト。yfinance は偽物に差し替えるので、ネットワークは使わない。"""

from datetime import date

import pandas as pd
import pytest
from yfinance import exceptions as yfe

from app.data.base import (
    Interval,
    InvalidRequestError,
    Market,
    ProviderUnavailableError,
    RateLimitError,
    SymbolNotFoundError,
)
from app.data.jp_master import JpListing, JpMaster
from app.data.yahoo import YahooProvider, market_of


def yf_frame(dates, tz="Asia/Tokyo", close=(100.0, 101.0, 102.0)):
    """yfinance の history(auto_adjust=False) が返す形の DataFrame。"""
    idx = pd.DatetimeIndex(pd.to_datetime(dates)).tz_localize(tz)
    c = pd.Series(close[: len(dates)], index=idx)
    return pd.DataFrame(
        {
            "Open": c - 1,
            "High": c + 2,
            "Low": c - 2,
            "Close": c,
            "Adj Close": c * 0.97,
            "Volume": 5000,
        }
    )


class FakeTicker:
    def __init__(self, frame=None, error=None, currency="JPY"):
        self.frame, self.error, self.calls = frame, error, []
        self.fast_info = {"currency": currency}

    def history(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.frame


def provider_with(ticker, **kw):
    return YahooProvider(ticker_factory=lambda s: ticker, **kw)


# ---- get_ohlcv ---------------------------------------------------------


def test_normalizes_columns_and_removes_timezone():
    t = FakeTicker(yf_frame(["2024-01-04", "2024-01-05"]))
    df = provider_with(t).get_ohlcv("7203.T", date(2024, 1, 1), date(2024, 1, 5), Interval.DAILY)
    assert list(df.columns) == ["open", "high", "low", "close", "adj_close", "volume"]
    assert df.index.tz is None
    assert df.index.name == "date"
    # tz を外しても日付は現地日付のまま(1日ずれない)
    assert [d.date() for d in df.index] == [date(2024, 1, 4), date(2024, 1, 5)]
    assert df["adj_close"].iloc[0] == pytest.approx(97.0)


def test_us_dates_are_not_shifted():
    # 米国株(America/New_York)を日本時間に変換すると翌日になってしまう。変換しないことを確認
    t = FakeTicker(yf_frame(["2024-03-01"], tz="America/New_York"))
    df = provider_with(t).get_ohlcv("AAPL", date(2024, 3, 1), date(2024, 3, 1), Interval.DAILY)
    assert df.index[0].date() == date(2024, 3, 1)


def test_end_date_is_inclusive():
    t = FakeTicker(yf_frame(["2024-01-05"]))
    provider_with(t).get_ohlcv("7203.T", date(2024, 1, 1), date(2024, 1, 5), Interval.WEEKLY)
    call = t.calls[0]
    assert call["start"] == "2024-01-01"
    assert call["end"] == "2024-01-06"  # yfinance の end は含まないので +1日
    assert call["interval"] == "1wk"
    assert call["auto_adjust"] is False


def test_start_after_end_raises():
    with pytest.raises(InvalidRequestError):
        provider_with(FakeTicker()).get_ohlcv(
            "X", date(2024, 2, 1), date(2024, 1, 1), Interval.DAILY
        )


def test_prices_missing_returns_empty():
    t = FakeTicker(error=yfe.YFPricesMissingError("7203.T", "no data"))
    df = provider_with(t).get_ohlcv("7203.T", date(2024, 1, 1), date(2024, 1, 5), Interval.DAILY)
    assert df.empty and list(df.columns)[0] == "open"


@pytest.mark.parametrize(
    "error,expected",
    [
        (yfe.YFRateLimitError(), RateLimitError),
        (yfe.YFTickerMissingError("ZZZZ", "delisted"), SymbolNotFoundError),
        (yfe.YFTzMissingError("ZZZZ"), SymbolNotFoundError),
        (ConnectionError("CONNECT tunnel failed"), ProviderUnavailableError),
    ],
)
def test_errors_are_translated(error, expected):
    with pytest.raises(expected):
        provider_with(FakeTicker(error=error)).get_ohlcv(
            "ZZZZ", date(2024, 1, 1), date(2024, 1, 5), Interval.DAILY
        )


# ---- get_quote ---------------------------------------------------------


def test_quote_uses_unadjusted_close_and_previous_day():
    t = FakeTicker(yf_frame(["2024-01-04", "2024-01-05"], close=(100.0, 110.0)))
    q = provider_with(t).get_quote("7203.T")
    assert q.price == 110.0  # Adj Close(106.7)ではなく実際の価格
    assert q.change == pytest.approx(10.0)
    assert q.change_pct == pytest.approx(0.10)
    assert q.as_of.date() == date(2024, 1, 5)
    assert q.currency == "JPY"


def test_quote_single_row_has_no_change():
    q = provider_with(FakeTicker(yf_frame(["2024-01-05"]))).get_quote("7203.T")
    assert q.change is None and q.change_pct is None


def test_quote_empty_raises_not_found():
    with pytest.raises(SymbolNotFoundError):
        provider_with(FakeTicker(pd.DataFrame())).get_quote("ZZZZ")


# ---- search ------------------------------------------------------------


class FakeSearch:
    def __init__(self, quotes=None, error=None):
        self._quotes, self._error = quotes or [], error

    def __call__(self, query, **kwargs):
        if self._error:
            raise self._error
        self.quotes = self._quotes
        return self


YAHOO_QUOTES = [
    {"symbol": "TM", "shortname": "Toyota ADR", "quoteType": "EQUITY", "exchange": "NYQ"},
    {"symbol": "7203.T", "longname": "Toyota Motor Corp", "quoteType": "EQUITY", "exchange": "JPX"},
    {"symbol": "TOYOF", "shortname": "Toyota OTC", "quoteType": "EQUITY", "exchange": "PNK"},
    {"symbol": "^N225", "shortname": "Nikkei", "quoteType": "INDEX", "exchange": "OSA"},
    {"symbol": "7203.F", "shortname": "Toyota Frankfurt", "quoteType": "EQUITY", "exchange": "FRA"},
]
JP = JpMaster([JpListing("7203", "トヨタ自動車", "プライム(内国株式)", "輸送用機器")])


def test_search_merges_jpx_and_yahoo_and_filters():
    p = YahooProvider(jp_master=JP, search_factory=FakeSearch(YAHOO_QUOTES))
    res = p.search("toyota")
    symbols = [r.symbol for r in res]
    # JPX は "toyota" にヒットしないので Yahoo の結果だけ。指数・OTC・海外市場は除外
    assert symbols == ["TM", "7203.T"]


def test_search_prefers_japanese_name_from_jpx():
    p = YahooProvider(jp_master=JP, search_factory=FakeSearch(YAHOO_QUOTES))
    res = p.search("7203")
    assert res[0].symbol == "7203.T" and res[0].name == "トヨタ自動車"
    assert [r.symbol for r in res].count("7203.T") == 1  # 重複しない


def test_search_market_filter():
    p = YahooProvider(jp_master=JP, search_factory=FakeSearch(YAHOO_QUOTES))
    assert all(r.market is Market.US for r in p.search("toyota", Market.US))


def test_search_returns_jpx_results_even_if_yahoo_fails():
    p = YahooProvider(jp_master=JP, search_factory=FakeSearch(error=ConnectionError("down")))
    assert [r.symbol for r in p.search("トヨタ")] == ["7203.T"]


def test_search_raises_when_nothing_found_and_yahoo_failed():
    p = YahooProvider(jp_master=None, search_factory=FakeSearch(error=yfe.YFRateLimitError()))
    with pytest.raises(RateLimitError):
        p.search("apple")


def test_blank_query_returns_empty():
    assert YahooProvider(search_factory=FakeSearch(YAHOO_QUOTES)).search("  ") == []


@pytest.mark.parametrize(
    "symbol,exchange,expected",
    [
        ("7203.T", "JPX", Market.JP),
        ("AAPL", "NMS", Market.US),
        ("BRK.B", "NYQ", None),
        ("X", "PNK", None),
    ],
)
def test_market_of(symbol, exchange, expected):
    assert market_of(symbol, exchange) is expected
