"""Motor ML V2: seleccion interna y evaluacion retrospectiva."""

import hashlib
import io
import platform
from importlib.metadata import version
from app.ml_data import temporal_split, validate_partitions
from app.time_utils import parse_utc

import joblib
import numpy as np

from fastapi import HTTPException
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    balanced_accuracy_score,
    brier_score_loss,
    log_loss,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    r2_score,
)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def parametro_json(value):
    """JSONB no admite NaN/Infinity, comunes en parametros de sklearn."""
    if isinstance(value, float) and not np.isfinite(value):
        return repr(value)
    return value if value is None or isinstance(value, (str, int, float, bool)) else repr(value)


def ejecutar_experimento_v2(dataset, algoritmo):
    if algoritmo not in ("regresion", "clasificacion"):
        raise HTTPException(422, "Tipo de experimento no compatible")

    objetivo = dataset.manifest["objetivo"]

    if algoritmo == "clasificacion" and objetivo != "magnitud":
        raise HTTPException(
            422, "La clasificacion requiere objetivo magnitud"
        )

    if objetivo not in ("magnitud", "profundidad_km"):
        raise HTTPException(422, "Objetivo no compatible")

    variables = (
        ["profundidad_km", "latitud", "longitud"]
        if objetivo == "magnitud"
        else ["magnitud", "latitud", "longitud"]
    )

    train = sorted(
        (
            r for r in dataset.snapshot
            if r["particion"] == "entrenamiento"
        ),
        key=lambda r: parse_utc(r["fecha_utc"])
    )

    test = sorted(
        (
            r for r in dataset.snapshot
            if r["particion"] == "validacion"
        ),
        key=lambda r: parse_utc(r["fecha_utc"])
    )

    if len(train) < 40 or len(test) < 8:
        raise HTTPException(422, "Particion temporal insuficiente")

    validate_partitions(train, test)

    fuentes_train = sorted({
        str(r.get("fuente") or "Desconocida")
        for r in train
    })

    fuentes_test = sorted({
        str(r.get("fuente") or "Desconocida")
        for r in test
    })

    fuente_unica = (
        len(fuentes_train) == 1
        and len(fuentes_test) == 1
        and fuentes_train == fuentes_test
        and fuentes_train[0] in ("IGP", "USGS")
    )

    fuente_modelo = (
        fuentes_train[0]
        if fuente_unica
        else "Mixta/no comparable"
    )

    def matriz(filas):
        return np.asarray([
            [
                float(r[v]) if r.get(v) is not None and not (v == "profundidad_km" and r.get("profundidad_imputada")) else np.nan
                for v in variables
            ]
            for r in filas
        ], dtype=float)

    X_train = matriz(train)
    X_test = matriz(test)

    try:
        y_train = np.asarray([
            float(r[objetivo]) for r in train
        ], dtype=float)

        y_test = np.asarray([
            float(r[objetivo]) for r in test
        ], dtype=float)

    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            422, "Valores objetivo incompletos"
        ) from exc

    if not (
        np.isfinite(y_train).all()
        and np.isfinite(y_test).all()
    ):
        raise HTTPException(
            422, "Objetivo con valores no validos"
        )

    if np.isinf(X_train).any() or np.isinf(X_test).any():
        raise HTTPException(
            422, "Variables con infinito"
        )

    if algoritmo == "clasificacion":
        y_train = (y_train >= 4).astype(int)
        y_test = (y_test >= 4).astype(int)

        if len(np.unique(y_train)) < 2:
            raise HTTPException(
                422,
                "Entrenamiento sin ambas clases M>=4 y M<4"
            )

    dev_train, dev = temporal_split(train, min_train=30, min_test=8)
    corte = len(dev_train)

    X_dev_train = X_train[:corte]
    X_dev = X_train[corte:]
    y_dev_train = y_train[:corte]
    y_dev = y_train[corte:]

    def candidatos():
        if algoritmo == "regresion":
            modelos = [
                (
                    "Referencia media",
                    make_pipeline(
                        SimpleImputer(strategy="median"),
                        DummyRegressor(strategy="mean")
                    )
                ),
                (
                    "Regresion lineal multiple",
                    make_pipeline(
                        SimpleImputer(strategy="median"),
                        StandardScaler(),
                        LinearRegression()
                    )
                )
            ]

            if fuente_unica:
                modelos.append((
                    "Gradient Boosting",
                    make_pipeline(
                        SimpleImputer(strategy="median"),
                        HistGradientBoostingRegressor(
                            max_iter=120,
                            learning_rate=0.05,
                            max_leaf_nodes=15,
                            l2_regularization=10,
                            random_state=42
                        )
                    )
                ))

            return modelos

        modelos = [
            (
                "Referencia mayoritaria",
                make_pipeline(
                    SimpleImputer(strategy="median"),
                    DummyClassifier(strategy="most_frequent")
                )
            )
        ]

        if len(np.unique(y_dev_train)) == 2:
            modelos.append((
                "Regresion logistica",
                make_pipeline(
                    SimpleImputer(strategy="median"),
                    StandardScaler(),
                    LogisticRegression(
                        max_iter=1000,
                        random_state=42
                    )
                )
            ))

            if fuente_unica:
                modelos.append((
                    "Logistica balanceada",
                    make_pipeline(
                        SimpleImputer(strategy="median"),
                        StandardScaler(),
                        LogisticRegression(
                            max_iter=1000,
                            class_weight="balanced",
                            random_state=42
                        )
                    )
                ))

        return modelos

    def metricas(verdad, pred):
        if algoritmo == "regresion":
            return {
                "mae": round(
                    float(mean_absolute_error(verdad, pred)), 4
                ),
                "rmse": round(
                    float(np.sqrt(
                        mean_squared_error(verdad, pred)
                    )), 4
                ),
                "r2": round(
                    float(r2_score(verdad, pred)), 4
                )
            }

        precision, recall, f1, _ = (
            precision_recall_fscore_support(
                verdad,
                pred,
                average="binary",
                zero_division=0
            )
        )

        return {
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
            "balanced_accuracy": round(
                float(balanced_accuracy_score(verdad, pred)), 4
            ),
            "matriz": confusion_matrix(
                verdad, pred, labels=[0, 1]
            ).tolist()
        }

    # Seleccion exclusivamente en el desarrollo interno.
    desarrollo = []
    hiperparametros = {}

    for nombre, modelo in candidatos():
        hiperparametros[nombre] = {
            k: parametro_json(v)
            for k, v in modelo.get_params(deep=True).items()
        }
        modelo.fit(X_dev_train, y_dev_train)
        pred = modelo.predict(X_dev)
        datos = metricas(y_dev, pred)

        criterio = (
            float(mean_absolute_error(y_dev, pred))
            if algoritmo == "regresion"
            else float(balanced_accuracy_score(y_dev, pred))
        )

        desarrollo.append({
            "modelo": nombre,
            "criterio": criterio,
            "metricas": datos
        })

    base = desarrollo[0]

    if algoritmo == "regresion":
        mejor_dev = min(
            desarrollo,
            key=lambda r: r["criterio"]
        )

        mejora = (
            (
                base["criterio"] - mejor_dev["criterio"]
            ) / base["criterio"]
            if base["criterio"] > 0
            else 0.0
        )

        mejor = (
            mejor_dev["modelo"]
            if mejora >= 0.01
            else base["modelo"]
        )

    else:
        mejor_dev = max(
            desarrollo,
            key=lambda r: r["criterio"]
        )

        mejor = (
            mejor_dev["modelo"]
            if (
                mejor_dev["criterio"]
                >= base["criterio"] + 0.03
            )
            else base["modelo"]
        )

    # Evaluacion en el bloque cronologico posterior.
    # Esta evaluacion no interviene en la seleccion.
    comparacion = []
    seleccionado = None
    estimados = None

    for nombre, modelo in candidatos():
        modelo.fit(X_train, y_train)
        pred = modelo.predict(X_test)

        datos_metricas = metricas(y_test, pred)
        if algoritmo == "clasificacion":
            probs = modelo.predict_proba(X_test)
            clases = modelo.classes_.tolist()
            p1 = probs[:, clases.index(1)] if 1 in clases else np.zeros(len(X_test))
            datos_metricas.update({
                "brier": round(float(brier_score_loss(y_test, p1)), 6),
                "log_loss": round(float(log_loss(y_test, np.column_stack((1-p1, p1)), labels=[0, 1])), 6),
            })
        comparacion.append({"modelo": nombre, **datos_metricas})

        if nombre == mejor:
            seleccionado = modelo
            estimados = pred

    if seleccionado is None:
        raise HTTPException(
            500, "No se pudo recuperar el modelo seleccionado"
        )

    salto = max(1, (len(test) + 49) // 50)
    indices = list(range(0, len(test), salto))[:50]

    serie = [
        {
            "fecha_utc": test[i]["fecha_utc"],
            "real": float(y_test[i]),
            "estimado": float(estimados[i])
        }
        for i in indices
    ]

    fuentes = {
        "entrenamiento": {
            f: sum(r.get("fuente") == f for r in train)
            for f in fuentes_train
        },
        "validacion": {
            f: sum(r.get("fuente") == f for r in test)
            for f in fuentes_test
        }
    }

    advertencia = (
        "Fuente unica y particiones cronologicas. "
        "Resultados retrospectivos, no pronosticos."
        if fuente_unica
        else
        "Dataset mixto o fuentes distintas entre entrenamiento "
        "y validacion. Los modelos avanzados quedan deshabilitados. "
        "Crear un dataset exclusivo IGP o USGS."
    )

    archivo = io.BytesIO()

    joblib.dump({
        "modelo": seleccionado,
        "variables": variables,
        "objetivo": objetivo,
        "algoritmo": algoritmo,
        "firma_dataset": dataset.signature,
        "fuente_modelo": fuente_modelo
    }, archivo)

    artefacto = archivo.getvalue()

    parametros = {
        "algoritmo": algoritmo,
        "objetivo": objetivo,
        "variables": variables,
        "split": "cronologico_seleccion_interna_con_separacion_temporal",
        "filas_desarrollo_train": corte,
        "filas_desarrollo_validacion": len(train) - corte,
        "separacion_minima_segundos": 120,
        "versiones_librerias": {name: version(name) for name in ("numpy", "scikit-learn", "joblib")},
        "python": platform.python_version(),
        "hiperparametros_candidatos": hiperparametros,
        "random_state": 42,
        "version": "SISMOIA_GOVERNANCE_ML_V3",
        "fuente_modelo": fuente_modelo
    }

    resultados = {
        "version_dataset": dataset.signature,
        "variables": variables,
        "objetivo": objetivo,
        "entrenamiento": len(train),
        "validacion": len(test),
        "rango_train_utc": [
            train[0]["fecha_utc"],
            train[-1]["fecha_utc"]
        ],
        "rango_validacion_utc": [
            test[0]["fecha_utc"],
            test[-1]["fecha_utc"]
        ],
        "comparacion": comparacion,
        "modelo_seleccionado": mejor,
        "comparacion_desarrollo": [
            {
                "modelo": r["modelo"],
                **r["metricas"]
            }
            for r in desarrollo
        ],
        "seleccion_sobre": (
            "bloque_cronologico_interno_independiente"
        ),
        "fuente_modelo": fuente_modelo,
        "fuentes": fuentes,
        "advertencia_fuentes": advertencia,
        "serie_validacion": serie,
        "evaluacion": "Retrospectiva",
        "artefacto_persistido": True,
        "despliegue_automatico": False,
        "incertidumbre": "Sin intervalo calibrado de regresion; probabilidades de clasificacion no calibradas",
        "distribucion_clases": ({"entrenamiento": np.bincount(y_train, minlength=2).tolist(), "validacion": np.bincount(y_test, minlength=2).tolist()} if algoritmo == "clasificacion" else None),
        "limitacion": (
            "Estimacion de caracteristicas de eventos observados. "
            "No permite pronosticar futuros terremotos. "
            "La validacion historica ya fue inspeccionada "
            "durante el desarrollo."
        )
    }

    return (
        parametros,
        resultados,
        artefacto,
        hashlib.sha256(artefacto).hexdigest()
    )
