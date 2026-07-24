from fastapi.testclient import TestClient

from api.index import app


client = TestClient(app)


def test_health_and_valid_sample_backtest() -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["dataMode"] == "sample"

    response = client.post(
        "/api/backtest/run",
        json={
            "ticker": "AAPL",
            "dataset": "synthetic",
            "start_date": "2020-01-01",
            "end_date": "2022-01-01",
            "strategy": "sma-crossover",
            "initial_capital": 100000,
            "commission": 0.001,
            "slippage": 0.0005,
            "benchmark": "buy-and-hold",
            "fractional": True,
            "fast_window": 20,
            "slow_window": 50,
            "rsi_period": 14,
            "rsi_entry": 30,
            "rsi_exit": 70,
            "position_size": 1,
            "maximum_exposure": 1,
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["meta"]["dataMode"] == "sample"
    assert body["data"]["series"]
    assert body["data"]["metrics"]["total_return"] is not None


def test_unknown_fields_and_excessive_range_are_rejected() -> None:
    unknown = client.post("/api/backtest/run", json={"unexpected": "value"})
    assert unknown.status_code == 422
    assert unknown.json()["error"]["code"] == "INVALID_INPUT"

    excessive = client.post(
        "/api/backtest/run",
        json={"start_date": "2000-01-01", "end_date": "2025-01-01"},
    )
    assert excessive.status_code == 422


def test_csv_upload_validation() -> None:
    valid = client.post(
        "/api/backtest/upload",
        content=(
            "date,open,high,low,close,volume\n"
            "2024-01-02,100,102,99,101,1000\n"
            "2024-01-03,101,103,100,102,1200\n"
        ),
        headers={"content-type": "text/csv"},
    )
    assert valid.status_code == 200
    assert valid.json()["data"]["rows"] == 2

    missing = client.post(
        "/api/backtest/upload",
        content="date,close\n2024-01-02,101\n",
        headers={"content-type": "text/csv"},
    )
    assert missing.status_code == 422
    assert "Missing required columns" in missing.json()["error"]["message"]

    duplicate = client.post(
        "/api/backtest/upload",
        content=(
            "date,open,high,low,close,volume\n"
            "2024-01-02,100,102,99,101,1000\n"
            "2024-01-02,101,103,100,102,1200\n"
        ),
        headers={"content-type": "text/csv"},
    )
    assert duplicate.status_code == 422
    assert "Duplicate dates" in duplicate.json()["error"]["message"]
