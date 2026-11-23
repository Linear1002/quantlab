"""バックテストエンジンのテスト(QUANT_SPEC §5, §6, §8, 付録A)。

期待値は QUANT_SPEC.md 付録A の手計算の表と同じ。表を変えたらここも変えること。
"""

import numpy as np
import pandas as pd
import pytest

from quant.engine import run_backtest, simulate
from quant.errors import InsufficientDataError, InvalidParameterError
from quant.models import BacktestConfig

DATES = pd.bdate_range("2024-01-01", periods=7)


def prices(opens, closes, dates=None):
    idx = dates if dates is not None else pd.bdate_range("2024-01-01", periods=len(opens))
    o, c = np.asarray(opens, float), np.asarray(closes, float)
    return pd.DataFrame(
        {"open": o, "high": np.maximum(o, c), "low": np.minimum(o, c), "close": c, "volume": 1.0},
        index=idx,
    )


def sig(values, index):
    return pd.Series(values, index=index, dtype="int8")


# ---- 付録A: 手計算の表とぴったり一致すること -------------------------------------

APPENDIX_CFG = BacktestConfig(
    initial_capital=10_000,
    commission_rate=0.001,
    slippage_bps=100,
    lot_size=1,
    price_mode="split_only",
)
APPENDIX_PX = prices([100, 101, 104, 103, 99, 100, 106], [100, 102, 105, 101, 98, 103, 107])
APPENDIX_SIG = sig([1, 1, 0, 0, 1, 1, 1], APPENDIX_PX.index)


@pytest.fixture(scope="module")
def appendix():
    return run_backtest(APPENDIX_PX, APPENDIX_SIG, APPENDIX_CFG)


def test_appendix_equity_curve(appendix):
    expected = [10000, 9989.13503, 10280.13503, 9976.33394, 9976.33394, 10162.43594, 10554.43594]
    np.testing.assert_allclose(appendix.equity.to_numpy(), expected, atol=1e-5)


def test_appendix_cash_and_position(appendix):
    np.testing.assert_allclose(
        appendix.cash.to_numpy(),
        [10000, 95.13503, 95.13503, 9976.33394, 9976.33394, 68.43594, 68.43594],
        atol=1e-5,
    )
    assert appendix.position.tolist() == [0, 97, 97, 0, 0, 98, 98]


def test_appendix_trades(appendix):
    t1, t2 = appendix.trades
    assert (t1.entry_date, t1.exit_date) == (DATES[1], DATES[3])
    assert t1.qty == 97
    assert t1.entry_price == pytest.approx(102.01)
    assert t1.exit_price == pytest.approx(101.97)
    assert t1.entry_fee == pytest.approx(9.89497)
    assert t1.exit_fee == pytest.approx(9.89109)
    assert t1.pnl == pytest.approx(-23.66606, abs=1e-5)
    assert t1.ret == pytest.approx(-0.0023893, abs=1e-7)
    assert (t1.bars_held, t1.days_held, t1.status) == (2, 2, "closed")

    assert t2.status == "open"
    assert (t2.entry_date, t2.exit_date, t2.qty) == (DATES[5], DATES[6], 98)
    assert t2.exit_price == pytest.approx(107.0)  # 最終日の終値(スリッページなし)
    assert t2.exit_fee == 0
    assert t2.pnl == pytest.approx(578.102, abs=1e-5)
    assert t2.ret == pytest.approx(0.0583476, abs=1e-7)


def test_appendix_no_pending_and_no_skips(appendix):
    assert appendix.pending_signal is None
    assert appendix.skipped_orders == [] and appendix.reduced_orders == []


# ---- 約定のタイミング(Look-ahead 防止の核)---------------------------------------


def test_fill_is_next_bar_open_with_slippage():
    """シグナルの日の終値ではなく、翌日の始値 ± スリッページで約定する。"""
    px = prices([10, 20, 30, 40], [11, 21, 31, 41])
    cfg = BacktestConfig(initial_capital=1000, commission_rate=0, slippage_bps=50, lot_size=1)
    r = run_backtest(px, sig([1, 1, 0, 0], px.index), cfg)
    (t,) = r.trades
    assert t.entry_date == px.index[1] and t.entry_price == pytest.approx(20 * 1.005)
    assert t.exit_date == px.index[3] and t.exit_price == pytest.approx(40 * 0.995)


