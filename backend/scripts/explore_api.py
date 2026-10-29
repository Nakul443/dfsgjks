"""
scripts/explore_api.py

Exploratory script to probe the Elexon BMRS API v1.
Validates endpoints, query parameters, payload shapes, and data granularity
for FUELHH (actuals) and WINDFOR (forecasts).
"""

import httpx
import pandas as pd

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"


def explore_fuelhh(client: httpx.Client) -> None:
    print("=" * 60)
    print("1. Exploring FUELHH (Actuals)")
    print("=" * 60)

    # 1. Fetch 1 day of FUELHH with server-side fuelType=WIND filter
    params = {
        "settlementDateFrom": "2026-01-01",
        "settlementDateTo": "2026-01-01",
        "fuelType": "WIND",
    }
    url = f"{BASE_URL}/datasets/FUELHH/stream"
    print(f"Request: GET {url}")
    print(f"Params: {params}")

    resp = client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()

    df = pd.DataFrame(data)
    print(f"\nResponse status: {resp.status_code}")
    print(f"Total rows returned: {len(df)}")
    print(f"Columns: {list(df.columns)}")
    print("\nSample rows (first 3):")
    print(df.head(3).to_string(index=False))

    # Verify server-side filtering
    fuel_types = df["fuelType"].unique()
    print(f"\nDistinct fuelType values: {fuel_types.tolist()}")

    # Check time intervals and granularity
    df["startTime"] = pd.to_datetime(df["startTime"])
    df["publishTime"] = pd.to_datetime(df["publishTime"])
    df = df.sort_values("startTime").reset_index(drop=True)
    time_diffs = df["startTime"].diff().dropna().unique()
    print(
        f"Unique intervals between consecutive startTimes: {[str(d) for d in time_diffs]}"
    )
    print(
        f"Unique minutes in startTime: {sorted(df['startTime'].dt.minute.unique().tolist())}"
    )
    print(
        f"Settlement periods present: {df['settlementPeriod'].min()} to {df['settlementPeriod'].max()} (count={df['settlementPeriod'].nunique()})"
    )

# function to explore WINDFOR (forecasts) data
# which means we will look at the forecast data for wind generation, including publish times and start times, and analyze the horizon between them
def explore_windfor(client: httpx.Client) -> None:
    print("\n" + "=" * 60)
    print("2. Exploring WINDFOR (Forecasts)")
    print("=" * 60)

    # WINDFOR streams filter by publishDateTimeFrom/To
    params = {
        "publishDateTimeFrom": "2026-01-01T00:00:00Z",
        "publishDateTimeTo": "2026-01-02T00:00:00Z",
    }
    url = f"{BASE_URL}/datasets/WINDFOR/stream"
    print(f"Request: GET {url}")
    print(f"Params: {params}")

    resp = client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()

    df = pd.DataFrame(data)
    print(f"\nResponse status: {resp.status_code}")
    print(f"Total rows returned: {len(df)}")
    print(f"Columns: {list(df.columns)}")
    print("\nSample rows (first 3):")
    print(df.head(3).to_string(index=False))

    df["startTime"] = pd.to_datetime(df["startTime"])
    df["publishTime"] = pd.to_datetime(df["publishTime"])

    # Granularity of startTime
    unique_minutes = df["startTime"].dt.minute.unique().tolist()
    print(f"\nUnique minutes in WINDFOR startTime: {sorted(unique_minutes)}")

    # Distinct publish times per startTime in this 1-day sample
    pubs_per_start = df.groupby("startTime")["publishTime"].nunique()
    print("\nDistinct publishTime values per startTime (summary):")
    print(
        f"  Min: {pubs_per_start.min()}, Max: {pubs_per_start.max()}, Mean: {pubs_per_start.mean():.1f}"
    )
    print(f"  Total unique startTimes: {df['startTime'].nunique()}")
    print(f"  Total unique publishTimes: {df['publishTime'].nunique()}")

    # Horizon calculation: horizon_hours = (startTime - publishTime) in hours
    df["horizon_hours"] = (
        df["startTime"] - df["publishTime"]
    ).dt.total_seconds() / 3600.0
    print("\nHorizon analysis (startTime - publishTime):")
    print(f"  Earliest horizon (min): {df['horizon_hours'].min():.1f} hours")
    print(f"  Latest horizon (max):   {df['horizon_hours'].max():.1f} hours")
    pos_horizons = df[df["horizon_hours"] >= 0]["horizon_hours"]
    print(
        f"  Non-negative horizons:  min={pos_horizons.min():.1f}h, max={pos_horizons.max():.1f}h"
    )


def main() -> None:
    with httpx.Client(timeout=30.0) as client:
        explore_fuelhh(client)
        explore_windfor(client)


if __name__ == "__main__":
    main()
