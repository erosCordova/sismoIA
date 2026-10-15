from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, or_, cast, Float, text, bindparam
from typing import Literal
from math import isfinite
import json
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
    q: str | None = Query(None, max_length=100),
    radio_lat: float | None = Query(None, ge=-90, le=90),
    radio_lon: float | None = Query(None, ge=-180, le=180),
    radio_km: float | None = Query(None, ge=1, le=800),
    poligono: str | None = Query(None, max_length=1000),
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

    # SISMOIA_CATALOGO_GEO_V4
    if q and q.strip():
        busqueda = q.strip()
        condiciones.append(or_(
            SeismicEvent.place.ilike(f"%{busqueda}%"),
            SeismicEvent.external_id.ilike(f"%{busqueda}%")
        ))

    if any(v is not None for v in (radio_lat, radio_lon, radio_km)):
        if not all(v is not None for v in (radio_lat, radio_lon, radio_km)):
            raise HTTPException(422, "Radio incompleto")

        lat1 = func.radians(cast(SeismicEvent.latitude, Float))
        lon1 = func.radians(cast(SeismicEvent.longitude, Float))
        lat2 = func.radians(radio_lat)
        lon2 = func.radians(radio_lon)

        coseno = (
            func.sin(lat1) * func.sin(lat2)
            + func.cos(lat1) * func.cos(lat2)
            * func.cos(lon1 - lon2)
        )

        distancia_km = 6371.0088 * func.acos(
            func.least(1.0, func.greatest(-1.0, coseno))
        )
        condiciones.append(distancia_km <= radio_km)

    if poligono:
        try:
            vertices = json.loads(poligono)

            if not isinstance(vertices, list) or not 3 <= len(vertices) <= 12:
                raise ValueError()

            coordenadas = []

            for punto in vertices:
                if not isinstance(punto, list) or len(punto) != 2:
                    raise ValueError()

                lat, lon = [float(v) for v in punto]

                if not (
                    isfinite(lat) and isfinite(lon)
                    and -90 <= lat <= 90
                    and -180 <= lon <= 180
                ):
                    raise ValueError()

                coordenadas.append(f"({lon:.7f},{lat:.7f})")

            expresion = "(" + ",".join(coordenadas) + ")"

        except (ValueError, TypeError, OverflowError):
            raise HTTPException(422, "Polígono inválido")

        condiciones.append(
            text(
                "point(CAST(seismic_events.longitude AS double precision), "
                "CAST(seismic_events.latitude AS double precision)) "
                "<@ CAST(:geo_poligono AS polygon)"
            ).bindparams(
                bindparam("geo_poligono", expresion)
            )
        )

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


def listar(db, filtros, limite, desplazamiento, orden="fecha_desc"):
    base = (
        select(SeismicEvent)
        .join(DataSource, DataSource.id == SeismicEvent.source_id)
        .where(*filtros)
    )

    total = db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0

    ordenes = {
        "fecha_desc": [
            SeismicEvent.occurred_at.desc(),
            SeismicEvent.id.desc()
        ],
        "fecha_asc": [
            SeismicEvent.occurred_at.asc(),
            SeismicEvent.id.asc()
        ],
        "magnitud_desc": [
            SeismicEvent.magnitude.desc(),
            SeismicEvent.occurred_at.desc()
        ],
        "magnitud_asc": [
            SeismicEvent.magnitude.asc(),
            SeismicEvent.occurred_at.desc()
        ],
        "profundidad_desc": [
            SeismicEvent.depth_km.desc().nullslast(),
            SeismicEvent.occurred_at.desc()
        ],
    }

    consulta = (
        select(SeismicEvent, DataSource.name)
        .join(DataSource, DataSource.id == SeismicEvent.source_id)
        .where(*filtros)
        .order_by(*ordenes[orden], SeismicEvent.id.desc())
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
    orden: Literal[
        "fecha_desc", "fecha_asc",
        "magnitud_desc", "magnitud_asc",
        "profundidad_desc"
    ] = "fecha_desc",
    usuario=Depends(requerir_permiso("events:read")),
):
    with Session(engine) as db:
        return listar(db, filtros, limite, offset, orden)


@router.get("/map")
def listar_mapa(
    filtros=Depends(filtros_catalogo),
    limite: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    orden: Literal[
        "fecha_desc", "fecha_asc",
        "magnitud_desc", "magnitud_asc",
        "profundidad_desc"
    ] = "fecha_desc",
    usuario=Depends(requerir_permiso("map:read")),
):
    with Session(engine) as db:
        return listar(db, filtros, limite, offset, orden)


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
