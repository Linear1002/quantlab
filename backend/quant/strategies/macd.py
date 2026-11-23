import pandas as pd

from quant.errors import InvalidParameterError
from quant.indicators import cross_above, cross_below, macd
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo


class MacdCross(Strategy):
    id = "macd"
    info = StrategyInfo(
        name="MACD",
        category="trend",
        summary="MACD線とシグナル線の交差で、トレンドの転換を捉える戦略。",
        idea=(
            "2本の EMA の差(MACD)が勢いを表す。その勢いが平均より強くなったら上昇の始まりと考える。"
        ),
        buy_rule="MACD線がシグナル線を上抜けた日の翌営業日の始値で買う。",
        sell_rule="MACD線がシグナル線を下抜けた日の翌営業日の始値で売る。",
        suitable="トレンドの転換がはっきり出る相場。",
        risks=[
            "値動きが小さい相場ではだましが多い",
            "3つの期間パラメータがあり、過去データに合わせ込みすぎ(過剰最適化)になりやすい",
        ],
        difficulty=2,
    )
    params = [
        ParamSpec("fast", "短期EMA", "int", 12, 2, 100, 1),
        ParamSpec("slow", "長期EMA", "int", 26, 3, 200, 1),
        ParamSpec("signal", "シグナル期間", "int", 9, 2, 100, 1, "MACD線の EMA の本数"),
    ]

    def _check_relations(self, p):
        if p["fast"] >= p["slow"]:
            raise InvalidParameterError("短期EMAは長期EMAより小さくしてください")

    def min_bars(self, p):
        return p["slow"] + p["signal"]  # シグナル線が出る位置 + 交差判定の1本

    def events(self, df: pd.DataFrame, p):
        line, sig, _ = macd(df["close"], p["fast"], p["slow"], p["signal"])
        return cross_above(line, sig), cross_below(line, sig)
