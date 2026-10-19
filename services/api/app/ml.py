import csv
import os
import json
from collections import Counter
from pathlib import Path
from typing import Literal
import joblib
import numpy as np
import pickle
from functools import wraps
from fastapi import APIRouter, Depends, HTTPException, Query
from app.access import requerir_permiso
from app.ml_artifacts import active_directory, database_rows, generate

router = APIRouter(prefix="/api/v1/ml", tags=["Machine Learning"])
BASE = Path(os.environ.get("SISMOIA_ML_OUTPUT_DIR") or Path(__file__).resolve().parents[1] / "data" / "processed")


def optional_artifacts(function):
    @wraps(function)
    def guarded(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except HTTPException as error:
            if error.status_code not in (409, 503):
                raise
            detail = error.detail
        except (OSError, ValueError, KeyError, TypeError, AttributeError, EOFError, ImportError, pickle.UnpicklingError):
            detail = "Los archivos de agrupamientos estan incompletos o no son compatibles. Vuelve a generar los agrupamientos con datos actuales."
        return {"disponible": False, "detalle": detail, "experimentos": [], "datasets": [], "puntos": [], "total": 0}
    return guarded

def archivo(nombre):
    ruta = active_directory(BASE) / nombre
    if not ruta.is_file():
        raise HTTPException(503, "Modelo o dataset no disponible: " + nombre)
    return ruta

def modelo(nombre):
    # Cargar exclusivamente artefactos generados localmente por SISMOIA.
    return joblib.load(archivo(nombre))

@router.get("/overview")
@optional_artifacts
def resumen(usuario: dict = Depends(requerir_permiso("models:read"))):
    if not all((active_directory(BASE) / name).is_file() for name in ('ml_metrics.json', 'kmeans_model.joblib', 'dbscan_model.joblib')):
        return {"disponible": False, "detalle": "Todavia no hay agrupamientos generados. Utiliza Generar agrupamientos con datos actuales."}
    metricas = json.loads(archivo("ml_metrics.json").read_text(encoding="utf-8"))
    km = modelo("kmeans_model.joblib")["modelo"]
    db = modelo("dbscan_model.joblib")["modelo"]
    conteo_km = Counter(int(x) for x in km.labels_)
    conteo_db = Counter(int(x) for x in db.labels_)
    metricas["kmeans"]["distribucion"] = {str(k): v for k, v in sorted(conteo_km.items())}
    metricas["dbscan"]["distribucion"] = {str(k): v for k, v in sorted(conteo_db.items())}
    metricas["dbscan"]["ruido"] = conteo_db.get(-1, 0)
    metricas["disponible"] = True
    return metricas


@router.post("/train-clustering")
def entrenar_agrupamientos(peru: bool = False, usuario: dict = Depends(requerir_permiso("models:train"))):
    return generate(BASE, database_rows(peru=peru), peru=peru)

@router.get("/clusters")
@optional_artifacts
def agrupaciones(
    conjunto: Literal["entrenamiento", "evaluacion"] = "evaluacion",
    limite: int = Query(300, ge=1, le=500),
    usuario: dict = Depends(requerir_permiso("models:read"))
):
    nombre = "sismoia_" + conjunto + ".csv"
    if not all((active_directory(BASE) / name).is_file() for name in (nombre, 'kmeans_model.joblib')):
        return {"disponible": False, "conjunto": conjunto, "total": 0, "puntos": [], "detalle": "Genera los agrupamientos para visualizar sus puntos"}
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
    return {"disponible": True, "conjunto": conjunto, "total": len(filas), "puntos": puntos}


# ============================================================
# REGISTRO DE ARTEFACTOS Y VALIDACION SUPERVISADA EXPERIMENTAL
# ============================================================

from datetime import datetime, timezone
from hashlib import sha256
from math import sqrt, isfinite

from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def huella_archivo(ruta):
    digest = sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(bloque)
    return digest.hexdigest()


def fecha_archivo(ruta):
    return datetime.fromtimestamp(
        ruta.stat().st_mtime, timezone.utc
    ).isoformat()


@router.get("/registry")
@optional_artifacts
def registro_ml(
    usuario: dict = Depends(requerir_permiso("models:read"))
):
    base = active_directory(BASE)
    metricas_ruta = base / "ml_metrics.json"

    metricas = {}
    if metricas_ruta.is_file():
        metricas = json.loads(
            metricas_ruta.read_text(encoding="utf-8")
        )

    archivos = [
        ("K-Means", "kmeans_model.joblib", "kmeans"),
        ("DBSCAN", "dbscan_model.joblib", "dbscan"),
    ]

    dataset = []
    for nombre in [
        "sismoia_entrenamiento.csv",
        "sismoia_evaluacion.csv",
    ]:
        ruta = base / nombre
        dataset.append({
            "nombre": nombre,
            "disponible": ruta.is_file(),
            "hash": huella_archivo(ruta)[:16]
            if ruta.is_file() else None,
        })

    experimentos = []

    for nombre, archivo_modelo, clave in archivos:
        ruta = base / archivo_modelo
        disponible = ruta.is_file()

        experimento = {
            "nombre": nombre,
            "algoritmo": nombre,
            "tipo": "Agrupamiento no supervisado",
            "objetivo": "Explorar patrones del catálogo histórico",
            "variable_objetivo": None,
            "ruta_artefacto": (
                f"data/processed/{ruta.relative_to(BASE).as_posix()}"
                if disponible else None
            ),
            "version": (
                huella_archivo(ruta)[:16]
                if disponible else None
            ),
            "fecha_archivo_utc": (
                fecha_archivo(ruta)
                if disponible else None
            ),
            "fecha_entrenamiento_utc": metricas.get("fecha_entrenamiento_utc") or metricas.get("generado_utc"),
            "estado": (
                "Artefacto disponible"
                if disponible else "No disponible"
            ),
            "metricas": metricas.get(clave, {}),
            "advertencia": (
                "La fecha del archivo no demuestra la fecha "
                "del entrenamiento. Los grupos no son "
                "pronósticos sísmicos."
            ),
        }

        if disponible:
            try:
                paquete = modelo(archivo_modelo)
                experimento["variables"] = (
                    paquete.get("variables", [])
                    if isinstance(paquete, dict) else []
                )

                estimador = (
                    paquete.get("modelo")
                    if isinstance(paquete, dict)
                    else paquete
                )

                parametros = estimador.get_params()
                permitidos = {
                    "n_clusters", "eps", "min_samples",
                    "random_state", "max_iter",
                    "init", "algorithm"
                }

                experimento["hiperparametros"] = {
                    k: v
                    for k, v in parametros.items()
                    if k in permitidos
                    and isinstance(v, (str, int, float, bool))
                }
            except Exception:
                experimento["estado"] = (
                    "Artefacto no verificable"
                )
                experimento["variables"] = []
                experimento["hiperparametros"] = {}

        experimentos.append(experimento)

    return {
        "experimentos": experimentos,
        "datasets": dataset,
        "metricas_disponibles": metricas_ruta.is_file(),
        "registrado_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "persistencia": (
            "Registro construido desde archivos existentes; "
            "no equivale a un historial persistente de ejecuciones."
        ),
        "nota": (
            "K-Means y DBSCAN son modelos no supervisados. "
            "No corresponde mostrar una matriz de confusión "
            "sin etiquetas verdaderas de clasificación."
        ),
    }


