import math
from collections import Counter
from statistics import median
from typing import Literal
from fastapi import APIRouter, Depends, Query
from app.access import requerir_permiso
from app.preparation import preparar

router = APIRouter(prefix="/api/v1/estimates", tags=["Estimaciones"])

def wilson95(exitos: int, total: int):
    if total < 30:
        return None
    z = 1.96
    p = exitos / total
    factor = 1 + z*z/total
    centro = (p + z*z/(2*total)) / factor
    margen = z * math.sqrt(p*(1-p)/total + z*z/(4*total*total)) / factor
    return {"inferior": round(max(0, centro-margen)*100, 2),
            "superior": round(min(1, centro+margen)*100, 2)}

@router.get("/historical")
def estimacion_historica(
    fuente: Literal["USGS", "IGP"] = "IGP",
    peru: bool = True,
    magnitud_umbral: float = Query(4.0, ge=0, le=9.9),
    usuario: dict = Depends(requerir_permiso("estimates:read"))
):
    filas = preparar(fuente, peru, 10001)
    limitado = len(filas) > 10000
    filas = filas[:10000]
    validos = [f for f in filas if f["estado_calidad"] == "VALIDO"]
    n = len(validos)
    magnitudes = [f["magnitud"] for f in validos]
    superiores = sum(m >= magnitud_umbral for m in magnitudes)
    meses = Counter(f["fecha_utc"][:7] for f in validos)
    intervalos = [
        ("Menor a 2", lambda m: m < 2),
        ("2 a 3", lambda m: 2 <= m < 3),
        ("3 a 4", lambda m: 3 <= m < 4),
        ("4 a 5", lambda m: 4 <= m < 5),
        ("5 a 6", lambda m: 5 <= m < 6),
        ("6 a 7", lambda m: 6 <= m < 7),
        ("7 o mas", lambda m: m >= 7)
    ]
    fechas = [f["fecha_utc"] for f in validos]
    return {
        "fuente": fuente, "peru": peru, "magnitud_umbral": magnitud_umbral,
        "registros_analizados": len(filas),
        "registros_validos": n,
        "registros_superiores_umbral": superiores,
        "porcentaje_observado": round(100*superiores/n, 2) if n else None,
        "intervalo_wilson_95": wilson95(superiores, n),
        "magnitud_mediana": median(magnitudes) if magnitudes else None,
        "primera_fecha_utc": min(fechas) if fechas else None,
        "ultima_fecha_utc": max(fechas) if fechas else None,
        "limite_alcanzado": limitado,
        "distribucion": [
            {"etiqueta": nombre, "cantidad": sum(criterio(m) for m in magnitudes)}
            for nombre, criterio in intervalos],
        "mensual": [{"etiqueta": mes, "cantidad": meses[mes]}
                    for mes in sorted(meses)],
        "advertencia": (
            "Porcentajes de registros observados, no probabilidades de futuros sismos. "
            "La cobertura temporal de USGS e IGP es diferente y puede ser incompleta. "
            "El intervalo de Wilson no corrige sesgos del catalogo ni registros compartidos.")
    }


# ============================================================
# ESTIMACIONES DESCRIPTIVAS DE REGISTROS OBSERVADOS
# ============================================================

from datetime import datetime, timedelta, timezone
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session
from app.database import engine
from app.models import DataSource, SeismicEvent


