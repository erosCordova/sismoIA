import math
from collections import Counter
from statistics import mean, median
from fastapi import APIRouter, Depends, Query
from app.access import requerir_permiso
from app.preparation import preparar

router = APIRouter(prefix="/api/v1/analytics", tags=["Analisis estadistico"])

def correlacion(pares):
    if len(pares) < 3:
        return None
    mx = mean(x for x, _ in pares)
    my = mean(y for _, y in pares)
    sx = sum((x - mx) ** 2 for x, _ in pares)
    sy = sum((y - my) ** 2 for _, y in pares)
    if sx == 0 or sy == 0:
        return None
    valor = sum((x - mx) * (y - my) for x, y in pares) / math.sqrt(sx * sy)
    return round(valor, 4)

@router.get("/overview")
def resumen(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    usuario: dict = Depends(requerir_permiso("analytics:read"))
):
    registros = preparar(fuente, peru, 10001)
    limitado = len(registros) > 10000
    registros = registros[:10000]
    validos = [r for r in registros if r["estado_calidad"] == "VALIDO"]
    magnitudes = [r["magnitud"] for r in validos if math.isfinite(r["magnitud"])]
    pares = [(r["magnitud"], r["profundidad_km"]) for r in validos
             if r["profundidad_km"] is not None
             and math.isfinite(r["magnitud"]) and math.isfinite(r["profundidad_km"])]
    meses = Counter(r["fecha_utc"][:7] for r in validos)
    fuentes = Counter(r["fuente"] for r in registros)
    estados = Counter(r["estado_calidad"] for r in registros)

    intervalos_m = [
        ("Menor a 2", lambda m: m < 2),
        ("2 a 3", lambda m: 2 <= m < 3),
        ("3 a 4", lambda m: 3 <= m < 4),
        ("4 a 5", lambda m: 4 <= m < 5),
        ("5 a 6", lambda m: 5 <= m < 6),
        ("6 a 7", lambda m: 6 <= m < 7),
        ("7 o mas", lambda m: m >= 7)
    ]
    profundidades = [y for _, y in pares]
    intervalos_p = [
        ("Menor a 0 km", lambda p: p < 0),
        ("0 a 70 km", lambda p: 0 <= p < 70),
        ("70 a 300 km", lambda p: 70 <= p < 300),
        ("300 km o mas", lambda p: p >= 300)
    ]
    return {
        "total": len(registros),
        "validos": len(validos),
        "limitado": limitado,
        "fuentes": [{"nombre": k, "cantidad": v} for k, v in sorted(fuentes.items())],
        "calidad": dict(estados),
        "magnitud_media": round(mean(magnitudes), 3) if magnitudes else None,
        "magnitud_mediana": median(magnitudes) if magnitudes else None,
        "profundidad_mediana": median(profundidades) if profundidades else None,
        "correlacion_magnitud_profundidad": correlacion(pares),
        "pares_comparables": len(pares),
        "mensual": [{"etiqueta": k, "cantidad": meses[k]} for k in sorted(meses)],
        "magnitudes": [{"etiqueta": k, "cantidad": sum(f(v) for v in magnitudes)} for k, f in intervalos_m],
        "profundidades": [{"etiqueta": k, "cantidad": sum(f(v) for v in profundidades)} for k, f in intervalos_p],
        "nota": "Conteo de registros por fuente, no de terremotos unicos. Correlacion no implica causalidad ni capacidad predictiva."
    }


# ============================================================
# SISMOIA - EXPLORADOR ESTADISTICO SOBRE POSTGRESQL
# ============================================================

from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import Float, case, cast, func, select
from sqlalchemy.orm import Session

from app.database import engine
from app.models import DataSource, SeismicEvent