def leer_registros_supervisados_archivos():
    registros = {}
    hashes = []

    for nombre in [
        "sismoia_entrenamiento.csv",
        "sismoia_evaluacion.csv",
    ]:
        ruta = archivo(nombre)
        hashes.append(huella_archivo(ruta))

        with ruta.open(
            encoding="utf-8-sig", newline=""
        ) as f:
            for fila in csv.DictReader(f):
                try:
                    evento_id = fila["id"]
                    fecha = datetime.fromisoformat(
                        fila["fecha_utc"].replace("Z", "+00:00")
                    )

                    if fecha.tzinfo is None:
                        fecha = fecha.replace(
                            tzinfo=timezone.utc
                        )

                    latitud = float(fila["latitud"])
                    longitud = float(fila["longitud"])
                    magnitud = float(fila["magnitud"])

                    profundidad_txt = fila.get(
                        "profundidad_km"
                    )

                    profundidad = (
                        float(profundidad_txt)
                        if profundidad_txt not in (
                            "", None, "None", "nan"
                        )
                        else float("nan")
                    )

                    if not all(map(isfinite, [
                        latitud, longitud, magnitud
                    ])):
                        continue

                    if not (
                        -90 <= latitud <= 90
                        and -180 <= longitud <= 180
                    ):
                        continue

                    registros[evento_id] = {
                        "id": evento_id,
                        "fecha": fecha,
                        "x": [
                            latitud,
                            longitud,
                            profundidad
                        ],
                        "y": magnitud,
                    }
                except (
                    ValueError, TypeError, KeyError
                ):
                    continue

    ordenados = sorted(
        registros.values(),
        key=lambda r: (r["fecha"], r["id"])
    )

    return ordenados[-3000:], sha256(
        "".join(hashes).encode()
    ).hexdigest()[:16]


