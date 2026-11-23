import pandas as pd

from quant.errors import InvalidParameterError
from quant.indicators import cross_above, cross_below, ema
from quant.strategies.base import ParamSpec, Strategy, StrategyInfo


class EmaCross(Strategy):
    id = "ema_cross"
    info = StrategyInfo(
        name="EMA Crossover",
        category="trend",
        summary="直近の値動きを重く扱う指数移動平均線の交差で売買するトレンドフォロー戦略。",
        idea="SMA より新しい価格を重視するので、トレンドの変化に早く反応できる。",
        buy_rule="短期EMAが長期EMAを上抜けた日の翌営業日の始値で買う。",
        sell_rule="短期EMAが長期EMAを下抜けた日の翌営業日の始値で売る。",
        suitable="トレンド相場。SMA よりも転換点を早く捉えたいとき。",
        risks=[
            "反応が早いぶん、だましのシグナルも SMA より増えやすい",
            "横ばい相場では売買が増え、手数料負けしやすい",
        ],
        difficulty=1,
    )
    params = [
        ParamSpec("short", "短期期間", "int", 12, 2, 200, 1, "短期EMAの本数"),
        ParamSpec("long", "長期期間", "int", 26, 3, 400, 1, "長期EMAの本数"),
    ]

    def _check_relations(self, p):
        if p["short"] >= p["long"]:
            raise InvalidParameterError("短期期間は長期期間より小さくしてください")

    def min_bars(self, p):
        return p["long"] + 1

    def events(self, df: pd.DataFrame, p):
        s, lo = ema(df["close"], p["short"]), ema(df["close"], p["long"])
        return cross_above(s, lo), cross_below(s, lo)
