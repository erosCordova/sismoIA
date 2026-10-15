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
def registro_ml(
    usuario: dict = Depends(requerir_permiso("models:read"))
):
    metricas_ruta = BASE / "ml_metrics.json"

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
        ruta = BASE / nombre
        dataset.append({
            "nombre": nombre,
            "disponible": ruta.is_file(),
            "hash": huella_archivo(ruta)[:16]
            if ruta.is_file() else None,
        })

    experimentos = []

    for nombre, archivo_modelo, clave in archivos:
        ruta = BASE / archivo_modelo
        disponible = ruta.is_file()

        experimento = {
            "nombre": nombre,
            "algoritmo": nombre,
            "tipo": "Agrupamiento no supervisado",
            "objetivo": "Explorar patrones del catálogo histórico",
            "variable_objetivo": None,
            "ruta_artefacto": (
                f"data/processed/{archivo_modelo}"
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
            "fecha_entrenamiento_utc": metricas.get(
                "fecha_entrenamiento_utc"
            ),
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


def leer_registros_supervisados():
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


@router.get("/regression-validation")
def validar_regresion(
    usuario: dict = Depends(requerir_permiso("models:read"))
):
    registros, version_dataset = leer_registros_supervisados()

    if len(registros) < 60:
        raise HTTPException(
            422,
            "Se necesitan al menos 60 registros históricos "
            "válidos para evaluar la regresión."
        )

    corte = int(len(registros) * 0.8)
    entrenamiento = registros[:corte]
    evaluacion = registros[corte:]

    x_train = np.asarray(
        [r["x"] for r in entrenamiento],
        dtype=float
    )
    y_train = np.asarray(
        [r["y"] for r in entrenamiento],
        dtype=float
    )

    x_test = np.asarray(
        [r["x"] for r in evaluacion],
        dtype=float
    )
    y_test = np.asarray(
        [r["y"] for r in evaluacion],
        dtype=float
    )

    modelos = [
        (
            "Referencia: media histórica",
            make_pipeline(
                SimpleImputer(strategy="median"),
                DummyRegressor(strategy="mean")
            ),
            {"strategy": "mean"}
        ),
        (
            "Regresión Ridge",
            make_pipeline(
                SimpleImputer(strategy="median"),
                StandardScaler(),
                Ridge(alpha=10.0)
            ),
            {"alpha": 10.0}
        ),
        (
            "Random Forest",
            make_pipeline(
                SimpleImputer(strategy="median"),
                RandomForestRegressor(
                    n_estimators=60,
                    max_depth=8,
                    min_samples_leaf=4,
                    random_state=42,
                    n_jobs=1
                )
            ),
            {
                "n_estimators": 60,
                "max_depth": 8,
                "min_samples_leaf": 4,
                "random_state": 42
            }
        ),
    ]

    comparacion = []
    predicciones = {}

    for nombre, estimador, hiperparametros in modelos:
        estimador.fit(x_train, y_train)
        estimado = estimador.predict(x_test)

        comparacion.append({
            "modelo": nombre,
            "mae": round(
                float(mean_absolute_error(
                    y_test, estimado
                )), 4
            ),
            "rmse": round(
                sqrt(float(mean_squared_error(
                    y_test, estimado
                ))), 4
            ),
            "r2": round(
                float(r2_score(y_test, estimado)), 4
            ),
            "hiperparametros": hiperparametros,
        })

        predicciones[nombre] = estimado

    mejor = min(
        comparacion,
        key=lambda r: r["mae"]
    )["modelo"]

    estimado_mejor = predicciones[mejor]

    paso = max(1, len(evaluacion) // 60)

    muestra = [
        {
            "fecha": evaluacion[i]["fecha"].isoformat(),
            "real": round(
                float(y_test[i]), 3
            ),
            "estimada": round(
                float(estimado_mejor[i]), 3
            ),
        }
        for i in range(
            0, len(evaluacion), paso
        )
    ][:60]

    return {
        "objetivo": (
            "Estimar la magnitud registrada a partir "
            "de ubicación y profundidad observadas."
        ),
        "tipo": "Regresión supervisada experimental",
        "dataset_version": version_dataset,
        "variables": [
            "latitud", "longitud", "profundidad_km"
        ],
        "variable_objetivo": "magnitud",
        "entrenamiento": len(entrenamiento),
        "evaluacion": len(evaluacion),
        "fecha_entrenamiento_desde": (
            entrenamiento[0]["fecha"].isoformat()
        ),
        "fecha_entrenamiento_hasta": (
            entrenamiento[-1]["fecha"].isoformat()
        ),
        "fecha_validacion_desde": (
            evaluacion[0]["fecha"].isoformat()
        ),
        "fecha_validacion_hasta": (
            evaluacion[-1]["fecha"].isoformat()
        ),
        "calculado_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "comparacion": comparacion,
        "mejor_mae": mejor,
        "real_vs_estimado": muestra,
        "estado": "Evaluación temporal no persistida",
        "advertencia": (
            "Resultados calculados con un subconjunto "
            "histórico de hasta 3.000 registros y separación "
            "cronológica 80/20. Las características incluyen "
            "profundidad observada del mismo evento. "
            "No son predicciones anticipadas de terremotos. "
            "No se guarda un nuevo modelo y no se activan alertas."
        ),
    }
