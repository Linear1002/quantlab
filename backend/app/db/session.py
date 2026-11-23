from sqlalchemy import Engine, create_engine

from app.db.tables import metadata


def make_engine(database_url: str) -> Engine:
    """DB に接続し、テーブルが無ければ作る。(Phase 7 で Alembic のマイグレーションに置き換える)"""
    kwargs = {}
    if database_url.startswith("sqlite"):
        # FastAPI は複数スレッドから DB を使うので、SQLite のスレッド制限を外す
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(database_url, **kwargs)
    metadata.create_all(engine)
    return engine
