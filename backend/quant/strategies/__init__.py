"""戦略の一覧(レジストリ)。新しい戦略を追加したら STRATEGIES に1行足す。"""

from quant.errors import InvalidParameterError
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo, generate_signals
from quant.strategies.bollinger import BollingerReversion
from quant.strategies.buy_hold import BuyAndHold
from quant.strategies.ema_cross import EmaCross
from quant.strategies.macd import MacdCross
from quant.strategies.mean_reversion import MeanReversion
from quant.strategies.momentum import Momentum
from quant.strategies.rsi import RsiReversal
from quant.strategies.sma_cross import SmaCross

# 画面に表示する順番
STRATEGIES: dict[str, Strategy] = {
    s.id: s
    for s in [
        SmaCross(),
        EmaCross(),
        RsiReversal(),
        MacdCross(),
        BollingerReversion(),
        Momentum(),
        MeanReversion(),
        BuyAndHold(),
    ]
}


def get_strategy(strategy_id: str) -> Strategy:
    try:
        return STRATEGIES[strategy_id]
    except KeyError:
        raise InvalidParameterError(f"unknown strategy: {strategy_id}") from None


def list_strategies() -> list[Strategy]:
    return list(STRATEGIES.values())


__all__ = [
    "STRATEGIES",
    "ParamSpec",
    "Strategy",
    "StrategyInfo",
    "generate_signals",
    "get_strategy",
    "list_strategies",
]
