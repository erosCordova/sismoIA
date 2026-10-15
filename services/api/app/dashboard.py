from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.access import requerir_permiso
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(
    prefix="/api/v1/dashboard",
    tags=["Dashboard"]
)

PERIODOS = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
}


def utc_iso(valor):
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(timezone.utc).isoformat()


def convertir_evento(evento, fuente):
    return {
        "id": str(evento.id),
        "fuente": fuente,
        "fecha_utc": utc_iso(evento.occurred_at),
        "latitud": float(evento.latitude),
        "longitud": float(evento.longitude),
        "magnitud": float(evento.magnitude),
        "profundidad_km": (
            float(evento.depth_km)
            if evento.depth_km is not None else None
        ),
        "lugar": evento.place,
        "url": evento.source_url,
    }


def numero(valor, decimales=2):
    return round(float(valor), decimales) if valor is not None else None


@router.get("/overview")
def resumen_dashboard(
    peru: bool = False,
    periodo: Literal["24h", "7d", "30d", "90d", "todos"] = "7d",
    fuente: str | None = Query(
        None, pattern="^(USGS|IGP)$"
    ),
    usuario=Depends(requerir_permiso("dashboard:read")),
):
    ahora = datetime.now(timezone.utc)
    filtros = [SeismicEvent.occurred_at <= ahora]

    if periodo != "todos":
        filtros.append(
            SeismicEvent.occurred_at >= ahora - PERIODOS[periodo]
        )

    if peru:
        filtros.extend([
            SeismicEvent.latitude.between(-19, 1),
            SeismicEvent.longitude.between(-82, -68),
        ])

    if fuente:
        filtros.append(
            SeismicEvent.source_id.in_(
                select(DataSource.id).where(
                    DataSource.name == fuente
                )
            )
        )

    with Session(engine) as db:

        latencia_segundos = func.extract(
            "epoch",
            SeismicEvent.received_at - SeismicEvent.occurred_at
        )

        resumen = db.execute(
            select(
                func.count(SeismicEvent.id),
                func.max(SeismicEvent.magnitude),
                func.avg(SeismicEvent.depth_km),
                func.percentile_cont(0.5).within_group(
                    SeismicEvent.depth_km
                ),
                func.count(SeismicEvent.depth_km),
                func.count(SeismicEvent.id).filter(
                    SeismicEvent.place.is_not(None),
                    func.length(
                        func.trim(SeismicEvent.place)
                    ) > 0,
                ),
                func.avg(latencia_segundos).filter(
                    SeismicEvent.received_at >=
                    SeismicEvent.occurred_at
                ),
            ).where(*filtros)
        ).one()

        (
            total,
            magnitud_maxima,
            profundidad_media,
            profundidad_mediana,
            profundidades_disponibles,
            lugares_disponibles,
            latencia_media,
        ) = resumen

        banda = case(
            (SeismicEvent.magnitude < 2, 0),
            (SeismicEvent.magnitude < 3, 1),
            (SeismicEvent.magnitude < 4, 2),
            (SeismicEvent.magnitude < 5, 3),
            else_=4,
        )

        filas_magnitud = db.execute(
            select(
                banda,
                func.count(SeismicEvent.id)
            )
            .where(*filtros)
            .group_by(banda)
        ).all()

        conteos_magnitud = {
            int(indice): int(cantidad)
            for indice, cantidad in filas_magnitud
        }

        etiquetas = [
            "Menos de 2",
            "2 a 2,9",
            "3 a 3,9",
            "4 a 4,9",
            "5 o más",
        ]

        magnitudes = [
            {
                "nombre": nombre,
                "cantidad": conteos_magnitud.get(indice, 0),
            }
            for indice, nombre in enumerate(etiquetas)
        ]

        if periodo == "todos":
            primera_fecha = db.scalar(
                select(
                    func.min(SeismicEvent.occurred_at)
                ).where(*filtros)
            )

            if primera_fecha is not None:
                if primera_fecha.tzinfo is None:
                    primera_fecha = primera_fecha.replace(
                        tzinfo=timezone.utc
                    )
                inicio = primera_fecha
            else:
                inicio = ahora - timedelta(days=1)
        else:
            inicio = ahora - PERIODOS[periodo]

        inicio_epoch = inicio.timestamp()
        fin_epoch = max(
            ahora.timestamp() + 1,
            inicio_epoch + 2,
        )

        intervalo = func.width_bucket(
            func.extract(
                "epoch", SeismicEvent.occurred_at
            ),
            inicio_epoch,
            fin_epoch,
            10,
        )

        filas_temporales = db.execute(
            select(
                intervalo,
                func.count(SeismicEvent.id)
            )
            .where(*filtros)
            .group_by(intervalo)
        ).all()

        conteos_tiempo = [0] * 10

        for posicion, cantidad in filas_temporales:
            indice = min(9, max(0, int(posicion) - 1))
            conteos_tiempo[indice] += int(cantidad)

        serie = [
            {
                "indice": indice,
                "cantidad": cantidad,
            }
            for indice, cantidad in enumerate(
                conteos_tiempo
            )
        ]

        consulta_eventos = (
            select(SeismicEvent, DataSource.name)
            .join(
                DataSource,
                SeismicEvent.source_id == DataSource.id
            )
            .where(*filtros)
            .order_by(
                SeismicEvent.occurred_at.desc(),
                SeismicEvent.id.desc(),
            )
            .limit(150)
        )

        filas_eventos = db.execute(
            consulta_eventos
        ).all()

        eventos_mapa = [
            convertir_evento(evento, nombre)
            for evento, nombre in filas_eventos
        ]

        consulta_sync = select(
            func.max(DataSource.last_sync_at)
        )

        if fuente:
            consulta_sync = consulta_sync.where(
                DataSource.name == fuente
            )

        ultima_sync = db.scalar(consulta_sync)

        return {
            "periodo": periodo,
            "peru": peru,
            "fuente": fuente,
            "calculado_utc": utc_iso(ahora),
            "inicio_utc": utc_iso(inicio),
            "total": int(total or 0),
            "magnitud_maxima": numero(magnitud_maxima, 1),
            "profundidad_media_km": numero(profundidad_media),
            "profundidad_mediana_km": numero(profundidad_mediana),
            "profundidades_disponibles": int(
                profundidades_disponibles or 0
            ),
            "lugares_disponibles": int(
                lugares_disponibles or 0
            ),
            "latencia_media_horas": (
                numero(float(latencia_media) / 3600)
                if latencia_media is not None else None
            ),
            "ultima_sincronizacion_utc": utc_iso(ultima_sync),
            "serie": serie,
            "magnitudes": magnitudes,
            "eventos_recientes": eventos_mapa[:5],
            "eventos_mapa": eventos_mapa,
            "mapa_limitado": int(total or 0) > 150,
            "nota": (
                "Conteos completos de registros en el periodo. "
                "USGS e IGP pueden reportar un mismo sismo. "
                "La latencia es el tiempo medio entre evento "
                "y recepción en SISMOIA, no el retardo de una alerta."
            ),
        }
