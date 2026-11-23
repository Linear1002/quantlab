"""株価データの SQLite キャッシュ(DESIGN.md §2.2)。

Yahoo はアクセス制限の上限を公開していないので、同じデータを何度も取りに行かないようにする。
どの MarketDataProvider にも被せられる「包み紙(デコレータ)」として作っている。
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import pandas as pd
from sqlalchemy import Engine, and_, delete, insert, select

from app.data.base import OHLCV_COLUMNS, Interval, Market, MarketDataProvider, Quote, SymbolInfo
from app.db.tables import ohlcv_bars, ohlcv_coverage

DEFAULT_TTL = timedelta(hours=12)


def _as_ns(df: pd.DataFrame) -> pd.DataFrame:
    """日付の型を datetime64[ns] にそろえる(キャッシュの有無で型が変わらないように)。"""
    out = df.copy()
    out.index = pd.DatetimeIndex(out.index, name="date").as_unit("ns")
    return out


class CachedProvider(MarketDataProvider):
    def __init__(
        self,
        inner: MarketDataProvider,
        engine: Engine,
        ttl: timedelta = DEFAULT_TTL,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ):
        self.inner = inner
        self.name = inner.name  # キャッシュの有無で provider 名は変えない
        self._engine = engine
        self._ttl = ttl
        self._now = now  # テストで時刻を進めるための引数
        self._lock = threading.Lock()

    # 検索と最新株価はキャッシュしない(新鮮さが大事なため)
    def search(self, query: str, market: Market | None = None) -> list[SymbolInfo]:
        return self.inner.search(query, market)

    def get_quote(self, symbol: str) -> Quote:
        return self.inner.get_quote(symbol)

    def get_ohlcv(self, symbol: str, start: date, end: date, interval: Interval) -> pd.DataFrame:
        key = (self.name, symbol.upper(), interval.value)
        with self._lock:
            cov = self._read_coverage(key)
            if cov is not None and self._is_fresh(cov["fetched_at"]):
                if cov["start"] <= start and end <= cov["end"]:
                    return _as_ns(self._read_bars(key, start, end))  # キャッシュで足りる

            # 足りない or 古い → 「取得済み期間 ∪ 要求期間」を丸ごと取り直す。
            # Adj Close は新しい配当で過去の値まで変わるので、一部だけ足すと値がつながらない。
            fetch_start = min(start, cov["start"]) if cov else start
            fetch_end = max(end, cov["end"]) if cov else end
            df = self.inner.get_ohlcv(symbol, fetch_start, fetch_end, interval)
            self._replace(key, df, fetch_start, fetch_end)

        mask = (df.index >= pd.Timestamp(start)) & (df.index <= pd.Timestamp(end))
        return _as_ns(df.loc[mask])

    # ---- 内部処理 ----------------------------------------------------

    def _is_fresh(self, fetched_at: datetime) -> bool:
        if fetched_at.tzinfo is None:  # SQLite は tz を保存しないので UTC として読む
            fetched_at = fetched_at.replace(tzinfo=UTC)
        return self._now() - fetched_at < self._ttl

    @staticmethod
    def _where(table, key):
        provider, symbol, interval = key
        return and_(
            table.c.provider == provider, table.c.symbol == symbol, table.c.interval == interval
        )

    def _read_coverage(self, key) -> dict | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(ohlcv_coverage).where(self._where(ohlcv_coverage, key)))
            r = row.mappings().first()
            return dict(r) if r else None

    def _read_bars(self, key, start: date, end: date) -> pd.DataFrame:
        q = (
            select(ohlcv_bars.c.date, *[ohlcv_bars.c[c] for c in OHLCV_COLUMNS])
            .where(self._where(ohlcv_bars, key))
            .where(ohlcv_bars.c.date.between(start, end))
            .order_by(ohlcv_bars.c.date)
        )
        with self._engine.connect() as conn:
            rows = conn.execute(q).all()
        df = pd.DataFrame(rows, columns=["date", *OHLCV_COLUMNS])
        df.index = pd.DatetimeIndex(pd.to_datetime(df.pop("date")), name="date")
        return df.astype("float64")

    def _replace(self, key, df: pd.DataFrame, start: date, end: date) -> None:
        provider, symbol, interval = key
        # NaN の行は保存しない(検証は services 側で行い、警告として表示する)
        clean = df.dropna(subset=["open", "high", "low", "close", "adj_close"])
        records = [
            {
                "provider": provider,
                "symbol": symbol,
                "interval": interval,
                "date": ts.date(),
                **{c: float(row[c]) if pd.notna(row[c]) else 0.0 for c in OHLCV_COLUMNS},
            }
            for ts, row in clean.iterrows()
        ]
        # 1つのトランザクションで「削除 → 挿入 → 取得記録の更新」を行う(途中で失敗したら全部戻る)
        with self._engine.begin() as conn:
            conn.execute(delete(ohlcv_bars).where(self._where(ohlcv_bars, key)))
            if records:
                conn.execute(insert(ohlcv_bars), records)
            conn.execute(delete(ohlcv_coverage).where(self._where(ohlcv_coverage, key)))
            conn.execute(
                insert(ohlcv_coverage).values(
                    provider=provider,
                    symbol=symbol,
                    interval=interval,
                    start=start,
                    end=end,
                    fetched_at=self._now(),
                )
            )
