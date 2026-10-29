"""
app/services/decision_time.py

Decision-time forecast service.
For each 30-min delivery slot with startTime = t on delivery day D:
  1. cutoff = (D - 1 day) at CUTOFF_TIME (UTC, default 09:00, configurable as HH:MM).
  2. Among WINDFOR rows with that startTime, keep those with publishTime <= cutoff.
  3. Choose the row with the latest publishTime.
  4. If none exists, forecast is null.
  5. Carry each hourly forecast forward to its :30 slot (forward-fill max 30 min, same publish_time).
  6. Compute horizon_hours = (time - publish_time).total_seconds() / 3600.0.
  7. Join with FUELHH actuals on slot time: error = forecast - actual (null if either is null).
"""

# this file is responsible for constructing the decision-time forecast series for each 30-minute delivery slot.
# It implements the logic to select the latest forecast published before a configurable cutoff time,
# forward-fills hourly forecasts to their subsequent :30 slots, computes the forecast horizon,
# and merges the forecasts with actual generation data to calculate forecast errors.

# in simple words, this service takes the raw forecast and actual generation data,
# applies the business rules for decision-time forecasting,
# and produces a clean time series that can be used for analysis or visualization.

from datetime import datetime, time

import numpy as np
import pandas as pd


def parse_cutoff_time(cutoff_str: str) -> time:
    """Parse HH:MM string to datetime.time."""
    parts = cutoff_str.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid cutoff format: '{cutoff_str}', expected 'HH:MM'")
    hour, minute = int(parts[0]), int(parts[1])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"Invalid cutoff time: '{cutoff_str}'")
    return time(hour=hour, minute=minute)


def forward_fill_hourly_forecasts(hourly_df: pd.DataFrame) -> pd.DataFrame:
    """
    Carries hourly forecasts forward to their subsequent :30 slot.

    Elexon WINDFOR forecasts are published only for hourly boundaries (:00).
    In the UK power market, half-hourly settlement periods share the hourly forecast.
    This function duplicates each hourly forecast to (time + 30 minutes) with the
    same publish_time and generation values, provided the source slot was on an hour (:00).

    Args:
        hourly_df: DataFrame with columns ['time', 'forecast', 'publish_time'].
                   May contain NaN forecasts.

    Returns:
        DataFrame with both :00 and :30 slots populated.
    """
    if hourly_df.empty:
        return hourly_df.copy()

    df = hourly_df.copy()
    # Filter only hourly slots (:00) that have non-null forecast
    hourly_slots = df[(df["time"].dt.minute == 0) & (df["forecast"].notna())].copy()

    if hourly_slots.empty:
        return df

    # Shift time by +30 minutes
    half_hour_slots = hourly_slots.copy()
    half_hour_slots["time"] = half_hour_slots["time"] + pd.Timedelta(minutes=30)

    # Combine original and shifted slots, keeping the shifted slots where original had NaN at :30
    combined = pd.concat([df, half_hour_slots], ignore_index=True)
    # Sort so that non-null forecasts come first for identical times if duplicate
    combined = combined.sort_values(
        by=["time", "forecast"], na_position="last"
    ).drop_duplicates(subset=["time"], keep="first")
    return combined.sort_values("time").reset_index(drop=True)


