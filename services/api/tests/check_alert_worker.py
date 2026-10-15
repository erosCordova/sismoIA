import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import seismic_worker as worker

llamadas = []

def fuente_ficticia(usuario):
    return {"recibidos": 0, "importados": 0, "duplicados": 0}

def alertas_ficticias(dias=7):
    llamadas.append(dias)
    return {"reglas_activas": 1, "eventos_evaluados": 10,
            "nuevas_alertas": 2, "consulta_limitada": False}

worker.sync_usgs = fuente_ficticia
worker.sync_igp = fuente_ficticia
worker.evaluar_registros = alertas_ficticias

resultado = worker.ejecutar()
assert resultado == 0, f"RESULTADO={resultado}"
assert llamadas == [7], f"EVALUACIONES={llamadas}"
print("SINCRONIZADOR_ALERTAS=OK")
print("PRUEBA_SIN_CAMBIOS_DE_DATOS=OK")
