"""銘柄検索・最新株価・過去の株価の API。"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.data.base import Interval, Market, MarketDataProvider
from app.data.factory import get_provider, jp_search_available
from app.services.market import load_history

router = APIRouter(prefix="/api/stocks", tags=["stocks"])

# 依存性注入: テストでは app.dependency_overrides[get_provider] で差し替える
Provider = Annotated[MarketDataProvider, Depends(get_provider)]


class SymbolOut(BaseModel):
    symbol: str
    name: str
    market: Market
    exchange: str | None
    currency: str | None


class SearchOut(BaseModel):
    results: list[SymbolOut]
    provider: str
    jp_name_search: bool  # False のとき、画面に「日本語名検索は無効」と案内する


class QuoteOut(BaseModel):
    symbol: str
    price: float
    currency: str | None
    as_of: date
    change: float | None
    change_pct: float | None
    provider: str


class Bar(BaseModel):
    date: date
    open: float
    high: float
    low: float
    close: float
    adj_close: float
    volume: float


class HistoryOut(BaseModel):
    symbol: str
    interval: Interval
    start: date
    end: date
    provider: str
    bars: list[Bar]
    warnings: list[str]


@router.get("/search", response_model=SearchOut)
def search(
    provider: Provider,
    q: str = Query(min_length=1, max_length=50, description="銘柄名・ティッカー・コード"),
    market: Market | None = None,
):
    results = provider.search(q, market)
    return SearchOut(
        results=[SymbolOut(**r.__dict__) for r in results],
        provider=provider.name,
        jp_name_search=jp_search_available(provider) or provider.name == "fixture",
    )


@router.get("/{symbol}/quote", response_model=QuoteOut)
def quote(symbol: str, provider: Provider):
    qt = provider.get_quote(symbol)
    return QuoteOut(
        symbol=qt.symbol,
        price=qt.price,
        currency=qt.currency,
        as_of=qt.as_of.date(),
        change=qt.change,
        change_pct=qt.change_pct,
        provider=provider.name,
    )


@router.get("/{symbol}/history", response_model=HistoryOut)
def history(
    provider: Provider,
    symbol: str,
    start: date,
    end: date,
    interval: Interval = Interval.DAILY,
):
    df, warnings = load_history(provider, symbol, start, end, interval)
    bars = [
        Bar(date=ts.date(), **{k: float(v) for k, v in row.items()}) for ts, row in df.iterrows()
    ]
    return HistoryOut(
        symbol=symbol,
        interval=interval,
        start=start,
        end=end,
        provider=provider.name,
        bars=bars,
        warnings=warnings,
    )