def test_first_bar_cannot_trade_and_equity_starts_at_capital():
    px = prices([10, 10, 10], [10, 10, 10])
    r = run_backtest(px, sig([1, 1, 1], px.index), BacktestConfig(initial_capital=500, lot_size=1))
    assert r.equity.iloc[0] == 500
    assert r.position.iloc[0] == 0 and r.position.iloc[1] > 0


def test_pending_signal_on_last_bar():
    px = prices([10, 10, 10], [10, 10, 10])
    cfg = BacktestConfig(initial_capital=1000, lot_size=1)
    assert run_backtest(px, sig([0, 0, 1], px.index), cfg).pending_signal == "buy"
    assert run_backtest(px, sig([1, 1, 0], px.index), cfg).pending_signal == "sell"
    assert run_backtest(px, sig([1, 1, 1], px.index), cfg).pending_signal is None


# ---- 手数料・単元株・資金不足 -----------------------------------------------------


def test_lot_size_and_minimum_commission_reduce_quantity():
    # 資金 2,040、価格 10、単元 100、最低手数料 50
    # 200株 → 2,000 + 50 = 2,050 > 2,040 なので 100株に減らす(1,000 + 50)
    px = prices([10, 10, 10], [10, 10, 10])
    cfg = BacktestConfig(
        initial_capital=2040, commission_rate=0.001, commission_min=50, slippage_bps=0, lot_size=100
    )
    r = run_backtest(px, sig([1, 1, 1], px.index), cfg)
    assert r.trades[0].qty == 100 and r.trades[0].entry_fee == 50
    assert r.cash.iloc[-1] == pytest.approx(2040 - 1050)
    assert r.reduced_orders == []  # percent_equity の調整は記録しない(仕様どおり)


def test_insufficient_cash_skips_and_retries_next_bar():
    # 資金 1,040、単元 100、最低手数料 50。価格 10 → 1,050 > 1,040 で買えない。
    # 翌日も s=1 のままなので、価格が 9 に下がった日に再度買いを試みて成功する(900 + 50 = 950)
    px = prices([10, 10, 9, 9], [10, 10, 9, 9])
    cfg = BacktestConfig(
        initial_capital=1040, commission_rate=0.001, commission_min=50, slippage_bps=0, lot_size=100
    )
    r = run_backtest(px, sig([1, 1, 1, 1], px.index), cfg)
    assert [o.date for o in r.skipped_orders] == [px.index[1]]
    assert r.skipped_orders[0].reason == "insufficient_cash"
    assert r.trades[0].entry_date == px.index[2] and r.trades[0].qty == 100


def test_fixed_shares_reduced_is_recorded():
    px = prices([10, 10, 10], [10, 10, 10])
    cfg = BacktestConfig(
        initial_capital=1500,
        commission_rate=0,
        sizing_mode="fixed_shares",
        sizing_value=250,
        lot_size=100,
    )
    r = run_backtest(px, sig([1, 1, 1], px.index), cfg)
    # 250株 → 単元で 200株 → 資金 1,500 なので 100株に減らす
    assert r.trades[0].qty == 100
    (note,) = r.reduced_orders
    assert (note.requested_qty, note.filled_qty) == (200, 100)


def test_percent_equity_partial():
    px = prices([10, 10, 10], [10, 10, 10])
    cfg = BacktestConfig(
        initial_capital=1000, commission_rate=0, slippage_bps=0, sizing_value=0.5, lot_size=1
    )
    r = run_backtest(px, sig([1, 1, 1], px.index), cfg)
    assert r.trades[0].qty == 50 and r.cash.iloc[-1] == pytest.approx(500)


# ---- 取引が無い・データ不足・入力の誤り -------------------------------------------


def test_no_trades():
    px = prices([10, 11, 12], [10, 11, 12])
    r = run_backtest(px, sig([0, 0, 0], px.index), BacktestConfig(initial_capital=1000))
    assert r.trades == [] and (r.equity == 1000).all()


def test_insufficient_bars():
    px = prices([10], [10])
    with pytest.raises(InsufficientDataError):
        run_backtest(px, sig([1], px.index), BacktestConfig())


