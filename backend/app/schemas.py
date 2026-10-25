from datetime import datetime
from pydantic import BaseModel


class DatasetBoundsResponse(BaseModel):
    min_time: datetime
    max_time: datetime
    row_count: int


class MetaResponse(BaseModel):
    actuals: DatasetBoundsResponse
    forecasts: DatasetBoundsResponse
    default_cutoff: str