@router.get("/experimental")
def estimacion_experimental(
    fuente: Literal["USGS", "IGP"] = "IGP",
    peru: bool = True,
    dias: int = Query(90, ge=1, le=3650),
    magnitud_umbral: float = Query(
        4.0, ge=0, le=9.9
    ),
    usuario: dict = Depends(
        requerir_permiso("estimates:read")
    ),
):
    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(days=dias)

    condiciones = [
        DataSource.name == fuente,
        SeismicEvent.occurred_at >= desde,
        SeismicEvent.occurred_at <= ahora,
    ]

    if peru:
        condiciones.extend([
            SeismicEvent.latitude.between(-19, 1),
            SeismicEvent.longitude.between(-82, -68),
        ])

    grupo_mes = func.to_char(
        func.timezone(
            "UTC", SeismicEvent.occurred_at
        ),
        "YYYY-MM"
    )

    banda = case(
        (SeismicEvent.magnitude < 2, 0),
        (SeismicEvent.magnitude < 3, 1),
        (SeismicEvent.magnitude < 4, 2),
        (SeismicEvent.magnitude < 5, 3),
        (SeismicEvent.magnitude < 6, 4),
        (SeismicEvent.magnitude < 7, 5),
        else_=6,
    )

    with Session(engine) as db:
        resumen = db.execute(
            select(
                func.count(SeismicEvent.id),
                func.count(SeismicEvent.id).filter(
                    SeismicEvent.magnitude >=
                    magnitud_umbral
                ),
                func.percentile_cont(0.5).within_group(
                    SeismicEvent.magnitude
                ),
                func.min(SeismicEvent.occurred_at),
                func.max(SeismicEvent.occurred_at),
            )
            .select_from(SeismicEvent)
            .join(
                DataSource,
                DataSource.id == SeismicEvent.source_id
            )
            .where(*condiciones)
        ).one()

        mensual = db.execute(
            select(
                grupo_mes,
                func.count(SeismicEvent.id)
            )
            .select_from(SeismicEvent)
            .join(DataSource)
            .where(*condiciones)
            .group_by(grupo_mes)
            .order_by(grupo_mes)
        ).all()

        magnitudes = db.execute(
            select(
                banda,
                func.count(SeismicEvent.id)
            )
            .select_from(SeismicEvent)
            .join(DataSource)
            .where(*condiciones)
            .group_by(banda)
        ).all()

    total = int(resumen[0] or 0)
    superiores = int(resumen[1] or 0)

    conteos = {
        int(indice): int(cantidad)
        for indice, cantidad in magnitudes
    }

    etiquetas = [
        "Menor a 2", "2 a 2,9", "3 a 3,9",
        "4 a 4,9", "5 a 5,9",
        "6 a 6,9", "7 o más"
    ]

    def utc(valor):
        if valor is None:
            return None
        if valor.tzinfo is None:
            valor = valor.replace(tzinfo=timezone.utc)
        return valor.astimezone(
            timezone.utc
        ).isoformat()

    return {
        "modelo": "Frecuencia histórica observada",
        "version_modelo": "OBS-WILSON-1.0",
        "metodo": (
            "Proporción observada e intervalo de Wilson"
        ),
        "tipo": "Descriptivo experimental",
        "fuente": fuente,
        "zona": "Perú" if peru else "Mundo",
        "ventana_dias": dias,
        "inicio_utc": utc(desde),
        "fin_utc": utc(ahora),
        "fecha_calculo_utc": utc(ahora),
        "magnitud_umbral": magnitud_umbral,
        "total_registros": total,
        "registros_umbral": superiores,
        "porcentaje_observado": (
            round(superiores * 100 / total, 2)
            if total else None
        ),
        "intervalo_wilson_95": wilson95(
            superiores, total
        ),
        "magnitud_mediana": (
            round(float(resumen[2]), 2)
            if resumen[2] is not None else None
        ),
        "primer_evento_utc": utc(resumen[3]),
        "ultimo_evento_utc": utc(resumen[4]),
        "mensual": [
            {
                "etiqueta": mes,
                "cantidad": int(cantidad)
            }
            for mes, cantidad in mensual
        ],
        "distribucion": [
            {
                "etiqueta": etiqueta,
                "cantidad": conteos.get(i, 0)
            }
            for i, etiqueta in enumerate(etiquetas)
        ],
        "estado_revision": (
            "Sin revisión persistida"
        ),
        "dataset": (
            "Catálogo PostgreSQL de registros "
            f"{fuente}, zona {'Perú' if peru else 'Mundo'}"
        ),
        "advertencia": (
            "El porcentaje y el intervalo de Wilson "
            "describen registros históricos existentes. "
            "NO representan la probabilidad de ocurrencia "
            "de un terremoto futuro. Los intervalos no "
            "corrigen sesgos, cobertura incompleta ni "
            "cambios de detectabilidad. No existe aprobación "
            "formal de este cálculo y no se emiten "
            "alertas oficiales."
        ),
    }
