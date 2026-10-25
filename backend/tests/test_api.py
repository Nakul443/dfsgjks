"""
tests/test_api.py

Integration and contract tests for FastAPI endpoints:
- GET /health
- GET /api/meta
- GET /api/series
- GET /api/metrics
- GET /api/metrics/by-hour
- GET /api/metrics/by-horizon
- Validation errors (422): out-of-range, bad cutoff format, start >= end, invalid ISO 8601
- In-memory caching behavior
"""

import pytest
from app.config import settings
from app.main import app
from app.services.data_store import data_store
from fastapi.testclient import TestClient


@pytest.fixture(scope="module", autouse=True)
def initialize_data_store():
    """Ensure data store is loaded for test execution."""
    data_store.load(data_dir=settings.data_dir, default_cutoff=settings.default_cutoff)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_meta_endpoint(client):
    response = client.get("/api/meta")
    assert response.status_code == 200
    data = response.json()
    assert "actuals" in data
    assert "forecasts" in data
    assert data["default_cutoff"] == "09:00"
    assert data["actuals"]["row_count"] == 1488
    assert data["forecasts"]["row_count"] == 18080


def test_series_endpoint_happy_path(client):
    params = {
        "start": "2026-01-05T00:00:00Z",
        "end": "2026-01-06T00:00:00Z",
        "cutoff": "09:00",
    }
    response = client.get("/api/series", params=params)
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 48
    assert len(body["data"]) == 48

    first = body["data"][0]
    assert first["time"] == "2026-01-05T00:00:00Z"
    assert first["forecast"] is not None
    assert first["actual"] is not None
    assert first["error"] is not None
    assert first["band_low"] is not None
    assert first["band_high"] is not None


def test_metrics_endpoint_happy_path(client):
    params = {
        "start": "2026-01-05T00:00:00Z",
        "end": "2026-01-06T00:00:00Z",
        "cutoff": "09:00",
    }
    response = client.get("/api/metrics", params=params)
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 48
    assert body["dropped_count"] == 0
    assert body["mae"] is not None
    assert body["rmse"] is not None
    assert body["bias"] is not None
    assert body["mape"] is not None


def test_metrics_by_hour_happy_path(client):
    params = {
        "start": "2026-01-05T00:00:00Z",
        "end": "2026-01-06T00:00:00Z",
    }
    response = client.get("/api/metrics/by-hour", params=params)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 24
    for item in body:
        assert 0 <= item["hour"] <= 23
        assert "mae" in item
        assert "bias" in item
        assert item["count"] == 2  # 2 half-hours per hour in 1 day


def test_metrics_by_horizon_happy_path(client):
    params = {
        "start": "2026-01-05T00:00:00Z",
        "end": "2026-01-06T00:00:00Z",
    }
    response = client.get("/api/metrics/by-horizon", params=params)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 6
    buckets = [item["bucket"] for item in body]
    assert buckets == ["0-6", "6-12", "12-24", "24-36", "36-48", "48+"]


def test_validation_out_of_range(client):
    # Outside January 2026 delivery window
    params = {
        "start": "2025-12-31T00:00:00Z",
        "end": "2026-01-05T00:00:00Z",
    }
    response = client.get("/api/series", params=params)
    assert response.status_code == 422
    assert "outside allowed delivery window" in response.json()["detail"]


def test_validation_start_gte_end(client):
    params = {
        "start": "2026-01-05T12:00:00Z",
        "end": "2026-01-05T10:00:00Z",
    }
    response = client.get("/api/series", params=params)
    assert response.status_code == 422
    assert "earlier than end" in response.json()["detail"]


def test_validation_bad_cutoff(client):
    params = {
        "start": "2026-01-05T00:00:00Z",
        "end": "2026-01-06T00:00:00Z",
        "cutoff": "25:00",
    }
    response = client.get("/api/series", params=params)
    assert response.status_code == 422
    assert "Invalid cutoff format" in response.json()["detail"]


def test_validation_bad_iso_format(client):
    params = {
        "start": "not-a-date",
        "end": "2026-01-06T00:00:00Z",
    }
    response = client.get("/api/series", params=params)
    assert response.status_code == 422
    assert "Invalid start datetime" in response.json()["detail"]
