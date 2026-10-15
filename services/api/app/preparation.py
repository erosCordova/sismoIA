import csv
import io
import math
from collections import Counter
from datetime import datetime, timedelta, timezone
from statistics import mean, median, quantiles
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.auth import usuario_actual
from app.database import engine
from app.models import DataSource, SeismicEvent

router = APIRouter(prefix="/api/v1/preparation", tags=["Preparacion de datos"])
MAX_FILAS = 10000

def obtener(fuente, peru, limite=MAX_FILAS):
    consulta = select(SeismicEvent, DataSource.name).join(
        DataSource, SeismicEvent.source_id == DataSource.id)
    if fuente:
        consulta = consulta.where(DataSource.name == fuente)
    if peru:
        consulta = consulta.where(
            SeismicEvent.latitude.between(-19, 1),
            SeismicEvent.longitude.between(-82, -68))
    consulta = consulta.order_by(SeismicEvent.occurred_at.desc()).limit(limite)
    with Session(engine) as db:
        return db.execute(consulta).all()

def transformar(evento, fuente):
    lat, lon = float(evento.latitude), float(evento.longitude)
    magnitud = float(evento.magnitude)
    profundidad = float(evento.depth_km) if evento.depth_km is not None else None
    fecha = evento.occurred_at
    fecha = fecha.astimezone(timezone.utc) if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)
    banderas = []
    valores = (lat, lon, magnitud)
    if not all(math.isfinite(v) for v in valores):
        banderas.append("valor_no_finito")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        banderas.append("coordenadas_fuera_de_rango")
    if not -2 <= magnitud <= 9.9:
        banderas.append("magnitud_inusual")
    if profundidad is None:
        banderas.append("profundidad_faltante")
    elif not math.isfinite(profundidad) or profundidad < -10 or profundidad > 750:
        banderas.append("profundidad_inusual")
    if fecha > datetime.now(timezone.utc) + timedelta(minutes=10):
        banderas.append("fecha_futura")
    if any(b != "profundidad_faltante" for b in banderas):
        estado = "REVISAR"
    elif banderas:
        estado = "INCOMPLETO"
    else:
        estado = "VALIDO"
    hora = fecha.hour
    mes = fecha.month
    return {
        "id": str(evento.id), "fuente": fuente,
        "fecha_utc": fecha.isoformat().replace("+00:00", "Z"),
        "anio": fecha.year, "mes": mes, "hora_utc": hora,
        "latitud": lat, "longitud": lon,
        "magnitud": magnitud, "profundidad_km": profundidad,
        "ciclo_hora_sin": round(math.sin(2 * math.pi * hora / 24), 6),
        "ciclo_hora_cos": round(math.cos(2 * math.pi * hora / 24), 6),
        "ciclo_mes_sin": round(math.sin(2 * math.pi * mes / 12), 6),
        "ciclo_mes_cos": round(math.cos(2 * math.pi * mes / 12), 6),
        "estado_calidad": estado, "banderas": banderas
    }

def preparar(fuente, peru, limite=MAX_FILAS):
    return [transformar(e, nombre) for e, nombre in obtener(fuente, peru, limite)]

def filtros(fuente, peru):
    return {"fuente": fuente, "peru": peru}

@router.get("/profile")
def perfil(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    usuario: dict = Depends(usuario_actual)
):
    filas = preparar(fuente, peru, MAX_FILAS + 1)
    limitado = len(filas) > MAX_FILAS
    filas = filas[:MAX_FILAS]
    estados = Counter(r["estado_calidad"] for r in filas)
    fuentes = Counter(r["fuente"] for r in filas)
    banderas = Counter(b for r in filas for b in r["banderas"])
    magnitudes = sorted(r["magnitud"] for r in filas if math.isfinite(r["magnitud"]))
    profundidades = sorted(r["profundidad_km"] for r in filas if r["profundidad_km"] is not None and math.isfinite(r["profundidad_km"]))
    q1, q3 = quantiles(magnitudes, n=4, method="inclusive")[0::2] if len(magnitudes) >= 2 else (None, None)
    iqr = q3 - q1 if q1 is not None else None
    intervalos = [(
        "M < 2", lambda x: x < 2),
        ("M 2-3", lambda x: 2 <= x < 3),
        ("M 3-4", lambda x: 3 <= x < 4),
        ("M 4-5", lambda x: 4 <= x < 5),
        ("M 5-6", lambda x: 5 <= x < 6),
        ("M 6-7", lambda x: 6 <= x < 7),
        ("M >= 7", lambda x: x >= 7)
    ]
    atipicos = sum(x < q1 - 1.5 * iqr or x > q3 + 1.5 * iqr for x in magnitudes) if iqr is not None else 0
    return {
        "total_analizados": len(filas),
        "limite_alcanzado": limitado,
        "por_fuente": dict(fuentes),
        "estados_calidad": dict(estados),
        "banderas": dict(banderas),
        "magnitud": {
            "media": round(mean(magnitudes), 3) if magnitudes else None,
            "mediana": median(magnitudes) if magnitudes else None,
            "q1": q1, "q3": q3, "iqr": iqr,
            "atipicos_iqr": atipicos
        },
        "profundidad": {
            "mediana": median(profundidades) if profundidades else None,
            "faltantes": banderas.get("profundidad_faltante", 0)
        },
        "distribucion_magnitudes": [
            {"intervalo": etiqueta, "cantidad": sum(criterio(x) for x in magnitudes)}
            for etiqueta, criterio in intervalos
        ]
    }

@router.get("/preview")
def vista_previa(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    solo_validos: bool = False,
    limite: int = Query(50, ge=1, le=200),
    usuario: dict = Depends(usuario_actual)
):
    filas = preparar(fuente, peru)
    if solo_validos:
        filas = [r for r in filas if r["estado_calidad"] == "VALIDO"]
    return {"total": len(filas), "registros": filas[:limite]}

@router.get("/export")
def exportar(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    solo_validos: bool = False,
    usuario: dict = Depends(usuario_actual)
):
    filas = preparar(fuente, peru)
    if solo_validos:
        filas = [r for r in filas if r["estado_calidad"] == "VALIDO"]
    salida = io.StringIO()
    columnas = list(transformar.__annotations__) if False else [
        "id", "fuente", "fecha_utc", "anio", "mes", "hora_utc",
        "latitud", "longitud", "magnitud", "profundidad_km",
        "ciclo_hora_sin", "ciclo_hora_cos", "ciclo_mes_sin", "ciclo_mes_cos",
        "estado_calidad", "banderas"
    ]
    escritor = csv.DictWriter(salida, fieldnames=columnas)
    escritor.writeheader()
    for fila in filas:
        escritor.writerow({**fila, "banderas": ";".join(fila["banderas"])})
    return Response(content="\ufeff" + salida.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=sismoia_datos_preparados.csv"})
