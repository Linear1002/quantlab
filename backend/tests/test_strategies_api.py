from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.data.base import Interval
from app.data.factory import get_provider
from app.data.fixture import FixtureProvider
from app.main import app
from app.services.signals import warmup_start


@pytest.fixture
def client():
    app.dependency_overrides[get_provider] = lambda: FixtureProvider(today=date(2026, 11, 20))
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_strategies(client):
    body = client.get("/api/strategies").json()
    assert len(body) == 8
    sma = body[0]
    assert sma["id"] == "sma_cross" and sma["risks"] and sma["difficulty"] == 1
    assert [p["name"] for p in sma["params"]] == ["short", "long"]
    assert body[-1]["id"] == "buy_hold" and body[-1]["params"] == []


def signals(client, sid, **kw):
    body = {"symbol": "TEST.T", "start": "2024-01-01", "end": "2024-12-31", **kw}
    return client.post(f"/api/strategies/{sid}/signals", json=body)


def test_signals_alternate_buy_sell(client):
    res = signals(client, "sma_cross", params={"short": 5, "long": 20})
    assert res.status_code == 200
    body = res.json()
    types = [e["type"] for e in body["events"]]
    assert types, "1年分あればクロスは起きるはず"
    assert types[0] == "buy"
    assert all(a != b for a, b in zip(types, types[1:], strict=False))  # 買いと売りが交互
    assert all("2024-01-01" <= e["date"] <= "2024-12-31" for e in body["events"])
    assert body["warmup_bars"] >= 20
    assert body["params"] == {"short": 5, "long": 20}


def test_buy_and_hold_buys_on_first_day(client):
    body = signals(client, "buy_hold").json()
    assert body["events"] == [
        {"date": "2024-01-01", "type": "buy", "close": body["events"][0]["close"]}
    ]
    assert body["holding_at_end"] is True


def test_invalid_params_are_rejected(client):
    res = signals(client, "sma_cross", params={"short": 50, "long": 20})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INVALID_PARAMETER"


def test_unknown_strategy(client):
    assert signals(client, "nope").status_code == 422


def test_short_warmup_adds_warning(client):
    # 合成データは 2000-01-03 から。それより前は取れないので、ウォームアップ不足の警告が出る
    res = signals(client, "sma_cross", start="2000-01-03", end="2000-12-31")
    assert any("シグナルが出ません" in w for w in res.json()["warnings"])


@pytest.mark.parametrize(
    "bars,interval", [(50, Interval.DAILY), (200, Interval.DAILY), (30, Interval.WEEKLY)]
)
def test_warmup_start_gives_enough_bars(bars, interval):
    """見積もった開始日から、必要な本数以上が取れること(合成データの営業日で確認)。"""
    p = FixtureProvider(today=date(2026, 11, 20))
    start = date(2024, 6, 3)
    df = p.get_ohlcv("TEST", warmup_start(start, bars, interval), start, interval)
    assert (df.index < str(start)).sum() >= bars
