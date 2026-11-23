"""DB のテーブル定義(SQLAlchemy Core)。

SQLite 固有の型は使わない(将来 PostgreSQL に移行するため)。
日付は Date 型、日時は timezone 付きの DateTime 型(UTC)で保存する。
"""

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    MetaData,
    PrimaryKeyConstraint,
    String,
    Table,
)

metadata = MetaData()

# 取得した株価(1行 = 1銘柄・1時間軸・1日)
ohlcv_bars = Table(
    "ohlcv_bars",
    metadata,
    Column("provider", String(32), nullable=False),
    Column("symbol", String(32), nullable=False),
    Column("interval", String(8), nullable=False),
    Column("date", Date, nullable=False),
    Column("open", Float, nullable=False),
    Column("high", Float, nullable=False),
    Column("low", Float, nullable=False),
    Column("close", Float, nullable=False),
    Column("adj_close", Float, nullable=False),
    Column("volume", Float, nullable=False),
    PrimaryKeyConstraint("provider", "symbol", "interval", "date"),
)

# どの期間をいつ取得したか(キャッシュが使えるかの判定に使う)
ohlcv_coverage = Table(
    "ohlcv_coverage",
    metadata,
    Column("provider", String(32), nullable=False),
    Column("symbol", String(32), nullable=False),
    Column("interval", String(8), nullable=False),
    Column("start", Date, nullable=False),
    Column("end", Date, nullable=False),
    Column("fetched_at", DateTime(timezone=True), nullable=False),
    PrimaryKeyConstraint("provider", "symbol", "interval"),
)
