"""株価データ取得の抽象化(DESIGN.md §2)。

アプリの他の部分はこの抽象クラスだけを使う。
Yahoo 以外のデータ元に変えるときは、このクラスを継承した実装を1つ追加すればよい。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum

import pandas as pd


class Market(StrEnum):
    JP = "JP"
    US = "US"


class Interval(StrEnum):
    DAILY = "1d"
    WEEKLY = "1wk"
    MONTHLY = "1mo"


# 年率換算係数(QUANT_SPEC §0 の P)
PERIODS_PER_YEAR: dict[Interval, int] = {
    Interval.DAILY: 252,
    Interval.WEEKLY: 52,
    Interval.MONTHLY: 12,
}

OHLCV_COLUMNS = ["open", "high", "low", "close", "adj_close", "volume"]


@dataclass(frozen=True)
class SymbolInfo:
    symbol: str  # 例: "7203.T", "AAPL"
    name: str
    market: Market
    exchange: str | None = None
    currency: str | None = None


@dataclass(frozen=True)
class Quote:
    symbol: str
    price: float
    currency: str | None
    as_of: datetime  # データ元が返した時刻(取得した時刻ではない)
    change: float | None = None
    change_pct: float | None = None


# ---- 例外 -------------------------------------------------------------


class ProviderError(Exception):
    """データ取得に関するエラーの基底。UI ではユーザー向けのメッセージに変換して表示する。"""

    code = "PROVIDER_ERROR"


class SymbolNotFoundError(ProviderError):
    code = "SYMBOL_NOT_FOUND"


class RateLimitError(ProviderError):
    code = "RATE_LIMITED"


class ProviderUnavailableError(ProviderError):
    code = "PROVIDER_UNAVAILABLE"


class DataValidationError(ProviderError):
    code = "INVALID_DATA"


class NoDataError(ProviderError):
    """銘柄は存在するが、指定期間にデータが1行も無いとき。"""

    code = "NO_DATA"


class InvalidRequestError(ProviderError):
    """リクエストの値がおかしいとき(開始日 > 終了日など)。"""

    code = "INVALID_REQUEST"


# ---- 抽象クラス ---------------------------------------------------------


class MarketDataProvider(ABC):
    name: str

    @abstractmethod
    def search(self, query: str, market: Market | None = None) -> list[SymbolInfo]:
        """銘柄名またはティッカーで検索する。該当なしは空リスト(例外にしない)。"""

    @abstractmethod
    def get_quote(self, symbol: str) -> Quote:
        """最新の株価。存在しない銘柄は SymbolNotFoundError。"""

    @abstractmethod
    def get_ohlcv(self, symbol: str, start: date, end: date, interval: Interval) -> pd.DataFrame:
        """OHLCV を返す。列は OHLCV_COLUMNS、index は昇順の DatetimeIndex(tz なし)。

        end は「その日を含む」。データが0行なら SymbolNotFoundError ではなく空の DataFrame を返し、
        判断は呼び出し側(services)が行う。
        """
