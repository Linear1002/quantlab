"""選んだ銘柄・期間で、戦略の売買シグナルを計算する(戦略ページのプレビュー用)。

バックテスト(Phase 5)でも、同じ「ウォームアップ込みで取得 → 調整 → シグナル」の流れを使う。
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta

import pandas as pd

from app.data.base import Interval, MarketDataProvider
from app.services.market import load_history
from quant.adjust import adjust_ohlc
from quant.models import PriceMode
from quant.strategies import generate_signals, get_strategy


def warmup_start(start: date, bars: int, interval: Interval) -> date:
    """bars 本のウォームアップを取るために、どれだけ前から取得すればよいか(暦日で見積もる)。

    日足: 1年 ≒ 245〜252 営業日なので、営業日 → 暦日は ×1.5 に余裕を足す(祝日・長期休場対策)
    週足: 1本 = 7日
    """
    days = math.ceil(bars * 1.5) + 14 if interval is Interval.DAILY else bars * 7 + 21
    return start - timedelta(days=days)


@dataclass
class SignalResult:
    params: dict
    data: pd.DataFrame  # 分析期間の調整済み価格 + signal 列
    warmup_bars: int  # 実際に取れたウォームアップの本数
    warnings: list[str]


def compute_signals(
    provider: MarketDataProvider,
    symbol: str,
    start: date,
    end: date,
    interval: Interval,
    strategy_id: str,
    params: dict | None,
    price_mode: PriceMode = PriceMode.TOTAL_RETURN,
) -> SignalResult:
    strategy = get_strategy(strategy_id)
    p = strategy.validate_params(params)
    need = strategy.min_bars(p)

    raw, warnings = load_history(
        provider, symbol, warmup_start(start, need, interval), end, interval
    )
    prices = adjust_ohlc(raw, price_mode)
    trade_start = pd.Timestamp(start)
    signal = generate_signals(strategy, prices, p, trade_start=trade_start)

    warm = int((prices.index < trade_start).sum())
    if warm < need - 1:
        warnings.append(
            f"指標の計算に必要な {need} 本のうち、分析開始日より前のデータが"
            f" {warm} 本しかありません。期間の序盤はシグナルが出ません"
        )
    in_range = prices.index >= trade_start
    data = prices.loc[in_range].assign(signal=signal.loc[in_range])
    return SignalResult(params=p, data=data, warmup_bars=warm, warnings=warnings)
