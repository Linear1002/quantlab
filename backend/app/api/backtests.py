"""バックテスト実行 API。(結果の保存・履歴は Phase 7)"""

from __future__ import annotations

import math
from dataclasses import asdict
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.data.base import Interval, MarketDataProvider
from app.data.factory import get_provider
from app.services.backtest import run_strategy_backtest
from quant import ENGINE_VERSION
from quant.metrics import Metrics
from quant.models import BacktestConfig, PriceMode, SizingMode, default_lot_size

router = APIRouter(prefix="/api/backtests", tags=["backtests"])
Provider = Annotated[MarketDataProvider, Depends(get_provider)]


class ConfigIn(BaseModel):
    """設定。省略した項目は既定値(QUANT_SPEC §5.1)。単元は銘柄から自動で決める。"""

    initial_capital: float = 1_000_000
    commission_rate: float = 0.0005
    commission_min: float = 0.0
    slippage_bps: float = 5.0
    sizing_mode: SizingMode = SizingMode.PERCENT_EQUITY
    sizing_value: float = 1.0
    lot_size: int | None = None
    price_mode: PriceMode = PriceMode.TOTAL_RETURN


class BacktestIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    start: date
    end: date
    interval: Interval = Interval.DAILY
    strategy_id: str
    params: dict[str, float] = Field(default_factory=dict)
    config: ConfigIn = Field(default_factory=ConfigIn)
    risk_free_rate: float = Field(default=0.0, ge=-0.05, le=0.2)


class MetricsOut(BaseModel):
    total_return: float
    cagr: float | None
    volatility: float | None
    sharpe: float | None
    sortino: float | None
    max_drawdown: float
    win_rate: float | None
    # JSON は無限大を表せないので、「損失ゼロ」は
    # profit_factor=None + profit_factor_infinite=True で表す
    profit_factor: float | None
    profit_factor_infinite: bool
    total_trades: int
    closed_trades: int

    @classmethod
    def of(cls, m: Metrics) -> MetricsOut:
        d = asdict(m)
        inf = d["profit_factor"] is not None and math.isinf(d["profit_factor"])
        if inf:
            d["profit_factor"] = None
        return cls(**d, profit_factor_infinite=inf)


class PointOut(BaseModel):
    date: date
    equity: float
    benchmark: float
    drawdown: float
    benchmark_drawdown: float
    position: int
    close: float  # 調整済み終値(チャート用)


class TradeOut(BaseModel):
    entry_date: date
    exit_date: date
    entry_price: float
    exit_price: float
    qty: int
    entry_fee: float
    exit_fee: float
    pnl: float
    ret: float
    bars_held: int
    days_held: int
    status: Literal["closed", "open"]


class NoteOut(BaseModel):
    date: date
    reason: str
    requested_qty: int
    filled_qty: int


class PeriodReturn(BaseModel):
    period: str  # "2024-01" または "2024"
    ret: float


class BacktestOut(BaseModel):
    symbol: str
    strategy_id: str
    params: dict[str, float]
    config: dict
    start: date
    end: date
    interval: Interval
    provider: str
    engine_version: str
    risk_free_rate: float
    metrics: MetricsOut
    benchmark_metrics: MetricsOut
    series: list[PointOut]
    trades: list[TradeOut]
    monthly_returns: list[PeriodReturn]
    yearly_returns: list[PeriodReturn]
    skipped_orders: list[NoteOut]
    reduced_orders: list[NoteOut]
    pending_signal: Literal["buy", "sell"] | None
    warmup_bars: int
    warnings: list[str]


@router.post("", response_model=BacktestOut)
def create_backtest(body: BacktestIn, provider: Provider):
    c = body.config
    cfg = BacktestConfig(
        initial_capital=c.initial_capital,
        commission_rate=c.commission_rate,
        commission_min=c.commission_min,
        slippage_bps=c.slippage_bps,
        sizing_mode=c.sizing_mode,
        sizing_value=c.sizing_value,
        lot_size=c.lot_size if c.lot_size is not None else default_lot_size(body.symbol),
        price_mode=c.price_mode,
    )
    run = run_strategy_backtest(
        provider,
        body.symbol,
        body.start,
        body.end,
        body.interval,
        body.strategy_id,
        body.params,
        cfg,
        body.risk_free_rate,
    )
    r, b = run.result, run.benchmark
    series = [
        PointOut(
            date=ts.date(),
            equity=float(r.equity.iat[i]),
            benchmark=float(b.equity.iat[i]),
            drawdown=float(run.drawdown.iat[i]),
            benchmark_drawdown=float(run.benchmark_drawdown.iat[i]),
            position=int(r.position.iat[i]),
            close=float(run.prices["close"].iat[i]),
        )
        for i, ts in enumerate(r.equity.index)
    ]
    return BacktestOut(
        symbol=body.symbol,
        strategy_id=run.strategy_id,
        params=run.params,
        config={
            **asdict(cfg),
            "sizing_mode": cfg.sizing_mode.value,
            "price_mode": cfg.price_mode.value,
        },
        start=body.start,
        end=body.end,
        interval=body.interval,
        provider=provider.name,
        engine_version=ENGINE_VERSION,
        risk_free_rate=body.risk_free_rate,
        metrics=MetricsOut.of(run.metrics),
        benchmark_metrics=MetricsOut.of(run.benchmark_metrics),
        series=series,
        trades=[
            TradeOut(
                **{**asdict(t), "entry_date": t.entry_date.date(), "exit_date": t.exit_date.date()}
            )
            for t in r.trades
        ],
        monthly_returns=[PeriodReturn(period=str(k), ret=float(v)) for k, v in run.monthly.items()],
        yearly_returns=[PeriodReturn(period=str(k), ret=float(v)) for k, v in run.yearly.items()],
        skipped_orders=[_note(n) for n in r.skipped_orders],
        reduced_orders=[_note(n) for n in r.reduced_orders],
        pending_signal=r.pending_signal,
        warmup_bars=run.warmup_bars,
        warnings=run.warnings,
    )


def _note(n) -> NoteOut:
    return NoteOut(
        date=n.date.date(), reason=n.reason, requested_qty=n.requested_qty, filled_qty=n.filled_qty
    )
