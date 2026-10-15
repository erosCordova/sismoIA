"""Laboratorio reproducible sin escrituras ni alertas oficiales."""
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
from math import isfinite
from typing import Literal
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.database import engine
from app.models import SeismicEvent, DataSource

router = APIRouter(
    prefix="/api/v1/science",
    tags=["Laboratorio científico"]
)


def utc(fecha):
    if fecha.tzinfo is None:
        return fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(timezone.utc)


def consultar(
    peru=False, fuente=None, desde=None, hasta=None,
    magnitud_min=None, profundidad_max=None,
    limite=5001
):
    if desde and hasta and desde > hasta:
        raise HTTPException(
            422, "La fecha inicial supera la final"
        )

    condiciones = []

    if peru:
        condiciones += [
            SeismicEvent.latitude.between(-19, 1),
            SeismicEvent.longitude.between(-82, -68)
        ]

    if fuente:
        condiciones.append(DataSource.name == fuente)

    if desde:
        condiciones.append(
            SeismicEvent.occurred_at >= datetime.combine(
                desde, time.min, tzinfo=timezone.utc
            )
        )

    if hasta:
        condiciones.append(
            SeismicEvent.occurred_at < datetime.combine(
                hasta + timedelta(days=1),
                time.min, tzinfo=timezone.utc
            )
        )

    if magnitud_min is not None:
        condiciones.append(
            SeismicEvent.magnitude >= magnitud_min
        )

    if profundidad_max is not None:
        condiciones.append(
            SeismicEvent.depth_km <= profundidad_max
        )

    with Session(engine) as db:
        return db.execute(
            select(SeismicEvent, DataSource.name)
            .join(
                DataSource,
                SeismicEvent.source_id == DataSource.id
            )
            .where(*condiciones)
            .order_by(
                SeismicEvent.occurred_at.desc(),
                SeismicEvent.id.desc()
            )
            .limit(limite)
        ).all()


