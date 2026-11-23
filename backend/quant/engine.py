"""バックテストエンジン(QUANT_SPEC §5)。

2層構造:
- simulate(): NumPy 配列だけを受け取る中核。1本ずつ「約定 → 記録」を進める。
              将来 Numba / CUDA に置き換えるのはこの関数(1スレッド = 1パラメータ組)。
- run_backtest(): pandas との変換、入力チェック、取引(Trade)の組み立て。

Look-ahead Bias を防ぐ仕組み:
バー i で使うのは「バー i-1 の終値で決まったシグナル target[i-1]」と「バー i の始値」だけ。
バー i の終値は、約定が終わった後の資産評価にしか使わない。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from quant.errors import InsufficientDataError, InvalidParameterError
from quant.models import BacktestConfig, BacktestResult, OrderNote, SizingMode, Trade


@dataclass
class Fill:
    """1回の約定。i はバーの位置。"""

    i: int
    side: str  # "buy" / "sell"
    price: float
    qty: int
    fee: float


@dataclass
class SimArrays:
    cash: np.ndarray
    qty: np.ndarray
    equity: np.ndarray
    fills: list[Fill] = field(default_factory=list)
    # (バー位置, 希望株数, 約定株数, 理由)
    notes: list[tuple[int, int, int, str]] = field(default_factory=list)
    pending: str | None = None


def commission(cfg: BacktestConfig, notional: float) -> float:
    """手数料 = max(最低手数料, 約定金額 × 料率)(§5.3)。"""
    return max(cfg.commission_min, notional * cfg.commission_rate)


def _floor_lot(x: float, lot: int) -> int:
    """x 株以下で、単元(lot)の倍数のうち最大のもの。"""
    if not math.isfinite(x) or x <= 0:
        return 0
    return int(math.floor(x / lot)) * lot


def buy_quantity(cfg: BacktestConfig, cash: float, fill: float) -> tuple[int, int]:
    """(希望株数, 実際に買える株数) を返す(§5.4)。

    手数料 = max(最低, 料率 × 金額) なので、「現金で払える」条件は次の2つが両方成り立つこと:
      fill × q × (1 + 料率) <= cash   かつ   fill × q + 最低手数料 <= cash
    ここから最大の q を直接計算し、浮動小数点の誤差に備えて最後に1単元ずつ確認する。
    """
    lot = cfg.lot_size
    if cfg.sizing_mode is SizingMode.PERCENT_EQUITY:
        wanted = _floor_lot(cash * cfg.sizing_value / fill, lot)
    else:
        wanted = _floor_lot(cfg.sizing_value, lot)

    affordable = _floor_lot(
        min(cash / (fill * (1 + cfg.commission_rate)), (cash - cfg.commission_min) / fill), lot
    )
    q = min(wanted, affordable)
    while q > 0 and fill * q + commission(cfg, fill * q) > cash:
        q -= lot
    return wanted, q


def simulate(
    open_: np.ndarray, close: np.ndarray, target: np.ndarray, cfg: BacktestConfig
) -> SimArrays:
    """中核のシミュレーション。入力はすべて同じ長さの 1次元配列。

    - target[i]: バー i の終値で決まった目標ポジション(0 / 1)
    - バー i(i >= 1)の始値で、target[i-1] に合わせて売買する
    """
    n = len(close)
    slip = cfg.slippage
    cash_arr = np.empty(n)
    qty_arr = np.zeros(n, dtype=np.int64)
    eq_arr = np.empty(n)
    out = SimArrays(cash_arr, qty_arr, eq_arr)

    cash = float(cfg.initial_capital)
    q = 0
    for i in range(n):
        if i > 0:
            want_long = target[i - 1] == 1  # 前日の終値で決まったシグナル
            if want_long and q == 0:
                fill = open_[i] * (1 + slip)  # 買いは不利な方向(高く)にずれる
                wanted, got = buy_quantity(cfg, cash, fill)
                if got == 0:
                    out.notes.append((i, wanted, 0, "insufficient_cash"))
                else:
                    fee = commission(cfg, fill * got)
                    cash -= fill * got + fee
                    q = got
                    out.fills.append(Fill(i, "buy", fill, got, fee))
                    if got < wanted and cfg.sizing_mode is SizingMode.FIXED_SHARES:
                        out.notes.append((i, wanted, got, "reduced"))
            elif not want_long and q > 0:
                fill = open_[i] * (1 - slip)  # 売りは安くなる方向にずれる
                fee = commission(cfg, fill * q)
                cash += fill * q - fee
                out.fills.append(Fill(i, "sell", fill, q, fee))
                q = 0
        # 約定が終わってから、その日の終値で資産を評価する
        cash_arr[i] = cash
        qty_arr[i] = q
        eq_arr[i] = cash + q * close[i]

    # 最終日のシグナルは翌日に約定するはずだったが、データが無いので「未約定」として残す
    if n > 0 and (target[n - 1] == 1) != (q > 0):
        out.pending = "buy" if target[n - 1] == 1 else "sell"
    return out


def _validate(prices: pd.DataFrame, signals: pd.Series) -> None:
    for col in ("open", "close"):
        if col not in prices.columns:
            raise InvalidParameterError(f"prices must have column '{col}'")
    if len(prices) < 2:
        raise InsufficientDataError(
            f"バックテストには2本以上のデータが必要です(現在 {len(prices)} 本)"
        )
    if not prices.index.equals(signals.index):
        raise InvalidParameterError("prices と signals の日付が一致しません")
    px = prices[["open", "close"]].to_numpy(dtype="float64")
    if not np.isfinite(px).all() or (px <= 0).any():
        raise InvalidParameterError("始値・終値に 0 以下・欠損・無限大の値があります")
    if signals.isna().any() or not set(np.unique(signals.to_numpy())) <= {0, 1}:
        raise InvalidParameterError("signals は 0 か 1 だけにしてください")


def run_backtest(prices: pd.DataFrame, signals: pd.Series, cfg: BacktestConfig) -> BacktestResult:
    """バックテストを実行する。

    prices: 分析期間の価格(adjust_ohlc で調整済み)。列 open, close が必要
    signals: prices と同じ日付の目標ポジション(0 / 1)。generate_signals の出力
    """
    _validate(prices, signals)
    idx = prices.index
    close = prices["close"].to_numpy(dtype="float64")
    sim = simulate(
        prices["open"].to_numpy(dtype="float64"),
        close,
        signals.to_numpy(dtype=np.int8),
        cfg,
    )

    # 約定の記録を「買い → 売り」の組(Trade)にまとめる
    trades: list[Trade] = []
    entry: Fill | None = None
    for f in sim.fills:
        if f.side == "buy":
            entry = f
        else:
            assert entry is not None
            trades.append(_make_trade(idx, entry, f.i, f.price, f.fee, "closed"))
            entry = None
    if entry is not None:  # 期間の最後に保有中 → 最終日の終値で評価(手数料なし)
        trades.append(_make_trade(idx, entry, len(idx) - 1, float(close[-1]), 0.0, "open"))

    notes = [
        OrderNote(idx[i], "buy", reason, wanted, got)  # type: ignore[arg-type]
        for i, wanted, got, reason in sim.notes
    ]
    return BacktestResult(
        equity=pd.Series(sim.equity, index=idx, name="equity"),
        cash=pd.Series(sim.cash, index=idx, name="cash"),
        position=pd.Series(sim.qty, index=idx, name="position"),
        trades=trades,
        skipped_orders=[n for n in notes if n.reason == "insufficient_cash"],
        reduced_orders=[n for n in notes if n.reason == "reduced"],
        pending_signal=sim.pending,  # type: ignore[arg-type]
        config=cfg,
    )


def _make_trade(
    idx: pd.DatetimeIndex, entry: Fill, exit_i: int, exit_price: float, exit_fee: float, status: str
) -> Trade:
    cost = entry.price * entry.qty + entry.fee
    pnl = (exit_price * entry.qty - exit_fee) - cost
    return Trade(
        entry_date=idx[entry.i],
        exit_date=idx[exit_i],
        entry_price=entry.price,
        exit_price=exit_price,
        qty=entry.qty,
        entry_fee=entry.fee,
        exit_fee=exit_fee,
        pnl=pnl,
        ret=pnl / cost,
        bars_held=exit_i - entry.i,
        days_held=(idx[exit_i] - idx[entry.i]).days,
        status=status,  # type: ignore[arg-type]
    )
