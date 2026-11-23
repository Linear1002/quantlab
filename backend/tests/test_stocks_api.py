"""株価 API のテスト。データ元は合成データ(fixture)に差し替える。"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.data.base import RateLimitError
from app.data.factory import get_provider
from app.data.fixture import FixtureProvider
from app.main import app


@pytest.fixture
def client():
    app.dependency_overrides[get_provider] = lambda: FixtureProvider(today=date(2026, 11, 20))
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_search(client):
    res = client.get("/api/stocks/search", params={"q": "test"})
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "fixture"
    assert {r["symbol"] for r in body["results"]} == {"TEST.T", "TEST"}


def test_search_market_filter(client):
    res = client.get("/api/stocks/search", params={"q": "test", "market": "JP"})
    assert [r["symbol"] for r in res.json()["results"]] == ["TEST.T"]


def test_search_empty_query_is_rejected_in_unified_format(client):
    res = client.get("/api/stocks/search", params={"q": ""})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_quote(client):
    body = client.get("/api/stocks/TEST.T/quote").json()
    assert body["as_of"] <= "2026-11-20"
    assert body["price"] > 0 and body["provider"] == "fixture"


def test_history(client):
    res = client.get(
        "/api/stocks/TEST/history", params={"start": "2024-01-01", "end": "2024-01-31"}
    )
    assert res.status_code == 200
    body = res.json()
    dates = [b["date"] for b in body["bars"]]
    assert dates[0] >= "2024-01-01" and dates[-1] <= "2024-01-31"
    assert dates == sorted(dates)
    assert set(body["bars"][0]) == {"date", "open", "high", "low", "close", "adj_close", "volume"}


def test_history_weekly_has_fewer_bars(client):
    p = {"start": "2024-01-01", "end": "2024-06-30"}
    daily = client.get("/api/stocks/TEST/history", params=p).json()["bars"]
    weekly = client.get("/api/stocks/TEST/history", params={**p, "interval": "1wk"}).json()["bars"]
    assert 20 <= len(weekly) <= 30 < len(daily)


@pytest.mark.parametrize(
    "path,params,status,code",
    [
        (
            "/api/stocks/NOPE/history",
            {"start": "2024-01-01", "end": "2024-01-31"},
            404,
            "SYMBOL_NOT_FOUND",
        ),
        (
            "/api/stocks/TEST/history",
            {"start": "2024-02-01", "end": "2024-01-01"},
            400,
            "INVALID_REQUEST",
        ),
        (
            "/api/stocks/TEST/history",
            {"start": "1970-01-01", "end": "1971-01-01"},
            400,
            "INVALID_REQUEST",
        ),
        ("/api/stocks/TEST/history", {"start": "2030-01-01", "end": "2030-02-01"}, 404, "NO_DATA"),
        ("/api/stocks/TEST/history", {"start": "bad", "end": "2024-01-01"}, 422, "INVALID_REQUEST"),
        ("/api/stocks/NOPE/quote", {}, 404, "SYMBOL_NOT_FOUND"),
    ],
)
def test_errors_use_unified_format(client, path, params, status, code):
    res = client.get(path, params=params)
    assert res.status_code == status
    err = res.json()["error"]
    assert err["code"] == code and err["message"]


def test_rate_limit_maps_to_429():
    class Limited(FixtureProvider):
        def search(self, query, market=None):
            raise RateLimitError("Yahoo Finance のアクセス制限に達しました")

    app.dependency_overrides[get_provider] = lambda: Limited()
    try:
        res = TestClient(app).get("/api/stocks/search", params={"q": "x"})
        assert res.status_code == 429 and res.json()["error"]["code"] == "RATE_LIMITED"
    finally:
        app.dependency_overrides.clear()
