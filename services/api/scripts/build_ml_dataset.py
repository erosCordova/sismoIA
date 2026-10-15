import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.preparation import preparar

DESTINO = ROOT / "data" / "processed"
DESTINO.mkdir(parents=True, exist_ok=True)
COLUMNAS = [
    "id", "fuente", "fecha_utc", "anio", "mes", "hora_utc",
    "latitud", "longitud", "magnitud", "profundidad_km",
    "ciclo_hora_sin", "ciclo_hora_cos",
    "ciclo_mes_sin", "ciclo_mes_cos"
]
CARACTERISTICAS = COLUMNAS[6:]

registros = preparar(None, False, 10001)
if len(registros) > 10000:
    raise RuntimeError("Dataset supera 10000 filas: requiere procesamiento por lotes")

validos = sorted(
    (r for r in registros if r["estado_calidad"] == "VALIDO"),
    key=lambda r: (r["fecha_utc"], r["id"])
)
if len(validos) < 10:
    raise RuntimeError("No hay suficientes registros validos")

corte = int(len(validos) * 0.8)
while corte < len(validos) and validos[corte]["fecha_utc"] == validos[corte - 1]["fecha_utc"]:
    corte += 1
if corte >= len(validos):
    raise RuntimeError("No fue posible separar cronologicamente los registros")

entrenamiento = validos[:corte]
prueba = validos[corte:]

def guardar(nombre, filas):
    with (DESTINO / nombre).open("w", newline="", encoding="utf-8-sig") as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=COLUMNAS)
        escritor.writeheader()
        escritor.writerows({col: fila[col] for col in COLUMNAS} for fila in filas)

guardar("sismoia_entrenamiento.csv", entrenamiento)
guardar("sismoia_evaluacion.csv", prueba)

manifiesto = {
    "generado_utc": datetime.now(timezone.utc).isoformat(),
    "fuentes": dict(Counter(r["fuente"] for r in validos)),
    "analizados": len(registros),
    "validos": len(validos),
    "excluidos_por_calidad": len(registros) - len(validos),
    "entrenamiento": len(entrenamiento),
    "evaluacion": len(prueba),
    "ultima_fecha_entrenamiento": entrenamiento[-1]["fecha_utc"],
    "primera_fecha_evaluacion": prueba[0]["fecha_utc"],
    "caracteristicas_numericas": CARACTERISTICAS,
    "variable_objetivo": None,
    "uso": "Analisis exploratorio y agrupamiento; no prediccion de terremotos",
    "advertencia": "Posibles eventos compartidos entre USGS e IGP pendientes de revision"
}
(DESTINO / "sismoia_manifiesto.json").write_text(
    json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8"
)

assert set(r["id"] for r in entrenamiento).isdisjoint(r["id"] for r in prueba)
assert entrenamiento[-1]["fecha_utc"] < prueba[0]["fecha_utc"]
print("DATASET_ML=OK")
print("REGISTROS_ANALIZADOS=", len(registros))
print("REGISTROS_VALIDOS=", len(validos))
print("ENTRENAMIENTO=", len(entrenamiento))
print("EVALUACION=", len(prueba))
print("DIVISION_CRONOLOGICA=OK")
print("ARCHIVOS_GENERADOS=3")
