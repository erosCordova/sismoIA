from pathlib import Path
import os

from pydantic_settings import BaseSettings, SettingsConfigDict
from app.configuration import ENV_FILE
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from pydantic import field_validator


ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    database_url: str
    sismoia_forecast_source_name: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def usar_psycopg(cls, value):
        if isinstance(value, str):
            for prefix in ("postgresql://", "postgres://"):
                if value.startswith(prefix):
                    return "postgresql+psycopg://" + value[len(prefix):]
        return value

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        extra="ignore",
    )


settings = Settings()

url = make_url(settings.database_url)
connection_options = {"connect_timeout": 5}
if url.host not in (None, "localhost", "127.0.0.1", "::1") and "sslmode" not in url.query:
    connection_options["sslmode"] = "require"

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args=connection_options,
)


def comprobar_conexion():
    with engine.connect() as conexion:
        return conexion.execute(
            text("SELECT current_database()")
        ).scalar_one()
