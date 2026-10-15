import math
from collections import Counter
from statistics import median
from typing import Literal
from fastapi import APIRouter, Depends, Query
from app.access import requerir_permiso
from app.preparation import preparar

router = APIRouter(prefix="/api/v1/estimates", tags=["Estimaciones"])

def wilson95(exitos: int, total: int):
    if total < 30:
        return None
    z = 1.96
    p = exitos / total
    factor = 1 + z*z/total
    centro = (p + z*z/(2*total)) / factor
    margen = z * math.sqrt(p*(1-p)/total + z*z/(4*total*total)) / factor
    return {"inferior": round(max(0, centro-margen)*100, 2),
            "superior": round(min(1, centro+margen)*100, 2)}

@router.get("/historical")
def estimacion_historica(
    fuente: Literal["USGS", "IGP"] = "IGP",
    peru: bool = True,
    magnitud_umbral: float = Query(4.0, ge=0, le=9.9),
    usuario: dict = Depends(requerir_permiso("estimates:read"))
):
    filas = preparar(fuente, peru, 10001)
    limitado = len(filas) > 10000
    filas = filas[:10000]
    validos = [f for f in filas if f["estado_calidad"] == "VALIDO"]
    n = len(validos)
    magnitudes = [f["magnitud"] for f in validos]
    superiores = sum(m >= magnitud_umbral for m in magnitudes)
    meses = Counter(f["fecha_utc"][:7] for f in validos)
    intervalos = [
        ("Menor a 2", lambda m: m < 2),
        ("2 a 3", lambda m: 2 <= m < 3),
        ("3 a 4", lambda m: 3 <= m < 4),
        ("4 a 5", lambda m: 4 <= m < 5),
        ("5 a 6", lambda m: 5 <= m < 6),
        ("6 a 7", lambda m: 6 <= m < 7),
        ("7 o mas", lambda m: m >= 7)
    ]
    fechas = [f["fecha_utc"] for f in validos]
    return {
        "fuente": fuente, "peru": peru, "magnitud_umbral": magnitud_umbral,
        "registros_analizados": len(filas),
        "registros_validos": n,
        "registros_superiores_umbral": superiores,
        "porcentaje_observado": round(100*superiores/n, 2) if n else None,
        "intervalo_wilson_95": wilson95(superiores, n),
        "magnitud_mediana": median(magnitudes) if magnitudes else None,
        "primera_fecha_utc": min(fechas) if fechas else None,
        "ultima_fecha_utc": max(fechas) if fechas else None,
        "limite_alcanzado": limitado,
        "distribucion": [
            {"etiqueta": nombre, "cantidad": sum(criterio(m) for m in magnitudes)}
            for nombre, criterio in intervalos],
        "mensual": [{"etiqueta": mes, "cantidad": meses[mes]}
                    for mes in sorted(meses)],
        "advertencia": (
            "Porcentajes de registros observados, no probabilidades de futuros sismos. "
            "La cobertura temporal de USGS e IGP es diferente y puede ser incompleta. "
            "El intervalo de Wilson no corrige sesgos del catalogo ni registros compartidos.")
    }
