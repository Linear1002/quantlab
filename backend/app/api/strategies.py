"""戦略一覧と、シグナルのプレビュー API。"""

from __future__ import annotations

from dataclasses import asdict
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.data.base import Interval, MarketDataProvider
from app.data.factory import get_provider
from app.services.signals import compute_signals
from quant.models import PriceMode
from quant.strategies import list_strategies

router = APIRouter(prefix="/api/strategies", tags=["strategies"])
Provider = Annotated[MarketDataProvider, Depends(get_provider)]


class ParamOut(BaseModel):
    name: str
    label: str
    type: Literal["int", "float"]
    default: float
    min: float
    max: float
    step: float
    description: str


class StrategyOut(BaseModel):
    id: str
    name: str
    category: str
    summary: str
    idea: str
    buy_rule: str
    sell_rule: str
    suitable: str
    risks: list[str]
    difficulty: int
    params: list[ParamOut]


@router.get("", response_model=list[StrategyOut])
def strategies():
    return [
        StrategyOut(id=s.id, **asdict(s.info), params=[ParamOut(**asdict(p)) for p in s.params])
        for s in list_strategies()
    ]


class SignalsIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    start: date
    end: date
    interval: Interval = Interval.DAILY
    params: dict[str, float] = Field(default_factory=dict)
    price_mode: PriceMode = PriceMode.TOTAL_RETURN


class SignalEvent(BaseModel):
    date: date  # シグナルが出た日(約定はこの翌営業日の始値)
    type: Literal["buy", "sell"]
    close: float  # その日の調整済み終値


class SignalsOut(BaseModel):
    strategy_id: str
    params: dict[str, float]
    events: list[SignalEvent]
    holding_at_end: bool
    bars: int
    warmup_bars: int
    provider: str
    warnings: list[str]


@router.post("/{strategy_id}/signals", response_model=SignalsOut)
def signals(strategy_id: str, body: SignalsIn, provider: Provider):
    r = compute_signals(
        provider,
        body.symbol,
        body.start,
        body.end,
        body.interval,
        strategy_id,
        body.params,
        body.price_mode,
    )
    sig = r.data["signal"]
    # 0→1 が買いシグナル、1→0 が売りシグナル(期間の初日は 0 から始まる前提で比べる)
    change = sig.diff().fillna(sig.iloc[0] if len(sig) else 0)
    events = [
        SignalEvent(
            date=ts.date(), type="buy" if d > 0 else "sell", close=float(r.data.at[ts, "close"])
        )
        for ts, d in change.items()
        if d != 0
    ]
    return SignalsOut(
        strategy_id=strategy_id,
        params=r.params,
        events=events,
        holding_at_end=bool(len(sig) and sig.iloc[-1] == 1),
        bars=len(sig),
        warmup_bars=r.warmup_bars,
        provider=provider.name,
        warnings=r.warnings,
    )
