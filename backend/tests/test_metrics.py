"""パフォーマンス指標のテスト(QUANT_SPEC §7)。期待値は手計算。"""

import math

import numpy as np
import pandas as pd
import pytest

from quant.metrics import compute_metrics, drawdown, monthly_returns, yearly_returns
from quant.models import Trade


def eq(values, start="2024-01-01", freq="B"):
    return pd.Series(
        values, dtype=float, index=pd.date_range(start, periods=len(values), freq=freq)
    )


def trade(pnl, status="closed"):
    d = pd.Timestamp("2024-01-01")
    return Trade(d, d, 100.0, 100.0, 1, 0.0, 0.0, pnl, pnl / 100, 1, 1, status)


def test_returns_and_risk_hand_computed():
    # 日次リターン r = [0.01, -0.01, 0.02, 0.0] になる資産推移
    e = [100.0]
    for r in [0.01, -0.01, 0.02, 0.0]:
        e.append(e[-1] * (1 + r))
    m = compute_metrics(eq(e), [], periods_per_year=252)
    # 平均 0.005、標本標準偏差 sqrt(5e-4 / 3) = 0.0129099
    sd = math.sqrt(5e-4 / 3)
    assert m.volatility == pytest.approx(sd * math.sqrt(252))
    assert m.sharpe == pytest.approx(0.005 / sd * math.sqrt(252))  # ≒ 6.148
    # 下方偏差 = sqrt((0 + 0.0001 + 0 + 0) / 4) = 0.005
    assert m.sortino == pytest.approx(0.005 / 0.005 * math.sqrt(252))
    assert m.total_return == pytest.approx(e[-1] / 100 - 1)


def test_risk_free_rate_is_converted_per_period():
    e = eq([100, 101, 100.5, 102, 103])
    rf = 0.02
    rf_p = (1 + rf) ** (1 / 252) - 1
    r = e.pct_change().dropna()
    m = compute_metrics(e, [], periods_per_year=252, risk_free_rate=rf)
    assert m.sharpe == pytest.approx((r - rf_p).mean() / r.std(ddof=1) * math.sqrt(252))


def test_cagr_uses_calendar_days():
    e = pd.Series([100.0, 121.0], index=pd.to_datetime(["2020-01-01", "2022-01-01"]))
    years = 731 / 365.25
    m = compute_metrics(e, [], periods_per_year=252)
    assert m.cagr == pytest.approx(1.21 ** (1 / years) - 1)  # ≒ 9.99%


def test_max_drawdown():
    m = compute_metrics(eq([100, 120, 90, 130, 65, 70]), [], periods_per_year=252)
    assert m.max_drawdown == pytest.approx(-0.5)  # 130 → 65
    dd = drawdown(eq([100, 120, 90, 130, 65, 70]))
    np.testing.assert_allclose(dd, [0, 0, -0.25, 0, -0.5, 70 / 130 - 1])


def test_trade_statistics():
    m = compute_metrics(
        eq([100, 101]), [trade(10), trade(-5), trade(20), trade(-15), trade(99, "open")], 252
    )
    assert m.win_rate == pytest.approx(0.5)  # 未決済は含めない
    assert m.profit_factor == pytest.approx(30 / 20)
    assert m.total_trades == 5 and m.closed_trades == 4


def test_undefined_values_are_none_not_zero():
    """計算できない指標は 0 で埋めず None にする(画面では「—」と表示)。"""
    m = compute_metrics(eq([100, 100, 100]), [], periods_per_year=252)
    assert m.sharpe is None and m.sortino is None  # 値動きなし → 標準偏差 0
    assert m.win_rate is None and m.profit_factor is None  # 取引なし
    assert m.volatility == 0.0


def test_profit_factor_without_losses_is_infinite():
    m = compute_metrics(eq([100, 110]), [trade(10)], periods_per_year=252)
    assert m.profit_factor == math.inf


def test_single_bar_has_no_volatility():
    m = compute_metrics(eq([100]), [], periods_per_year=252)
    assert m.volatility is None and m.cagr is None and m.total_return == 0


def test_monthly_and_yearly_returns():
    idx = pd.to_datetime(
        ["2023-12-29", "2024-01-15", "2024-01-31", "2024-02-15", "2024-02-29", "2025-01-02"]
    )
    e = pd.Series([100, 105, 110, 99, 121, 133.1], index=idx, dtype=float)
    mr = monthly_returns(e)
    # 最初の月は初期値(100)が基準。2023-12 は 100/100 - 1 = 0
    assert mr.loc["2023-12"] == pytest.approx(0.0)
    assert mr.loc["2024-01"] == pytest.approx(0.10)  # 110 / 100
    assert mr.loc["2024-02"] == pytest.approx(0.10)  # 121 / 110
    assert mr.loc["2025-01"] == pytest.approx(0.10)  # 133.1 / 121
    yr = yearly_returns(e)
    assert yr.loc[2024] == pytest.approx(0.21) and yr.loc[2025] == pytest.approx(0.10)


def test_weekly_annualization():
    e = eq([100, 102, 101, 104], freq="W-FRI")
    r = e.pct_change().dropna()
    m = compute_metrics(e, [], periods_per_year=52)
    assert m.volatility == pytest.approx(r.std(ddof=1) * math.sqrt(52))
