"""Alembic の設定。DB の構造(テーブル)の変更は、このフォルダの versions/ に1つずつ記録する。

接続先の決め方:
1. アプリから実行するとき(app/db/session.py):
   接続そのものを config.attributes["connection"] で受け取る
2. コマンドから実行するとき(uv run alembic upgrade head):
   設定(QUANTLAB_DATABASE_URL)を使う
"""

from logging.config import fileConfig

from sqlalchemy import create_engine

from alembic import context
from app.config import get_settings
from app.db.tables import metadata

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = metadata


def run_migrations_offline() -> None:
    """SQL を画面に出すだけのモード(uv run alembic upgrade head --sql)。"""
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    engine = create_engine(get_settings().database_url)
    with engine.connect() as conn:
        _run(conn)


def _run(connection) -> None:
    # render_as_batch: SQLite は列の変更(ALTER)が苦手なので、表を作り直す方式で変更する
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
