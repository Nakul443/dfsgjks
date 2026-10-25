"""
tests/test_decision_time.py

Unit tests for decision_time service covering:
1. Picks the latest forecast at or before cutoff.
2. Forecast published exactly at the cutoff is included.
3. Forecast published after the cutoff is excluded.
4. No forecast before cutoff gives null forecast (not 0).
5. Missing actual gives null error.
6. Different cutoff times change the chosen forecast.
7. Horizon is computed correctly.
8. forward_fill_hourly_forecasts carries :00 to :30 with same publish_time and generation.
"""

from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest
from app.services.decision_time import (
    build_series,
    forward_fill_hourly_forecasts,
    parse_cutoff_time,
)


def test_parse_cutoff_time():
    t = parse_cutoff_time("09:00")
    assert t.hour == 9 and t.minute == 0
    t2 = parse_cutoff_time("17:30")
    assert t2.hour == 17 and t2.minute == 30

    with pytest.raises(ValueError):
        parse_cutoff_time("invalid")
    with pytest.raises(ValueError):
        parse_cutoff_time("25:00")
    with pytest.raises(ValueError):
        parse_cutoff_time("09:65")


def test_forward_fill_hourly_forecasts():
    t0 = pd.Timestamp("2026-01-02T10:00:00Z")
    t1 = pd.Timestamp("2026-01-02T10:30:00Z")
    pub = pd.Timestamp("2026-01-01T08:00:00Z")

    hourly_df = pd.DataFrame(
        {
            "time": [t0, t1],
            "forecast": [1500.0, np.nan],
            "publish_time": [pub, pd.NaT],
        }
    )

    filled = forward_fill_hourly_forecasts(hourly_df)
    assert len(filled) == 2
    row_10 = filled[filled["time"] == t0].iloc[0]
    row_1030 = filled[filled["time"] == t1].iloc[0]

    assert row_10["forecast"] == 1500.0
    assert row_10["publish_time"] == pub

    assert row_1030["forecast"] == 1500.0
    assert row_1030["publish_time"] == pub


def test_picks_latest_at_or_before_cutoff():
    # Delivery day: 2026-01-02. Cutoff at 09:00 on 2026-01-01
    start = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 2, 1, 0, tzinfo=UTC)  # 2 slots: 00:00 and 00:30

    # Forecasts for 2026-01-02 00:00:00
    forecasts = pd.DataFrame(
        {
            "start_time": [
                pd.Timestamp("2026-01-02T00:00:00Z"),
                pd.Timestamp("2026-01-02T00:00:00Z"),
            ],
            "publish_time": [
                pd.Timestamp("2026-01-01T04:00:00Z"),  # earlier
                pd.Timestamp("2026-01-01T08:30:00Z"),  # later, before cutoff
            ],
            "generation": [1000, 1200],
        }
    )

    actuals = pd.DataFrame(
        {
            "start_time": [
                pd.Timestamp("2026-01-02T00:00:00Z"),
                pd.Timestamp("2026-01-02T00:30:00Z"),
            ],
            "generation": [1150, 1160],
        }
    )

    series = build_series(actuals, forecasts, start, end, cutoff="09:00")
    assert len(series) == 2

    row0 = series.iloc[0]
    assert row0["forecast"] == 1200.0
    assert row0["publish_time"] == pd.Timestamp("2026-01-01T08:30:00Z")
    assert row0["actual"] == 1150.0
    assert row0["error"] == 50.0  # 1200 - 1150


def test_forecast_published_exactly_at_cutoff_included():
    start = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 2, 0, 30, tzinfo=UTC)

    # Cutoff is 2026-01-01 09:00:00Z
    forecasts = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T00:00:00Z")],
            "publish_time": [pd.Timestamp("2026-01-01T09:00:00Z")],
            "generation": [2000],
        }
    )
    actuals = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T00:00:00Z")],
            "generation": [1900],
        }
    )

    series = build_series(actuals, forecasts, start, end, cutoff="09:00")
    assert series.iloc[0]["forecast"] == 2000.0
    assert series.iloc[0]["error"] == 100.0


