import pandas as pd

from quant.indicators import bollinger
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo


class BollingerReversion(Strategy):
    id = "bollinger"
    info = StrategyInfo(
        name="Bollinger Bands",
        category="mean_reversion",
        summary="価格がバンドの下限を割ったら買い、中心線に戻ったら売る戦略。",
        idea="価格は統計的にバンドの内側に収まりやすいので、下に外れたら平均へ戻ると考える。",
        buy_rule="終値が下限バンド(中心線 − k × 標準偏差)を下回った日の翌営業日の始値で買う。",
        sell_rule="終値が中心線(移動平均)を上回った日の翌営業日の始値で売る。",
        suitable="ボラティリティが安定したレンジ相場。",
        risks=[
            "暴落時はバンドの外で下がり続ける(バンドウォーク)ことがある",
            "損切りのルールがないため、1回の損失が大きくなりうる",
        ],
        difficulty=2,
    )
    params = [
        ParamSpec("n", "期間", "int", 20, 2, 200, 1, "中心線(SMA)と標準偏差の本数"),
        ParamSpec("k", "標準偏差の倍率", "float", 2.0, 0.5, 4.0, 0.1, "バンドの幅"),
    ]

    def min_bars(self, p):
        return p["n"]

    def events(self, df: pd.DataFrame, p):
        mid, _, lower = bollinger(df["close"], p["n"], p["k"])
        c = df["close"]
        return (c < lower).fillna(False), (c > mid).fillna(False)