def filtros_explorador(
    fuente,
    peru,
    fecha_desde,
    fecha_hasta,
    magnitud_min,
    profundidad_max,
):
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise HTTPException(
            status_code=422,
            detail="La fecha inicial supera la fecha final",
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
                fecha_hasta + timedelta(days=1),
                time.min,
                tzinfo=timezone.utc,
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

    return condiciones


@router.get("/explorer")
def explorador_estadistico(
    fuente: str | None = Query(
        None, pattern="^(USGS|IGP)$"
    ),
    peru: bool = False,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    magnitud_min: float | None = Query(
        None, ge=-2, le=10
    ),
    profundidad_max: float | None = Query(
        None, ge=0, le=750
    ),
    agrupacion: Literal["dia", "semana", "mes"] = "semana",
    usuario=Depends(requerir_permiso("analytics:read")),
):
    condiciones = filtros_explorador(
        fuente, peru, fecha_desde, fecha_hasta,
        magnitud_min, profundidad_max
    )

    union = (
        SeismicEvent.source_id == DataSource.id
    )

    periodo_sql = {
        "dia": "day",
        "semana": "week",
        "mes": "month",
    }[agrupacion]

    tiempo_utc = func.timezone(
        "UTC", SeismicEvent.occurred_at
    )

    intervalo = func.date_trunc(
        periodo_sql, tiempo_utc
    )

    magnitud_numerica = cast(
        SeismicEvent.magnitude, Float
    )

    profundidad_numerica = cast(
        SeismicEvent.depth_km, Float
    )

    escala = 3 if peru else 10

    cuadrante_lat = func.floor(
        SeismicEvent.latitude / escala
    )

    cuadrante_lon = func.floor(
        SeismicEvent.longitude / escala
    )

    with Session(engine) as db:

        estadisticas = db.execute(
            select(
                func.count(SeismicEvent.id),
                func.avg(SeismicEvent.magnitude),
                func.percentile_cont(0.5).within_group(
                    SeismicEvent.magnitude
                ),
                func.avg(SeismicEvent.depth_km),
                func.percentile_cont(0.5).within_group(
                    SeismicEvent.depth_km
                ),
                func.corr(
                    magnitud_numerica,
                    profundidad_numerica
                ),
                func.count(SeismicEvent.id).filter(
                    SeismicEvent.depth_km.is_(None)
                ),
                func.count(SeismicEvent.id).filter(
                    SeismicEvent.magnitude_type.is_(None)
                ),
                func.count(SeismicEvent.depth_km),
            )
            .select_from(SeismicEvent)
            .join(DataSource, union)
            .where(*condiciones)
        ).one()

        filas_tiempo = db.execute(
            select(
                intervalo,
                func.count(SeismicEvent.id)
            )
            .select_from(SeismicEvent)
            .join(DataSource, union)
            .where(*condiciones)
            .group_by(intervalo)
            .order_by(intervalo)
        ).all()

        tramo_magnitud = case(
            (SeismicEvent.magnitude < 2, 0),
            (SeismicEvent.magnitude < 3, 1),
            (SeismicEvent.magnitude < 4, 2),
            (SeismicEvent.magnitude < 5, 3),
            (SeismicEvent.magnitude < 6, 4),
            (SeismicEvent.magnitude < 7, 5),
            else_=6,
        )

        filas_magnitud = db.execute(
            select(
                tramo_magnitud,
                func.count(SeismicEvent.id)
            )
            .select_from(SeismicEvent)
            .join(DataSource, union)
            .where(*condiciones)
            .group_by(tramo_magnitud)
        ).all()

        tramo_profundidad = case(
            (SeismicEvent.depth_km < 0, 0),
            (SeismicEvent.depth_km < 70, 1),
            (SeismicEvent.depth_km < 300, 2),
            else_=3,
        )

        filas_profundidad = db.execute(
            select(
                tramo_profundidad,
                func.count(SeismicEvent.id)
            )
            .select_from(SeismicEvent)
            .join(DataSource, union)
            .where(
                *condiciones,
                SeismicEvent.depth_km.is_not(None)
            )
            .group_by(tramo_profundidad)
        ).all()

        filas_fuentes = db.execute(
            select(
                DataSource.name,
                func.count(SeismicEvent.id)
            )
            .select_from(SeismicEvent)
            .join(DataSource, union)
            .where(*condiciones)
            .group_by(DataSource.name)
        ).all()

        filas_zonas = db.execute(
            select(
                cuadrante_lat,
                cuadrante_lon,
                func.count(SeismicEvent.id).label("cantidad")
            )
            .select_from(SeismicEvent)
            .join(DataSource, union)
            .where(*condiciones)
            .group_by(cuadrante_lat, cuadrante_lon)
            .order_by(func.count(SeismicEvent.id).desc())
            .limit(10)
        ).all()

        filas_dispersion = db.execute(
            select(
                SeismicEvent.magnitude,
                SeismicEvent.depth_km,
                SeismicEvent.occurred_at,
                DataSource.name,
            )
            .select_from(SeismicEvent)
            .join(DataSource, union)
            .where(
                *condiciones,
                SeismicEvent.depth_km.is_not(None)
            )
            .order_by(
                SeismicEvent.occurred_at.desc()
            )
            .limit(350)
        ).all()

    magnitudes = dict(
        (int(indice), int(cantidad))
        for indice, cantidad in filas_magnitud
    )

    profundidades = dict(
        (int(indice), int(cantidad))
        for indice, cantidad in filas_profundidad
    )

    def redondear(valor):
        return (
            round(float(valor), 3)
            if valor is not None else None
        )

    return {
        "total": int(estadisticas[0] or 0),
        "magnitud_media": redondear(estadisticas[1]),
        "magnitud_mediana": redondear(estadisticas[2]),
        "profundidad_media": redondear(estadisticas[3]),
        "profundidad_mediana": redondear(estadisticas[4]),
        "correlacion": redondear(estadisticas[5]),
        "faltantes_profundidad": int(estadisticas[6] or 0),
        "faltantes_tipo_magnitud": int(estadisticas[7] or 0),
        "pares_comparables": int(estadisticas[8] or 0),
        "fecha_consulta_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "agrupacion": agrupacion,
        "serie": [
            {
                "fecha": fecha.isoformat(),
                "cantidad": int(cantidad),
            }
            for fecha, cantidad in filas_tiempo
        ],
        "magnitudes": [
            {
                "etiqueta": etiqueta,
                "cantidad": magnitudes.get(i, 0),
            }
            for i, etiqueta in enumerate([
                "Menor a 2",
                "2 a 2,9",
                "3 a 3,9",
                "4 a 4,9",
                "5 a 5,9",
                "6 a 6,9",
                "7 o más",
            ])
        ],
        "profundidades": [
            {
                "etiqueta": etiqueta,
                "cantidad": profundidades.get(i, 0),
            }
            for i, etiqueta in enumerate([
                "Menor a 0 km",
                "0 a 69,9 km",
                "70 a 299,9 km",
                "300 km o más",
            ])
        ],
        "fuentes": [
            {
                "nombre": nombre,
                "cantidad": int(cantidad),
            }
            for nombre, cantidad in filas_fuentes
        ],
        "zonas": [
            {
                "zona": (
                    f"Lat {int(lat * escala)} a "
                    f"{int((lat + 1) * escala)}°, "
                    f"Lon {int(lon * escala)} a "
                    f"{int((lon + 1) * escala)}°"
                ),
                "cantidad": int(cantidad),
            }
            for lat, lon, cantidad in filas_zonas
        ],
        "dispersion": [
            {
                "magnitud": float(magnitud),
                "profundidad": float(profundidad),
                "fecha": fecha.isoformat(),
                "fuente": nombre,
            }
            for magnitud, profundidad, fecha, nombre
            in filas_dispersion
        ],
        "nota": (
            "Las estadísticas agregadas usan todos los "
            "registros que cumplen los filtros. La dispersión "
            "muestra hasta 350 registros recientes. Las zonas "
            "son cuadrículas geográficas, no regiones "
            "administrativas. Dos fuentes pueden registrar "
            "un mismo terremoto."
        ),
    }
