import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import sys
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import engine
from app.seismic import sincronizar as sync_usgs
from app.igp import sincronizar_igp as sync_igp
from app.alerts import evaluar_registros

LOCK_ID = 20261014

def registrar(**datos):
    datos["fecha_utc"] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(datos, ensure_ascii=False), flush=True)

def ejecutar():
    errores = 0
    with engine.connect() as conexion:
        bloqueo = conexion.execute(
            text("SELECT pg_try_advisory_lock(:clave)"),
            {"clave": LOCK_ID}
        ).scalar()
        if not bloqueo:
            registrar(estado="OMITIDO", motivo="Otra sincronización está ejecutándose")
            return 0
        try:
            for nombre, funcion in (("USGS", sync_usgs), ("IGP", sync_igp)):
                try:
                    datos = funcion({"roles": ["Administrador"]})
                    registrar(fuente=nombre, estado="OK",
                        recibidos=datos["recibidos"],
                        importados=datos["importados"],
                        duplicados=datos["duplicados"])
                except Exception as error:
                    errores += 1
                    registrar(fuente=nombre, estado="ERROR",
                        detalle=str(error)[:240])
            try:
                resultado = evaluar_registros(dias=7)
                registrar(fuente="ALERTAS", estado="OK", **resultado)
            except Exception as error:
                errores += 1
                registrar(fuente="ALERTAS", estado="ERROR",
                    detalle=str(error)[:240])
        finally:
            conexion.execute(
                text("SELECT pg_advisory_unlock(:clave)"),
                {"clave": LOCK_ID}
            )
    registrar(ciclo="FINALIZADO", estado="OK" if not errores else "ERROR_PARCIAL")
    return 1 if errores else 0

def ejecutar_seguro():
    try:
        return ejecutar()
    except Exception as error:
        registrar(estado="ERROR_GENERAL", detalle=str(error)[:240])
        return 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--minutes", type=int, default=60)
    opciones = parser.parse_args()
    if not 15 <= opciones.minutes <= 1440:
        parser.error("Intervalo permitido: 15 a 1440 minutos")
    if opciones.loop:
        registrar(servicio="SISMOIA_AUTO_SYNC", intervalo_minutos=opciones.minutes)
        while True:
            ejecutar_seguro()
            time.sleep(opciones.minutes * 60)
    else:
        sys.exit(ejecutar_seguro())
