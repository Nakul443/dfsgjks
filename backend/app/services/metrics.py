"""
app/services/metrics.py

Metrics calculation service.
Computes:
  - Overall metrics: MAE, RMSE, bias, MAPE (excluding zero actuals), error percentiles (P10, P50, P90),
    count of rows used, and count of rows dropped for missing data.
  - Metrics by hour of day: grouped by UTC hour of time.
  - Metrics by horizon: joins actuals and all forecasts, excludes horizon_hours < 0,
    buckets horizon_hours into [0-6, 6-12, 12-24, 24-36, 36-48, 48+].
  - Planning band: per slot, band_low = forecast - P90(error) (clamped at 0) and
    band_high = forecast - P10(error), where percentiles are taken from the valid error series.
"""

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

HORIZON_BUCKET_EDGES = [0.0, 6.0, 12.0, 24.0, 36.0, 48.0, float("inf")]
HORIZON_BUCKET_LABELS = ["0-6", "6-12", "12-24", "24-36", "36-48", "48+"]


def compute_error_stats(
    error_series: pd.Series, actual_series: pd.Series | None = None
) -> dict[str, Any]:
    """Helper to compute MAE, RMSE, bias, MAPE, and percentiles on non-null error series."""
    valid_errors = error_series.dropna()
    count = len(valid_errors)

    if count == 0:
        return {
            "mae": None,
            "rmse": None,
            "bias": None,
            "mape": None,
            "p10": None,
            "p50": None,
            "p90": None,
            "count": 0,
        }

    mae = float(valid_errors.abs().mean())
    rmse = float(np.sqrt((valid_errors**2).mean()))
    bias = float(valid_errors.mean())
    p10 = float(np.percentile(valid_errors, 10))
    p50 = float(np.percentile(valid_errors, 50))
    p90 = float(np.percentile(valid_errors, 90))

    mape = None
    if actual_series is not None:
        # Align actual_series with valid_errors and exclude actual == 0
        valid_indices = valid_errors.index
        sub_actual = actual_series.loc[valid_indices]
        non_zero_mask = sub_actual != 0.0
        if non_zero_mask.any():
            mape_vals = (
                valid_errors[non_zero_mask].abs() / sub_actual[non_zero_mask].abs()
            ) * 100.0
            mape = float(mape_vals.mean())

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "bias": round(bias, 2),
        "mape": round(mape, 2) if mape is not None else None,
        "p10": round(p10, 2),
        "p50": round(p50, 2),
        "p90": round(p90, 2),
        "count": count,
    }


def overall_metrics(series_df: pd.DataFrame) -> dict[str, Any]:
    """
    Computes overall summary metrics for the given aligned series DataFrame.
    Returns:
      mae, rmse, bias, mape, p10, p50, p90, count, dropped_count
    """
    total_rows = len(series_df)
    if total_rows == 0:
        return {
            "mae": None,
            "rmse": None,
            "bias": None,
            "mape": None,
            "p10": None,
            "p50": None,
            "p90": None,
            "count": 0,
            "dropped_count": 0,
        }

    stats = compute_error_stats(series_df["error"], series_df["actual"])
    stats["dropped_count"] = total_rows - stats["count"]
    return stats


