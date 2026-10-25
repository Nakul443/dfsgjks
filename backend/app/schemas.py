from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DatasetBoundsResponse(BaseModel):
    min_time: datetime
    max_time: datetime
    row_count: int


class MetaResponse(BaseModel):
    actuals: DatasetBoundsResponse
    forecasts: DatasetBoundsResponse
    default_cutoff: str


class SeriesItemResponse(BaseModel):
    time: datetime
    forecast: float | None = None
    publish_time: datetime | None = None
    horizon_hours: float | None = None
    actual: float | None = None
    error: float | None = None
    band_low: float | None = None
    band_high: float | None = None

    model_config = ConfigDict(ser_json_inf_nan="null")


class SeriesResponse(BaseModel):
    count: int
    data: list[SeriesItemResponse]


class MetricsResponse(BaseModel):
    mae: float | None = None
    rmse: float | None = None
    bias: float | None = None
    mape: float | None = None
    p10: float | None = None
    p50: float | None = None
    p90: float | None = None
    count: int
    dropped_count: int

    model_config = ConfigDict(ser_json_inf_nan="null")


class HourMetricItem(BaseModel):
    hour: int
    mae: float | None = None
    bias: float | None = None
    count: int

    model_config = ConfigDict(ser_json_inf_nan="null")


class HorizonMetricItem(BaseModel):
    bucket: str
    mae: float | None = None
    bias: float | None = None
    count: int

    model_config = ConfigDict(ser_json_inf_nan="null")
