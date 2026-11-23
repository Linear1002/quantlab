"""E2E テスト専用の「合成データ」のデータ元(DESIGN.md §2.3)。

実データではないので、銘柄名に「合成データ」と入れ、provider 名も "fixture" にする。
画面はこの名前を見て「テスト用の合成データです」という警告を出す。
QUANTLAB_DATA_PROVIDER=fixture を明示したときだけ使われる。
"""

from __future__ import annotations

from datetime import date, datetime

import numpy as np
import pandas as pd

from app.data.base import (
    OHLCV_COLUMNS,
    Interval,
    InvalidRequestError,
    Market,
    MarketDataProvider,
    Quote,
    SymbolInfo,
    SymbolNotFoundError,
)

SYMBOLS = {
    "TEST.T": SymbolInfo("TEST.T", "テスト銘柄 JP(合成データ)", Market.JP, "TEST", "JPY"),
    "TEST": SymbolInfo("TEST", "Test Stock US (synthetic)", Market.US, "TEST", "USD"),
}
_START = date(2000, 1, 3)
_END = date(2030, 12, 31)


def _series(symbol: str) -> pd.DataFrame:
    """銘柄ごとに乱数の種を固定したランダムウォーク(毎回同じ結果になる)。"""
    days = pd.bdate_range(_START, _END, name="date")
    rng = np.random.default_rng(sum(map(ord, symbol)))
    ret = rng.normal(0.0003, 0.015, len(days))
    close = 1000.0 * np.exp(np.cumsum(ret))
    open_ = close * (1 + rng.normal(0, 0.003, len(days)))
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.004, len(days))))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.004, len(days))))
    vol = rng.integers(100_000, 1_000_000, len(days)).astype(float)
    return pd.DataFrame(
        {
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "adj_close": close,
            "volume": vol,
        },
        index=days,
    )


class FixtureProvider(MarketDataProvider):
    name = "fixture"

    def __init__(self, today: date | None = None):
        self._today = today or date.today()

    def search(self, query: str, market: Market | None = None) -> list[SymbolInfo]:
        q = query.strip().casefold()
        if not q:
            return []
        return [
            s
            for s in SYMBOLS.values()
            if (q in s.symbol.casefold() or q in s.name.casefold())
            and (market is None or s.market == market)
        ]

    def get_quote(self, symbol: str) -> Quote:
        df = self.get_ohlcv(symbol, date(self._today.year - 1, 1, 1), self._today, Interval.DAILY)
        last, prev = df.iloc[-1], df.iloc[-2]
        return Quote(
            symbol=symbol,
            price=float(last["close"]),
            currency=SYMBOLS[symbol].currency,
            as_of=datetime.combine(df.index[-1].date(), datetime.min.time()),
            change=float(last["close"] - prev["close"]),
            change_pct=float(last["close"] / prev["close"] - 1),
        )

    def get_ohlcv(self, symbol: str, start: date, end: date, interval: Interval) -> pd.DataFrame:
        if symbol not in SYMBOLS:
            raise SymbolNotFoundError(f"銘柄 {symbol} が見つかりません")
        if start > end:
            raise InvalidRequestError("開始日が終了日より後になっています")
        df = _series(symbol)
        df = df.loc[
            (df.index >= pd.Timestamp(start)) & (df.index <= pd.Timestamp(min(end, self._today)))
        ]
        if interval is Interval.WEEKLY:
            df = _resample(df, "W-FRI")
        elif interval is Interval.MONTHLY:
            df = _resample(df, "ME")
        return df[OHLCV_COLUMNS]


def _resample(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    agg = {
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "adj_close": "last",
        "volume": "sum",
    }
    out = df.resample(rule).agg(agg).dropna()
    out.index.name = "date"
    return out
