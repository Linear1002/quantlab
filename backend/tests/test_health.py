from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok():
    res = TestClient(app).get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["data_provider"] == "yahoo"
