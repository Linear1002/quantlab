"""Yahoo Finance(yfinance)を使ったデータ取得。

yfinance は非公式ライブラリで、Yahoo の規約上は個人利用が前提(DESIGN.md §7)。
yfinance の例外や列名はここで吸収し、外には MarketDataProvider の形だけを見せる。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd
import yfinance as yf
from yfinance import exceptions as yfe

from app.data.base import (
    OHLCV_COLUMNS,
    Interval,
    InvalidRequestError,
    Market,
    MarketDataProvider,
    ProviderError,
    ProviderUnavailableError,
    Quote,
    RateLimitError,
    SymbolInfo,
    SymbolNotFoundError,
)
from app.data.jp_master import JpMaster

log = logging.getLogger(__name__)

# yfinance の列名 → QuantLab の列名
_COLUMN_MAP = {
    "Open": "open",
    "High": "high",
    "Low": "low",
    "Close": "close",
    "Adj Close": "adj_close",
    "Volume": "volume",
}

# Yahoo の取引所コードのうち米国のもの
US_EXCHANGES = {"NMS", "NGM", "NCM", "NYQ", "ASE", "PCX", "BTS", "NYS", "NAS"}
ALLOWED_QUOTE_TYPES = {"EQUITY", "ETF"}
SEARCH_LIMIT = 20


def market_of(symbol: str, exchange: str | None = None) -> Market | None:
    """ティッカーと取引所から市場を判定する。日本・米国以外は None。"""
    if symbol.upper().endswith(".T"):
        return Market.JP
    if "." not in symbol and (exchange is None or exchange in US_EXCHANGES):
        return Market.US
    return None


def _translate_error(e: Exception, symbol: str) -> ProviderError:
    """yfinance / 通信の例外を、ユーザーに見せられる ProviderError に変換する。"""
    if isinstance(e, ProviderError):
        return e
    if isinstance(e, yfe.YFRateLimitError):
        return RateLimitError(
            "Yahoo Finance のアクセス制限に達しました。数分待ってから再度お試しください"
        )
    if isinstance(e, (yfe.YFTickerMissingError, yfe.YFTzMissingError)):
        return SymbolNotFoundError(f"銘柄 {symbol} が見つかりません(上場廃止の可能性もあります)")
    return ProviderUnavailableError(
        f"Yahoo Finance からの取得に失敗しました({type(e).__name__}: {e})"
    )


def normalize_history(raw: pd.DataFrame) -> pd.DataFrame:
    """yfinance の history() の結果を QuantLab の形式にそろえる。

    - 列名を小文字・スネークケースに変える
    - タイムゾーンを外して「取引所の現地日付」にする(tz_convert はしない: QUANT_SPEC §1.1)
    - 時刻部分を 00:00 にそろえる
    """
    missing = [c for c in _COLUMN_MAP if c not in raw.columns]
    if missing:
        raise ProviderUnavailableError(f"Yahoo のデータに必要な列がありません: {missing}")
    df = raw[list(_COLUMN_MAP)].rename(columns=_COLUMN_MAP)
    idx = pd.DatetimeIndex(df.index)
    if idx.tz is not None:
        idx = idx.tz_localize(None)
    df.index = idx.normalize()
    df.index.name = "date"
    return df[OHLCV_COLUMNS].astype("float64")


class YahooProvider(MarketDataProvider):
    name = "yahoo"

    def __init__(
        self,
        jp_master: JpMaster | None = None,
        ticker_factory: Callable[[str], Any] = yf.Ticker,
        search_factory: Callable[..., Any] = yf.Search,
    ):
        # ticker_factory / search_factory はテストで偽物に差し替えるための引数
        self._jp = jp_master
        self._ticker = ticker_factory
        self._search = search_factory

    # ---- 株価 ---------------------------------------------------------

    def get_ohlcv(self, symbol: str, start: date, end: date, interval: Interval) -> pd.DataFrame:
        if start > end:
            raise InvalidRequestError("開始日が終了日より後になっています")
        try:
            raw = self._ticker(symbol).history(
                start=start.isoformat(),
                # yfinance の end は「その日を含まない」ので1日足す
                end=(end + timedelta(days=1)).isoformat(),
                interval=interval.value,
                auto_adjust=False,  # Close と Adj Close の両方を受け取る
                actions=False,
                raise_errors=True,
            )
        except yfe.YFPricesMissingError:
            # 銘柄は存在するが、その期間にデータが無い
            return pd.DataFrame(columns=OHLCV_COLUMNS, index=pd.DatetimeIndex([], name="date"))
        except Exception as e:  # noqa: BLE001 - すべて ProviderError に変換して返す
            raise _translate_error(e, symbol) from e
        if raw is None or raw.empty:
            return pd.DataFrame(columns=OHLCV_COLUMNS, index=pd.DatetimeIndex([], name="date"))
        return normalize_history(raw)

    def get_quote(self, symbol: str) -> Quote:
        """直近の日足の最終行から最新値を作る。取引時間中は「取引中の値」になる。"""
        try:
            t = self._ticker(symbol)
            raw = t.history(period="10d", interval="1d", auto_adjust=False, raise_errors=True)
        except Exception as e:  # noqa: BLE001
            raise _translate_error(e, symbol) from e
        if raw is None or raw.empty:
            raise SymbolNotFoundError(f"銘柄 {symbol} の株価が取得できません")
        df = normalize_history(raw).dropna(subset=["close"])
        if df.empty:
            raise SymbolNotFoundError(f"銘柄 {symbol} の株価が取得できません")

        last = df.iloc[-1]
        prev = df.iloc[-2] if len(df) >= 2 else None
        price = float(last["close"])  # Close = 配当未調整の実際の価格
        change = price - float(prev["close"]) if prev is not None else None
        change_pct = change / float(prev["close"]) if prev is not None else None
        return Quote(
            symbol=symbol,
            price=price,
            currency=self._currency(t),
            as_of=datetime.combine(df.index[-1].date(), datetime.min.time()),
            change=change,
            change_pct=change_pct,
        )

    @staticmethod
    def _currency(ticker: Any) -> str | None:
        try:
            return ticker.fast_info["currency"]
        except Exception:  # noqa: BLE001 - 通貨が取れなくても株価の表示は続ける
            return None

    # ---- 検索 ---------------------------------------------------------

    def search(self, query: str, market: Market | None = None) -> list[SymbolInfo]:
        query = query.strip()
        if not query:
            return []

        results: list[SymbolInfo] = []
        if self._jp is not None and market in (None, Market.JP):
            results += [x.to_symbol_info() for x in self._jp.search(query, limit=10)]

        yahoo_error: ProviderError | None = None
        if market in (None, Market.US) or self._jp is None:
            try:
                results += self._search_yahoo(query)
            except Exception as e:  # noqa: BLE001
                yahoo_error = _translate_error(e, query)
                log.warning("Yahoo search failed: %s", e)

        # 同じ銘柄が JPX と Yahoo の両方から来たら、先に入った方(JPX = 日本語名)を残す
        seen: set[str] = set()
        unique: list[SymbolInfo] = []
        for r in results:
            if r.symbol.upper() in seen or (market and r.market != market):
                continue
            seen.add(r.symbol.upper())
            unique.append(r)

        if not unique and yahoo_error is not None:
            raise yahoo_error
        return unique[:SEARCH_LIMIT]

    def _search_yahoo(self, query: str) -> list[SymbolInfo]:
        s = self._search(
            query,
            max_results=10,
            news_count=0,
            lists_count=0,
            include_cb=False,
            recommended=0,
            raise_errors=True,
        )
        out: list[SymbolInfo] = []
        for q in s.quotes or []:
            symbol = q.get("symbol")
            if not symbol or q.get("quoteType") not in ALLOWED_QUOTE_TYPES:
                continue
            mkt = market_of(symbol, q.get("exchange"))
            if mkt is None:
                continue
            out.append(
                SymbolInfo(
                    symbol=symbol,
                    name=q.get("longname") or q.get("shortname") or symbol,
                    market=mkt,
                    exchange=q.get("exchDisp") or q.get("exchange"),
                    currency="JPY" if mkt is Market.JP else "USD",
                )
            )
        return out
