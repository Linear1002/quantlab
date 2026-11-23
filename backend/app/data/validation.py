"""OHLCV データの検証(QUANT_SPEC §1.2)。

方針: おかしなデータは黙って直さず、エラーにする。
例外は「OHLC が NaN の行」(Yahoo は休場日に NaN 行を返すことがある)と「順序」だけで、
これらは情報を失わずに直せるので、直したうえで warnings に記録する。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.data.base import OHLCV_COLUMNS, DataValidationError

PRICE_COLUMNS = ["open", "high", "low", "close", "adj_close"]
# high >= max(open, close) などの比較で許す相対誤差(浮動小数点の丸め対策)
REL_TOL = 1e-6


def validate_ohlcv(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """OHLCV を検証し、(きれいにした DataFrame, 警告メッセージのリスト) を返す。

    違反があれば DataValidationError。入力の df は変更しない。
    """
    warnings: list[str] = []

    # 1. 必須列
    missing = [c for c in OHLCV_COLUMNS if c not in df.columns]
    if missing:
        raise DataValidationError(f"必須の列がありません: {missing}")

    # 2. index
    if not isinstance(df.index, pd.DatetimeIndex):
        raise DataValidationError("index が日付型(DatetimeIndex)ではありません")
    if df.index.tz is not None:
        raise DataValidationError("index にタイムゾーンが付いています(Provider 側で外す仕様)")
    dup = df.index[df.index.duplicated()]
    if len(dup) > 0:
        raise DataValidationError(
            f"日付が重複しています: {[d.date().isoformat() for d in dup[:5]]}"
        )

    out = df[OHLCV_COLUMNS].astype("float64")

    # 3. 昇順でなければ並べ替える(情報は失われない)
    if not out.index.is_monotonic_increasing:
        out = out.sort_index()
        warnings.append("日付が昇順でなかったため並べ替えました")

    # 4. OHLC が NaN の行は除外する
    nan_rows = out[PRICE_COLUMNS].isna().any(axis=1)
    if nan_rows.any():
        dropped = [d.date().isoformat() for d in out.index[nan_rows]]
        out = out[~nan_rows]
        shown = ", ".join(dropped[:5]) + (" ほか" if len(dropped) > 5 else "")
        warnings.append(f"価格が欠損している {len(dropped)} 行を除外しました({shown})")
    # 出来高の欠損は 0 として扱う(価格計算には使わないため)
    if out["volume"].isna().any():
        out["volume"] = out["volume"].fillna(0.0)
        warnings.append("出来高の欠損を 0 として扱いました")

    if out.empty:
        return out, warnings

    # 5. 値の範囲チェック
    prices = out[PRICE_COLUMNS].to_numpy()
    if (prices <= 0).any() or not np.isfinite(prices).all():
        bad = out.index[(out[PRICE_COLUMNS] <= 0).any(axis=1)]
        raise DataValidationError(
            f"0 以下または無限大の価格があります: {[d.date().isoformat() for d in bad[:5]]}"
        )
    if (out["volume"] < 0).any():
        raise DataValidationError("出来高が負の行があります")

    # 6. 高値・安値の整合性
    hi_ok = out["high"] >= out[["open", "close"]].max(axis=1) * (1 - REL_TOL)
    lo_ok = out["low"] <= out[["open", "close"]].min(axis=1) * (1 + REL_TOL)
    bad = out.index[~(hi_ok & lo_ok)]
    if len(bad) > 0:
        raise DataValidationError(
            "高値・安値が始値・終値と矛盾する行があります: "
            f"{[d.date().isoformat() for d in bad[:5]]}"
        )

    return out, warnings
