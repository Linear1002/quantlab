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
    app.dependency_overrides.clear()


def run(client, **kw):
    body = {
        "symbol": "TEST.T",
        "start": "2022-01-01",
        "end": "2024-12-31",
        "strategy_id": "sma_cross",
        **kw,
    }
    return client.post("/api/backtests", json=body)


def test_backtest_runs_and_is_consistent(client):
    res = run(client, params={"short": 10, "long": 40})
    assert res.status_code == 200, res.text
    b = res.json()
    series = b["series"]
    assert series[0]["date"] >= "2022-01-01" and series[-1]["date"] <= "2024-12-31"
    assert series[0]["equity"] == b["config"]["initial_capital"] == 1_000_000
    assert b["config"]["lot_size"] == 100  # 日本株は単元 100 株が既定
    # 指標と系列が一致している
    assert b["metrics"]["total_return"] == pytest.approx(series[-1]["equity"] / 1_000_000 - 1)
    assert b["benchmark_metrics"]["total_return"] == pytest.approx(
        series[-1]["benchmark"] / 1_000_000 - 1
    )
    assert b["metrics"]["max_drawdown"] == pytest.approx(min(p["drawdown"] for p in series))
    # 最終資産 = 初期資金 + 損益の合計
    assert series[-1]["equity"] == pytest.approx(1_000_000 + sum(t["pnl"] for t in b["trades"]))
    assert b["trades"] and all(t["qty"] % 100 == 0 for t in b["trades"])
    assert b["monthly_returns"][0]["period"] == "2022-01"
    assert [y["period"] for y in b["yearly_returns"]] == ["2022", "2023", "2024"]


def test_buy_and_hold_strategy_equals_benchmark(client):
    """戦略として Buy and Hold を選んだら、比較用のベンチマークとまったく同じになるはず。"""
    b = run(client, strategy_id="buy_hold").json()
    assert all(p["equity"] == p["benchmark"] for p in b["series"])
    assert b["metrics"] == b["benchmark_metrics"]


def test_costs_reduce_returns(client):
    free = run(client, config={"commission_rate": 0, "slippage_bps": 0}).json()
    costly = run(client, config={"commission_rate": 0.003, "slippage_bps": 30}).json()
    assert free["metrics"]["closed_trades"] == costly["metrics"]["closed_trades"] > 0
    assert costly["metrics"]["total_return"] < free["metrics"]["total_return"]


def test_small_capital_warns(client):
    b = run(client, config={"initial_capital": 1000}).json()  # 1単元(100株 × 約1000円)に足りない
    assert b["trades"] == []
    assert b["metrics"]["win_rate"] is None
    assert any("Buy and Hold でも買えません" in w for w in b["warnings"])


@pytest.mark.parametrize(
    "kw,code",
    [
        ({"config": {"slippage_bps": -1}}, "INVALID_PARAMETER"),
        ({"config": {"sizing_value": 2}}, "INVALID_PARAMETER"),
        ({"params": {"short": 60, "long": 20}}, "INVALID_PARAMETER"),
        ({"strategy_id": "nope"}, "INVALID_PARAMETER"),
        ({"start": "2024-06-01", "end": "2024-01-01"}, "INVALID_REQUEST"),
        ({"risk_free_rate": 1.0}, "INVALID_REQUEST"),
    ],
)
def test_invalid_requests(client, kw, code):
    res = run(client, **kw)
    assert res.status_code in (400, 422)
    assert res.json()["error"]["code"] == code


def test_single_bar_period_is_insufficient(client):
    res = run(client, start="2024-01-02", end="2024-01-02")
    assert res.status_code == 422 and res.json()["error"]["code"] == "INSUFFICIENT_DATA"