def leer_registros_supervisados(peru=False):
    # La base principal evita depender de CSV que no se distribuyen con el proyecto.
    rows = database_rows(peru=peru)
    signature = sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()[:16]
    return [{"id": r["id"], "fecha": datetime.fromisoformat(r["fecha_utc"].replace("Z", "+00:00")),
             "x": [r["latitud"], r["longitud"], r["profundidad_km"]], "y": r["magnitud"], "fuente": r["fuente"]} for r in rows], signature


@router.get("/regression-validation")
def validar_regresion(peru: bool = False, usuario: dict = Depends(requerir_permiso("models:train"))):
    from types import SimpleNamespace
    from app.ml_data import temporal_split
    from app.ml_engine import ejecutar_experimento_v2
    registros, firma = leer_registros_supervisados(peru=peru)
    filas = [{"id": r["id"], "fecha_utc": r["fecha"].isoformat(), "latitud": r["x"][0],
              "longitud": r["x"][1], "profundidad_km": r["x"][2], "magnitud": r["y"],
              "fuente": r.get("fuente", "No especificada")} for r in registros]
    train, test = temporal_split(filas, min_train=40, min_test=8)
    for label, block in (("entrenamiento", train), ("validacion", test)):
        for row in block:
            row["particion"] = label
    dataset = SimpleNamespace(snapshot=train+test, manifest={"objetivo":"magnitud"}, signature=firma)
    params, results, _, _ = ejecutar_experimento_v2(dataset, "regresion")
    return {
        "objetivo": "Estimar magnitud de eventos ya observados", "tipo": "Regresion retrospectiva",
        "dataset_version": firma, "origen": "Supabase/PostgreSQL", "peru": peru, "variables": params["variables"], "variable_objetivo":"magnitud",
        "entrenamiento":len(train), "evaluacion":len(test),
        "fecha_entrenamiento_desde":train[0]["fecha_utc"], "fecha_entrenamiento_hasta":train[-1]["fecha_utc"],
        "fecha_validacion_desde":test[0]["fecha_utc"], "fecha_validacion_hasta":test[-1]["fecha_utc"],
        "calculado_utc":datetime.now(timezone.utc).isoformat(),
        "comparacion":[{**r,"hiperparametros":params["hiperparametros_candidatos"][r["modelo"]]} for r in results["comparacion"]],
        "mejor_mae":results["modelo_seleccionado"],
        "real_vs_estimado":[{"fecha":r["fecha_utc"],"real":r["real"],"estimada":r["estimado"]} for r in results["serie_validacion"]],
        "estado":"Laboratorio no persistido; seleccion por desarrollo interno",
        "advertencia":"Seleccion independiente de la prueba final. Datos observados, no pronosticos. Para conservar el experimento utiliza Gobierno ML."
    }
