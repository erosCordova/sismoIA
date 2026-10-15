import math
from datetime import datetime, timezone
from decimal import Decimal
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.auth import usuario_actual
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/seismic", tags=["IGP"])
IGP_URL = "https://ide.igp.gob.pe/arcgis/rest/services/monitoreocensis/SismosReportados/MapServer/0"

@router.post("/sync-igp")
def sincronizar_igp(usuario: dict = Depends(usuario_actual)):
    if "Administrador" not in usuario.get("roles", []):
        raise HTTPException(403, "No autorizado para sincronizar IGP")
    parametros = {
        "f": "json", "where": "1=1",
        "outFields": "objectid,code,fechaevento,fecha,lat,lon,magnitud,prof,ref,departamento",
        "returnGeometry": "true", "orderByFields": "fechaevento DESC",
        "resultRecordCount": 500, "outSR": 4326
    }
    try:
        with httpx.Client(timeout=60, follow_redirects=True) as cliente:
            respuesta = cliente.get(IGP_URL + "/query", params=parametros)
            respuesta.raise_for_status()
            datos = respuesta.json()
        if not isinstance(datos, dict) or "error" in datos or not isinstance(datos.get("features"), list):
            raise ValueError(str(datos.get("error", "Respuesta ArcGIS invalida")))
        registros = datos["features"]
    except (httpx.HTTPError, ValueError, KeyError) as error:
        raise HTTPException(502, f"Error consultando IGP: {error}")

    validos = {}
    descartados = 0
    for registro in registros:
        try:
            a = registro.get("attributes") or {}
            g = registro.get("geometry") or {}
            identificador = a.get("code") or a.get("objectid")
            fecha = a.get("fechaevento") or a.get("fecha")
            lat = a.get("lat") if a.get("lat") is not None else g.get("y")
            lon = a.get("lon") if a.get("lon") is not None else g.get("x")
            mag = float(a["magnitud"])
            lat, lon = float(lat), float(lon)
            if not identificador or fecha is None or not all(math.isfinite(x) for x in (lat, lon, mag)):
                raise ValueError("Campos incompletos")
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Coordenadas invalidas")
            momento = datetime.fromtimestamp(float(fecha) / 1000, timezone.utc).replace(tzinfo=None)
            profundidad = float(a["prof"]) if a.get("prof") is not None else None
            if profundidad is not None and not math.isfinite(profundidad):
                profundidad = None
            clave = "IGP-" + str(identificador)[:146]
            validos[clave] = (momento, lat, lon, mag, profundidad,
                str(a.get("ref") or a.get("departamento") or "Sismo reportado por IGP"))
        except (ValueError, TypeError, OverflowError, KeyError, AttributeError):
            descartados += 1

    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    with Session(engine) as db:
        fuente = db.scalar(select(DataSource).where(DataSource.name == "IGP"))
        if fuente is None:
            fuente = DataSource(name="IGP", organization="Instituto Geofisico del Peru",
                base_url=IGP_URL, source_type="arcgis", status="active", created_at=ahora)
            db.add(fuente)
            db.flush()
        existentes = set(db.scalars(select(SeismicEvent.external_id).where(
            SeismicEvent.source_id == fuente.id,
            SeismicEvent.external_id.in_(list(validos)))).all()) if validos else set()
        for clave, (fecha, lat, lon, magnitud, profundidad, lugar) in validos.items():
            if clave in existentes:
                continue
            db.add(SeismicEvent(source_id=fuente.id, external_id=clave,
                occurred_at=fecha, latitude=Decimal(str(lat)),
                longitude=Decimal(str(lon)), magnitude=Decimal(str(magnitud)),
                depth_km=Decimal(str(profundidad)) if profundidad is not None else None,
                magnitude_type=None, place=lugar, source_url=IGP_URL,
                received_at=ahora, review_status="reported"))
        fuente.last_sync_at = ahora
        db.commit()
    return {"fuente": "IGP", "recibidos": len(registros),
            "importados": len(validos) - len(existentes),
            "duplicados": len(existentes), "descartados": descartados}

@router.post("/sync-all")
def sincronizar_todas(usuario: dict = Depends(usuario_actual)):
    if "Administrador" not in usuario.get("roles", []):
        raise HTTPException(403, "No autorizado")
    from app.seismic import sincronizar
    usgs = sincronizar(usuario)
    igp = sincronizar_igp(usuario)
    return {"fuentes": {"USGS": usgs, "IGP": igp},
            "importados": usgs["importados"] + igp["importados"],
            "duplicados": usgs["duplicados"] + igp["duplicados"]}