def test_forecast_published_after_cutoff_excluded():
    start = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 2, 0, 30, tzinfo=UTC)

    # Forecast published at 09:01:00Z, after 09:00 cutoff
    forecasts = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T00:00:00Z")],
            "publish_time": [pd.Timestamp("2026-01-01T09:01:00Z")],
            "generation": [2000],
        }
    )
    actuals = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T00:00:00Z")],
            "generation": [1900],
        }
    )

    series = build_series(actuals, forecasts, start, end, cutoff="09:00")
    assert pd.isna(series.iloc[0]["forecast"])
    assert pd.isna(series.iloc[0]["error"])


def test_no_forecast_before_cutoff_gives_null():
    start = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 2, 0, 30, tzinfo=UTC)

    forecasts = pd.DataFrame(columns=["start_time", "publish_time", "generation"])
    actuals = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T00:00:00Z")],
            "generation": [1900],
        }
    )

    series = build_series(actuals, forecasts, start, end, cutoff="09:00")
    assert pd.isna(series.iloc[0]["forecast"])
    assert series.iloc[0]["actual"] == 1900.0
    assert pd.isna(series.iloc[0]["error"])


def test_missing_actual_gives_null_error():
    start = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 2, 0, 30, tzinfo=UTC)

    forecasts = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T00:00:00Z")],
            "publish_time": [pd.Timestamp("2026-01-01T08:00:00Z")],
            "generation": [2000],
        }
    )
    actuals = pd.DataFrame(columns=["start_time", "generation"])

    series = build_series(actuals, forecasts, start, end, cutoff="09:00")
    assert series.iloc[0]["forecast"] == 2000.0
    assert pd.isna(series.iloc[0]["actual"])
    assert pd.isna(series.iloc[0]["error"])


def test_different_cutoff_times_change_forecast():
    start = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 2, 0, 30, tzinfo=UTC)

    forecasts = pd.DataFrame(
        {
            "start_time": [
                pd.Timestamp("2026-01-02T00:00:00Z"),
                pd.Timestamp("2026-01-02T00:00:00Z"),
            ],
            "publish_time": [
                pd.Timestamp("2026-01-01T08:00:00Z"),
                pd.Timestamp("2026-01-01T12:00:00Z"),
            ],
            "generation": [1000, 1500],
        }
    )
    actuals = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T00:00:00Z")],
            "generation": [1100],
        }
    )

    series_0900 = build_series(actuals, forecasts, start, end, cutoff="09:00")
    series_1400 = build_series(actuals, forecasts, start, end, cutoff="14:00")

    assert series_0900.iloc[0]["forecast"] == 1000.0
    assert series_1400.iloc[0]["forecast"] == 1500.0


def test_horizon_computed_correctly():
    start = datetime(2026, 1, 2, 10, 0, tzinfo=UTC)
    end = datetime(2026, 1, 2, 11, 0, tzinfo=UTC)  # 10:00 and 10:30

    # Publish time is 2026-01-01 06:00:00Z
    # Horizon for 10:00 is (2026-01-02 10:00 - 2026-01-01 06:00) = 28.0 hours
    # Horizon for 10:30 is (2026-01-02 10:30 - 2026-01-01 06:00) = 28.5 hours
    forecasts = pd.DataFrame(
        {
            "start_time": [pd.Timestamp("2026-01-02T10:00:00Z")],
            "publish_time": [pd.Timestamp("2026-01-01T06:00:00Z")],
            "generation": [2500],
        }
    )
    actuals = pd.DataFrame(
        {
            "start_time": [
                pd.Timestamp("2026-01-02T10:00:00Z"),
                pd.Timestamp("2026-01-02T10:30:00Z"),
            ],
            "generation": [2400, 2450],
        }
    )

    series = build_series(actuals, forecasts, start, end, cutoff="09:00")
    assert series.iloc[0]["horizon_hours"] == 28.0
    assert series.iloc[1]["horizon_hours"] == 28.5
    assert series.iloc[0]["forecast"] == 2500.0
    assert series.iloc[1]["forecast"] == 2500.0
