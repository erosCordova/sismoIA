import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, aliased
from app.access import requerir_permiso
from app.time_utils import utc_iso
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/seismic/quality", tags=["Calidad sismica"])

def distancia_km(lat1, lon1, lat2, lon2):
    a, b, c, d = map(math.radians, (lat1, lon1, lat2, lon2))
    x = math.sin((c-a)/2)**2 + math.cos(a)*math.cos(c)*math.sin((d-b)/2)**2
    return 12742 * math.asin(min(1.0, math.sqrt(max(0.0, x))))

@router.get("/possible-duplicates")
def posibles_duplicados(
    dias: int = Query(90, ge=1, le=365),
    limite: int = Query(10, ge=1, le=100),
    usuario: dict = Depends(requerir_permiso("datasets:read"))
):
    u = aliased(SeismicEvent)
    i = aliased(SeismicEvent)
    fu = aliased(DataSource)
    fi = aliased(DataSource)
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    with Session(engine) as db:
        consulta = (
            select(
                u.id.label("uid"), i.id.label("iid"),
                u.occurred_at.label("uf"), i.occurred_at.label("ifecha"),
                u.latitude.label("ulat"), u.longitude.label("ulon"),
                i.latitude.label("ilat"), i.longitude.label("ilon"),
                u.magnitude.label("umag"), i.magnitude.label("imag")
            )
            .select_from(u)
            .join(i, and_(
                func.abs(func.extract("epoch", u.occurred_at - i.occurred_at)) <= 180,
                func.abs(u.latitude - i.latitude) <= Decimal("0.6"),
                func.abs(u.longitude - i.longitude) <= Decimal("0.6"),
                func.abs(u.magnitude - i.magnitude) <= Decimal("0.6")
            ))
            .join(fu, fu.id == u.source_id)
            .join(fi, fi.id == i.source_id)
            .where(fu.name == "USGS", fi.name == "IGP",
                   u.occurred_at >= desde, i.occurred_at >= desde)
            .order_by(i.occurred_at.desc())
            .limit(3001)
        )
        filas = db.execute(consulta).all()

    propuestas = []
    for r in filas[:3000]:
        tiempo = abs((r.uf - r.ifecha).total_seconds())
        distancia = distancia_km(float(r.ulat), float(r.ulon), float(r.ilat), float(r.ilon))
        diferencia_mag = abs(float(r.umag) - float(r.imag))
        if distancia > 50 or diferencia_mag > 0.6:
            continue
        propuestas.append({
            "usgs_id": str(r.uid), "igp_id": str(r.iid),
            "fecha_usgs_utc": utc_iso(r.uf),
            "fecha_igp_utc": utc_iso(r.ifecha),
            "diferencia_segundos": round(tiempo, 1),
            "distancia_km": round(distancia, 2),
            "diferencia_magnitud": round(diferencia_mag, 2),
            "magnitud_usgs": float(r.umag),
            "magnitud_igp": float(r.imag)
        })

    propuestas.sort(key=lambda e: (
        e["diferencia_segundos"], e["distancia_km"], e["diferencia_magnitud"]))
    usados_usgs, usados_igp, coincidencias = set(), set(), []
    for p in propuestas:
        if p["usgs_id"] in usados_usgs or p["igp_id"] in usados_igp:
            continue
        usados_usgs.add(p["usgs_id"])
        usados_igp.add(p["igp_id"])
        coincidencias.append(p)

    return {
        "ventana_dias": dias,
        "coincidencias_probables": len(coincidencias),
        "analisis_parcial": len(filas) > 3000,
        "criterios": {"tiempo_max_segundos": 180,
                     "distancia_max_km": 50, "diferencia_magnitud_max": 0.6},
        "muestra": coincidencias[:limite],
        "advertencia": "Coincidencias aproximadas; requieren validacion cientifica. No se eliminaron registros."
    }
