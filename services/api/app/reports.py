import csv
import io
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/reports", tags=["Reportes"])
LIMITE_EXPORTACION = 10000

def filtros(dias, peru, fuente):
    ahora = datetime.now(timezone.utc)
    condiciones = [
        SeismicEvent.occurred_at >= ahora - timedelta(days=dias),
        SeismicEvent.occurred_at <= ahora
    ]
    if peru:
        condiciones += [
            SeismicEvent.latitude.between(-19, 1),
            SeismicEvent.longitude.between(-82, -68)
        ]
    if fuente:
        condiciones.append(DataSource.name == fuente)
    return condiciones

@router.get("/summary")
def resumen(
    dias: int = Query(30, ge=1, le=365),
    peru: bool = True,
    fuente: str | None = Query(None, max_length=100),
    usuario=Depends(requerir_permiso("reports:read"))
):
    condiciones = filtros(dias, peru, fuente)
    rangos = [
        "Menor a 2", "2 a 3", "3 a 4", "4 a 5",
        "5 a 6", "6 a 7", "7 o mas"
    ]
    magnitud = case(
        (SeismicEvent.magnitude < 2, rangos[0]),
        (SeismicEvent.magnitude < 3, rangos[1]),
        (SeismicEvent.magnitude < 4, rangos[2]),
        (SeismicEvent.magnitude < 5, rangos[3]),
        (SeismicEvent.magnitude < 6, rangos[4]),
        (SeismicEvent.magnitude < 7, rangos[5]),
        else_=rangos[6]
    )
    with Session(engine) as db:
        total, media, maxima, desde, hasta = db.execute(
            select(func.count(SeismicEvent.id),
                   func.avg(SeismicEvent.magnitude),
                   func.max(SeismicEvent.magnitude),
                   func.min(SeismicEvent.occurred_at),
                   func.max(SeismicEvent.occurred_at))
            .select_from(SeismicEvent).join(DataSource)
            .where(*condiciones)
        ).one()
        por_fuente = db.execute(
            select(DataSource.name, func.count(SeismicEvent.id))
            .join(SeismicEvent, SeismicEvent.source_id == DataSource.id)
            .where(*condiciones)
            .group_by(DataSource.name).order_by(DataSource.name)
        ).all()
        mes = func.to_char(SeismicEvent.occurred_at, "YYYY-MM")
        por_mes = db.execute(
            select(mes.label("mes"), func.count(SeismicEvent.id))
            .select_from(SeismicEvent).join(DataSource)
            .where(*condiciones).group_by(mes).order_by(mes)
        ).all()
        por_magnitud = dict(db.execute(
            select(magnitud, func.count(SeismicEvent.id))
            .select_from(SeismicEvent).join(DataSource)
            .where(*condiciones).group_by(magnitud)
        ).all())
    return {
        "dias": dias, "peru": peru, "fuente": fuente,
        "total": int(total),
        "magnitud_promedio": round(float(media), 2) if media is not None else None,
        "magnitud_maxima": float(maxima) if maxima is not None else None,
        "primera_fecha_utc": desde.isoformat() if desde else None,
        "ultima_fecha_utc": hasta.isoformat() if hasta else None,
        "por_fuente": [{"nombre": n, "cantidad": int(c)} for n, c in por_fuente],
        "por_mes": [{"etiqueta": m, "cantidad": int(c)} for m, c in por_mes],
        "por_magnitud": [{"etiqueta": r, "cantidad": int(por_magnitud.get(r, 0))} for r in rangos],
        "advertencia": (
            "Estadisticas descriptivas del catalogo disponible. "
            "No predicen terremotos. USGS e IGP pueden contener eventos coincidentes. "
            "El filtro Peru utiliza un rectangulo geografico aproximado.")
    }

def texto_seguro(valor):
    texto = str(valor or "")
    if texto and texto[0] in ("=", "+", "-", "@", "\t", "\r"):
        return chr(39) + texto
    return texto

@router.get("/export.csv")
def exportar(
    dias: int = Query(30, ge=1, le=365),
    peru: bool = True,
    fuente: str | None = Query(None, max_length=100),
    usuario=Depends(requerir_permiso("reports:create"))
):
    condiciones = filtros(dias, peru, fuente)
    consulta = (
        select(SeismicEvent.external_id, SeismicEvent.occurred_at,
               DataSource.name, SeismicEvent.magnitude,
               SeismicEvent.depth_km, SeismicEvent.latitude,
               SeismicEvent.longitude, SeismicEvent.place,
               SeismicEvent.source_url)
        .join(DataSource, DataSource.id == SeismicEvent.source_id)
        .where(*condiciones)
        .order_by(SeismicEvent.occurred_at.desc())
        .limit(LIMITE_EXPORTACION)
    )
    def generar():
        salida = io.StringIO()
        escritor = csv.writer(salida)
        escritor.writerow([
            "id_externo", "fecha_utc", "fuente", "magnitud",
            "profundidad_km", "latitud", "longitud", "lugar", "url_fuente"
        ])
        yield "\ufeff" + salida.getvalue()
        with Session(engine) as db:
            for fila in db.execute(consulta):
                salida.seek(0)
                salida.truncate(0)
                id_externo, fecha, origen, mag, profundidad, lat, lon, lugar, url = fila
                escritor.writerow([
                    texto_seguro(id_externo), fecha.isoformat(),
                    texto_seguro(origen), mag, profundidad, lat, lon,
                    texto_seguro(lugar), texto_seguro(url)
                ])
                yield salida.getvalue()
    return StreamingResponse(
        generar(), media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=sismoia_reporte.csv",
            "Cache-Control": "no-store"
        }
    )
