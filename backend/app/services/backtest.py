"""バックテストの一連の流れ: データ取得 → 調整 → シグナル → エンジン → 指標。

比較用の Buy and Hold も、同じ価格・同じ設定(手数料・スリッページ・単元)で実行する。
条件をそろえないと「どちらが良いか」を公平に比べられないため。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd

from app.data.base import PERIODS_PER_YEAR, Interval, MarketDataProvider
from app.services.signals import compute_signals
from quant.engine import run_backtest
from quant.metrics import Metrics, compute_metrics, drawdown, monthly_returns, yearly_returns
from quant.models import BacktestConfig, BacktestResult
from quant.strategies import generate_signals, get_strategy


@dataclass
class BacktestRun:
    strategy_id: str
    params: dict
    prices: pd.DataFrame  # 分析期間の調整済み価格(エンジンに渡したもの)
    result: BacktestResult
    metrics: Metrics
    benchmark: BacktestResult
    benchmark_metrics: Metrics
    drawdown: pd.Series
    benchmark_drawdown: pd.Series
    monthly: pd.Series
    yearly: pd.Series
    benchmark_monthly: pd.Series
    benchmark_yearly: pd.Series
    warmup_bars: int
    warnings: list[str]


def run_strategy_backtest(
    provider: MarketDataProvider,
    symbol: str,
    start: date,
    end: date,
    interval: Interval,
    strategy_id: str,
    params: dict | None,
    cfg: BacktestConfig,
    risk_free_rate: float = 0.0,
) -> BacktestRun:
    sig = compute_signals(
        provider, symbol, start, end, interval, strategy_id, params, cfg.price_mode
    )
    prices = sig.data.drop(columns="signal")
    ppy = PERIODS_PER_YEAR[interval]

    result = run_backtest(prices, sig.data["signal"], cfg)
    metrics = compute_metrics(result.equity, result.trades, ppy, risk_free_rate)

    # ベンチマーク(Buy and Hold)を同じ価格・同じ設定で
    bh_signal = generate_signals(get_strategy("buy_hold"), prices, {}, trade_start=prices.index[0])
    bench = run_backtest(prices, bh_signal, cfg)
    bench_metrics = compute_metrics(bench.equity, bench.trades, ppy, risk_free_rate)

    warnings = list(sig.warnings)
    if result.skipped_orders:
        warnings.append(
            f"資金不足で買えなかった日が {len(result.skipped_orders)} 日ありました"
            "(初期資金を増やすか、単元株数を見直してください)"
        )
    if result.reduced_orders:
        warnings.append(
            f"資金不足で、指定より少ない株数で買った取引が {len(result.reduced_orders)} 件あります"
        )
    if not bench.trades:
        warnings.append(
            "Buy and Hold でも買えませんでした。初期資金が1単元の価格より少ない可能性があります"
        )

    return BacktestRun(
        strategy_id=strategy_id,
        params=sig.params,
        prices=prices,
        result=result,
        metrics=metrics,
        benchmark=bench,
        benchmark_metrics=bench_metrics,
        drawdown=drawdown(result.equity),
        benchmark_drawdown=drawdown(bench.equity),
        monthly=monthly_returns(result.equity),
        yearly=yearly_returns(result.equity),
        benchmark_monthly=monthly_returns(bench.equity),
        benchmark_yearly=yearly_returns(bench.equity),
        warmup_bars=sig.warmup_bars,
        warnings=warnings,
    )
