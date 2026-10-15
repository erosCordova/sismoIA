from datetime import timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/sources", tags=["Fuentes de datos"])

def fecha(valor):
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.isoformat()

@router.get("")
def listar_fuentes(usuario=Depends(requerir_permiso("sources:read"))):
    with Session(engine) as db:
        consulta = (
            select(DataSource, func.count(SeismicEvent.id),
                   func.max(SeismicEvent.occurred_at),
                   func.max(SeismicEvent.received_at))
            .outerjoin(SeismicEvent, SeismicEvent.source_id == DataSource.id)
            .group_by(DataSource.id)
            .order_by(DataSource.name)
        )
        filas = db.execute(consulta).all()
        fuentes = []
        for origen, total, ultimo_evento, ultima_recepcion in filas:
            fuentes.append({
                "id": str(origen.id),
                "nombre": origen.name,
                "organizacion": origen.organization,
                "tipo": origen.source_type,
                "estado": str(origen.status),
                "licencia": origen.license_name,
                "ultima_sincronizacion_utc": fecha(origen.last_sync_at),
                "ultimo_evento_utc": fecha(ultimo_evento),
                "ultima_recepcion_utc": fecha(ultima_recepcion),
                "registros": int(total)
            })
        return {
            "total_fuentes": len(fuentes),
            "total_registros": sum(x["registros"] for x in fuentes),
            "fuentes": fuentes,
            "observacion": "Los registros de USGS e IGP pueden referirse al mismo terremoto."
        }


# SISMOIA_SOURCE_DIAGNOSTICS_V2
from datetime import datetime, timedelta, timezone


@router.get("/diagnostics")
def diagnostico_fuentes(
    usuario=Depends(requerir_permiso("sources:read"))
):
    ahora = datetime.now(timezone.utc)
    limite_24h = ahora - timedelta(hours=24)

    def formato_fecha(valor):
        if valor is None:
            return None
        if valor.tzinfo is None:
            valor = valor.replace(tzinfo=timezone.utc)
        return valor.astimezone(timezone.utc).isoformat()

    resultado = []

    with Session(engine) as db:
        fuentes = db.scalars(
            select(DataSource).order_by(DataSource.name)
        ).all()

        for fuente in fuentes:
            latencia = func.extract(
                "epoch",
                SeismicEvent.received_at - SeismicEvent.occurred_at
            )

            fila = db.execute(
                select(
                    func.count(SeismicEvent.id),
                    func.count(SeismicEvent.id).filter(
                        SeismicEvent.received_at >= limite_24h
                    ),
                    func.max(SeismicEvent.received_at),
                    func.max(SeismicEvent.occurred_at),
                    func.avg(latencia).filter(
                        SeismicEvent.received_at >=
                        SeismicEvent.occurred_at
                    ),
                    func.count(SeismicEvent.id).filter(
                        SeismicEvent.depth_km.is_(None)
                    ),
                ).where(
                    SeismicEvent.source_id == fuente.id
                )
            ).one()

            total, recientes, ultima_recepcion, ultimo_evento, media_segundos, nulos = fila

            if ultima_recepcion is None:
                frescura = "Sin recepciones"
                antiguedad = None
            else:
                recepcion = ultima_recepcion
                if recepcion.tzinfo is None:
                    recepcion = recepcion.replace(
                        tzinfo=timezone.utc
                    )

                antiguedad = max(
                    0,
                    (ahora - recepcion).total_seconds() / 3600
                )

                frescura = (
                    "Recepción reciente"
                    if antiguedad <= 24
                    else "Sin recepción en 24 h"
                )

            resultado.append({
                "id": str(fuente.id),
                "nombre": fuente.name,
                "organizacion": fuente.organization,
                "tipo": fuente.source_type,
                "estado_configuracion": fuente.status,
                "licencia": fuente.license_name,
                "registros": int(total),
                "recibidos_24h": int(recientes),
                "ultima_recepcion_utc": formato_fecha(
                    ultima_recepcion
                ),
                "ultimo_evento_utc": formato_fecha(
                    ultimo_evento
                ),
                "ultima_sincronizacion_utc": formato_fecha(
                    fuente.last_sync_at
                ),
                "antiguedad_recepcion_horas": (
                    round(antiguedad, 2)
                    if antiguedad is not None else None
                ),
                "latencia_media_horas": (
                    round(float(media_segundos) / 3600, 2)
                    if media_segundos is not None else None
                ),
                "profundidades_faltantes": int(nulos),
                "frescura": frescura,
            })

    return {
        "fuentes": resultado,
        "total_fuentes": len(resultado),
        "total_registros": sum(
            f["registros"] for f in resultado
        ),
        "calculado_utc": ahora.isoformat(),
        "nota": (
            "La frescura se calcula desde la última recepción "
            "almacenada. No comprueba disponibilidad en vivo "
            "de las APIs externas. El estado de configuración "
            "tampoco garantiza que el conector esté operativo."
        ),
    }
