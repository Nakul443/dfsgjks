# this file is responsible for defining the API endpoints for the forecasting service.

import re
from datetime import UTC, datetime

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.cache import cache
from app.config import settings
from app.schemas import (
    DatasetBoundsResponse,
    HorizonMetricItem,
    HourMetricItem,
    MetaResponse,
    MetricsResponse,
    SeriesItemResponse,
    SeriesResponse,
)
from app.services.data_store import data_store
from app.services.decision_time import build_series
from app.services.metrics import (
    metrics_by_horizon,
    metrics_by_hour,
    overall_metrics,
    planning_band,
)

router = APIRouter()

MIN_DELIVERY_TIME = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
MAX_DELIVERY_TIME = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)
CUTOFF_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def validate_time_range(start_str: str, end_str: str) -> tuple[datetime, datetime]:
    """Parse and validate start and end query parameters."""
    try:
        start = datetime.fromisoformat(start_str)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid start datetime: '{start_str}'. Must be ISO 8601.",
        ) from e

    try:
        end = datetime.fromisoformat(end_str)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid end datetime: '{end_str}'. Must be ISO 8601.",
        ) from e

    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    else:
        start = start.astimezone(UTC)

    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    else:
        end = end.astimezone(UTC)

    if start >= end:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid range: start ({start.isoformat()}) must be earlier than end ({end.isoformat()}).",
        )

    if start < MIN_DELIVERY_TIME or end > MAX_DELIVERY_TIME:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Range [{start.isoformat()}, {end.isoformat()}) outside allowed delivery window "
                f"[{MIN_DELIVERY_TIME.isoformat()}, {MAX_DELIVERY_TIME.isoformat()}]."
            ),
        )

    return start, end


def validate_cutoff(cutoff: str | None) -> str:
    """Validate cutoff format HH:MM or return default."""
    if cutoff is None or cutoff.strip() == "":
        return settings.default_cutoff
    cutoff_clean = cutoff.strip()
    if not CUTOFF_PATTERN.match(cutoff_clean):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid cutoff format: '{cutoff}'. Must match HH:MM (e.g. '09:00').",
        )
    return cutoff_clean


@router.get("/meta", response_model=MetaResponse)
def get_meta() -> MetaResponse:
    meta = data_store.meta
    return MetaResponse(
        actuals=DatasetBoundsResponse(
            min_time=meta.actuals.min_time,
            max_time=meta.actuals.max_time,
            row_count=meta.actuals.row_count,
        ),
        forecasts=DatasetBoundsResponse(
            min_time=meta.forecasts.min_time,
            max_time=meta.forecasts.max_time,
            row_count=meta.forecasts.row_count,
        ),
        default_cutoff=meta.default_cutoff,
    )


@router.get("/series", response_model=SeriesResponse)
def get_series(
    start: str = Query(..., description="Start delivery datetime (ISO 8601)"),
    end: str = Query(..., description="End delivery datetime (ISO 8601)"),
    cutoff: str | None = Query(
        None, description="Cutoff time in HH:MM (default 09:00)"
    ),
) -> SeriesResponse:
    start_dt, end_dt = validate_time_range(start, end)
    cutoff_time = validate_cutoff(cutoff)

    cache_key = ("series", start_dt, end_dt, cutoff_time)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    series = build_series(
        data_store.actuals, data_store.forecasts, start_dt, end_dt, cutoff=cutoff_time
    )
    series_with_band = planning_band(series)

    records = series_with_band.to_dict(orient="records")
    items = []
    for r in records:
        t = r["time"]
        pt = r["publish_time"]
        items.append(
            SeriesItemResponse(
                time=t.to_pydatetime() if isinstance(t, pd.Timestamp) else t,
                forecast=float(r["forecast"]) if pd.notna(r["forecast"]) else None,
                publish_time=(
                    pt.to_pydatetime()
                    if isinstance(pt, pd.Timestamp) and pd.notna(pt)
                    else None
                ),
                horizon_hours=float(r["horizon_hours"])
                if pd.notna(r["horizon_hours"])
                else None,
                actual=float(r["actual"]) if pd.notna(r["actual"]) else None,
                error=float(r["error"]) if pd.notna(r["error"]) else None,
                band_low=float(r["band_low"]) if pd.notna(r["band_low"]) else None,
                band_high=float(r["band_high"]) if pd.notna(r["band_high"]) else None,
            )
        )

    resp = SeriesResponse(count=len(items), data=items)
    cache.set(cache_key, resp)
    return resp


@router.get("/metrics", response_model=MetricsResponse)
def get_metrics(
    start: str = Query(..., description="Start delivery datetime (ISO 8601)"),
    end: str = Query(..., description="End delivery datetime (ISO 8601)"),
    cutoff: str | None = Query(
        None, description="Cutoff time in HH:MM (default 09:00)"
    ),
) -> MetricsResponse:
    start_dt, end_dt = validate_time_range(start, end)
    cutoff_time = validate_cutoff(cutoff)

    cache_key = ("metrics", start_dt, end_dt, cutoff_time)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    series = build_series(
        data_store.actuals, data_store.forecasts, start_dt, end_dt, cutoff=cutoff_time
    )
    raw_stats = overall_metrics(series)
    resp = MetricsResponse(**raw_stats)
    cache.set(cache_key, resp)
    return resp


@router.get("/metrics/by-hour", response_model=list[HourMetricItem])
def get_metrics_by_hour(
    start: str = Query(..., description="Start delivery datetime (ISO 8601)"),
    end: str = Query(..., description="End delivery datetime (ISO 8601)"),
    cutoff: str | None = Query(
        None, description="Cutoff time in HH:MM (default 09:00)"
    ),
) -> list[HourMetricItem]:
    start_dt, end_dt = validate_time_range(start, end)
    cutoff_time = validate_cutoff(cutoff)

    cache_key = ("metrics_by_hour", start_dt, end_dt, cutoff_time)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    series = build_series(
        data_store.actuals, data_store.forecasts, start_dt, end_dt, cutoff=cutoff_time
    )
    raw_items = metrics_by_hour(series)
    resp = [HourMetricItem(**item) for item in raw_items]
    cache.set(cache_key, resp)
    return resp


@router.get("/metrics/by-horizon", response_model=list[HorizonMetricItem])
def get_metrics_by_horizon(
    start: str = Query(..., description="Start delivery datetime (ISO 8601)"),
    end: str = Query(..., description="End delivery datetime (ISO 8601)"),
) -> list[HorizonMetricItem]:
    start_dt, end_dt = validate_time_range(start, end)

    cache_key = ("metrics_by_horizon", start_dt, end_dt)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    raw_items = metrics_by_horizon(
        data_store.actuals, data_store.forecasts, start_dt, end_dt
    )
    resp = [HorizonMetricItem(**item) for item in raw_items]
    cache.set(cache_key, resp)
    return resp
