from datetime import date

from fastapi.testclient import TestClient

from app.data.base import Interval
from app.data.cache import CachedProvider
from app.data.fixture import FixtureProvider
from app.main import app


def test_status_and_clear_cache(isolated_db):
    client = TestClient(app)
    s = client.get("/api/system/status").json()
    assert s["database"] == "sqlite" and s["cache_bars"] == 0 and s["saved_runs"] == 0

    # キャッシュに1銘柄分ためる
    cached = CachedProvider(FixtureProvider(today=date(2026, 11, 20)), isolated_db)
    cached.get_ohlcv("TEST", date(2024, 1, 1), date(2024, 1, 31), Interval.DAILY)
    s = client.get("/api/system/status").json()
    assert s["cache_symbols"] == 1 and s["cache_bars"] > 0

    cleared = client.delete("/api/system/cache").json()
    assert cleared["deleted_bars"] == s["cache_bars"]
    assert client.get("/api/system/status").json()["cache_bars"] == 0
