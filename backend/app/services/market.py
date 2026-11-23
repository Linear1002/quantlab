"""株価データを取得して検証するまでの処理。API とバックテストの両方から使う。"""

from __future__ import annotations

from datetime import date

import pandas as pd

from app.data.base import Interval, InvalidRequestError, MarketDataProvider, NoDataError
from app.data.validation import validate_ohlcv

# 取得できる最も古い日付(これより前はデータの信頼性が低く、取得にも時間がかかる)
MIN_DATE = date(1980, 1, 1)


def load_history(
    provider: MarketDataProvider, symbol: str, start: date, end: date, interval: Interval
) -> tuple[pd.DataFrame, list[str]]:
    """OHLCV を取得して検証する。戻り値は (データ, 警告メッセージ)。

    - start > end → InvalidRequestError(400)
    - 検証後に 0 行 → NoDataError(404)
    - データの矛盾 → DataValidationError(502)
    """
    if start > end:
        raise InvalidRequestError("開始日が終了日より後になっています")
    if start < MIN_DATE:
        raise InvalidRequestError(f"開始日は {MIN_DATE.isoformat()} 以降を指定してください")

    raw = provider.get_ohlcv(symbol, start, end, interval)
    df, warnings = validate_ohlcv(raw)
    if df.empty:
        raise NoDataError(
            f"{symbol} の {start.isoformat()} 〜 {end.isoformat()} の株価データがありません"
        )
    return df, warnings
