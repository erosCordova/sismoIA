import math
from collections import Counter
from statistics import mean, median
from fastapi import APIRouter, Depends, Query
from app.access import requerir_permiso
from app.preparation import preparar

router = APIRouter(prefix="/api/v1/analytics", tags=["Analisis estadistico"])

def correlacion(pares):
    if len(pares) < 3:
        return None
    mx = mean(x for x, _ in pares)
    my = mean(y for _, y in pares)
    sx = sum((x - mx) ** 2 for x, _ in pares)
    sy = sum((y - my) ** 2 for _, y in pares)
    if sx == 0 or sy == 0:
        return None
    valor = sum((x - mx) * (y - my) for x, y in pares) / math.sqrt(sx * sy)
    return round(valor, 4)

@router.get("/overview")
def resumen(
    fuente: str | None = Query(None, pattern="^(USGS|IGP)$"),
    peru: bool = False,
    usuario: dict = Depends(requerir_permiso("analytics:read"))
):
    registros = preparar(fuente, peru, 10001)
    limitado = len(registros) > 10000
    registros = registros[:10000]
    validos = [r for r in registros if r["estado_calidad"] == "VALIDO"]
    magnitudes = [r["magnitud"] for r in validos if math.isfinite(r["magnitud"])]
    pares = [(r["magnitud"], r["profundidad_km"]) for r in validos
             if r["profundidad_km"] is not None
             and math.isfinite(r["magnitud"]) and math.isfinite(r["profundidad_km"])]
    meses = Counter(r["fecha_utc"][:7] for r in validos)
    fuentes = Counter(r["fuente"] for r in registros)
    estados = Counter(r["estado_calidad"] for r in registros)

    intervalos_m = [
        ("Menor a 2", lambda m: m < 2),
        ("2 a 3", lambda m: 2 <= m < 3),
        ("3 a 4", lambda m: 3 <= m < 4),
        ("4 a 5", lambda m: 4 <= m < 5),
        ("5 a 6", lambda m: 5 <= m < 6),
        ("6 a 7", lambda m: 6 <= m < 7),
        ("7 o mas", lambda m: m >= 7)
    ]
    profundidades = [y for _, y in pares]
    intervalos_p = [
        ("Menor a 0 km", lambda p: p < 0),
        ("0 a 70 km", lambda p: 0 <= p < 70),
        ("70 a 300 km", lambda p: 70 <= p < 300),
        ("300 km o mas", lambda p: p >= 300)
    ]
    return {
        "total": len(registros),
        "validos": len(validos),
        "limitado": limitado,
        "fuentes": [{"nombre": k, "cantidad": v} for k, v in sorted(fuentes.items())],
        "calidad": dict(estados),
        "magnitud_media": round(mean(magnitudes), 3) if magnitudes else None,
        "magnitud_mediana": median(magnitudes) if magnitudes else None,
        "profundidad_mediana": median(profundidades) if profundidades else None,
        "correlacion_magnitud_profundidad": correlacion(pares),
        "pares_comparables": len(pares),
        "mensual": [{"etiqueta": k, "cantidad": meses[k]} for k in sorted(meses)],
        "magnitudes": [{"etiqueta": k, "cantidad": sum(f(v) for v in magnitudes)} for k, f in intervalos_m],
        "profundidades": [{"etiqueta": k, "cantidad": sum(f(v) for v in profundidades)} for k, f in intervalos_p],
        "nota": "Conteo de registros por fuente, no de terremotos unicos. Correlacion no implica causalidad ni capacidad predictiva."
    }