@pytest.mark.parametrize(
    "bad",
    [
        lambda px: sig([0, 2, 0], px.index),  # 0/1 以外
        lambda px: pd.Series([0.0, np.nan, 1.0], index=px.index),  # NaN
        lambda px: sig([0, 1, 0], pd.bdate_range("2030-01-01", periods=3)),  # 日付が合わない
    ],
)
def test_invalid_signals(bad):
    px = prices([10, 10, 10], [10, 10, 10])
    with pytest.raises(InvalidParameterError):
        run_backtest(px, bad(px), BacktestConfig())


def test_invalid_prices():
    px = prices([10, 0, 10], [10, 10, 10])
    with pytest.raises(InvalidParameterError):
        run_backtest(px, sig([0, 0, 0], px.index), BacktestConfig())


# ---- 不変条件(ランダムなデータで何度も確認)--------------------------------------


def random_case(seed):
    rng = np.random.default_rng(seed)
    n = 300
    c = 100 * np.exp(rng.normal(0, 0.02, n).cumsum())
    o = c * (1 + rng.normal(0, 0.005, n))
    px = prices(o, c)
    s = sig((rng.random(n) < 0.5).astype(int), px.index)
    cfg = BacktestConfig(
        initial_capital=float(rng.uniform(5_000, 2_000_000)),
        commission_rate=float(rng.uniform(0, 0.003)),
        commission_min=float(rng.uniform(0, 100)),
        slippage_bps=float(rng.uniform(0, 30)),
        lot_size=int(rng.choice([1, 100])),
    )
    return px, s, cfg


@pytest.mark.parametrize("seed", range(10))
def test_invariants(seed):
    px, s, cfg = random_case(seed)
    r = run_backtest(px, s, cfg)
    # 1. 資産 = 現金 + 株数 × 終値(毎日)
    np.testing.assert_allclose(r.equity, r.cash + r.position * px["close"], rtol=1e-12)
    # 2. 現金はマイナスにならない(借金して買わない)
    assert (r.cash >= -1e-9).all()
    # 3. 株数は単元の倍数
    assert (r.position % cfg.lot_size == 0).all()
    # 4. 最終資産 = 初期資金 + 全取引の損益の合計
    assert r.equity.iloc[-1] == pytest.approx(
        cfg.initial_capital + sum(t.pnl for t in r.trades), rel=1e-12
    )
    # 5. 保有中かどうかは「前日のシグナル」と一致する(買えなかった日を除く)
    skipped = {o.date for o in r.skipped_orders}
    for i in range(1, len(px)):
        if px.index[i] not in skipped:
            assert (r.position.iloc[i] > 0) == bool(s.iloc[i - 1])


@pytest.mark.parametrize("seed", range(5))
def test_future_tampering_does_not_change_past_equity(seed):
    """§8-2: バー k 以降の価格とシグナルを書き換えても、k-1 までの資産・取引は変わらない。"""
    px, s, cfg = random_case(seed)
    base = run_backtest(px, s, cfg)
    rng = np.random.default_rng(1000 + seed)
    for k in (50, 150, 250):
        px2, s2 = px.copy(), s.copy()
        px2.iloc[k:, :4] = px2.iloc[k:, :4].to_numpy() * rng.uniform(0.5, 1.5, (len(px) - k, 1))
        s2.iloc[k:] = rng.integers(0, 2, len(px) - k).astype("int8")
        r = run_backtest(px2, s2, cfg)
        pd.testing.assert_series_equal(r.equity.iloc[:k], base.equity.iloc[:k])
        closed_before = [
            t for t in base.trades if t.status == "closed" and t.exit_date < px.index[k]
        ]
        assert [
            t for t in r.trades if t.status == "closed" and t.exit_date < px.index[k]
        ] == closed_before


def test_simulate_works_on_plain_arrays():
    """GPU 化を見据え、中核の simulate は NumPy 配列だけで動く。"""
    out = simulate(
        APPENDIX_PX["open"].to_numpy(),
        APPENDIX_PX["close"].to_numpy(),
        APPENDIX_SIG.to_numpy(),
        APPENDIX_CFG,
    )
    assert isinstance(out.equity, np.ndarray)
    assert out.equity[-1] == pytest.approx(10554.43594, abs=1e-5)
