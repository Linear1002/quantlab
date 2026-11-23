"""バックテスト結果の保存・一覧・取得・削除。SQL を書くのはこのファイルだけにする。"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import Engine, delete, func, insert, select

from app.db.tables import backtest_runs as t


@dataclass(frozen=True)
class RunSummary:
    """一覧に出す1行分。"""

    id: str
    created_at: datetime
    symbol: str
    symbol_name: str
    strategy_id: str
    strategy_name: str
    start: date
    end: date
    interval: str
    provider: str
    initial_capital: float
    total_return: float
    cagr: float | None
    max_drawdown: float
    sharpe: float | None


SUMMARY_COLUMNS = [t.c[f] for f in RunSummary.__dataclass_fields__]


def save_run(
    engine: Engine, *, summary: dict, result_json: dict, now: datetime | None = None
) -> str:
    """結果を保存して ID を返す。summary には RunSummary の項目(id と created_at 以外)を入れる。"""
    run_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            insert(t).values(
                id=run_id,
                created_at=now or datetime.now(UTC),
                result_json=result_json,
                **summary,
            )
        )
    return run_id


def _to_summary(d: dict) -> RunSummary:
    d = dict(d)
    if d["created_at"].tzinfo is None:  # SQLite は tz を保存しないので UTC として読む
        d["created_at"] = d["created_at"].replace(tzinfo=UTC)
    return RunSummary(**d)


def list_runs(
    engine: Engine, *, limit: int = 50, offset: int = 0, symbol: str | None = None
) -> tuple[list[RunSummary], int]:
    """新しい順に一覧を返す。戻り値は (この範囲の行, 全件数)。"""
    q = select(*SUMMARY_COLUMNS).order_by(t.c.created_at.desc())
    count = select(func.count()).select_from(t)
    if symbol:
        q = q.where(t.c.symbol == symbol)
        count = count.where(t.c.symbol == symbol)
    with engine.connect() as conn:
        rows = conn.execute(q.limit(limit).offset(offset)).all()
        total = conn.execute(count).scalar_one()
    return [_to_summary(r._mapping) for r in rows], total


def get_run(engine: Engine, run_id: str) -> tuple[RunSummary, dict] | None:
    with engine.connect() as conn:
        row = conn.execute(
            select(*SUMMARY_COLUMNS, t.c.result_json).where(t.c.id == run_id)
        ).first()
    if row is None:
        return None
    d = dict(row._mapping)
    result = d.pop("result_json")
    return _to_summary(d), result


def delete_run(engine: Engine, run_id: str) -> bool:
    """削除できたら True、そもそも無ければ False。"""
    with engine.begin() as conn:
        return conn.execute(delete(t).where(t.c.id == run_id)).rowcount > 0
