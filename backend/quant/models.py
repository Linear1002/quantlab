"""バックテストの入力設定(仕様書 QUANT_SPEC.md §5.1)。

入力の設定(BacktestConfig)と、結果のデータ型(Trade, OrderNote, BacktestResult)。
計算は engine.py と metrics.py が行う。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

import pandas as pd

from quant.errors import InvalidParameterError


class SizingMode(StrEnum):
    PERCENT_EQUITY = "percent_equity"  # 現金の何割で買うか
    FIXED_SHARES = "fixed_shares"  # 毎回決まった株数を買う


class PriceMode(StrEnum):
    TOTAL_RETURN = "total_return"  # 分割+配当調整(デフォルト)
    SPLIT_ONLY = "split_only"  # 分割調整のみ。配当は無視


def default_lot_size(symbol: str) -> int:
    """日本株(Yahoo の `.T` 銘柄)は単元株 100、それ以外は 1 株単位。"""
    return 100 if symbol.upper().endswith(".T") else 1


@dataclass(frozen=True)
class BacktestConfig:
    initial_capital: float = 1_000_000.0
    commission_rate: float = 0.0005
    commission_min: float = 0.0
    slippage_bps: float = 5.0
    sizing_mode: SizingMode = SizingMode.PERCENT_EQUITY
    sizing_value: float = 1.0
    lot_size: int = 1
    price_mode: PriceMode = PriceMode.TOTAL_RETURN
    long_only: bool = True

    def __post_init__(self) -> None:
        # 文字列で渡されても Enum に変換する(API から JSON で来るため)
        object.__setattr__(self, "sizing_mode", SizingMode(self.sizing_mode))
        object.__setattr__(self, "price_mode", PriceMode(self.price_mode))
        self.validate()

    @property
    def slippage(self) -> float:
        """bps(1/10000)を比率に変換した値。5bps → 0.0005。"""
        return self.slippage_bps / 10_000

    def validate(self) -> None:
        """仕様書 §5.1 の制約をチェックする。違反時は InvalidParameterError。"""
        errors: list[str] = []
        if not self.initial_capital > 0:
            errors.append("initial_capital must be > 0")
        if not 0 <= self.commission_rate < 0.1:
            errors.append("commission_rate must be in [0, 0.1)")
        if not self.commission_min >= 0:
            errors.append("commission_min must be >= 0")
        if not 0 <= self.slippage_bps < 1000:
            errors.append("slippage_bps must be in [0, 1000)")
        if not (isinstance(self.lot_size, int) and self.lot_size >= 1):
            errors.append("lot_size must be an integer >= 1")
        if self.sizing_mode is SizingMode.PERCENT_EQUITY:
            if not 0 < self.sizing_value <= 1:
                errors.append("sizing_value must be in (0, 1] for percent_equity")
        else:
            if not (self.sizing_value > 0 and float(self.sizing_value).is_integer()):
                errors.append("sizing_value must be a positive integer for fixed_shares")
        if not self.long_only:
            errors.append("short selling is not supported yet (long_only must be True)")
        if errors:
            raise InvalidParameterError("; ".join(errors))


# ---- バックテストの結果(QUANT_SPEC §5, §6)-----------------------------------------


@dataclass(frozen=True)
class Trade:
    """1回の売買(買い → 売り)。期間の最後に保有中なら status="open"(含み損益)。"""

    entry_date: pd.Timestamp
    exit_date: pd.Timestamp
    entry_price: float  # スリッページ込みの約定価格
    exit_price: float  # 未決済なら最終日の終値
    qty: int
    entry_fee: float
    exit_fee: float  # 未決済なら 0
    pnl: float  # (exit_price*qty - exit_fee) - (entry_price*qty + entry_fee)
    ret: float  # pnl / (entry_price*qty + entry_fee)
    bars_held: int
    days_held: int  # 暦日数
    status: Literal["closed", "open"]


@dataclass(frozen=True)
class OrderNote:
    """思いどおりに約定できなかった注文の記録。"""

    date: pd.Timestamp
    side: Literal["buy", "sell"]
    reason: Literal["insufficient_cash", "reduced"]
    requested_qty: int
    filled_qty: int


@dataclass
class BacktestResult:
    equity: pd.Series  # 資産推移 E_t
    cash: pd.Series
    position: pd.Series  # 保有株数 q_t
    trades: list[Trade]
    skipped_orders: list[OrderNote]  # 資金不足で買えなかった注文
    reduced_orders: list[OrderNote]  # fixed_shares で株数を減らした注文
    pending_signal: Literal["buy", "sell"] | None  # 最終日に出て、約定していないシグナル
    config: BacktestConfig
