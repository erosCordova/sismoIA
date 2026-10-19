import csv
import io
import math
from collections import Counter
from datetime import datetime, timedelta, timezone
from statistics import mean, median, quantiles
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.time_utils import next_utc_date
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/preparation", tags=["Preparacion de datos"])
MAX_FILAS = 10000

def obtener(fuente, peru, limite=MAX_FILAS):
    consulta = select(SeismicEvent, DataSource.name).join(
        DataSource, SeismicEvent.source_id == DataSource.id)
    if fuente:
        consulta = consulta.where(DataSource.name == fuente)
    if peru:
        consulta = consulta.where(
            SeismicEvent.latitude.between(-19, 1),
            SeismicEvent.longitude.between(-82, -68))
    consulta = consulta.order_by(SeismicEvent.occurred_at.desc()).limit(limite)
    with Session(engine) as db:
        return db.execute(consulta).all()

def transformar(evento, fuente):
    lat, lon = float(evento.latitude), float(evento.longitude)
    magnitud = float(evento.magnitude)
    profundidad = float(evento.depth_km) if evento.depth_km is not None else None
    fecha = evento.occurred_at
    fecha = fecha.astimezone(timezone.utc) if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)
    banderas = []
    valores = (lat, lon, magnitud)
    if not all(math.isfinite(v) for v in valores):
        banderas.append("valor_no_finito")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        banderas.append("coordenadas_fuera_de_rango")
    if not -2 <= magnitud <= 9.9:
        banderas.append("magnitud_inusual")
    if profundidad is None:
        banderas.append("profundidad_faltante")
    elif not math.isfinite(profundidad) or profundidad < -10 or profundidad > 750:
        banderas.append("profundidad_inusual")
    if fecha > datetime.now(timezone.utc) + timedelta(minutes=10):
        banderas.append("fecha_futura")
    if any(b != "profundidad_faltante" for b in banderas):
        estado = "REVISAR"
    elif banderas:
        estado = "INCOMPLETO"
    else:
        estado = "VALIDO"
    hora = fecha.hour
    mes = fecha.month
    return {
        "id": str(evento.id), "fuente": fuente,
        "fecha_utc": fecha.isoformat().replace("+00:00", "Z"),
        "anio": fecha.year, "mes": mes, "hora_utc": hora,
        "latitud": lat, "longitud": lon,
        "magnitud": magnitud, "profundidad_km": profundidad,
        "ciclo_hora_sin": round(math.sin(2 * math.pi * hora / 24), 6),
        "ciclo_hora_cos": round(math.cos(2 * math.pi * hora / 24), 6),
        "ciclo_mes_sin": round(math.sin(2 * math.pi * mes / 12), 6),
        "ciclo_mes_cos": round(math.cos(2 * math.pi * mes / 12), 6),
        "estado_calidad": estado, "banderas": banderas
    }

def preparar(fuente, peru, limite=MAX_FILAS):
    return [transformar(e, nombre) for e, nombre in obtener(fuente, peru, limite)]

def filtros(fuente, peru):
    return {"fuente": fuente, "peru": peru}

@router.get("/profile")
def perfil(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    usuario: dict = Depends(requerir_permiso("datasets:read"))
):
    filas = preparar(fuente, peru, MAX_FILAS + 1)
    limitado = len(filas) > MAX_FILAS
    filas = filas[:MAX_FILAS]
    estados = Counter(r["estado_calidad"] for r in filas)
    fuentes = Counter(r["fuente"] for r in filas)
    banderas = Counter(b for r in filas for b in r["banderas"])
    magnitudes = sorted(r["magnitud"] for r in filas if math.isfinite(r["magnitud"]))
    profundidades = sorted(r["profundidad_km"] for r in filas if r["profundidad_km"] is not None and math.isfinite(r["profundidad_km"]))
    q1, q3 = quantiles(magnitudes, n=4, method="inclusive")[0::2] if len(magnitudes) >= 2 else (None, None)
    iqr = q3 - q1 if q1 is not None else None
    intervalos = [(
        "M < 2", lambda x: x < 2),
        ("M 2-3", lambda x: 2 <= x < 3),
        ("M 3-4", lambda x: 3 <= x < 4),
        ("M 4-5", lambda x: 4 <= x < 5),
        ("M 5-6", lambda x: 5 <= x < 6),
        ("M 6-7", lambda x: 6 <= x < 7),
        ("M >= 7", lambda x: x >= 7)
    ]
    atipicos = sum(x < q1 - 1.5 * iqr or x > q3 + 1.5 * iqr for x in magnitudes) if iqr is not None else 0
    return {
        "total_analizados": len(filas),
        "limite_alcanzado": limitado,
        "por_fuente": dict(fuentes),
        "estados_calidad": dict(estados),
        "banderas": dict(banderas),
        "magnitud": {
            "media": round(mean(magnitudes), 3) if magnitudes else None,
            "mediana": median(magnitudes) if magnitudes else None,
            "q1": q1, "q3": q3, "iqr": iqr,
            "atipicos_iqr": atipicos
        },
        "profundidad": {
            "mediana": median(profundidades) if profundidades else None,
            "faltantes": banderas.get("profundidad_faltante", 0)
        },
        "distribucion_magnitudes": [
            {"intervalo": etiqueta, "cantidad": sum(criterio(x) for x in magnitudes)}
            for etiqueta, criterio in intervalos
        ]
    }

