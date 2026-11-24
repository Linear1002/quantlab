"""DB への接続と、テーブルの作成・更新(マイグレーション)。"""

from __future__ import annotations

import threading
from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect

from alembic import command
from app.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parents[2]

# マイグレーションは同時に1つだけ実行する。
# Alembic は同時実行を想定しておらず、複数のリクエストが同時に DB を準備すると、
# 中身が空の alembic_version だけが残って、以後ずっと失敗する状態になる(実際に起きた)。
_migrate_lock = threading.Lock()


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False  # アプリのログ設定を上書きしない
    return cfg


def migrate(engine: Engine) -> None:
    """DB を最新の構造にする(alembic upgrade head と同じ)。

    Phase 3〜6 では Alembic を使わずにテーブルを作っていた。その DB には
    「どこまで適用したか」の記録が無いので、0001 は適用済みとして記録してから進める。
    判定は「記録テーブルがあるか」ではなく「記録(リビジョン)が入っているか」で行う。
    空の記録テーブルだけが残った DB(同時実行で壊れたもの)もこれで直る。
    """
    with _migrate_lock:
        cfg = _alembic_config()
        with engine.begin() as conn:
            current = MigrationContext.configure(conn).get_current_revision()
            legacy = "ohlcv_bars" in inspect(conn).get_table_names()
            if current is None and legacy:
                cfg.attributes["connection"] = conn
                command.stamp(cfg, "0001")
        # stamp を確定(コミット)させてから、残りを適用する
        with engine.begin() as conn:
            cfg.attributes["connection"] = conn
            command.upgrade(cfg, "head")


def make_engine(database_url: str) -> Engine:
    kwargs = {}
    if database_url.startswith("sqlite"):
        # FastAPI は複数スレッドから DB を使うので、SQLite のスレッド制限を外す
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(database_url, **kwargs)
    migrate(engine)
    return engine


_engine: Engine | None = None
_engine_lock = threading.Lock()


def get_engine() -> Engine:
    """アプリ全体で1つだけ使う DB 接続(FastAPI の Depends でも使う)。

    最初の1回だけ接続とマイグレーションを行う。同時に呼ばれても1回だけになるようロックする
    (lru_cache は同時に呼ばれると関数を複数回実行してしまう)。
    """
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = make_engine(get_settings().database_url)
    return _engine
