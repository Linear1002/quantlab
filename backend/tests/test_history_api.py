"""結果の保存・一覧・再表示・削除の API テスト。DB は conftest.py の一時ファイル。"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.data.factory import get_provider
from app.data.fixture import FixtureProvider
from app.main import app


@pytest.fixture
def client():
    app.dependency_overrides[get_provider] = lambda: FixtureProvider(today=date(2026, 11, 20))
    yield TestClient(app)
    app.dependency_overrides.pop(get_provider, None)


def run(client, **kw):
    body = {
        "symbol": "TEST.T",
        "symbol_name": "テスト銘柄 JP(合成データ)",
        "start": "2023-01-01",
        "end": "2024-12-31",
        "strategy_id": "sma_cross",
        **kw,
    }
    res = client.post("/api/backtests", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_run_is_saved_and_can_be_reopened(client):
    created = run(client)
    assert created["id"] and created["created_at"]
    assert created["strategy_name"] == "SMA Crossover"
    assert created["symbol_name"] == "テスト銘柄 JP(合成データ)"

    again = client.get(f"/api/backtests/{created['id']}").json()
    # 再表示した結果は、実行したときとまったく同じ(再計算していない)
    assert again == created


def test_list_is_newest_first_with_summary(client):
    a = run(client, strategy_id="sma_cross")
    b = run(client, strategy_id="buy_hold")
    body = client.get("/api/backtests").json()
    assert body["total"] == 2
    assert [i["id"] for i in body["items"]] == [b["id"], a["id"]]
    top = body["items"][0]
    assert top["strategy_name"] == "Buy and Hold"
    assert top["total_return"] == pytest.approx(b["metrics"]["total_return"])
    assert top["max_drawdown"] == pytest.approx(b["metrics"]["max_drawdown"])
    assert top["start"] == b["series"][0]["date"] and top["provider"] == "fixture"


def test_list_pagination_and_symbol_filter(client):
    for _ in range(3):
        run(client)
    run(client, symbol="TEST", symbol_name="Test US")
    page = client.get("/api/backtests", params={"limit": 2, "offset": 1}).json()
    assert page["total"] == 4 and len(page["items"]) == 2
    only_us = client.get("/api/backtests", params={"symbol": "TEST"}).json()
    assert only_us["total"] == 1 and only_us["items"][0]["symbol_name"] == "Test US"


def test_delete(client):
    rid = run(client)["id"]
    assert client.delete(f"/api/backtests/{rid}").status_code == 204
    res = client.get(f"/api/backtests/{rid}")
    assert res.status_code == 404 and res.json()["error"]["code"] == "RUN_NOT_FOUND"
    assert client.delete(f"/api/backtests/{rid}").status_code == 404


def test_failed_run_is_not_saved(client):
    res = client.post(
        "/api/backtests",
        json={
            "symbol": "TEST.T",
            "start": "2024-01-01",
            "end": "2024-12-31",
            "strategy_id": "sma_cross",
            "params": {"short": 60},
        },
    )
    assert res.status_code == 422
    assert client.get("/api/backtests").json()["total"] == 0
