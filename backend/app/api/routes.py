# this file defines the API routes for the backend application,
# specifically for retrieving metadata about datasets.

from fastapi import APIRouter

from app.schemas import DatasetBoundsResponse, MetaResponse
from app.services.data_store import data_store

router = APIRouter()


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
