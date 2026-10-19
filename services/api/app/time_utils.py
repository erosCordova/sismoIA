"""Representacion UTC unica para datos, API y comparaciones temporales."""
from datetime import date, datetime, timedelta, timezone
from fastapi import HTTPException


def next_utc_date(value: date) -> date:
    try:
        return value + timedelta(days=1)
    except OverflowError:
        raise HTTPException(422, "La fecha final supera el rango admitido; utiliza una fecha anterior a 9999-12-31") from None


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_iso(value: datetime | None) -> str | None:
    return as_utc(value).isoformat().replace("+00:00", "Z") if value else None


def parse_utc(value: str) -> datetime:
    return as_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
