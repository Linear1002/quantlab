"""設定画面で使う、データの状態確認とキャッシュの削除。"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Engine, delete, func, select

from app.config import get_settings
from app.data.jp_master import DEFAULT_PATH, JpMaster
from app.db.session import get_engine
from app.db.tables import backtest_runs, ohlcv_bars, ohlcv_coverage
from quant import ENGINE_VERSION

router = APIRouter(prefix="/api/system", tags=["system"])
Db = Annotated[Engine, Depends(get_engine)]


class StatusOut(BaseModel):
    data_provider: str
    engine_version: str
    database: str  # "sqlite" / "postgresql" など(接続先の詳細は出さない)
    jp_master_count: int | None  # 日本語検索の銘柄数。CSV が無ければ None
    jp_master_updated_at: datetime | None
    cache_symbols: int
    cache_bars: int
    saved_runs: int


@router.get("/status", response_model=StatusOut)
def status(db: Db):
    s = get_settings()
    jp = JpMaster.load()
    updated = (
        datetime.fromtimestamp(DEFAULT_PATH.stat().st_mtime, tz=UTC)
        if DEFAULT_PATH.exists()
        else None
    )
    with db.connect() as conn:
        symbols = conn.execute(select(func.count()).select_from(ohlcv_coverage)).scalar_one()
        bars = conn.execute(select(func.count()).select_from(ohlcv_bars)).scalar_one()
        runs = conn.execute(select(func.count()).select_from(backtest_runs)).scalar_one()
    return StatusOut(
        data_provider=s.data_provider,
        engine_version=ENGINE_VERSION,
        database=db.dialect.name,
        jp_master_count=len(jp) if jp else None,
        jp_master_updated_at=updated,
        cache_symbols=symbols,
        cache_bars=bars,
        saved_runs=runs,
    )


class ClearOut(BaseModel):
    deleted_bars: int


@router.delete("/cache", response_model=ClearOut)
def clear_cache(db: Db):
    """株価のキャッシュを全部消す(次に開いたときに取り直す)。保存した結果は消さない。"""
    with db.begin() as conn:
        n = conn.execute(delete(ohlcv_bars)).rowcount
        conn.execute(delete(ohlcv_coverage))
    return ClearOut(deleted_bars=n)
