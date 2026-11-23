import pandas as pd

from quant.errors import InvalidParameterError
from quant.indicators import zscore
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo


class MeanReversion(Strategy):
    id = "mean_reversion"
    info = StrategyInfo(
        name="Mean Reversion",
        category="mean_reversion",
        summary="価格が平均から大きく下に離れたら買い、平均近くに戻ったら売る戦略。",
        idea="一時的な行き過ぎは平均に戻りやすいと考え、乖離の大きさを Zスコアで測る。",
        buy_rule="Zスコア(平均からの乖離 ÷ 標準偏差)が −entry を下回った日の翌営業日の始値で買う。",
        sell_rule="Zスコアが −exit 以上に戻った日の翌営業日の始値で売る。",
        suitable="一定の水準を中心に上下するレンジ相場。",
        risks=[
            "業績悪化などで価格の水準そのものが変わると、平均に戻らない",
            "損切りのルールがないため、1回の損失が大きくなりうる",
        ],
        difficulty=3,
    )
    params = [
        ParamSpec("n", "期間", "int", 20, 2, 200, 1, "平均と標準偏差の本数"),
        ParamSpec(
            "entry_z",
            "買いの乖離(σ)",
            "float",
            2.0,
            0.5,
            4.0,
            0.1,
            "Zスコアがこの値のマイナスを下回ったら買う",
        ),
        ParamSpec(
            "exit_z",
            "売りの乖離(σ)",
            "float",
            0.0,
            -2.0,
            3.5,
            0.1,
            "Zスコアがこの値のマイナス以上で売る",
        ),
    ]

    def _check_relations(self, p):
        if p["exit_z"] >= p["entry_z"]:
            raise InvalidParameterError("売りの乖離は買いの乖離より小さくしてください")

    def min_bars(self, p):
        return p["n"]

    def events(self, df: pd.DataFrame, p):
        z = zscore(df["close"], p["n"])
        return (z < -p["entry_z"]).fillna(False), (z >= -p["exit_z"]).fillna(False)
