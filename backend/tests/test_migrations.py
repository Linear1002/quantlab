"""DB のマイグレーション(Alembic)のテスト。"""

from datetime import date

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, insert, inspect, select

from app.db.session import make_engine
from app.db.tables import metadata, ohlcv_bars


def test_migrations_match_table_definitions(tmp_path):
    """マイグレーションで作った DB と tables.py の定義に差が無いこと。

    差があると「コードは変えたのにマイグレーションを作り忘れた」状態。
    PostgreSQL に移ったときも、同じマイグレーションで同じ DB が作られる。
    """
    engine = make_engine(f"sqlite:///{tmp_path}/a.db")
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), metadata)
    assert diff == []


def test_legacy_database_is_upgraded_without_losing_data(tmp_path):
    """Phase 3〜6 の DB(Alembic なしで作った)を、データを消さずに最新にできること。"""
    url = f"sqlite:///{tmp_path}/legacy.db"
    legacy = create_engine(url)
    metadata.tables["ohlcv_bars"].create(legacy)
    metadata.tables["ohlcv_coverage"].create(legacy)
    with legacy.begin() as conn:
        conn.execute(
            insert(ohlcv_bars).values(
                provider="yahoo", symbol="7203.T", interval="1d", date=date(2024, 1, 4),
                open=1, high=2, low=0.5, close=1.5, adj_close=1.4, volume=100,
            )
        )  # fmt: skip
    legacy.dispose()

    engine = make_engine(url)
    assert {"backtest_runs", "alembic_version"} <= set(inspect(engine).get_table_names())
    with engine.connect() as conn:
        assert conn.execute(select(ohlcv_bars.c.symbol)).scalar_one() == "7203.T"


def test_make_engine_twice_is_safe(tmp_path):
    url = f"sqlite:///{tmp_path}/b.db"
    make_engine(url).dispose()
    make_engine(url).dispose()  # 2回目は何もしない(エラーにならない)
