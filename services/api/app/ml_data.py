"""Particiones cronologicas sin compartir instantes ni eventos proximos."""
from fastapi import HTTPException
from app.time_utils import parse_utc

TEMPORAL_GAP_SECONDS = 120


def temporal_split(rows, fraction=0.8, min_train=1, min_test=1):
    ordered = sorted(rows, key=lambda r: (parse_utc(r["fecha_utc"]), str(r["id"])))
    candidates = [
        i for i in range(min_train, len(ordered) - min_test + 1)
        if (parse_utc(ordered[i]["fecha_utc"]) - parse_utc(ordered[i - 1]["fecha_utc"])).total_seconds() > TEMPORAL_GAP_SECONDS
    ]
    if not candidates:
        raise HTTPException(422, "No hay una particion temporal independiente suficiente; amplia el periodo del dataset")
    target = len(ordered) * fraction
    cut = min(candidates, key=lambda i: (abs(i - target), i))
    return ordered[:cut], ordered[cut:]


def validate_partitions(train, test):
    if {str(r["id"]) for r in train} & {str(r["id"]) for r in test}:
        raise HTTPException(422, "Un evento aparece en ambas particiones")
    gap = (parse_utc(test[0]["fecha_utc"]) - parse_utc(train[-1]["fecha_utc"])).total_seconds()
    if gap <= TEMPORAL_GAP_SECONDS:
        raise HTTPException(422, "Particiones superpuestas o demasiado proximas; crea una nueva version del dataset")