@router.get("/preview")
def vista_previa(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    solo_validos: bool = False,
    limite: int = Query(50, ge=1, le=200),
    usuario: dict = Depends(requerir_permiso("datasets:read"))
):
    filas = preparar(fuente, peru)
    if solo_validos:
        filas = [r for r in filas if r["estado_calidad"] == "VALIDO"]
    return {"total": len(filas), "registros": filas[:limite]}

@router.get("/export")
def exportar(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    solo_validos: bool = False,
    usuario: dict = Depends(requerir_permiso("datasets:write"))
):
    filas = preparar(fuente, peru)
    if solo_validos:
        filas = [r for r in filas if r["estado_calidad"] == "VALIDO"]
    salida = io.StringIO()
    columnas = list(transformar.__annotations__) if False else [
        "id", "fuente", "fecha_utc", "anio", "mes", "hora_utc",
        "latitud", "longitud", "magnitud", "profundidad_km",
        "ciclo_hora_sin", "ciclo_hora_cos", "ciclo_mes_sin", "ciclo_mes_cos",
        "estado_calidad", "banderas"
    ]
    escritor = csv.DictWriter(salida, fieldnames=columnas)
    escritor.writeheader()
    for fila in filas:
        escritor.writerow({**fila, "banderas": ";".join(fila["banderas"])})
    return Response(content="\ufeff" + salida.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=sismoia_datos_preparados.csv"})


# ============================================================
# SISMOIA - REPORTE REPRODUCIBLE DE PREPARACION
# ============================================================

import hashlib
import json
from datetime import date, time
from fastapi import HTTPException
from sqlalchemy import func


def condiciones_dataset(
    fuente, peru, fecha_desde, fecha_hasta
):
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise HTTPException(
            422, "La fecha inicial supera la fecha final"
        )

    condiciones = []

    if fuente:
        condiciones.append(DataSource.name == fuente)

    if peru:
        condiciones.extend([
            SeismicEvent.latitude.between(-19, 1),
            SeismicEvent.longitude.between(-82, -68),
        ])

    if fecha_desde:
        condiciones.append(
            SeismicEvent.occurred_at >= datetime.combine(
                fecha_desde, time.min, tzinfo=timezone.utc
            )
        )

    if fecha_hasta:
        condiciones.append(
            SeismicEvent.occurred_at < datetime.combine(
                next_utc_date(fecha_hasta),
                time.min, tzinfo=timezone.utc
            )
        )

    return condiciones


def obtener_dataset(
    fuente, peru, fecha_desde, fecha_hasta,
    limite=MAX_FILAS + 1
):
    condiciones = condiciones_dataset(
        fuente, peru, fecha_desde, fecha_hasta
    )

    consulta = (
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
    )

    with Session(engine) as db:
        return [
            transformar(evento, nombre)
            for evento, nombre in db.execute(consulta)
        ]


def version_consulta(
    fuente, peru, fecha_desde, fecha_hasta
):
    condiciones = condiciones_dataset(
        fuente, peru, fecha_desde, fecha_hasta
    )

    with Session(engine) as db:
        total, ultima_recepcion = db.execute(
            select(
                func.count(SeismicEvent.id),
                func.max(SeismicEvent.received_at)
            )
            .select_from(SeismicEvent)
            .join(
                DataSource,
                DataSource.id == SeismicEvent.source_id
            )
            .where(*condiciones)
        ).one()

    parametros = {
        "fuente": fuente,
        "peru": peru,
        "fecha_desde": str(fecha_desde),
        "fecha_hasta": str(fecha_hasta),
        "total": int(total),
        "ultima_recepcion": (
            ultima_recepcion.isoformat()
            if ultima_recepcion else None
        ),
        "reglas": "SISMOIA_PREPARACION_V1",
    }

    firma = hashlib.sha256(
        json.dumps(
            parametros,
            sort_keys=True
        ).encode("utf-8")
    ).hexdigest()

    return {
        "codigo": "DS-" + firma[:12].upper(),
        "firma": firma,
        "total_catalogo": int(total),
        "ultima_recepcion_utc": (
            ultima_recepcion.isoformat()
            if ultima_recepcion else None
        ),
    }


def registros_preparados(
    fuente, peru, fecha_desde, fecha_hasta,
    solo_validos, imputar_profundidad,
    objetivo
):
    filas = obtener_dataset(
        fuente, peru, fecha_desde, fecha_hasta
    )

    limitado = len(filas) > MAX_FILAS
    filas = filas[:MAX_FILAS]

    estados = Counter(
        r["estado_calidad"] for r in filas
    )

    banderas = Counter(
        bandera
        for r in filas
        for bandera in r["banderas"]
    )

    if solo_validos:
        seleccion = [
            dict(r)
            for r in filas
            if r["estado_calidad"] == "VALIDO"
        ]
    else:
        seleccion = [dict(r) for r in filas]

    if objetivo == "profundidad_km":
        seleccion = [
            r for r in seleccion
            if r["profundidad_km"] is not None
        ]

    seleccion.sort(
        key=lambda r: (r["fecha_utc"], r["id"])
    )

    corte = int(len(seleccion) * 0.8)

    if len(seleccion) >= 2:
        corte = max(1, min(
            len(seleccion) - 1, corte
        ))

    entrenamiento = seleccion[:corte]

    profundidad_entrenamiento = [
        r["profundidad_km"]
        for r in entrenamiento
        if r["profundidad_km"] is not None
        and math.isfinite(r["profundidad_km"])
    ]

    valor_imputacion = (
        median(profundidad_entrenamiento)
        if profundidad_entrenamiento
        else None
    )

    for indice, fila in enumerate(seleccion):
        fila["particion"] = (
            "entrenamiento"
            if indice < corte
            else "validacion"
        )

        fila["profundidad_imputada"] = False

        if (
            imputar_profundidad
            and objetivo != "profundidad_km"
            and fila["profundidad_km"] is None
            and valor_imputacion is not None
        ):
            fila["profundidad_km"] = valor_imputacion
            fila["profundidad_imputada"] = True

    return {
        "muestra": filas,
        "seleccion": seleccion,
        "limitado": limitado,
        "estados": dict(estados),
        "banderas": dict(banderas),
        "corte": corte,
        "imputacion": valor_imputacion,
    }


@router.get("/dataset-report")
def reporte_dataset(
    fuente: str | None = Query(
        None, pattern="^(USGS|IGP)$"
    ),
    peru: bool = False,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    solo_validos: bool = False,
    imputar_profundidad: bool = False,
    objetivo: str = Query(
        "magnitud",
        pattern="^(magnitud|profundidad_km)$"
    ),
    usuario: dict = Depends(requerir_permiso("datasets:read")),
):
    version = version_consulta(
        fuente, peru, fecha_desde, fecha_hasta
    )

    resultado = registros_preparados(
        fuente, peru, fecha_desde, fecha_hasta,
        solo_validos, imputar_profundidad,
        objetivo
    )

    muestra = resultado["muestra"]
    seleccion = resultado["seleccion"]

    magnitudes = sorted(
        r["magnitud"]
        for r in muestra
        if math.isfinite(r["magnitud"])
    )

    profundidades = sorted(
        r["profundidad_km"]
        for r in muestra
        if r["profundidad_km"] is not None
    )

    q1, q3 = (
        (
            quantiles(
                magnitudes,
                n=4,
                method="inclusive"
            )[0],
            quantiles(
                magnitudes,
                n=4,
                method="inclusive"
            )[2],
        )
        if len(magnitudes) >= 2
        else (None, None)
    )

    iqr = q3 - q1 if q1 is not None else None

    atipicos = (
        sum(
            m < q1 - 1.5 * iqr
            or m > q3 + 1.5 * iqr
            for m in magnitudes
        )
        if iqr is not None else 0
    )

    variables = [
        "latitud",
        "longitud",
        "anio",
        "mes",
        "hora_utc",
        "ciclo_hora_sin",
        "ciclo_hora_cos",
        "ciclo_mes_sin",
        "ciclo_mes_cos",
        "magnitud",
        "profundidad_km",
    ]

    features = [
        columna
        for columna in variables
        if columna != objetivo
    ]

    return {
        "version": version,
        "total_muestra": len(muestra),
        "limitado": resultado["limitado"],
        "seleccionados": len(seleccion),
        "entrenamiento": resultado["corte"],
        "validacion": (
            len(seleccion) - resultado["corte"]
        ),
        "estados": resultado["estados"],
        "banderas": resultado["banderas"],
        "objetivo": objetivo,
        "variables_entrada": features,
        "imputacion_profundidad": (
            round(resultado["imputacion"], 3)
            if imputar_profundidad
            and objetivo != "profundidad_km"
            and resultado["imputacion"] is not None
            else None
        ),
        "magnitud": {
            "media": (
                round(mean(magnitudes), 3)
                if magnitudes else None
            ),
            "mediana": (
                median(magnitudes)
                if magnitudes else None
            ),
            "q1": q1,
            "q3": q3,
            "iqr": iqr,
            "atipicos_iqr": atipicos,
        },
        "profundidad": {
            "mediana": (
                median(profundidades)
                if profundidades else None
            ),
            "faltantes": resultado[
                "banderas"
            ].get("profundidad_faltante", 0),
        },
        "reglas": [
            "Conservar registros originales",
            "Validar coordenadas geográficas",
            "Identificar magnitudes inusuales",
            "Detectar profundidades faltantes",
            "Detectar fechas futuras",
            "Marcar valores atípicos mediante IQR",
            "Ordenar cronológicamente antes de dividir",
            "Separar 80% entrenamiento y 20% validación",
            "Calcular la mediana de imputación solo con entrenamiento",
            "Excluir la variable objetivo de las variables de entrada",
        ],
        "vista_previa": seleccion[:80],
        "nota": (
            "La versión identifica el estado y los filtros de "
            "la consulta, no una copia inmutable. El perfil "
            "y CSV incluyen hasta 10.000 filas recientes. "
            "No se entrena ningún modelo ni se alteran "
            "registros originales."
        ),
    }


@router.get("/dataset-export")
def exportar_dataset(
    fuente: str | None = Query(
        None, pattern="^(USGS|IGP)$"
    ),
    peru: bool = False,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    solo_validos: bool = False,
    imputar_profundidad: bool = False,
    objetivo: str = Query(
        "magnitud",
        pattern="^(magnitud|profundidad_km)$"
    ),
    usuario: dict = Depends(requerir_permiso("datasets:write")),
):
    datos = registros_preparados(
        fuente, peru, fecha_desde, fecha_hasta,
        solo_validos, imputar_profundidad,
        objetivo
    )

    columnas = [
        "id", "fuente", "fecha_utc",
        "latitud", "longitud",
        "magnitud", "profundidad_km",
        "anio", "mes", "hora_utc",
        "ciclo_hora_sin", "ciclo_hora_cos",
        "ciclo_mes_sin", "ciclo_mes_cos",
        "estado_calidad",
        "particion", "profundidad_imputada",
        "banderas",
    ]

    salida = io.StringIO()

    escritor = csv.DictWriter(
        salida,
        fieldnames=columnas,
        extrasaction="ignore"
    )

    escritor.writeheader()

    for fila in datos["seleccion"]:
        escritor.writerow({
            **fila,
            "banderas": ";".join(fila["banderas"]),
        })

    return Response(
        content="\ufeff" + salida.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition":
                "attachment; filename=sismoia_dataset_ml.csv"
        }
    )
