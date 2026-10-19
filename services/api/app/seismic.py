import math
import httpx
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.auth import usuario_actual
from app.time_utils import utc_iso
from app.ingestion import tracked_ingestion, store_events, origin_hash
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/seismic", tags=["Eventos sismicos"])
FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson"

def zona_peru(consulta):
    return consulta.where(SeismicEvent.latitude.between(-19, 1), SeismicEvent.longitude.between(-82, -68))

def serializar(e, origen="Desconocida"):
    return {"id": str(e.id), "fuente": origen, "external_id": e.external_id,
            "fecha_utc": utc_iso(e.occurred_at),
            "latitud": float(e.latitude), "longitud": float(e.longitude),
            "magnitud": float(e.magnitude),
            "profundidad_km": float(e.depth_km) if e.depth_km is not None else None,
            "lugar": e.place, "url": e.source_url,
            "tipo_magnitud": e.magnitude_type, "estado": e.review_status}

@router.post("/sync")
@tracked_ingestion("USGS", "US Geological Survey", FEED_URL, "geojson")
def sincronizar(usuario: dict = Depends(usuario_actual)):
    if "Administrador" not in usuario.get("roles", []):
        raise HTTPException(403, "Solo administradores pueden sincronizar fuentes")
    try:
        with httpx.Client(timeout=60, follow_redirects=True) as cliente:
            respuesta = cliente.get(FEED_URL)
            respuesta.raise_for_status()
            registros = respuesta.json()["features"]
            if not isinstance(registros, list):
                raise ValueError("Formato GeoJSON invalido")
    except (httpx.HTTPError, ValueError, KeyError) as error:
        raise HTTPException(502, f"No fue posible consultar USGS: {error}")
    ahora = datetime.now(timezone.utc)
    por_id = {str(f["id"]): f for f in registros if isinstance(f, dict) and f.get("id")}
    with Session(engine) as db:
        fuente = db.scalar(select(DataSource).where(DataSource.name == "USGS"))
        if fuente is None:
            fuente = DataSource(name="USGS", organization="US Geological Survey",
                base_url="https://earthquake.usgs.gov", source_type="geojson",
                status="active", license_name="Dominio publico USGS", created_at=ahora)
            db.add(fuente)
            db.flush()
        ids = list(por_id)
        descartados = 0
        pendientes = []
        for identificador, evento in por_id.items():
            propiedades = evento.get("properties") or {}
            coordenadas = (evento.get("geometry") or {}).get("coordinates") or []
            try:
                if len(coordenadas) < 2 or propiedades.get("mag") is None or propiedades.get("time") is None:
                    descartados += 1
                    continue
                longitud, latitud = map(float, coordenadas[:2])
                magnitud = float(propiedades["mag"])
                if not all(map(math.isfinite, (longitud, latitud, magnitud))) or not (-90 <= latitud <= 90 and -180 <= longitud <= 180):
                    descartados += 1
                    continue
                profundidad = float(coordenadas[2]) if len(coordenadas) > 2 and coordenadas[2] is not None else None
                if profundidad is not None and not math.isfinite(profundidad):
                    profundidad = None
                fecha = datetime.fromtimestamp(float(propiedades["time"]) / 1000, timezone.utc)
            except (TypeError, ValueError, OverflowError):
                descartados += 1
                continue
            pendientes.append(dict(source_id=fuente.id, external_id=identificador,
                occurred_at=fecha, latitude=Decimal(str(latitud)),
                longitude=Decimal(str(longitud)), magnitude=Decimal(str(magnitud)),
                depth_km=Decimal(str(profundidad)) if profundidad is not None else None,
                magnitude_type=str(propiedades.get("magType") or "")[:30] or None,
                place=propiedades.get("place"), source_url=propiedades.get("url"),
                received_at=ahora, review_status=str(propiedades.get("status") or "automatic")[:30], origin_hash=origin_hash(evento)))
        cambios = store_events(db, fuente, pendientes)
        fuente.last_sync_at = ahora
        fuente.status = "active"
        db.commit()
    return {"fuente": "USGS", "recibidos": len(registros),
            "importados": cambios["inserted"], "actualizados": cambios["updated"], "duplicados": cambios["unchanged"],
            "descartados": descartados, "sincronizacion_utc": utc_iso(ahora)}

@router.get("/events")
def listar_eventos(
    peru: bool = False,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    min_magnitude: float | None = Query(None, ge=-2, le=10),
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    usuario: dict = Depends(usuario_actual)
):
    with Session(engine) as db:
        consulta = select(SeismicEvent)
        if peru:
            consulta = zona_peru(consulta)
        if fuente:
            consulta = consulta.where(SeismicEvent.source_id == select(DataSource.id).where(DataSource.name == fuente).scalar_subquery())
        if min_magnitude is not None:
            consulta = consulta.where(SeismicEvent.magnitude >= Decimal(str(min_magnitude)))
        total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
        eventos = db.scalars(consulta.order_by(SeismicEvent.occurred_at.desc()).offset(offset).limit(limit)).all()
        nombres = dict(db.execute(select(DataSource.id, DataSource.name)).all())
        return {"total": total, "peru": peru, "eventos": [serializar(e, nombres.get(e.source_id, "Desconocida")) for e in eventos]}

@router.get("/stats")
def estadisticas(usuario: dict = Depends(usuario_actual)):
    with Session(engine) as db:
        total, maxima = db.execute(select(func.count(SeismicEvent.id), func.max(SeismicEvent.magnitude))).one()
        peru = db.scalar(zona_peru(select(func.count(SeismicEvent.id)))) or 0
        conteos = dict(db.execute(select(DataSource.name, func.count(SeismicEvent.id)).join(SeismicEvent, SeismicEvent.source_id == DataSource.id).group_by(DataSource.name)).all())
        ultima = db.scalar(select(func.max(DataSource.last_sync_at)))
        return {"total_eventos": total, "eventos_peru": peru,
                "magnitud_maxima": float(maxima) if maxima is not None else None,
                "ultima_sincronizacion_utc": utc_iso(ultima),
                "fuente": "USGS + IGP" if len(conteos) > 1 else next(iter(conteos), None), "eventos_por_fuente": conteos}
