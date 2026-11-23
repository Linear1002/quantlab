"""パフォーマンス指標(QUANT_SPEC §7)。

計算できない指標(取引ゼロの勝率、値動きゼロの Sharpe など)は None にする。
0 で埋めると「勝率 0%」のように誤解されるため。画面では「—」と表示する。
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import pandas as pd

from quant.models import Trade


@dataclass(frozen=True)
class Metrics:
    total_return: float
    cagr: float | None
    volatility: float | None
    sharpe: float | None
    sortino: float | None
    max_drawdown: float  # 負の値(-0.25 = 25% 下落)
    win_rate: float | None
    profit_factor: float | None  # 損失ゼロで利益ありなら +inf
    total_trades: int  # 決済済み + 未決済
    closed_trades: int


def period_returns(equity: pd.Series) -> pd.Series:
    """バーごとのリターン r_t = E_t / E_{t-1} - 1。"""
    return equity.pct_change().iloc[1:]


def drawdown(equity: pd.Series) -> pd.Series:
    """各時点の「それまでの最高値からの下落率」(0 以下)。"""
    return equity / equity.cummax() - 1.0


def compute_metrics(
    equity: pd.Series,
    trades: list[Trade],
    periods_per_year: int,
    risk_free_rate: float = 0.0,
) -> Metrics:
    """資産推移と取引から指標を計算する。

    - periods_per_year: 年率換算係数(日足 252 / 週足 52 / 月足 12)
    - risk_free_rate: 無リスク金利(年率)。1期間あたり rf_p = (1+rf)^(1/P) - 1 に直して引く
    """
    e0, e_t = float(equity.iloc[0]), float(equity.iloc[-1])
    total_return = e_t / e0 - 1.0

    # CAGR: 暦日ベースの年数で年率にする
    years = (equity.index[-1] - equity.index[0]).days / 365.25
    if years <= 0:
        cagr = None
    elif e_t <= 0:
        cagr = -1.0
    else:
        cagr = (e_t / e0) ** (1.0 / years) - 1.0

    r = period_returns(equity)
    rf_p = (1.0 + risk_free_rate) ** (1.0 / periods_per_year) - 1.0
    ann = math.sqrt(periods_per_year)
    if len(r) >= 2:
        sd = float(r.std(ddof=1))
        excess = r - rf_p
        volatility = sd * ann
        sharpe = float(excess.mean()) / sd * ann if sd > 0 else None
        # 下方偏差: 無リスク金利を下回った分だけの二乗平均(上回った期間は 0 として数える)
        dd = math.sqrt(float((excess.clip(upper=0.0) ** 2).mean()))
        sortino = float(excess.mean()) / dd * ann if dd > 0 else None
    else:
        volatility = sharpe = sortino = None

    closed = [t for t in trades if t.status == "closed"]
    gains = sum(t.pnl for t in closed if t.pnl > 0)
    losses = -sum(t.pnl for t in closed if t.pnl < 0)
    if not closed:
        win_rate = profit_factor = None
    else:
        win_rate = sum(1 for t in closed if t.pnl > 0) / len(closed)
        profit_factor = gains / losses if losses > 0 else (math.inf if gains > 0 else None)

    return Metrics(
        total_return=total_return,
        cagr=cagr,
        volatility=volatility,
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown=float(drawdown(equity).min()),
        win_rate=win_rate,
        profit_factor=profit_factor,
        total_trades=len(trades),
        closed_trades=len(closed),
    )


def _bucket_returns(equity: pd.Series, keys) -> pd.Series:
    """期間ごと(月・年)のリターン = その期間最後の E / 前の期間最後の E - 1。
    最初の期間は初期値 E_0 を基準にする。"""
    last = equity.groupby(keys).last()
    base = last.shift(1)
    base.iloc[0] = equity.iloc[0]
    return last / base - 1.0


def monthly_returns(equity: pd.Series) -> pd.Series:
    """月別リターン(index は "2024-01" のような月)。"""
    return _bucket_returns(equity, equity.index.to_period("M"))


def yearly_returns(equity: pd.Series) -> pd.Series:
    """年別リターン(index は 2024 のような年)。"""
    return _bucket_returns(equity, equity.index.year)
