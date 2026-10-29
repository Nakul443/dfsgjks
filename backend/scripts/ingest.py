"""
scripts/ingest.py

One-time snapshot ingest script for January 2026 UK Wind Forecast Portal.
Fetches FUELHH (actuals) and WINDFOR (forecasts) from Elexon BMRS API v1.
Saves cleaned datasets to Parquet files in backend/data/:
  - actuals.parquet: [start_time, generation]
  - forecasts.parquet: [start_time, publish_time, generation]
"""

# this file is responsible for ingesting wind generation actuals and forecasts from the Elexon BMRS API v1.
# It fetches data in chunks, handles rate limiting with retries,
# processes and cleans the data, and saves the results to Parquet files for use in the backend application.

import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pandas as pd

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

ACTUALS_START = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
ACTUALS_END = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

FORECAST_PUBLISH_START = datetime(2025, 12, 28, 0, 0, tzinfo=UTC)
FORECAST_PUBLISH_END = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

CHUNK_DAYS = 7 # this means we will fetch data in 7-day chunks to avoid overwhelming the API and to handle rate limits effectively.


def fetch_with_retry(
    client: httpx.Client,
    url: str,
    params: dict[str, str],
    max_retries: int = 4,
    backoff_factor: float = 1.5,
) -> list[dict]:
    """Fetch JSON stream from API with exponential backoff on transient errors."""
    for attempt in range(1, max_retries + 1):
        try:
            resp = client.get(url, params=params)
            if resp.status_code == 429:
                sleep_time = backoff_factor**attempt
                print(f"Rate limited (429). Retrying in {sleep_time:.1f}s...")
                time.sleep(sleep_time)
                continue
            resp.raise_for_status()
            return resp.json()
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            if attempt == max_retries:
                raise RuntimeError(
                    f"Failed to fetch {url} with {params} after {max_retries} attempts: {e}"
                ) from e
            sleep_time = backoff_factor**attempt
            print(f"Attempt {attempt} failed ({e}). Retrying in {sleep_time:.1f}s...")
            time.sleep(sleep_time)
    raise RuntimeError(f"Unreachable fetch attempt loop for {url}")


