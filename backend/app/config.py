# this file is reponsible for loading and validating configuration settings for the backend application.
# It uses Pydantic's BaseSettings to read from environment variables and a .env file,
# providing default values and validation for various configuration parameters.

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    default_cutoff: str = "09:00"
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"
    port: int = 8000

    @field_validator("data_dir", mode="before")
    @classmethod
    def resolve_data_dir(cls, v: str | Path) -> Path:
        p = Path(v)
        if not p.is_absolute():
            backend_root = Path(__file__).resolve().parent.parent
            candidate = backend_root / p
            if candidate.exists():
                return candidate
            return p.resolve()
        return p

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]


settings = Settings()