@router.get("/analytics")
def explorar(
    peru: bool = False,
    fuente: str | None = Query(
        None, pattern="^(IGP|USGS)$"
    ),
    desde: date | None = None,
    hasta: date | None = None,
    magnitud_min: float | None = Query(
        None, ge=-2, le=10
    ),
    profundidad_max: float | None = Query(
        None, ge=0, le=750
    ),
    agrupacion: Literal[
        "dia", "semana", "mes"
    ] = "dia",
    x: Literal[
        "magnitud", "profundidad_km",
        "latitud", "longitud"
    ] = "profundidad_km",
    y: Literal[
        "magnitud", "profundidad_km",
        "latitud", "longitud"
    ] = "magnitud",
    usuario=Depends(
        requerir_permiso("analytics:read")
    )
):
    originales = consultar(
        peru, fuente, desde, hasta,
        magnitud_min, profundidad_max
    )

    limitado = len(originales) > 5000
    filas = originales[:5000]

    series = Counter()
    rangos = Counter()
    fuentes = Counter()
    faltantes = Counter()
    puntos = []
    claves = []

    for evento, nombre in filas:
        fecha = utc(evento.occurred_at)

        if agrupacion == "dia":
            periodo = fecha.date().isoformat()
        elif agrupacion == "semana":
            periodo = (
                fecha.date()
                - timedelta(days=fecha.weekday())
            ).isoformat()
        else:
            periodo = fecha.strftime("%Y-%m")

        series[periodo] += 1
        fuentes[nombre] += 1

        magnitud = float(evento.magnitude)

        rango = (
            "M < 2" if magnitud < 2
            else "M 2-3" if magnitud < 3
            else "M 3-4" if magnitud < 4
            else "M 4-5" if magnitud < 5
            else "M 5-6" if magnitud < 6
            else "M 6-7" if magnitud < 7
            else "M >= 7"
        )

        rangos[rango] += 1

        if evento.depth_km is None:
            faltantes["Profundidad"] += 1

        if not evento.place:
            faltantes["Localidad"] += 1

        if not evento.magnitude_type:
            faltantes["Tipo de magnitud"] += 1

        valores = {
            "magnitud": magnitud,
            "profundidad_km": (
                float(evento.depth_km)
                if evento.depth_km is not None
                else None
            ),
            "latitud": float(evento.latitude),
            "longitud": float(evento.longitude)
        }

        if (
            valores[x] is not None
            and valores[y] is not None
        ):
            puntos.append({
                "x": valores[x],
                "y": valores[y]
            })

        claves.append((
            str(evento.source_id),
            evento.external_id
        ))

    paso = max(1, (len(puntos) + 349) // 350)

    etiquetas = [
        "M < 2", "M 2-3", "M 3-4",
        "M 4-5", "M 5-6", "M 6-7",
        "M >= 7"
    ]

    return {
        "muestra": len(filas),
        "limite_alcanzado": limitado,
        "actualizado_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "filtros": {
            "peru": peru,
            "fuente": fuente,
            "desde": str(desde) if desde else None,
            "hasta": str(hasta) if hasta else None,
            "magnitud_min": magnitud_min,
            "profundidad_max": profundidad_max,
            "agrupacion": agrupacion,
            "x": x,
            "y": y
        },
        "serie": [
            {"periodo": k, "eventos": v}
            for k, v in sorted(series.items())
        ],
        "histograma": [
            {"rango": k, "eventos": rangos[k]}
            for k in etiquetas
        ],
        "dispersion": puntos[::paso][:350],
        "fuentes": dict(fuentes),
        "faltantes": dict(faltantes),
        "duplicados_clave_fuente": (
            len(claves) - len(set(claves))
        ),
        "nota_duplicados": (
            "Se cuentan coincidencias de fuente e ID "
            "externo; no posibles duplicados físicos "
            "entre diferentes proveedores."
        ),
        "nota": (
            "Análisis descriptivo de registros observados, "
            "no predicción de futuros terremotos."
        )
    }


