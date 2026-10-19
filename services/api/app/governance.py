from app.time_utils import utc_iso, as_utc
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

from pydantic import BaseModel, Field, ConfigDict

from sqlalchemy import select

from sqlalchemy.exc import IntegrityError

from sqlalchemy.orm import Session, defer



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
    model_config = ConfigDict(str_strip_whitespace=True)

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

        "creada_utc": utc_iso(d.created_at),

        "creada_por": (

            str(d.created_by)

            if d.created_by else None

        ),

        "revisada_utc": (

            utc_iso(d.reviewed_at)

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

        "creada_utc": utc_iso(e.created_at),

        "creada_por": (

            str(e.created_by)

            if e.created_by else None

        ),

        "revisada_utc": (

            utc_iso(e.reviewed_at)

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
    from app.ml_data import temporal_split
    if datos.fecha_desde and datos.fecha_hasta and datos.fecha_desde > datos.fecha_hasta:
        raise HTTPException(422, "La fecha inicial supera la final")
    origen = obtener_dataset(datos.fuente, datos.peru, datos.fecha_desde, datos.fecha_hasta, limite=datos.limite + 1)
    limitado = len(origen) > datos.limite
    origen = origen[:datos.limite]
    estados = Counter(r["estado_calidad"] for r in origen)
    banderas = Counter(b for r in origen for b in r["banderas"])
    filas = [dict(r) for r in origen if r["estado_calidad"] in (("VALIDO",) if datos.solo_validos else ("VALIDO", "INCOMPLETO"))]
    filas = [r for r in filas if r.get(datos.objetivo) is not None and math.isfinite(r[datos.objetivo])]
    if not datos.imputar_profundidad:
        filas = [r for r in filas if r.get("profundidad_km") is not None]
    train, test = temporal_split(filas, min_train=40, min_test=8)
    # Garantizar que tambien es viable la seleccion cronologica interna.
    temporal_split(train, min_train=30, min_test=8)
    for partition, rows in (("entrenamiento", train), ("validacion", test)):
        for row in rows:
            row["particion"] = partition
            row["profundidad_imputada"] = False
    filas = train + test
    manifest = {
        "fuente": datos.fuente, "peru": datos.peru,
        "fecha_desde": str(datos.fecha_desde) if datos.fecha_desde else None,
        "fecha_hasta": str(datos.fecha_hasta) if datos.fecha_hasta else None,
        "objetivo": datos.objetivo, "solo_validos": datos.solo_validos,
        "imputar_profundidad": datos.imputar_profundidad,
        "imputacion": "Ajustada dentro del pipeline de cada particion; snapshot conserva nulos",
        "limite": datos.limite, "muestra_limitada": limitado,
        "total_consultado": len(origen), "total_seleccionado": len(filas),
        "entrenamiento": len(train), "validacion": len(test),
        "separacion_minima_segundos": 120,
        "estados_calidad": dict(estados), "banderas": dict(banderas),
        "reglas": "SISMOIA_DATASET_SNAPSHOT_V2",
        "nota": "Instantanea persistente de eventos observados; no pronostica futuros sismos."
    }
    return manifest, filas, firma_snapshot(manifest, filas)





def ejecutar_experimento(dataset, algoritmo):

    from app.ml_engine import ejecutar_experimento_v2

    return ejecutar_experimento_v2(dataset, algoritmo)





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

            .options(defer(DatasetVersion.snapshot))

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

            .where(ExperimentRun.algorithm.in_(("regresion", "clasificacion")))

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





class EntradaEstimacion(BaseModel):

    latitud: float = Field(..., ge=-90, le=90)

    longitud: float = Field(..., ge=-180, le=180)

    profundidad_km: float | None = Field(

        default=None, ge=0, le=800

    )

    magnitud: float | None = Field(

        default=None, ge=-2, le=10

    )





@router.post("/experiments/{experiment_id}/predict")

def predecir_experimento(

    experiment_id: UUID,

    datos: EntradaEstimacion,

    usuario=Depends(requerir_permiso("models:train"))

):

    with Session(engine) as db:

        experimento = db.get(ExperimentRun, experiment_id)



        if experimento is None:

            raise HTTPException(404, "Experimento no encontrado")



        if experimento.status not in ("pending", "approved"):

            raise HTTPException(

                409, "Experimento no disponible para pruebas"

            )



        dataset = db.get(

            DatasetVersion, experimento.dataset_id

        )



        if dataset is None or dataset.status == "rejected":

            raise HTTPException(409, "Dataset no disponible")



        if not firma_snapshot_valida(

            dataset.manifest,

            dataset.snapshot,

            dataset.signature

        ):

            raise HTTPException(409, "Dataset alterado")



        artefacto = bytes(experimento.artifact)



        if (

            not artefacto

            or len(artefacto) > 20 * 1024 * 1024

            or hashlib.sha256(artefacto).hexdigest()

               != experimento.artifact_sha256

        ):

            raise HTTPException(

                409, "Integridad del modelo no valida"

            )



        parametros = experimento.parameters

        algoritmo = experimento.algorithm

        estado = experimento.status

        nombre_modelo = experimento.results.get(

            "modelo_seleccionado", "Modelo entrenado"

        )



        objetivo = parametros.get("objetivo")

        variables = parametros.get("variables")



        if objetivo not in ("magnitud", "profundidad_km"):

            raise HTTPException(409, "Objetivo no compatible")



        esperadas = (

            ["profundidad_km", "latitud", "longitud"]

            if objetivo == "magnitud"

            else ["magnitud", "latitud", "longitud"]

        )



        if variables != esperadas:

            raise HTTPException(409, "Variables incompatibles")



        if algoritmo not in ("regresion", "clasificacion"):

            raise HTTPException(409, "Algoritmo no compatible")



        if algoritmo == "clasificacion" and objetivo != "magnitud":

            raise HTTPException(

                409, "Clasificacion incompatible"

            )



        for variable in variables:

            valor = getattr(datos, variable)



            if valor is None or not math.isfinite(valor):

                raise HTTPException(

                    422, f"Falta un valor valido: {variable}"

                )



        if getattr(datos, objetivo) is not None:

            raise HTTPException(

                422,

                "No introduzcas el valor que deseas estimar"

            )



        try:

            paquete = joblib.load(io.BytesIO(artefacto))

        except Exception:

            raise HTTPException(

                409, "No fue posible cargar el modelo"

            )



        if not isinstance(paquete, dict):

            raise HTTPException(409, "Artefacto incompatible")



        if (

            paquete.get("firma_dataset") != dataset.signature

            or paquete.get("variables") != variables

            or paquete.get("objetivo") != objetivo

            or paquete.get("algoritmo") != algoritmo

        ):

            raise HTTPException(

                409, "Metadatos del modelo incompatibles"

            )



        modelo = paquete.get("modelo")



        if modelo is None or not hasattr(modelo, "predict"):

            raise HTTPException(409, "Modelo no ejecutable")



        matriz = np.asarray([[

            float(getattr(datos, variable))

            for variable in variables

        ]], dtype=float)



        try:

            prediccion = float(modelo.predict(matriz)[0])

        except Exception:

            raise HTTPException(

                409, "El modelo no pudo procesar las entradas"

            )



        if not math.isfinite(prediccion):

            raise HTTPException(409, "Resultado no valido")



        resultado = {

            "experimento_id": str(experiment_id),

            "modelo": nombre_modelo,

            "estado_modelo": estado,

            "algoritmo": algoritmo,

            "objetivo": objetivo,

            "estimacion": round(prediccion, 4),

            "categoria": None,

            "advertencia": (

                "Estimacion experimental a partir de datos "

                "observados. No pronostica futuros terremotos."

            )

        }



        if algoritmo == "clasificacion":

            clase = int(round(prediccion))



            if clase not in (0, 1):

                raise HTTPException(

                    409, "Clase predicha no valida"

                )



            resultado["categoria"] = (

                "Magnitud mayor o igual a 4"

                if clase == 1

                else "Magnitud menor de 4"

            )
            if hasattr(modelo, "predict_proba"):
                clases = modelo.classes_.tolist()
                probabilidades = modelo.predict_proba(matriz)[0]
                resultado["probabilidad_clase_positiva"] = float(probabilidades[clases.index(1)]) if 1 in clases else 0.0
                resultado["probabilidad_calibrada"] = False
                resultado["nota_probabilidad"] = "Confianza estadistica de clasificacion de un registro observado, sin calibracion validada; no es probabilidad de un futuro sismo."




        return resultado



# SISMOIA_EXPERIMENT_DELETE_V1
# Eliminacion administrativa con validacion conjunta y auditoria.
# El artefacto del modelo esta almacenado en ExperimentRun.artifact.

def _sismoia_eliminar_experimentos(ids, usuario):
    if not ids or len(ids) > 100:
        raise HTTPException(
            422,
            "Selecciona entre 1 y 100 experimentos"
        )

    if len(set(ids)) != len(ids):
        raise HTTPException(
            422,
            "La seleccion contiene experimentos duplicados"
        )

    with Session(engine) as db:
        experimentos = [
            db.get(ExperimentRun, identificador)
            for identificador in ids
        ]

        faltantes = [
            str(identificador)
            for identificador, experimento
            in zip(ids, experimentos)
            if experimento is None
        ]

        if faltantes:
            raise HTTPException(
                404,
                "Experimentos no encontrados: "
                + ", ".join(faltantes)
            )

        protegidos = [
            str(e.id)
            for e in experimentos
            if e.status not in ("pending", "rejected")
        ]

        if protegidos:
            raise HTTPException(
                409,
                "No se pueden eliminar experimentos aprobados "
                "o en estados no permitidos: "
                + ", ".join(protegidos)
            )

        eliminados = []

        for experimento in experimentos:
            anterior = {
                "id": str(experimento.id),
                "dataset_id": str(experimento.dataset_id),
                "algoritmo": experimento.algorithm,
                "estado": experimento.status,
                "artefacto_sha256": experimento.artifact_sha256,
                "artefacto_bytes": len(experimento.artifact)
            }

            auditar(
                db,
                usuario,
                "experiment.delete",
                "experiment",
                str(experimento.id),
                anterior,
                None
            )

            eliminados.append(str(experimento.id))
            db.delete(experimento)

        db.commit()

        return {
            "eliminados": len(eliminados),
            "ids": eliminados,
            "mensaje": "Experimentos eliminados y auditados"
        }


@router.delete("/experiments/{experiment_id}")
def sismoia_eliminar_experimento(
    experiment_id: UUID,
    usuario=Depends(requerir_permiso("users:manage"))
):
    return _sismoia_eliminar_experimentos(
        [experiment_id],
        usuario
    )


@router.post("/experiments/bulk-delete")
def sismoia_eliminar_experimentos_lote(
    ids: list[UUID],
    usuario=Depends(requerir_permiso("users:manage"))
):
    return _sismoia_eliminar_experimentos(ids, usuario)
