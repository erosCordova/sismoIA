import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

sys.path.insert(
    0, str(Path(__file__).resolve().parents[1])
)

from app.database import engine
from app.models import DataSource, SeismicEvent
import app.seismic as seismic

BLOQUEO = 20261014

def main():
    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(days=90)

    if "supabase" not in (engine.url.host or "").lower():
        raise RuntimeError(
            "No se detecto PostgreSQL de Supabase"
        )

    print("BASE=SUPABASE", flush=True)
    print("DESDE=", desde.isoformat(), flush=True)
    print("HASTA=", ahora.isoformat(), flush=True)

    recibidos_total = 0
    importados_total = 0
    descartados_total = 0

    with engine.connect() as conexion:
        ocupado = conexion.execute(
            text("SELECT pg_try_advisory_lock(:id)"),
            {"id": BLOQUEO}
        ).scalar()

        if not ocupado:
            raise RuntimeError(
                "Hay otra sincronizacion en curso"
            )

        url_original = seismic.FEED_URL

        try:
            with httpx.Client(
                timeout=90,
                follow_redirects=True
            ) as cliente:

                actual = desde
                numero = 0

                while actual < ahora:
                    siguiente = min(
                        actual + timedelta(days=7),
                        ahora
                    )

                    numero += 1

                    params = {
                        "starttime": actual.strftime(
                            "%Y-%m-%dT%H:%M:%S"
                        ),
                        "endtime": siguiente.strftime(
                            "%Y-%m-%dT%H:%M:%S"
                        ),
                        "eventtype": "earthquake"
                    }

                    for intento in range(3):
                        try:
                            respuesta = cliente.get(
                                "https://earthquake.usgs.gov/"
                                "fdsnws/event/1/count",
                                params=params
                            )
                            respuesta.raise_for_status()
                            esperados = int(
                                respuesta.text.strip()
                            )
                            break
                        except Exception:
                            if intento == 2:
                                raise
                            time.sleep(3)

                    if esperados > 19000:
                        raise RuntimeError(
                            "Demasiados registros en ventana "
                            + str(numero)
                        )

                    if esperados == 0:
                        actual = siguiente
                        continue

                    seismic.FEED_URL = (
                        "https://earthquake.usgs.gov/"
                        "fdsnws/event/1/query?"
                        + urlencode({
                            **params,
                            "format": "geojson",
                            "orderby": "time-asc",
                            "limit": 20000
                        })
                    )

                    resultado = seismic.sincronizar(
                        {"roles": ["Administrador"]}
                    )

                    recibidos = int(
                        resultado["recibidos"]
                    )

                    if recibidos != esperados:
                        raise RuntimeError(
                            "Ventana "
                            + str(numero)
                            + ": esperados="
                            + str(esperados)
                            + ", recibidos="
                            + str(recibidos)
                        )

                    nuevos = int(
                        resultado["importados"]
                    )
                    descartados = int(
                        resultado["descartados"]
                    )

                    recibidos_total += recibidos
                    importados_total += nuevos
                    descartados_total += descartados

                    print(
                        "VENTANA=", numero,
                        "RECIBIDOS=", recibidos,
                        "IMPORTADOS=", nuevos,
                        "DESCARTADOS=", descartados,
                        flush=True
                    )

                    actual = siguiente
                    time.sleep(1)

        finally:
            seismic.FEED_URL = url_original

            conexion.execute(
                text("SELECT pg_advisory_unlock(:id)"),
                {"id": BLOQUEO}
            )

    grupo = func.to_char(
        func.timezone(
            "UTC", SeismicEvent.occurred_at
        ),
        "YYYY-MM"
    )

    with Session(engine) as db:
        mensual = db.execute(
            select(
                grupo,
                func.count(SeismicEvent.id)
            )
            .select_from(SeismicEvent)
            .join(
                DataSource,
                DataSource.id == SeismicEvent.source_id
            )
            .where(
                DataSource.name == "USGS",
                SeismicEvent.occurred_at >= desde,
                SeismicEvent.occurred_at <= ahora
            )
            .group_by(grupo)
            .order_by(grupo)
        ).all()

    print("===== DISTRIBUCION MENSUAL REAL =====")

    for mes, cantidad in mensual:
        print(
            "MES=", mes,
            "SISMOS=", cantidad,
            flush=True
        )

    print("TOTAL_RECIBIDOS=", recibidos_total)
    print("TOTAL_IMPORTADOS=", importados_total)
    print("TOTAL_DESCARTADOS=", descartados_total)
    print("RESULTADO=OK")

if __name__ == "__main__":
    main()
