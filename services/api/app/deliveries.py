"""Bandeja interna auditada. No ejecuta envios externos."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import requerir_permiso
from app.auth import usuario_actual
from app.database import engine
from app.models import (
    User, UserRole, Role, AuditLog,
    SeismicEvent, DataSource
)
from app.alert_models import (
    SeismicAlert, AlertAction
)
from app.delivery_models import AlertDelivery


router = APIRouter(
    prefix="/api/v1/deliveries",
    tags=["Entregas internas de alertas"]
)


class Asignacion(BaseModel):
    alerta_id: UUID
    destinatario_id: UUID


def identidad(usuario):
    try:
        return UUID(str(usuario["id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            403, "Identidad de usuario no válida"
        )


def fecha(v):
    return v.isoformat() if v else None


def registrar(db, usuario, entrega, accion):
    actor = identidad(usuario)

    db.add(AlertAction(
        alert_id=entrega.alert_id,
        actor_id=actor,
        action=accion,
        details=(
            f"Entrega {entrega.id}; "
            f"destinatario {entrega.recipient_id}; "
            f"estado {entrega.status}"
        )
    ))

    db.add(AuditLog(
        actor_id=actor,
        action=accion,
        entity_type="sismo_alert_delivery",
        entity_id=str(entrega.id),
        after_json={
            "alerta_id": str(entrega.alert_id),
            "destinatario_id": str(
                entrega.recipient_id
            ),
            "canal": "internal",
            "estado": entrega.status
        }
    ))


def detalle(d, nombre=None):
    return {
        "id": str(d.id),
        "alerta_id": str(d.alert_id),
        "destinatario_id": str(d.recipient_id),
        "destinatario": nombre,
        "canal": "internal",
        "estado": d.status,
        "intentos_externos": d.attempts,
        "ultimo_intento_utc": fecha(
            d.last_attempt_at
        ),
        "acuse_utc": fecha(d.acknowledged_at),
        "cancelada_utc": fecha(d.cancelled_at),
        "creada_utc": fecha(d.created_at),
        "error": d.error,
        "envio_externo": False,
    }


def consulta():
    return (
        select(
            AlertDelivery,
            User.full_name,
            SeismicAlert.severity,
            SeismicEvent.magnitude,
            SeismicEvent.place,
            DataSource.name,
            SeismicEvent.source_url,
        )
        .select_from(AlertDelivery)
        .join(
            User,
            User.id == AlertDelivery.recipient_id
        )
        .join(
            SeismicAlert,
            SeismicAlert.id == AlertDelivery.alert_id
        )
        .join(
            SeismicEvent,
            SeismicEvent.id == SeismicAlert.event_id
        )
        .join(
            DataSource,
            DataSource.id == SeismicEvent.source_id
        )
    )


def resultado(filas):
    return [
        {
            **detalle(d, nombre),
            "severidad": severidad,
            "magnitud": float(magnitud),
            "lugar": lugar,
            "fuente": fuente,
            "url_fuente": url,
        }
        for (
            d, nombre, severidad,
            magnitud, lugar, fuente, url
        ) in filas
    ]


@router.get("/recipients")
def destinatarios(
    usuario=Depends(
        requerir_permiso("alerts:approve")
    )
):
    with Session(engine) as db:
        usuarios = db.scalars(
            select(User)
            .join(
                UserRole,
                UserRole.user_id == User.id
            )
            .join(
                Role,
                Role.id == UserRole.role_id
            )
            .where(
                User.status == "active",
                Role.name.in_([
                    "Administrador",
                    "Operador de alertas",
                    "Auditor"
                ])
            )
            .distinct()
            .order_by(User.full_name)
        ).all()

        return {
            "usuarios": [
                {
                    "id": str(u.id),
                    "nombre": u.full_name
                }
                for u in usuarios
            ]
        }


@router.get("/outbox")
def salidas(
    limite: int = Query(100, ge=1, le=200),
    usuario=Depends(
        requerir_permiso("alerts:read")
    )
):
    with Session(engine) as db:
        filas = db.execute(
            consulta()
            .order_by(
                AlertDelivery.created_at.desc()
            )
            .limit(limite)
        ).all()

        return {"entregas": resultado(filas)}


@router.get("/mine")
def recibidas(usuario=Depends(usuario_actual)):
    uid = identidad(usuario)

    with Session(engine) as db:
        filas = db.execute(
            consulta()
            .where(
                AlertDelivery.recipient_id == uid,
                AlertDelivery.status != "cancelled"
            )
            .order_by(
                AlertDelivery.created_at.desc()
            )
            .limit(100)
        ).all()

        return {"entregas": resultado(filas)}


@router.post("/assign", status_code=201)
def asignar(
    datos: Asignacion,
    usuario=Depends(
        requerir_permiso("alerts:approve")
    )
):
    with Session(engine) as db:
        alerta = db.get(
            SeismicAlert,
            datos.alerta_id,
            with_for_update=True
        )

        if not alerta:
            raise HTTPException(
                404, "Alerta no encontrada"
            )

        if alerta.status != "approved":
            raise HTTPException(
                409,
                "Primero debe aprobarse la alerta"
            )

        permitido = db.scalar(
            select(User.id)
            .join(
                UserRole,
                UserRole.user_id == User.id
            )
            .join(
                Role,
                Role.id == UserRole.role_id
            )
            .where(
                User.id == datos.destinatario_id,
                User.status == "active",
                Role.name.in_([
                    "Administrador",
                    "Operador de alertas",
                    "Auditor"
                ])
            )
            .limit(1)
        )

        if not permitido:
            raise HTTPException(
                422,
                "Destinatario inactivo o sin acceso al centro"
            )

        existente = db.scalar(
            select(AlertDelivery)
            .where(
                AlertDelivery.alert_id ==
                    datos.alerta_id,
                AlertDelivery.recipient_id ==
                    datos.destinatario_id,
                AlertDelivery.channel == "internal"
            )
        )

        if existente:
            if existente.status == "cancelled":
                raise HTTPException(
                    409,
                    "La asignación fue cancelada. "
                    "No se puede reactivar automáticamente."
                )

            return detalle(existente)

        entrega = AlertDelivery(
            alert_id=datos.alerta_id,
            recipient_id=datos.destinatario_id,
            channel="internal",
            status="assigned",
            assigned_by=identidad(usuario)
        )

        db.add(entrega)
        db.flush()

        registrar(
            db, usuario, entrega,
            "delivery.internal.assign"
        )

        db.commit()
        db.refresh(entrega)

        return detalle(entrega)


@router.post("/{delivery_id}/ack")
def confirmar(
    delivery_id: UUID,
    usuario=Depends(usuario_actual)
):
    uid = identidad(usuario)

    with Session(engine) as db:
        entrega = db.get(
            AlertDelivery,
            delivery_id,
            with_for_update=True
        )

        if not entrega:
            raise HTTPException(
                404, "Asignación no encontrada"
            )

        if entrega.recipient_id != uid:
            raise HTTPException(
                403, "Esta asignación no te pertenece"
            )

        if entrega.status == "acknowledged":
            return detalle(entrega)

        if entrega.status != "assigned":
            raise HTTPException(
                409,
                "No se puede confirmar esta asignación"
            )

        entrega.status = "acknowledged"
        entrega.acknowledged_at = (
            datetime.now(timezone.utc)
        )

        registrar(
            db, usuario, entrega,
            "delivery.internal.ack"
        )

        db.commit()
        db.refresh(entrega)

        return detalle(entrega)


@router.post("/{delivery_id}/cancel")
def cancelar(
    delivery_id: UUID,
    usuario=Depends(
        requerir_permiso("alerts:approve")
    )
):
    with Session(engine) as db:
        entrega = db.get(
            AlertDelivery,
            delivery_id,
            with_for_update=True
        )

        if not entrega:
            raise HTTPException(
                404, "Asignación no encontrada"
            )

        if entrega.status == "cancelled":
            return detalle(entrega)

        if entrega.status != "assigned":
            raise HTTPException(
                409,
                "No se puede cancelar una recepción confirmada"
            )

        entrega.status = "cancelled"
        entrega.cancelled_at = (
            datetime.now(timezone.utc)
        )

        registrar(
            db, usuario, entrega,
            "delivery.internal.cancel"
        )

        db.commit()
        db.refresh(entrega)

        return detalle(entrega)
