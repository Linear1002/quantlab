import pandas as pd

from quant.strategies.base import Strategy, StrategyInfo


class BuyAndHold(Strategy):
    id = "buy_hold"
    info = StrategyInfo(
        name="Buy and Hold",
        category="benchmark",
        summary="最初に買って、期間の最後まで持ち続ける戦略。他の戦略の比較基準にも使う。",
        idea="売買のタイミングを考えず、市場の長期的な成長をそのまま受け取る。",
        buy_rule="分析開始日の翌営業日の始値で買う。",
        sell_rule="売らない(期間の最後の終値で評価する)。",
        suitable="長期的に右肩上がりの銘柄。",
        risks=[
            "暴落をそのまま受けるので、最大ドローダウンが大きくなりやすい",
            "1銘柄だけなので、その企業固有のリスクを分散できない",
        ],
        difficulty=1,
    )
    params = []

    def min_bars(self, p):
        return 1

    def events(self, df: pd.DataFrame, p):
        return (
            pd.Series(True, index=df.index),
            pd.Series(False, index=df.index),
        )
