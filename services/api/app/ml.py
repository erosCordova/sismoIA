import csv
import json
from collections import Counter
from pathlib import Path
from typing import Literal
import joblib
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from app.access import requerir_permiso

router = APIRouter(prefix="/api/v1/ml", tags=["Machine Learning"])
BASE = Path(__file__).resolve().parents[1] / "data" / "processed"

def archivo(nombre):
    ruta = BASE / nombre
    if not ruta.is_file():
        raise HTTPException(503, "Modelo o dataset no disponible: " + nombre)
    return ruta

def modelo(nombre):
    # Cargar exclusivamente artefactos generados localmente por SISMOIA.
    return joblib.load(archivo(nombre))

@router.get("/overview")
def resumen(usuario: dict = Depends(requerir_permiso("models:read"))):
    metricas = json.loads(archivo("ml_metrics.json").read_text(encoding="utf-8"))
    km = modelo("kmeans_model.joblib")["modelo"]
    db = modelo("dbscan_model.joblib")["modelo"]
    conteo_km = Counter(int(x) for x in km.labels_)
    conteo_db = Counter(int(x) for x in db.labels_)
    metricas["kmeans"]["distribucion"] = {str(k): v for k, v in sorted(conteo_km.items())}
    metricas["dbscan"]["distribucion"] = {str(k): v for k, v in sorted(conteo_db.items())}
    metricas["dbscan"]["ruido"] = conteo_db.get(-1, 0)
    return metricas

@router.get("/clusters")
def agrupaciones(
    conjunto: Literal["entrenamiento", "evaluacion"] = "evaluacion",
    limite: int = Query(300, ge=1, le=500),
    usuario: dict = Depends(requerir_permiso("models:read"))
):
    nombre = "sismoia_" + conjunto + ".csv"
    with archivo(nombre).open(encoding="utf-8-sig", newline="") as f:
        filas = list(csv.DictReader(f))
    paquete = modelo("kmeans_model.joblib")
    recientes = list(reversed(filas[-limite:]))
    if not recientes:
        return {"conjunto": conjunto, "total": len(filas), "puntos": []}
    variables = paquete["variables"]
    matriz = np.asarray([[float(r[v]) for v in variables] for r in recientes])
    grupos = paquete["modelo"].predict(paquete["escalador"].transform(matriz))
    puntos = [{
        "id": r["id"], "fuente": r["fuente"], "fecha_utc": r["fecha_utc"],
        "latitud": float(r["latitud"]), "longitud": float(r["longitud"]),
        "magnitud": float(r["magnitud"]),
        "profundidad_km": float(r["profundidad_km"]) if r["profundidad_km"] else None,
        "grupo": int(g)
    } for r, g in zip(recientes, grupos)]
    return {"conjunto": conjunto, "total": len(filas), "puntos": puntos}
