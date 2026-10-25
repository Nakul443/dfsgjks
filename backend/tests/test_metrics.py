"""
tests/test_metrics.py

Unit tests for metrics service:
- MAE, RMSE, bias with tiny hand-checked numbers
- MAPE excluding zero actuals
- Percentiles P10, P50, P90
- Empty and all-null inputs handling (returns nulls and 0 count, no crashes)
- Metrics by hour grouping
- Metrics by horizon with bucket edges and exclusion of horizon_hours < 0
- Planning band computation and 0 clamping
"""

from datetime import UTC, datetime

import numpy as np
import pandas as pd
from app.services.metrics import (
    metrics_by_horizon,
    metrics_by_hour,
    overall_metrics,
    planning_band,
)


def test_overall_metrics_hand_checked():
    # 3 rows:
    # errors = [-10, 20, 30]
    # actuals = [100, 200, 300]
    # MAE = (| -10 | + | 20 | + | 30 |) / 3 = 60 / 3 = 20.0
    # RMSE = sqrt((-10^2 + 20^2 + 30^2) / 3) = sqrt((100 + 400 + 900) / 3) = sqrt(1400 / 3) = sqrt(466.6667) = 21.60
    # Bias = (-10 + 20 + 30) / 3 = 40 / 3 = 13.33
    # MAPE = (10/100 + 20/200 + 30/300) / 3 * 100 = (0.10 + 0.10 + 0.10) / 3 * 100 = 10.0%
    series_df = pd.DataFrame(
        {
            "time": pd.date_range("2026-01-01", periods=3, freq="30min", tz="UTC"),
            "forecast": [90.0, 220.0, 330.0],
            "actual": [100.0, 200.0, 300.0],
            "error": [-10.0, 20.0, 30.0],
        }
    )

    metrics = overall_metrics(series_df)
    assert metrics["mae"] == 20.0
    assert metrics["rmse"] == 21.60
    assert metrics["bias"] == 13.33
    assert metrics["mape"] == 10.0
    assert metrics["count"] == 3
    assert metrics["dropped_count"] == 0
    assert metrics["p50"] == 20.0


def test_mape_excludes_zero_actuals():
    # actual has a 0: row 2 has actual=0, error=50
    # valid non-zero rows: actual=100, error=10 -> 10%
    series_df = pd.DataFrame(
        {
            "time": pd.date_range("2026-01-01", periods=2, freq="30min", tz="UTC"),
            "forecast": [110.0, 50.0],
            "actual": [100.0, 0.0],
            "error": [10.0, 50.0],
        }
    )

    metrics = overall_metrics(series_df)
    assert metrics["count"] == 2
    assert metrics["mape"] == 10.0


def test_empty_and_null_input_handling():
    empty_df = pd.DataFrame(columns=["time", "forecast", "actual", "error"])
    metrics = overall_metrics(empty_df)
    assert metrics["count"] == 0
    assert metrics["dropped_count"] == 0
    assert metrics["mae"] is None
    assert metrics["rmse"] is None

    null_df = pd.DataFrame(
        {
            "time": pd.date_range("2026-01-01", periods=2, freq="30min", tz="UTC"),
            "forecast": [np.nan, np.nan],
            "actual": [100.0, np.nan],
            "error": [np.nan, np.nan],
        }
    )
    metrics_null = overall_metrics(null_df)
    assert metrics_null["count"] == 0
    assert metrics_null["dropped_count"] == 2
    assert metrics_null["mae"] is None