def metrics_by_hour(series_df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Computes metrics grouped by UTC hour of day (0 to 23).
    Returns list of dicts: [ { "hour": h, "mae": ..., "bias": ..., "count": ... } ]
    """
    if series_df.empty:
        return [{"hour": h, "mae": None, "bias": None, "count": 0} for h in range(24)]

    df = series_df.copy()
    df["hour"] = df["time"].dt.hour

    results = []
    for h in range(24):
        hour_df = df[df["hour"] == h]
        valid_errors = hour_df["error"].dropna()
        count = len(valid_errors)
        if count == 0:
            results.append({"hour": h, "mae": None, "bias": None, "count": 0})
        else:
            results.append(
                {
                    "hour": h,
                    "mae": round(float(valid_errors.abs().mean()), 2),
                    "bias": round(float(valid_errors.mean()), 2),
                    "count": count,
                }
            )

    return results


def metrics_by_horizon(
    actuals: pd.DataFrame,
    forecasts: pd.DataFrame,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    """
    Computes metrics across all forecasts joined to actuals, grouped by horizon bucket.
    Excludes rows where horizon_hours < 0.
    Buckets: 0-6, 6-12, 12-24, 24-36, 36-48, 48+.
    Returns list of dicts: [ { "bucket": "0-6", "mae": ..., "bias": ..., "count": ... }, ... ]
    """
    # Subsets in [start, end)
    a_sub = actuals[(actuals["start_time"] >= start) & (actuals["start_time"] < end)][
        ["start_time", "generation"]
    ].copy()
    a_sub = a_sub.rename(columns={"start_time": "time", "generation": "actual"})

    f_sub = forecasts[
        (forecasts["start_time"] >= start) & (forecasts["start_time"] < end)
    ][["start_time", "publish_time", "generation"]].copy()
    f_sub = f_sub.rename(columns={"start_time": "time", "generation": "forecast"})

    if a_sub.empty or f_sub.empty:
        return [
            {"bucket": b, "mae": None, "bias": None, "count": 0}
            for b in HORIZON_BUCKET_LABELS
        ]

    # Inner join on delivery slot time
    merged = f_sub.merge(a_sub, on="time", how="inner")
    if merged.empty:
        return [
            {"bucket": b, "mae": None, "bias": None, "count": 0}
            for b in HORIZON_BUCKET_LABELS
        ]

    merged["horizon_hours"] = (
        merged["time"] - merged["publish_time"]
    ).dt.total_seconds() / 3600.0

    # Rule: exclude horizon_hours < 0
    valid_pairs = merged[
        (merged["horizon_hours"] >= 0.0)
        & merged["forecast"].notna()
        & merged["actual"].notna()
    ].copy()

    if valid_pairs.empty:
        return [
            {"bucket": b, "mae": None, "bias": None, "count": 0}
            for b in HORIZON_BUCKET_LABELS
        ]

    valid_pairs["error"] = valid_pairs["forecast"] - valid_pairs["actual"]

    # pd.cut: right=False means [0, 6), [6, 12), ...
    valid_pairs["bucket"] = pd.cut(
        valid_pairs["horizon_hours"],
        bins=HORIZON_BUCKET_EDGES,
        labels=HORIZON_BUCKET_LABELS,
        right=False,
    )

    results = []
    for bucket in HORIZON_BUCKET_LABELS:
        bucket_data = valid_pairs[valid_pairs["bucket"] == bucket]
        errs = bucket_data["error"]
        count = len(errs)
        if count == 0:
            results.append({"bucket": bucket, "mae": None, "bias": None, "count": 0})
        else:
            results.append(
                {
                    "bucket": bucket,
                    "mae": round(float(errs.abs().mean()), 2),
                    "bias": round(float(errs.mean()), 2),
                    "count": count,
                }
            )

    return results


def planning_band(
    series_df: pd.DataFrame,
    reference_errors: pd.Series | None = None,
) -> pd.DataFrame:
    """
    Computes per-slot planning band:
      band_low = max(0.0, forecast - P90(error))
      band_high = forecast - P10(error)
    Where P10 and P90 of error are computed from reference_errors if provided,
    or fallback to non-null error rows of series_df.
    Percentiles come from a fixed reference: the whole January 2026 decision-time error
    series for the same cutoff, so the band does not leak the selected day's actuals or change with zoom.
    If no valid error rows exist, band_low and band_high are null.
    Returns copy of series_df with band_low and band_high added.
    """
    df = series_df.copy()
    err_source = reference_errors if reference_errors is not None else df["error"]
    valid_errors = err_source.dropna()

    if len(valid_errors) == 0:
        df["band_low"] = np.nan
        df["band_high"] = np.nan
        return df

    p10 = float(np.percentile(valid_errors, 10))
    p90 = float(np.percentile(valid_errors, 90))

    df["band_low"] = np.where(
        df["forecast"].notna(),
        np.maximum(0.0, df["forecast"] - p90),
        np.nan,
    )
    df["band_high"] = np.where(
        df["forecast"].notna(),
        df["forecast"] - p10,
        np.nan,
    )

    return df