def build_series(
    actuals: pd.DataFrame,
    forecasts: pd.DataFrame,
    start: datetime,
    end: datetime,
    cutoff: str = "09:00",
) -> pd.DataFrame:
    """
    Constructs the 30-min per-slot decision-time series between [start, end).

    Columns returned:
      - time: slot startTime (UTC)
      - forecast: MW (nullable float)
      - publish_time: datetime when forecast was published (nullable)
      - horizon_hours: (time - publish_time) in hours (nullable float)
      - actual: MW actual generation (nullable float)
      - error: forecast - actual (nullable float)

    Vectorized implementation:
      - Generates complete 30-minute interval grid for [start, end).
      - Computes day-ahead cutoff per slot = (slot_date - 1 day) at cutoff_time.
      - Filters forecasts for start_times in [start, end) where publish_time <= cutoff.
      - Finds latest publish_time per start_time.
      - Carries hourly forecast to :30 slot via forward_fill_hourly_forecasts.
      - Merges with grid and actuals.
    """
    cutoff_t = parse_cutoff_time(cutoff)

    # 1. Generate full 30-min grid in [start, end)
    slot_times = pd.date_range(start=start, end=end, freq="30min", inclusive="left")
    grid = pd.DataFrame({"time": slot_times})
    if grid.empty:
        return pd.DataFrame(
            columns=[
                "time",
                "forecast",
                "publish_time",
                "horizon_hours",
                "actual",
                "error",
            ]
        )

    # 2. Compute cutoff per slot
    # Cutoff is (slot_date - 1 day) at cutoff_t (UTC)
    slot_dates = grid["time"].dt.floor("D")
    grid["cutoff"] = (
        slot_dates
        - pd.Timedelta(days=1)
        + pd.Timedelta(hours=cutoff_t.hour, minutes=cutoff_t.minute)
    )

    # 3. Filter candidate forecasts
    # Candidate forecast start_time must be within [start, end)
    f_sub = forecasts[
        (forecasts["start_time"] >= start) & (forecasts["start_time"] < end)
    ].copy()

    chosen_forecasts = pd.DataFrame(
        columns=["time", "forecast", "publish_time", "horizon_hours"]
    )

    if not f_sub.empty:
        # Merge cutoff from grid onto candidate forecasts by matching start_time
        # Since grid has every 30m slot and forecasts are at least a subset of those start_times
        f_with_cutoff = f_sub.merge(
            grid[["time", "cutoff"]],
            left_on="start_time",
            right_on="time",
            how="inner",
        )

        # Keep candidates where publish_time <= cutoff
        valid_candidates = f_with_cutoff[
            f_with_cutoff["publish_time"] <= f_with_cutoff["cutoff"]
        ]

        if not valid_candidates.empty:
            # Sort by start_time and publish_time ascending, pick latest
            sorted_candidates = valid_candidates.sort_values(
                by=["start_time", "publish_time"]
            )
            latest_per_start = sorted_candidates.groupby(
                "start_time", as_index=False
            ).last()

            chosen_forecasts = pd.DataFrame(
                {
                    "time": latest_per_start["start_time"],
                    "forecast": latest_per_start["generation"].astype(float),
                    "publish_time": latest_per_start["publish_time"],
                }
            )

    # 4. Merge chosen forecasts onto full grid
    merged_grid = grid[["time"]].merge(chosen_forecasts, on="time", how="left")

    # 5. Forward-fill hourly forecast to :30 slot
    filled_grid = forward_fill_hourly_forecasts(merged_grid)

    # Ensure all original grid slots are present
    final_df = grid[["time"]].merge(filled_grid, on="time", how="left")

    # 6. Compute horizon_hours
    if final_df["publish_time"].notna().any():
        final_df["publish_time"] = pd.to_datetime(final_df["publish_time"], utc=True)
        final_df["horizon_hours"] = (
            final_df["time"] - final_df["publish_time"]
        ).dt.total_seconds() / 3600.0
    else:
        final_df["publish_time"] = pd.to_datetime(final_df["publish_time"], utc=True)
        final_df["horizon_hours"] = np.nan

    # 7. Merge actuals
    a_sub = actuals[(actuals["start_time"] >= start) & (actuals["start_time"] < end)][
        ["start_time", "generation"]
    ].copy()
    a_sub = a_sub.rename(columns={"start_time": "time", "generation": "actual"})
    a_sub["actual"] = a_sub["actual"].astype(float)

    final_df = final_df.merge(a_sub, on="time", how="left")

    # 8. Compute error = forecast - actual (null if either is null)
    final_df["error"] = np.where(
        final_df["forecast"].notna() & final_df["actual"].notna(),
        final_df["forecast"] - final_df["actual"],
        np.nan,
    )

    # Order columns
    return final_df[
        ["time", "forecast", "publish_time", "horizon_hours", "actual", "error"]
    ]
