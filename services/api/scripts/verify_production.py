import json
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

FRONTEND = "https://sismo-ia.vercel.app"
BACKEND = "https://sismoia.onrender.com"

def consultar(url):
    ultimo_error = None

    for intento in range(3):
        try:
            solicitud = Request(
                url,
                headers={"User-Agent": "SISMOIA-Production-Monitor/1.0"}
            )

            with urlopen(solicitud, timeout=90) as respuesta:
                return respuesta.status, respuesta.read(3000000)

        except HTTPError as error:
            if error.code in (401, 403, 404):
                return error.code, error.read(10000)
            ultimo_error = error

        except (URLError, TimeoutError) as error:
            ultimo_error = error

        if intento < 2:
            time.sleep(10)

    raise RuntimeError(str(ultimo_error))


def verificar():
    errores = []

    print("===== FRONTEND VERCEL =====", flush=True)

    try:
        estado, contenido = consultar(FRONTEND)
        assert estado == 200
        assert b"<html" in contenido.lower()
        print("FRONTEND=OK", flush=True)
    except Exception as error:
        errores.append("FRONTEND: " + str(error))
        print("FRONTEND=ERROR", flush=True)

    print("===== BACKEND RENDER =====", flush=True)

    try:
        estado, contenido = consultar(
            BACKEND + "/openapi.json"
        )

        assert estado == 200

        esquema = json.loads(contenido)
        rutas = esquema.get("paths", {})

        necesarias = [
            "/api/v1/alerts/rules",
            "/api/v1/alerts/evaluate",
            "/api/v1/alerts/inbox",
            "/api/v1/seismic/sync",
            "/api/v1/seismic/sync-igp",
            "/api/v1/forecasts/zones",
        ]

        for ruta in necesarias:
            if ruta not in rutas:
                errores.append("RUTA_FALTANTE: " + ruta)
                print("RUTA_FALTANTE=", ruta, flush=True)

        print("BACKEND=OK", flush=True)
        print("RUTAS_TOTALES=", len(rutas), flush=True)

    except Exception as error:
        errores.append("BACKEND: " + str(error))
        print("BACKEND=ERROR", flush=True)

    print("===== PROTECCION DE ALERTAS =====", flush=True)

    try:
        estado, _ = consultar(
            BACKEND + "/api/v1/alerts/rules"
        )

        if estado not in (401, 403):
            errores.append(
                "ALERTAS: acceso sin autenticar, HTTP "
                + str(estado)
            )
            print("AUTORIZACION=ERROR", flush=True)
        else:
            print("AUTORIZACION=OK", flush=True)

    except Exception as error:
        errores.append("AUTORIZACION: " + str(error))
        print("AUTORIZACION=ERROR", flush=True)

    if errores:
        print("RESULTADO=ERROR", flush=True)
        for error in errores:
            print("DETALLE=", error, flush=True)
        return 1

    print("RESULTADO=PRODUCCION_OPERATIVA", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(verificar())
