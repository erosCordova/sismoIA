"""Prueba transaccional real, sin datos permanentes."""

import os
from pathlib import Path
from uuid import UUID, uuid4
from decimal import Decimal
from unittest.mock import patch

for name in (".env", ".env.local"):
    path = Path(name)
    if not path.is_file():
        continue

    for line in path.read_text(
        encoding="utf-8-sig"
    ).splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        if line.startswith("export "):
            line = line[7:]

        key, value = line.split("=", 1)
        os.environ.setdefault(
            key.strip(),
            value.strip().strip('"').strip("'")
        )

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.database import engine
from app.models import (
    User, Role, UserRole,
    SeismicEvent, AuditLog
)
from app.alert_models import (
    AlertRule, SeismicAlert, AlertAction
)
from app.delivery_models import AlertDelivery
from app import deliveries
from app.permissions import tiene_permiso


def main():
    assert tiene_permiso(
        ["Operador de alertas"], "alerts:approve"
    )
    assert not tiene_permiso(
        ["Solo lectura"], "alerts:approve"
    )

    print("PERMISOS_CONFIGURADOS=OK")

    ids_prueba = {}
    acciones_esperadas = {
        "delivery.internal.assign",
        "delivery.internal.ack",
        "delivery.internal.cancel",
    }

    with engine.connect() as conn:
        transaccion = conn.begin()

        try:
            def sesion(*args, **kwargs):
                return Session(
                    bind=conn,
                    join_transaction_mode="create_savepoint"
                )

            with sesion() as db:
                evento_id = db.scalar(
                    select(SeismicEvent.id).limit(1)
                )

                assert evento_id, (
                    "No hay eventos sísmicos para probar"
                )

                rol = db.scalar(
                    select(Role).where(
                        Role.name == "Operador de alertas"
                    )
                )

                if rol is None:
                    rol = Role(
                        id=uuid4(),
                        name="Operador de alertas",
                        description="Rol temporal de prueba"
                    )
                    db.add(rol)
                    db.flush()

                usuarios = []

                for numero in (1, 2):
                    uid = uuid4()

                    usuario = User(
                        id=uid,
                        full_name=f"Prueba temporal {numero}",
                        email=(
                            f"sismoia-prueba-{uid.hex}"
                            "@example.invalid"
                        ),
                        password_hash="!sin-acceso!",
                        status="active"
                    )

                    db.add(usuario)
                    usuarios.append(usuario)

                db.flush()

                for usuario in usuarios:
                    db.add(UserRole(
                        user_id=usuario.id,
                        role_id=rol.id
                    ))

                regla = AlertRule(
                    name=f"PRUEBA-{uuid4().hex[:16]}",
                    min_magnitude=Decimal("4.0"),
                    peru_only=False,
                    enabled=True
                )

                db.add(regla)
                db.flush()

                alerta = SeismicAlert(
                    rule_id=regla.id,
                    event_id=evento_id,
                    severity="warning",
                    status="approved"
                )

                db.add(alerta)
                db.flush()

                usuario1 = usuarios[0].id
                usuario2 = usuarios[1].id
                alerta_id = alerta.id

                ids_prueba = {
                    "usuarios": [usuario1, usuario2],
                    "alerta": alerta_id
                }

                db.commit()

            actor1 = {
                "id": str(usuario1),
                "roles": ["Operador de alertas"]
            }

            actor2 = {
                "id": str(usuario2),
                "roles": ["Operador de alertas"]
            }

            with patch.object(
                deliveries, "Session",
                side_effect=sesion
            ):
                asignacion1 = deliveries.asignar(
                    deliveries.Asignacion(
                        alerta_id=alerta_id,
                        destinatario_id=usuario1
                    ),
                    usuario=actor1
                )

                assert asignacion1["estado"] == "assigned"

                primera_id = UUID(asignacion1["id"])

                print("ASIGNACION=OK")

                repetida = deliveries.asignar(
                    deliveries.Asignacion(
                        alerta_id=alerta_id,
                        destinatario_id=usuario1
                    ),
                    usuario=actor1
                )

                assert repetida["id"] == asignacion1["id"]

                print("DEDUPLICACION=OK")

                mis_avisos = deliveries.recibidas(
                    usuario=actor1
                )

                assert any(
                    x["id"] == asignacion1["id"]
                    for x in mis_avisos["entregas"]
                )

                print("BANDEJA_PERSONAL=OK")

                confirmada = deliveries.confirmar(
                    primera_id,
                    usuario=actor1
                )

                assert (
                    confirmada["estado"] == "acknowledged"
                )
                assert confirmada["acuse_utc"]

                print("ACUSE_DE_RECEPCION=OK")

                asignacion2 = deliveries.asignar(
                    deliveries.Asignacion(
                        alerta_id=alerta_id,
                        destinatario_id=usuario2
                    ),
                    usuario=actor1
                )

                segunda_id = UUID(asignacion2["id"])

                try:
                    deliveries.confirmar(
                        segunda_id,
                        usuario=actor1
                    )
                except HTTPException as exc:
                    assert exc.status_code == 403
                else:
                    raise AssertionError(
                        "Fallo: recepción ajena permitida"
                    )

                print("AISLAMIENTO_DESTINATARIO=OK")

                cancelada = deliveries.cancelar(
                    segunda_id,
                    usuario=actor1
                )

                assert cancelada["estado"] == "cancelled"

                print("CANCELACION=OK")

                try:
                    deliveries.confirmar(
                        segunda_id,
                        usuario=actor2
                    )
                except HTTPException as exc:
                    assert exc.status_code == 409
                else:
                    raise AssertionError(
                        "Fallo: confirmó alerta cancelada"
                    )

                print("ESTADOS_PROTEGIDOS=OK")

                salidas = deliveries.salidas(
                    limite=100,
                    usuario=actor1
                )

                assert any(
                    x["id"] == asignacion1["id"]
                    for x in salidas["entregas"]
                )

                print("BANDEJA_OPERATIVA=OK")

                ids_prueba["entregas"] = [
                    primera_id, segunda_id
                ]

            with sesion() as db:
                auditoria = db.scalars(
                    select(AuditLog)
                    .where(
                        AuditLog.entity_type ==
                            "sismo_alert_delivery",
                        AuditLog.entity_id.in_([
                            str(primera_id),
                            str(segunda_id)
                        ])
                    )
                ).all()

                acciones = {
                    a.action for a in auditoria
                }

                assert acciones_esperadas.issubset(
                    acciones
                )

                historial = db.scalars(
                    select(AlertAction)
                    .where(
                        AlertAction.alert_id == alerta_id
                    )
                ).all()

                assert len(historial) >= 4

                print("AUDITORIA_POSTGRESQL=OK")

            assert transaccion.is_active, (
                "La transacción externa fue cerrada"
            )

        finally:
            if transaccion.is_active:
                transaccion.rollback()

    with Session(engine) as db:
        for uid in ids_prueba.get("usuarios", []):
            assert db.get(User, uid) is None

        assert db.get(
            SeismicAlert,
            ids_prueba["alerta"]
        ) is None

        for did in ids_prueba.get("entregas", []):
            assert db.get(
                AlertDelivery, did
            ) is None

    print("ROLLBACK_TOTAL=OK")
    print("DATOS_TEMPORALES_PERSISTIDOS=0")
    print("ENTREGAS_FLUJO_INTEGRAL=OK")


if __name__ == "__main__":
    main()
