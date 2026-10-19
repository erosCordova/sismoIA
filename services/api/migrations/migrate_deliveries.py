from sqlalchemy import inspect

from app.database import engine
from app.delivery_models import AlertDelivery
from app import alert_models  # registra la tabla referenciada por alert_id

tabla = AlertDelivery.__table__

with engine.begin() as conn:
    inspector = inspect(conn)

    if inspector.has_table(tabla.name):
        actuales = {
            c["name"]
            for c in inspector.get_columns(tabla.name)
        }

        requeridas = {
            c.name
            for c in tabla.columns
        }

        if requeridas - actuales:
            raise RuntimeError(
                "Esquema de entregas incompatible"
            )

        restricciones = {
            r["name"]
            for r in inspector.get_unique_constraints(
                tabla.name
            )
        }

        if (
            "uq_sismo_delivery_recipient"
            not in restricciones
        ):
            raise RuntimeError(
                "Falta restricción de deduplicación"
            )

    AlertDelivery.metadata.create_all(
        conn,
        tables=[tabla],
        checkfirst=True
    )

    assert inspect(conn).has_table(tabla.name)

print("MIGRACION_ENTREGAS=OK")
