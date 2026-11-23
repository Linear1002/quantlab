import pandas as pd

from quant.indicators import roc
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo


class Momentum(Strategy):
    id = "momentum"
    info = StrategyInfo(
        name="Momentum",
        category="trend",
        summary="過去の一定期間に値上がりしている間だけ保有する戦略。",
        idea="上がっているものはしばらく上がり続けやすい(モメンタム効果)と考える。",
        buy_rule="n 本前と比べた変化率が閾値(既定 0%)を上回った日の翌営業日の始値で買う。",
        sell_rule="変化率が閾値以下になった日の翌営業日の始値で売る。",
        suitable="数か月単位で続くトレンド相場。",
        risks=[
            "トレンドが急に反転すると、変化率が下がるまで売れず損失が出る",
            "変化率が閾値付近を行き来すると売買が増える",
        ],
        difficulty=1,
    )
    params = [
        ParamSpec("n", "期間", "int", 60, 2, 400, 1, "何本前と比べるか"),
        ParamSpec(
            "threshold", "閾値(%)", "float", 0.0, -50.0, 50.0, 0.5, "この変化率を超えたら保有"
        ),
    ]

    def min_bars(self, p):
        return p["n"] + 1

    def events(self, df: pd.DataFrame, p):
        r = roc(df["close"], p["n"])
        th = p["threshold"] / 100.0
        valid = r.notna()
        # 「条件を満たす間は保有」なので、entry = 条件成立、exit = 条件不成立
        return (valid & (r > th)), (valid & (r <= th))
