from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import pandas as pd


@dataclass(frozen=True)
class DatasetBounds:
    min_time: datetime
    max_time: datetime
    row_count: int


@dataclass(frozen=True)
class DataStoreMeta:
    actuals: DatasetBounds
    forecasts: DatasetBounds
    default_cutoff: str


class DataStore:
    def __init__(self, data_dir: Path | None = None) -> None:
        self._data_dir = data_dir
        self._actuals: pd.DataFrame | None = None
        self._forecasts: pd.DataFrame | None = None
        self._meta: DataStoreMeta | None = None

    def load(self, data_dir: Path | None = None, default_cutoff: str = "09:00") -> None:
        if data_dir is not None:
            self._data_dir = data_dir
        if self._data_dir is None:
            raise ValueError("data_dir must be provided to load DataStore")

        actuals_parquet = self._data_dir / "actuals.parquet"
        actuals_csv_gz = self._data_dir / "actuals.csv.gz"
        forecasts_parquet = self._data_dir / "forecasts.parquet"
        forecasts_csv_gz = self._data_dir / "forecasts.csv.gz"

        if actuals_parquet.exists():
            actuals = pd.read_parquet(actuals_parquet)
        elif actuals_csv_gz.exists():
            actuals = pd.read_csv(actuals_csv_gz)
        else:
            raise FileNotFoundError(
                f"Neither actuals.parquet nor actuals.csv.gz found at {self._data_dir}"
            )

        if forecasts_parquet.exists():
            forecasts = pd.read_parquet(forecasts_parquet)
        elif forecasts_csv_gz.exists():
            forecasts = pd.read_csv(forecasts_csv_gz)
        else:
            raise FileNotFoundError(
                f"Neither forecasts.parquet nor forecasts.csv.gz found at {self._data_dir}"
            )

        # Enforce UTC timezone-awareness
        actuals["start_time"] = pd.to_datetime(actuals["start_time"], utc=True)
        forecasts["start_time"] = pd.to_datetime(forecasts["start_time"], utc=True)
        forecasts["publish_time"] = pd.to_datetime(forecasts["publish_time"], utc=True)

        self._actuals = actuals.sort_values("start_time").reset_index(drop=True)
        self._forecasts = forecasts.sort_values(
            ["start_time", "publish_time"]
        ).reset_index(drop=True)

        self._meta = DataStoreMeta(
            actuals=DatasetBounds(
                min_time=self._actuals["start_time"].min().to_pydatetime(),
                max_time=self._actuals["start_time"].max().to_pydatetime(),
                row_count=len(self._actuals),
            ),
            forecasts=DatasetBounds(
                min_time=self._forecasts["start_time"].min().to_pydatetime(),
                max_time=self._forecasts["start_time"].max().to_pydatetime(),
                row_count=len(self._forecasts),
            ),
            default_cutoff=default_cutoff,
        )

    @property
    def actuals(self) -> pd.DataFrame:
        if self._actuals is None:
            raise RuntimeError("DataStore is not loaded. Call load() first.")
        return self._actuals

    @property
    def forecasts(self) -> pd.DataFrame:
        if self._forecasts is None:
            raise RuntimeError("DataStore is not loaded. Call load() first.")
        return self._forecasts

    @property
    def meta(self) -> DataStoreMeta:
        if self._meta is None:
            raise RuntimeError("DataStore is not loaded. Call load() first.")
        return self._meta


data_store = DataStore()
