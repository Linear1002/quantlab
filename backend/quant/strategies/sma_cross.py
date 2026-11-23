import pandas as pd

from quant.errors import InvalidParameterError
from quant.indicators import cross_above, cross_below, sma
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo


class SmaCross(Strategy):
    id = "sma_cross"
    info = StrategyInfo(
        name="SMA Crossover",
        category="trend",
        summary="短期と長期の単純移動平均線の交差で売買する、代表的なトレンドフォロー戦略。",
        idea="価格の平均が短期で長期を上回るのは、上昇トレンドが始まったサインと考える。",
        buy_rule="短期SMAが長期SMAを下から上に抜けた日(ゴールデンクロス)の翌営業日の始値で買う。",
        sell_rule="短期SMAが長期SMAを上から下に抜けた日(デッドクロス)の翌営業日の始値で売る。",
        suitable="一方向に大きく動くトレンド相場。",
        risks=[
            "横ばい相場では交差が頻発し、小さな損失(往復ビンタ)が積み重なる",
            "移動平均は過去の平均なので、売買のタイミングが遅れる",
        ],
        difficulty=1,
    )
    params = [
        ParamSpec("short", "短期期間", "int", 20, 2, 200, 1, "短期SMAの本数"),
        ParamSpec("long", "長期期間", "int", 50, 3, 400, 1, "長期SMAの本数"),
    ]

    def _check_relations(self, p):
        if p["short"] >= p["long"]:
            raise InvalidParameterError("短期期間は長期期間より小さくしてください")

    def min_bars(self, p):
        return p["long"] + 1  # 交差の判定に前日の値も必要

    def events(self, df: pd.DataFrame, p):
        s, lo = sma(df["close"], p["short"]), sma(df["close"], p["long"])
        return cross_above(s, lo), cross_below(s, lo)