def ingest_actuals(client: httpx.Client) -> pd.DataFrame:
    """Fetch FUELHH actual wind generation in 7-day chunks for January 2026."""
    print("=" * 60)
    print("Fetching FUELHH Actuals (fuelType=WIND)...")
    print("=" * 60)

    url = f"{BASE_URL}/datasets/FUELHH/stream"
    all_rows: list[dict] = []

    curr_start = ACTUALS_START
    chunk_idx = 1

    while curr_start < ACTUALS_END:
        curr_end = min(curr_start + timedelta(days=CHUNK_DAYS), ACTUALS_END)
        # Note: settlement date format is YYYY-MM-DD
        # settlementDateTo is inclusive, but we will filter by start_time strictly in [start, end)
        settlement_from = curr_start.strftime("%Y-%m-%d")
        # Subtract 1 second or use current date for settlementDateTo
        settlement_to = (curr_end - timedelta(seconds=1)).strftime("%Y-%m-%d")

        params = {
            "settlementDateFrom": settlement_from,
            "settlementDateTo": settlement_to,
            "fuelType": "WIND",
        }
        print(
            f"Chunk {chunk_idx}: settlementDateFrom={settlement_from} to settlementDateTo={settlement_to}..."
        )

        data = fetch_with_retry(client, url, params)
        row_count = len(data)
        print(f"  -> Returned {row_count} rows")

        if row_count == 0:
            raise RuntimeError(
                f"Chunk {chunk_idx} returned 0 rows for FUELHH with params {params}! Failing loudly."
            )

        all_rows.extend(data)
        curr_start = curr_end
        chunk_idx += 1

    df = pd.DataFrame(all_rows)

    # Process and clean
    df["start_time"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")

    # Filter strictly to delivery window [2026-01-01T00:00:00Z, 2026-02-01T00:00:00Z)
    df = df[(df["start_time"] >= ACTUALS_START) & (df["start_time"] < ACTUALS_END)]

    # Keep required columns and deduplicate
    df = df[["start_time", "generation"]].drop_duplicates(subset=["start_time"])
    df = df.sort_values("start_time").reset_index(drop=True)

    return df


def ingest_forecasts(client: httpx.Client) -> pd.DataFrame:
    """Fetch WINDFOR forecasts in 7-day publish chunks, then filter start_time."""
    print("\n" + "=" * 60)
    print("Fetching WINDFOR Forecasts...")
    print("=" * 60)

    url = f"{BASE_URL}/datasets/WINDFOR/stream"
    all_rows: list[dict] = []

    curr_start = FORECAST_PUBLISH_START
    chunk_idx = 1

    while curr_start < FORECAST_PUBLISH_END:
        curr_end = min(curr_start + timedelta(days=CHUNK_DAYS), FORECAST_PUBLISH_END)
        p_from = curr_start.strftime("%Y-%m-%dT%H:%M:%SZ")
        p_to = curr_end.strftime("%Y-%m-%dT%H:%M:%SZ")

        params = {
            "publishDateTimeFrom": p_from,
            "publishDateTimeTo": p_to,
        }
        print(
            f"Chunk {chunk_idx}: publishDateTimeFrom={p_from} to publishDateTimeTo={p_to}..."
        )

        data = fetch_with_retry(client, url, params)
        row_count = len(data)
        print(f"  -> Returned {row_count} rows")

        if row_count == 0:
            raise RuntimeError(
                f"Chunk {chunk_idx} returned 0 rows for WINDFOR with params {params}! Failing loudly."
            )

        all_rows.extend(data)
        curr_start = curr_end
        chunk_idx += 1

    df = pd.DataFrame(all_rows)

    # Process and clean
    df["start_time"] = pd.to_datetime(df["startTime"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publishTime"], utc=True)
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")

    # Filter strictly to delivery window [2026-01-01T00:00:00Z, 2026-02-01T00:00:00Z)
    df = df[(df["start_time"] >= ACTUALS_START) & (df["start_time"] < ACTUALS_END)]

    # Keep required columns and deduplicate
    df = df[["start_time", "publish_time", "generation"]].drop_duplicates(
        subset=["start_time", "publish_time"]
    )
    df = df.sort_values(["start_time", "publish_time"]).reset_index(drop=True)

    return df


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    actuals_path = DATA_DIR / "actuals.parquet"
    forecasts_path = DATA_DIR / "forecasts.parquet"

    start_time = time.time()
    with httpx.Client(timeout=60.0) as client:
        df_actuals = ingest_actuals(client)
        df_forecasts = ingest_forecasts(client)

    # Save to Parquet
    df_actuals.to_parquet(actuals_path, index=False)
    df_forecasts.to_parquet(forecasts_path, index=False)

    duration = time.time() - start_time

    # Summary
    print("\n" + "=" * 60)
    print(f"Ingest completed successfully in {duration:.1f}s")
    print("=" * 60)

    # Expected slots: 31 days * 48 slots/day = 1488 slots
    expected_slots = 31 * 48
    actuals_count = len(df_actuals)
    missing_actual_slots = expected_slots - actuals_count

    print(f"Actuals Parquet: {actuals_path}")
    print(f"  Rows: {actuals_count} (Expected: {expected_slots})")
    print(f"  Missing slots: {missing_actual_slots}")
    print(f"  Min start_time: {df_actuals['start_time'].min()}")
    print(f"  Max start_time: {df_actuals['start_time'].max()}")

    print(f"\nForecasts Parquet: {forecasts_path}")
    print(f"  Rows: {len(df_forecasts)}")
    print(f"  Unique start_time count: {df_forecasts['start_time'].nunique()}")
    print(f"  Min start_time: {df_forecasts['start_time'].min()}")
    print(f"  Max start_time: {df_forecasts['start_time'].max()}")
    print(f"  Min publish_time: {df_forecasts['publish_time'].min()}")
    print(f"  Max publish_time: {df_forecasts['publish_time'].max()}")


if __name__ == "__main__":
    main()
