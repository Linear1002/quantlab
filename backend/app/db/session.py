"""DB への接続と、テーブルの作成・更新(マイグレーション)。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect

from alembic import command
from app.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False  # アプリのログ設定を上書きしない
    return cfg


def migrate(engine: Engine) -> None:
    """DB を最新の構造にする(alembic upgrade head と同じ)。

    Phase 3〜6 では Alembic を使わずにテーブルを作っていた。その DB には
    「どこまで適用したか」の記録(alembic_version)が無いので、
    0001 は適用済みとして記録してから進める。
    """
    tables = set(inspect(engine).get_table_names())
    cfg = _alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        if "ohlcv_bars" in tables and "alembic_version" not in tables:
            command.stamp(cfg, "0001")
        command.upgrade(cfg, "head")


def make_engine(database_url: str) -> Engine:
    kwargs = {}
    if database_url.startswith("sqlite"):
        # FastAPI は複数スレッドから DB を使うので、SQLite のスレッド制限を外す
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(database_url, **kwargs)
    migrate(engine)
    return engine


@lru_cache
def get_engine() -> Engine:
    """アプリ全体で1つだけ使う DB 接続(FastAPI の Depends でも使う)。"""
    return make_engine(get_settings().database_url)
