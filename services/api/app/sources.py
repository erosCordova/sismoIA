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
