"""Migración aditiva, explícita e idempotente."""

from sqlalchemy import inspect

from app.database import engine
from app.governance_models import (
    DatasetVersion, ExperimentRun
)

if __name__ == "__main__":
    tablas = [
        DatasetVersion.__table__,
        ExperimentRun.__table__
    ]

    with engine.begin() as conexion:
        for tabla in tablas:
            inspector = inspect(conexion)

            if inspector.has_table(tabla.name):
                existentes = {
                    c["name"]
                    for c in inspector.get_columns(
                        tabla.name
                    )
                }

                requeridas = {
                    c.name for c in tabla.columns
                }

                faltantes = requeridas - existentes

                if faltantes:
                    raise RuntimeError(
                        "Esquema incompatible: "
                        + tabla.name
                    )

        DatasetVersion.metadata.create_all(
            bind=conexion,
            tables=tablas,
            checkfirst=True
        )

        inspector = inspect(conexion)

        for tabla in tablas:
            assert inspector.has_table(
                tabla.name
            ), tabla.name

            print(
                "TABLA_VERIFICADA=",
                tabla.name
            )

    print("MIGRACION_GOBIERNO_ML=OK")
