"""Versiones, experimentos y aprobación auditada de ML."""

import hashlib
import io
import json
import math

from collections import Counter
from datetime import date, datetime, timezone
from statistics import median
from typing import Literal
from uuid import UUID

import joblib
import numpy as np

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sklearn.dummy import (
    DummyClassifier, DummyRegressor
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import (
    LinearRegression, LogisticRegression
)
from sklearn.metrics import (
    confusion_matrix, mean_absolute_error,
    mean_squared_error, precision_recall_fscore_support,
    r2_score
)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.access import requerir_permiso
from app.database import engine
from app.governance_models import (
    DatasetVersion, ExperimentRun
)
from app.models import AuditLog
from app.preparation import obtener_dataset

router = APIRouter(
    prefix="/api/v1/governance",
    tags=["Gobierno de Machine Learning"]
)


class NuevaVersion(BaseModel):
    nombre: str = Field(
        min_length=3, max_length=120
    )
    fuente: Literal["IGP", "USGS"] | None = None
    peru: bool = True
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    solo_validos: bool = False
    imputar_profundidad: bool = True
    objetivo: Literal[
        "magnitud", "profundidad_km"
    ] = "magnitud"
    limite: int = Field(
        default=1000, ge=50, le=10000
    )


class NuevoExperimento(BaseModel):
    dataset_id: UUID
    algoritmo: Literal[
        "regresion", "clasificacion"
    ] = "regresion"


class Decision(BaseModel):
    decision: Literal["approved", "rejected"]
    motivo: str = Field(
        min_length=8, max_length=500
    )


def actor(usuario):
    return (
        UUID(str(usuario["id"]))
        if usuario.get("id")
        else None
    )


def json_canonico(datos):
    return json.dumps(
        datos,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False
    ).encode("utf-8")


def firma_snapshot(manifest, filas):
    return hashlib.sha256(
        json_canonico({
            "manifest": manifest,
            "rows": filas
        })
    ).hexdigest()


def restaurar_ceros_ciclicos(filas):
    """Recupera representaciones -0.0 normalizadas por JSONB."""
    restauradas = []
    cantidad = 0

    for fila in filas:
        copia = dict(fila)
        hora = copia.get("hora_utc")
        mes = copia.get("mes")

        if isinstance(hora, int) and isinstance(mes, int):
            valores = {
                "ciclo_hora_sin": round(
                    math.sin(2 * math.pi * hora / 24), 6
                ),
                "ciclo_hora_cos": round(
                    math.cos(2 * math.pi * hora / 24), 6
                ),
                "ciclo_mes_sin": round(
                    math.sin(2 * math.pi * mes / 12), 6
                ),
                "ciclo_mes_cos": round(
                    math.cos(2 * math.pi * mes / 12), 6
                ),
            }

            for campo, esperado in valores.items():
                actual = copia.get(campo)

                if (
                    type(actual) in (int, float)
                    and actual == 0
                    and math.copysign(1.0, float(actual)) > 0
                    and esperado == 0
                    and math.copysign(1.0, esperado) < 0
                ):
                    copia[campo] = -0.0
                    cantidad += 1

        restauradas.append(copia)

    return restauradas, cantidad


def firma_snapshot_valida(manifest, filas, firma):
    """Valida la firma original sin cambiar datos ni firmas."""
    if firma_snapshot(manifest, filas) == firma:
        return True

    reconstruidas, cantidad = restaurar_ceros_ciclicos(filas)

    return (
        cantidad > 0
        and firma_snapshot(manifest, reconstruidas) == firma
    )


def version_json(d):
    return {
        "id": str(d.id),
        "nombre": d.name,
        "firma_sha256": d.signature,
        "estado": d.status,
        "total": d.total_rows,
        "manifest": d.manifest,
        "creada_utc": d.created_at.isoformat(),
        "creada_por": (
            str(d.created_by)
            if d.created_by else None
        ),
        "revisada_utc": (
            d.reviewed_at.isoformat()
            if d.reviewed_at else None
        ),
        "revisada_por": (
            str(d.reviewed_by)
            if d.reviewed_by else None
        ),
        "motivo": d.review_note
    }


def experimento_json(e):
    return {
        "id": str(e.id),
        "dataset_id": str(e.dataset_id),
        "algoritmo": e.algorithm,
        "estado": e.status,
        "parametros": e.parameters,
        "resultados": e.results,
        "artefacto_sha256": e.artifact_sha256,
        "artefacto_bytes": len(e.artifact),
        "creada_utc": e.created_at.isoformat(),
        "creada_por": (
            str(e.created_by)
            if e.created_by else None
        ),
        "revisada_utc": (
            e.reviewed_at.isoformat()
            if e.reviewed_at else None
        ),
        "revisada_por": (
            str(e.reviewed_by)
            if e.reviewed_by else None
        ),
        "motivo": e.review_note
    }


def auditar(
    db, usuario, accion, tipo,
    identificador, antes, despues
):
    db.add(AuditLog(
        actor_id=actor(usuario),
        action=accion,
        entity_type=tipo,
        entity_id=str(identificador),
        before_json=antes,
        after_json=despues
    ))


def construir_snapshot(datos):
    if (
        datos.fecha_desde
        and datos.fecha_hasta
        and datos.fecha_desde > datos.fecha_hasta
    ):
        raise HTTPException(
            422, "La fecha inicial supera la final"
        )

    origen = obtener_dataset(
        datos.fuente,
        datos.peru,
        datos.fecha_desde,
        datos.fecha_hasta,
        limite=datos.limite + 1
    )

    limitado = len(origen) > datos.limite
    origen = origen[:datos.limite]

    estados = Counter(
        r["estado_calidad"] for r in origen
    )

    banderas = Counter(
        bandera
        for r in origen
        for bandera in r["banderas"]
    )

    filas = [
        dict(r)
        for r in origen
        if (
            not datos.solo_validos
            or r["estado_calidad"] == "VALIDO"
        )
    ]

    if datos.objetivo == "profundidad_km":
        filas = [
            r for r in filas
            if r["profundidad_km"] is not None
        ]

    filas.sort(
        key=lambda r: (
            r["fecha_utc"], r["id"]
        )
    )

    if len(filas) < 40:
        raise HTTPException(
            422,
            "Se necesitan al menos 40 filas preparadas"
        )

    corte = max(
        1,
        min(
            len(filas) - 1,
            int(len(filas) * 0.8)
        )
    )

    profundidades_train = [
        r["profundidad_km"]
        for r in filas[:corte]
        if (
            r["profundidad_km"] is not None
            and math.isfinite(r["profundidad_km"])
        )
    ]

    mediana_train = (
        median(profundidades_train)
        if profundidades_train
        else None
    )

    for i, fila in enumerate(filas):
        fila["particion"] = (
            "entrenamiento"
            if i < corte
            else "validacion"
        )

        fila["profundidad_imputada"] = False

        if (
            datos.imputar_profundidad
            and datos.objetivo != "profundidad_km"
            and fila["profundidad_km"] is None
            and mediana_train is not None
        ):
            fila["profundidad_km"] = mediana_train
            fila["profundidad_imputada"] = True

    manifest = {
        "fuente": datos.fuente,
        "peru": datos.peru,
        "fecha_desde": (
            str(datos.fecha_desde)
            if datos.fecha_desde else None
        ),
        "fecha_hasta": (
            str(datos.fecha_hasta)
            if datos.fecha_hasta else None
        ),
        "objetivo": datos.objetivo,
        "solo_validos": datos.solo_validos,
        "imputar_profundidad": (
            datos.imputar_profundidad
        ),
        "limite": datos.limite,
        "muestra_limitada": limitado,
        "total_consultado": len(origen),
        "total_seleccionado": len(filas),
        "entrenamiento": corte,
        "validacion": len(filas) - corte,
        "imputacion_calculada_solo_train": (
            mediana_train
        ),
        "estados_calidad": dict(estados),
        "banderas": dict(banderas),
        "reglas": "SISMOIA_DATASET_SNAPSHOT_V1",
        "nota": (
            "Instantánea persistente de registros "
            "observados. No representa una "
            "predicción anticipada."
        )
    }

    return (
        manifest,
        filas,
        firma_snapshot(manifest, filas)
    )


def ejecutar_experimento(dataset, algoritmo):
    objetivo = dataset.manifest["objetivo"]

    if (
        algoritmo == "clasificacion"
        and objetivo != "magnitud"
    ):
        raise HTTPException(
            422,
            "La clasificación requiere objetivo magnitud"
        )

    variables = (
        ["profundidad_km", "latitud", "longitud"]
        if objetivo == "magnitud"
        else ["magnitud", "latitud", "longitud"]
    )

    train = [
        r for r in dataset.snapshot
        if r["particion"] == "entrenamiento"
    ]

    test = [
        r for r in dataset.snapshot
        if r["particion"] == "validacion"
    ]

    if len(train) < 30 or len(test) < 8:
        raise HTTPException(
            422, "Partición temporal insuficiente"
        )

    def matriz(filas):
        return np.asarray([
            [
                float(r[v])
                if r[v] is not None
                else np.nan
                for v in variables
            ]
            for r in filas
        ], dtype=float)

    X_train = matriz(train)
    X_test = matriz(test)

    y_train = np.asarray([
        float(r[objetivo]) for r in train
    ])

    y_test = np.asarray([
        float(r[objetivo]) for r in test
    ])

    if not (
        np.all(np.isfinite(y_train))
        and np.all(np.isfinite(y_test))
    ):
        raise HTTPException(
            422, "Objetivo con valores no válidos"
        )

    if algoritmo == "regresion":
        candidatos = [
            (
                "Referencia media",
                make_pipeline(
                    SimpleImputer(strategy="median"),
                    DummyRegressor(strategy="mean")
                )
            ),
            (
                "Regresión lineal múltiple",
                make_pipeline(
                    SimpleImputer(strategy="median"),
                    StandardScaler(),
                    LinearRegression()
                )
            )
        ]

    else:
        y_train = (y_train >= 4).astype(int)
        y_test = (y_test >= 4).astype(int)

        if len(set(y_train.tolist())) != 2:
            raise HTTPException(
                422,
                "Entrenamiento sin ambas clases M>=4 y M<4"
            )

        candidatos = [
            (
                "Referencia mayoritaria",
                make_pipeline(
                    SimpleImputer(strategy="median"),
                    DummyClassifier(
                        strategy="most_frequent"
                    )
                )
            ),
            (
                "Regresión logística",
                make_pipeline(
                    SimpleImputer(strategy="median"),
                    StandardScaler(),
                    LogisticRegression(
                        max_iter=1000,
                        random_state=42
                    )
                )
            )
        ]

    comparacion = []
    modelos = {}

    for nombre, modelo in candidatos:
        modelo.fit(X_train, y_train)
        pred = modelo.predict(X_test)

        if algoritmo == "regresion":
            metricas = {
                "mae": round(
                    float(mean_absolute_error(
                        y_test, pred
                    )), 4
                ),
                "rmse": round(
                    float(np.sqrt(
                        mean_squared_error(
                            y_test, pred
                        )
                    )), 4
                ),
                "r2": round(
                    float(r2_score(
                        y_test, pred
                    )), 4
                )
            }

            criterio = metricas["mae"]

        else:
            precision, recall, f1, _ = (
                precision_recall_fscore_support(
                    y_test,
                    pred,
                    average="binary",
                    zero_division=0
                )
            )

            metricas = {
                "precision": round(
                    float(precision), 4
                ),
                "recall": round(
                    float(recall), 4
                ),
                "f1": round(float(f1), 4),
                "matriz": confusion_matrix(
                    y_test,
                    pred,
                    labels=[0, 1]
                ).tolist()
            }

            criterio = -metricas["f1"]

        comparacion.append({
            "modelo": nombre,
            **metricas,
            "_criterio": criterio
        })

        modelos[nombre] = modelo

    mejor = min(
        comparacion,
        key=lambda x: x["_criterio"]
    )["modelo"]

    for resultado in comparacion:
        resultado.pop("_criterio")

    seleccionado = modelos[mejor]
    estimados = seleccionado.predict(X_test)

    salto = max(
        1,
        (len(test) + 49) // 50
    )

    indices = list(
        range(0, len(test), salto)
    )[:50]

    serie = [
        {
            "fecha_utc": test[i]["fecha_utc"],
            "real": float(y_test[i]),
            "estimado": float(estimados[i])
        }
        for i in indices
    ]

    archivo = io.BytesIO()

    joblib.dump({
        "modelo": seleccionado,
        "variables": variables,
        "objetivo": objetivo,
        "algoritmo": algoritmo,
        "firma_dataset": dataset.signature
    }, archivo)

    artefacto = archivo.getvalue()

    parametros = {
        "algoritmo": algoritmo,
        "objetivo": objetivo,
        "variables": variables,
        "split": "cronologico_80_20",
        "random_state": 42,
        "version": "SISMOIA_GOVERNANCE_ML_V1"
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
        "serie_validacion": serie,
        "evaluacion": "Retrospectiva",
        "artefacto_persistido": True,
        "despliegue_automatico": False,
        "limitacion": (
            "Usa magnitud o profundidad observadas "
            "después de los eventos. No permite "
            "pronosticar futuros terremotos."
        )
    }

    return (
        parametros,
        resultados,
        artefacto,
        hashlib.sha256(artefacto).hexdigest()
    )


@router.get("/datasets")
def listar_datasets(
    limite: int = Query(30, ge=1, le=100),
    usuario=Depends(
        requerir_permiso("models:read")
    )
):
    with Session(engine) as db:
        items = db.scalars(
            select(DatasetVersion)
            .order_by(
                DatasetVersion.created_at.desc()
            )
            .limit(limite)
        ).all()

        return {
            "datasets": [
                version_json(x) for x in items
            ]
        }


@router.post("/datasets", status_code=201)
def registrar_dataset(
    datos: NuevaVersion,
    usuario=Depends(
        requerir_permiso("models:train")
    )
):
    manifest, filas, firma = construir_snapshot(
        datos
    )

    with Session(engine) as db:
        existente = db.scalar(
            select(DatasetVersion)
            .where(
                DatasetVersion.signature == firma
            )
        )

        if existente:
            raise HTTPException(
                409,
                "La instantánea ya existe: "
                + str(existente.id)
            )

        version = DatasetVersion(
            name=datos.nombre.strip(),
            signature=firma,
            status="pending",
            total_rows=len(filas),
            manifest=manifest,
            snapshot=filas,
            created_by=actor(usuario)
        )

        db.add(version)

        try:
            db.flush()

            auditar(
                db,
                usuario,
                "dataset.create",
                "sismo_dataset_version",
                version.id,
                None,
                {
                    "firma": firma,
                    "filas": len(filas),
                    "estado": "pending"
                }
            )

            db.commit()

        except IntegrityError:
            db.rollback()
            raise HTTPException(
                409,
                "Ya existe esa versión"
            )

        db.refresh(version)
        return version_json(version)


@router.get("/datasets/{dataset_id}")
def detalle_dataset(
    dataset_id: UUID,
    usuario=Depends(
        requerir_permiso("models:read")
    )
):
    with Session(engine) as db:
        version = db.get(
            DatasetVersion,
            dataset_id
        )

        if not version:
            raise HTTPException(
                404, "Dataset no encontrado"
            )

        if not firma_snapshot_valida(
            version.manifest,
            version.snapshot,
            version.signature
        ):
            raise HTTPException(
                409, "Firma de integridad incorrecta"
            )

        return {
            **version_json(version),
            "firma_verificada": True,
            "muestra": version.snapshot[:20]
        }


@router.post("/datasets/{dataset_id}/review")
def revisar_dataset(
    dataset_id: UUID,
    datos: Decision,
    usuario=Depends(
        requerir_permiso("users:manage")
    )
):
    with Session(engine) as db:
        version = db.get(
            DatasetVersion,
            dataset_id
        )

        if not version:
            raise HTTPException(
                404, "Dataset no encontrado"
            )

        if version.status != "pending":
            raise HTTPException(
                409, "Dataset ya revisado"
            )

        if not firma_snapshot_valida(
            version.manifest,
            version.snapshot,
            version.signature
        ):
            raise HTTPException(
                409, "Firma de integridad incorrecta"
            )

        anterior = {"estado": version.status}

        version.status = datos.decision
        version.reviewed_by = actor(usuario)
        version.reviewed_at = datetime.now(
            timezone.utc
        )
        version.review_note = datos.motivo.strip()

        auditar(
            db,
            usuario,
            "dataset.review",
            "sismo_dataset_version",
            version.id,
            anterior,
            {
                "estado": version.status,
                "motivo": version.review_note,
                "revision_propia": (
                    version.created_by == actor(usuario)
                )
            }
        )

        db.commit()
        db.refresh(version)
        return version_json(version)


@router.get("/experiments")
def listar_experimentos(
    limite: int = Query(30, ge=1, le=100),
    usuario=Depends(
        requerir_permiso("models:read")
    )
):
    with Session(engine) as db:
        items = db.scalars(
            select(ExperimentRun)
            .order_by(
                ExperimentRun.created_at.desc()
            )
            .limit(limite)
        ).all()

        return {
            "experimentos": [
                experimento_json(x) for x in items
            ]
        }


@router.post("/experiments", status_code=201)
def registrar_experimento(
    datos: NuevoExperimento,
    usuario=Depends(
        requerir_permiso("models:train")
    )
):
    with Session(engine) as db:
        version = db.get(
            DatasetVersion,
            datos.dataset_id
        )

        if not version:
            raise HTTPException(
                404, "Dataset no encontrado"
            )

        if version.status == "rejected":
            raise HTTPException(
                409, "Dataset rechazado"
            )

        if not firma_snapshot_valida(
            version.manifest,
            version.snapshot,
            version.signature
        ):
            raise HTTPException(
                409, "Dataset alterado"
            )

        params, resultados, blob, huella = (
            ejecutar_experimento(
                version,
                datos.algoritmo
            )
        )

        ejecucion = ExperimentRun(
            dataset_id=version.id,
            algorithm=datos.algoritmo,
            status="pending",
            parameters=params,
            results=resultados,
            artifact=blob,
            artifact_sha256=huella,
            created_by=actor(usuario)
        )

        db.add(ejecucion)
        db.flush()

        auditar(
            db,
            usuario,
            "ml.experiment.create",
            "sismo_ml_experiment",
            ejecucion.id,
            None,
            {
                "dataset_id": str(version.id),
                "algoritmo": datos.algoritmo,
                "artefacto_sha256": huella,
                "estado": "pending"
            }
        )

        db.commit()
        db.refresh(ejecucion)

        return experimento_json(ejecucion)


@router.post(
    "/experiments/{experiment_id}/review"
)
def revisar_experimento(
    experiment_id: UUID,
    datos: Decision,
    usuario=Depends(
        requerir_permiso("users:manage")
    )
):
    with Session(engine) as db:
        ejecucion = db.get(
            ExperimentRun,
            experiment_id
        )

        if not ejecucion:
            raise HTTPException(
                404, "Experimento no encontrado"
            )

        if ejecucion.status != "pending":
            raise HTTPException(
                409, "Experimento ya revisado"
            )

        version = db.get(
            DatasetVersion,
            ejecucion.dataset_id
        )

        if (
            datos.decision == "approved"
            and version.status != "approved"
        ):
            raise HTTPException(
                409,
                "Primero debe aprobarse el dataset"
            )

        if hashlib.sha256(
            ejecucion.artifact
        ).hexdigest() != ejecucion.artifact_sha256:
            raise HTTPException(
                409, "Artefacto alterado"
            )

        anterior = {
            "estado": ejecucion.status
        }

        ejecucion.status = datos.decision
        ejecucion.reviewed_by = actor(usuario)
        ejecucion.reviewed_at = datetime.now(
            timezone.utc
        )
        ejecucion.review_note = datos.motivo.strip()

        auditar(
            db,
            usuario,
            "ml.experiment.review",
            "sismo_ml_experiment",
            ejecucion.id,
            anterior,
            {
                "estado": ejecucion.status,
                "motivo": ejecucion.review_note,
                "revision_propia": (
                    ejecucion.created_by == actor(usuario)
                )
            }
        )

        db.commit()
        db.refresh(ejecucion)

        return experimento_json(ejecucion)
