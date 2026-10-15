from pathlib import Path
import os

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    database_url: str

    model_config = SettingsConfigDict(
        env_file=ROOT / (".env.supabase" if os.getenv("SISMOIA_TARGET") == "supabase" else ".env"),
        extra="ignore",
    )


settings = Settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)


def comprobar_conexion():
    with engine.connect() as conexion:
        return conexion.execute(
            text("SELECT current_database()")
        ).scalar_one()