def test_metrics_by_hour():
    times = [
        pd.Timestamp("2026-01-01T01:00:00Z"),
        pd.Timestamp("2026-01-01T01:30:00Z"),
        pd.Timestamp("2026-01-01T02:00:00Z"),
    ]
    series_df = pd.DataFrame(
        {
            "time": times,
            "forecast": [110.0, 120.0, 200.0],
            "actual": [100.0, 100.0, 200.0],
            "error": [10.0, 20.0, 0.0],
        }
    )

    by_hour = metrics_by_hour(series_df)
    assert len(by_hour) == 24

    # Hour 1: errors [10, 20] -> MAE=15, bias=15, count=2
    h1 = next(item for item in by_hour if item["hour"] == 1)
    assert h1["mae"] == 15.0
    assert h1["bias"] == 15.0
    assert h1["count"] == 2

    # Hour 2: error [0] -> MAE=0, bias=0, count=1
    h2 = next(item for item in by_hour if item["hour"] == 2)
    assert h2["mae"] == 0.0
    assert h2["bias"] == 0.0
    assert h2["count"] == 1

    # Hour 0: no data -> count=0, mae=None
    h0 = next(item for item in by_hour if item["hour"] == 0)
    assert h0["count"] == 0
    assert h0["mae"] is None


def test_metrics_by_horizon():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 3, 0, 0, tzinfo=UTC)

    actuals = pd.DataFrame(
        {
            "start_time": [
                pd.Timestamp("2026-01-02T12:00:00Z"),
                pd.Timestamp("2026-01-02T12:00:00Z"),
                pd.Timestamp("2026-01-02T12:00:00Z"),
            ],
            "generation": [1000, 1000, 1000],
        }
    ).drop_duplicates(subset=["start_time"])

    forecasts = pd.DataFrame(
        {
            "start_time": [
                pd.Timestamp("2026-01-02T12:00:00Z"),  # horizon = 3h -> bucket "0-6"
                pd.Timestamp("2026-01-02T12:00:00Z"),  # horizon = 20h -> bucket "12-24"
                pd.Timestamp(
                    "2026-01-02T12:00:00Z"
                ),  # horizon = -2h -> EXCLUDE (negative)
            ],
            "publish_time": [
                pd.Timestamp("2026-01-02T09:00:00Z"),
                pd.Timestamp("2026-01-01T16:00:00Z"),
                pd.Timestamp("2026-01-02T14:00:00Z"),
            ],
            "generation": [1050, 900, 1200],
        }
    )

    by_hz = metrics_by_horizon(actuals, forecasts, start, end)
    assert len(by_hz) == 6

    b0_6 = next(b for b in by_hz if b["bucket"] == "0-6")
    assert b0_6["count"] == 1
    assert b0_6["mae"] == 50.0  # 1050 - 1000

    b12_24 = next(b for b in by_hz if b["bucket"] == "12-24")
    assert b12_24["count"] == 1
    assert b12_24["mae"] == 100.0  # | 900 - 1000 |
    assert b12_24["bias"] == -100.0

    # Negative horizon should have been excluded, not placed anywhere
    total_count = sum(b["count"] for b in by_hz)
    assert total_count == 2


def test_planning_band():
    # 5 non-null errors: -40, -20, 0, 20, 40
    # P10 = -32.0, P90 = 32.0
    series_df = pd.DataFrame(
        {
            "time": pd.date_range("2026-01-01", periods=6, freq="30min", tz="UTC"),
            "forecast": [10.0, 50.0, 100.0, 200.0, 250.0, np.nan],
            "actual": [50.0, 70.0, 100.0, 180.0, 210.0, 100.0],
            "error": [-40.0, -20.0, 0.0, 20.0, 40.0, np.nan],
        }
    )

    band_df = planning_band(series_df)
    # band_low = max(0, forecast - P90)
    # For row 0: forecast=10.0, 10.0 - 32.0 = -22.0 -> clamped to 0.0
    assert band_df.iloc[0]["band_low"] == 0.0
    # band_high = forecast - P10 = 10.0 - (-32.0) = 42.0
    assert band_df.iloc[0]["band_high"] == 42.0

    # For row 5 where forecast is NaN, band should be NaN
    assert pd.isna(band_df.iloc[5]["band_low"])
    assert pd.isna(band_df.iloc[5]["band_high"])
