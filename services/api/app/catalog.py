from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.access import requerir_permiso
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/catalog", tags=["Catálogo sísmico"])


def fecha_utc(valor):
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(timezone.utc).isoformat()


def filtros_catalogo(
    peru: bool = False,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    min_magnitude: float | None = Query(None, ge=-2, le=10),
    max_magnitude: float | None = Query(None, ge=-2, le=10),
    min_depth: float | None = Query(None, ge=0, le=750),
    max_depth: float | None = Query(None, ge=0, le=750),
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    lat_min: float | None = Query(None, ge=-90, le=90),
    lat_max: float | None = Query(None, ge=-90, le=90),
    lon_min: float | None = Query(None, ge=-180, le=180),
    lon_max: float | None = Query(None, ge=-180, le=180),
):
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise HTTPException(422, "La fecha inicial supera la final")

    for minimo, maximo, nombre in [
        (min_magnitude, max_magnitude, "magnitud"),
        (min_depth, max_depth, "profundidad"),
        (lat_min, lat_max, "latitud"),
        (lon_min, lon_max, "longitud"),
    ]:
        if minimo is not None and maximo is not None and minimo > maximo:
            raise HTTPException(422, f"Rango de {nombre} inválido")

    condiciones = []

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

    if min_magnitude is not None:
        condiciones.append(SeismicEvent.magnitude >= min_magnitude)

    if max_magnitude is not None:
        condiciones.append(SeismicEvent.magnitude <= max_magnitude)

    if min_depth is not None:
        condiciones.append(SeismicEvent.depth_km >= min_depth)

    if max_depth is not None:
        condiciones.append(SeismicEvent.depth_km <= max_depth)

    if fuente:
        condiciones.append(DataSource.name == fuente)

    if lat_min is not None:
        condiciones.append(SeismicEvent.latitude >= lat_min)
    if lat_max is not None:
        condiciones.append(SeismicEvent.latitude <= lat_max)
    if lon_min is not None:
        condiciones.append(SeismicEvent.longitude >= lon_min)
    if lon_max is not None:
        condiciones.append(SeismicEvent.longitude <= lon_max)

    return condiciones


def evento_json(e, fuente):
    return {
        "id": str(e.id),
        "id_externo": e.external_id,
        "fuente": fuente,
        "fecha_utc": fecha_utc(e.occurred_at),
        "latitud": float(e.latitude),
        "longitud": float(e.longitude),
        "magnitud": float(e.magnitude),
        "tipo_magnitud": e.magnitude_type,
        "profundidad_km": (
            float(e.depth_km) if e.depth_km is not None else None
        ),
        "lugar": e.place,
        "estado_revision": e.review_status,
        "url": e.source_url,
        "fecha_recepcion_utc": fecha_utc(e.received_at),
    }


def listar(db, filtros, limite, desplazamiento):
    base = (
        select(SeismicEvent)
        .join(DataSource, DataSource.id == SeismicEvent.source_id)
        .where(*filtros)
    )

    total = db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0

    consulta = (
        select(SeismicEvent, DataSource.name)
        .join(DataSource, DataSource.id == SeismicEvent.source_id)
        .where(*filtros)
        .order_by(
            SeismicEvent.occurred_at.desc(),
            SeismicEvent.id.desc(),
        )
        .offset(desplazamiento)
        .limit(limite)
    )

    filas = db.execute(consulta).all()

    return {
        "total": int(total),
        "limite": limite,
        "offset": desplazamiento,
        "consultado_utc": datetime.now(timezone.utc).isoformat(),
        "eventos": [
            evento_json(evento, nombre)
            for evento, nombre in filas
        ],
    }


@router.get("/events")
def listar_eventos(
    filtros=Depends(filtros_catalogo),
    limite: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    usuario=Depends(requerir_permiso("events:read")),
):
    with Session(engine) as db:
        return listar(db, filtros, limite, offset)


@router.get("/map")
def listar_mapa(
    filtros=Depends(filtros_catalogo),
    limite: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    usuario=Depends(requerir_permiso("map:read")),
):
    with Session(engine) as db:
        return listar(db, filtros, limite, offset)


def detalle_evento(evento_id):
    with Session(engine) as db:
        fila = db.execute(
            select(SeismicEvent, DataSource)
            .join(DataSource, DataSource.id == SeismicEvent.source_id)
            .where(SeismicEvent.id == evento_id)
        ).first()

        if not fila:
            raise HTTPException(404, "Evento no encontrado")

        evento, fuente = fila
        resultado = evento_json(evento, fuente.name)

        resultado.update({
            "fuente_organizacion": fuente.organization,
            "fuente_url": fuente.base_url,
            "region": None,
            "huella_origen_calculada": sha256(
                f"{fuente.name}:{evento.external_id}".encode()
            ).hexdigest(),
        })

        return resultado


@router.get("/events/{evento_id}")
def detalle_desde_eventos(
    evento_id: UUID,
    usuario=Depends(requerir_permiso("events:read")),
):
    return detalle_evento(evento_id)


@router.get("/map/{evento_id}")
def detalle_desde_mapa(
    evento_id: UUID,
    usuario=Depends(requerir_permiso("map:read")),
):
    return detalle_evento(evento_id)
