from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    notebook_path: Path = Path("data/notebook.json")
    database_url: SecretStr | None = None  # Только для прежних миграций Alembic.
    app_origin: str = "http://localhost:3000"
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not value.get_secret_value().startswith("postgresql+psycopg://"):
            raise ValueError("Требуется PostgreSQL через драйвер psycopg")
        return value

    @field_validator("app_origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("APP_ORIGIN должен содержать только схему, хост и порт")
        return value.rstrip("/")