@router.post("/ml/compare")
def comparar_ml(
    usuario=Depends(
        requerir_permiso("models:train")
    )
):
    import numpy as np
    from sklearn.dummy import (
        DummyRegressor, DummyClassifier
    )
    from sklearn.linear_model import (
        LinearRegression, LogisticRegression
    )
    from sklearn.metrics import (
        mean_absolute_error,
        mean_squared_error,
        r2_score,
        precision_recall_fscore_support,
        confusion_matrix
    )
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    filas = consultar(limite=3001)
    limitado = len(filas) > 3000
    filas = filas[:3000]

    filas.sort(
        key=lambda r: (
            utc(r[0].occurred_at),
            str(r[0].id)
        )
    )

    validas = []

    for e, fuente in filas:
        if e.depth_km is None:
            continue

        valores = (
            e.magnitude, e.depth_km,
            e.latitude, e.longitude
        )

        if all(isfinite(float(v)) for v in valores):
            validas.append((e, fuente))

    if len(validas) < 40:
        raise HTTPException(
            422,
            "Se necesitan al menos 40 eventos "
            "con profundidad y magnitud válidas."
        )

    X = np.array([
        [
            float(e.depth_km),
            float(e.latitude),
            float(e.longitude)
        ]
        for e, _ in validas
    ], dtype=float)

    y = np.array([
        float(e.magnitude)
        for e, _ in validas
    ], dtype=float)

    corte = max(
        1, min(
            len(validas)-1,
            int(len(validas)*0.8)
        )
    )

    X_train = X[:corte]
    X_test = X[corte:]
    y_train = y[:corte]
    y_test = y[corte:]

    modelos = [
        (
            "Referencia: media histórica",
            DummyRegressor(strategy="mean"),
            [0]
        ),
        (
            "Regresión lineal simple",
            LinearRegression(),
            [0]
        ),
        (
            "Regresión lineal múltiple",
            LinearRegression(),
            [0, 1, 2]
        )
    ]

    variables = [
        "profundidad_km",
        "latitud",
        "longitud"
    ]

    regresiones = []
    real_estimado = []

    for nombre, modelo, indices in modelos:
        modelo.fit(
            X_train[:, indices],
            y_train
        )

        prediccion = modelo.predict(
            X_test[:, indices]
        )

        regresiones.append({
            "modelo": nombre,
            "variables": [
                variables[i] for i in indices
            ],
            "mae": round(
                float(mean_absolute_error(
                    y_test, prediccion
                )), 4
            ),
            "rmse": round(
                float(np.sqrt(
                    mean_squared_error(
                        y_test, prediccion
                    )
                )), 4
            ),
            "r2": round(
                float(r2_score(
                    y_test, prediccion
                )), 4
            )
        })

        if nombre == "Regresión lineal múltiple":
            salto = max(
                1, (len(y_test) + 49) // 50
            )

            real_estimado = [
                {
                    "indice": i + corte + 1,
                    "real": round(
                        float(y_test[i]), 2
                    ),
                    "estimado": round(
                        float(prediccion[i]), 2
                    )
                }
                for i in range(
                    0, len(y_test), salto
                )
            ][:50]

    clases = (y >= 4.0).astype(int)

    clases_train = clases[:corte]
    clases_test = clases[corte:]

    clasificacion = None

    if len(set(clases_train.tolist())) == 2:
        clasificadores = [
            (
                "Referencia: clase mayoritaria",
                DummyClassifier(
                    strategy="most_frequent"
                )
            ),
            (
                "Regresión logística",
                make_pipeline(
                    StandardScaler(),
                    LogisticRegression(
                        max_iter=1000,
                        random_state=42
                    )
                )
            )
        ]

        comparaciones = []

        for nombre, modelo in clasificadores:
            modelo.fit(
                X_train, clases_train
            )

            predicho = modelo.predict(
                X_test
            )

            precision, recall, f1, _ = (
                precision_recall_fscore_support(
                    clases_test,
                    predicho,
                    average="binary",
                    zero_division=0
                )
            )

            comparaciones.append({
                "modelo": nombre,
                "precision": round(
                    float(precision), 4
                ),
                "recall": round(
                    float(recall), 4
                ),
                "f1": round(
                    float(f1), 4
                ),
                "matriz": confusion_matrix(
                    clases_test,
                    predicho,
                    labels=[0, 1]
                ).tolist()
            })

        clasificacion = {
            "clase_positiva": (
                "Evento ya reportado "
                "con magnitud >= 4"
            ),
            "comparacion": comparaciones
        }

    identificadores = [
        [
            str(e.id),
            str(e.magnitude),
            str(e.depth_km)
        ]
        for e, _ in validas
    ]

    huella = sha256(
        json.dumps(
            identificadores,
            separators=(",", ":")
        ).encode()
    ).hexdigest()

    return {
        "version_muestra": (
            "EV-" + huella[:14].upper()
        ),
        "guardado": False,
        "muestra_limitada": limitado,
        "entrenamiento": corte,
        "validacion": len(validas) - corte,
        "periodo_entrenamiento": [
            utc(validas[0][0].occurred_at).isoformat(),
            utc(validas[corte-1][0].occurred_at).isoformat()
        ],
        "periodo_validacion": [
            utc(validas[corte][0].occurred_at).isoformat(),
            utc(validas[-1][0].occurred_at).isoformat()
        ],
        "ejecutado_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "regresion": regresiones,
        "real_estimado": real_estimado,
        "clasificacion": clasificacion,
        "limitaciones": (
            "Experimento retrospectivo. Se utilizan "
            "variables observadas después del evento. "
            "No demuestra capacidad para anticipar sismos. "
            "No se guardaron modelos entrenados."
        )
    }
