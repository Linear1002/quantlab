import pandas as pd

from quant.errors import InvalidParameterError
from quant.indicators import rsi
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo


class RsiReversal(Strategy):
    id = "rsi"
    info = StrategyInfo(
        name="RSI",
        category="oscillator",
        summary="RSI で「売られすぎ」を買い、「買われすぎ」で売る逆張り戦略。",
        idea="短期間に大きく下がった銘柄は、反発しやすいと考える。",
        buy_rule="RSI が下限(既定 30)を下回った日の翌営業日の始値で買う。",
        sell_rule="RSI が上限(既定 70)を上回った日の翌営業日の始値で売る。",
        suitable="一定の範囲で上下を繰り返すレンジ相場。",
        risks=[
            "強い下落トレンドでは「売られすぎ」が続き、損失が大きくなる",
            "上限に届かないまま長く保有し続けることがある",
        ],
        difficulty=2,
    )
    params = [
        ParamSpec("n", "期間", "int", 14, 2, 100, 1, "RSI の計算に使う本数"),
        ParamSpec("lower", "買いの閾値", "float", 30, 1, 99, 1, "これを下回ったら買う"),
        ParamSpec("upper", "売りの閾値", "float", 70, 1, 99, 1, "これを上回ったら売る"),
    ]

    def _check_relations(self, p):
        if p["lower"] >= p["upper"]:
            raise InvalidParameterError("買いの閾値は売りの閾値より小さくしてください")

    def min_bars(self, p):
        return p["n"] + 1

    def events(self, df: pd.DataFrame, p):
        r = rsi(df["close"], p["n"])
        return (r < p["lower"]).fillna(False), (r > p["upper"]).fillna(False)
