"""株式分割・配当の調整(QUANT_SPEC §2.2)。

Yahoo の Close/Open/High/Low は「分割調整済み・配当未調整」、Adj Close は「分割+配当調整済み」。
total_return モードでは、調整係数 f = adj_close / close を始値・高値・安値にも掛けて、
4本値すべてを「配当再投資を仮定した価格」にそろえる。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant.errors import InvalidParameterError
from quant.models import PriceMode

REQUIRED = ["open", "high", "low", "close", "adj_close", "volume"]


def adjust_ohlc(df: pd.DataFrame, mode: PriceMode | str = PriceMode.TOTAL_RETURN) -> pd.DataFrame:
    """バックテストで使う価格を作る。

    入力は変更せず、列 open/high/low/close/volume の新しい DataFrame を返す。

    - total_return: f = adj_close / close を O/H/L に掛け、close は adj_close にする
    - split_only:   O/H/L/C をそのまま使う(配当は無視される)
    """
    mode = PriceMode(mode)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise InvalidParameterError(f"adjust_ohlc: missing columns {missing}")

    out = df[["open", "high", "low", "close", "volume"]].astype("float64").copy()
    if mode is PriceMode.SPLIT_ONLY:
        return out

    close = df["close"].astype("float64")
    adj = df["adj_close"].astype("float64")
    if (close <= 0).any() or (adj <= 0).any() or close.isna().any() or adj.isna().any():
        raise InvalidParameterError("adjust_ohlc: close and adj_close must be positive and not NaN")

    f = (adj / close).to_numpy()
    for col in ("open", "high", "low"):
        out[col] = df[col].to_numpy(dtype="float64") * f
    out["close"] = adj.to_numpy()
    # 掛け算の丸め誤差で high < close などにならないよう、範囲を整える
    out["high"] = np.maximum.reduce([out["high"], out["open"], out["close"]])
    out["low"] = np.minimum.reduce([out["low"], out["open"], out["close"]])
    return out
