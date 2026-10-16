"""Notificaciones internas por email, con envio manual."""

import os
import ssl
import smtplib

from email.message import EmailMessage
from email.utils import parseaddr
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import requerir_permiso
from app.database import engine
from app.models import User, SeismicEvent, DataSource
from app.alert_models import SeismicAlert, AlertAction

router = APIRouter(
    prefix="/api/v1/email-notifications",
    tags=["Notificaciones por correo"]
)


class Solicitud(BaseModel):
    alert_id: UUID
    recipient_user_id: UUID


def configuracion():
    nombres = (
        "SISMOIA_SMTP_HOST",
        "SISMOIA_SMTP_USER",
        "SISMOIA_SMTP_PASSWORD",
        "SISMOIA_SMTP_FROM"
    )

    return {
        "habilitado": (
            os.getenv("SISMOIA_EMAIL_ENABLED", "false")
            .lower() == "true"
        ),
        "configurado": all(
            os.getenv(nombre, "").strip()
            for nombre in nombres
        )
    }


def correo_valido(valor):
    nombre, email = parseaddr(valor or "")

    if (
        not email
        or email != valor
        or email.count("@") != 1
        or "\n" in valor
        or "\r" in valor
    ):
        raise ValueError("Direccion de correo invalida")

    return email


def mensaje_sismico(alerta, evento, fuente, destinatario):
    if alerta.status != "approved":
        raise ValueError("Solo se notifican alertas aprobadas")

    ubicacion = " ".join(
        str(evento.place or "Ubicacion no especificada")
        .split()
    )[:150]

    nombre_fuente = " ".join(
        str(fuente.name).split()
    )[:100]

    magnitud = str(evento.magnitude)

    asunto = (
        f"SISMOIA | Sismo registrado M{magnitud}"
    )

    enlace = str(evento.source_url or "")

    if not enlace.startswith(("https://", "http://")):
        enlace = "No disponible"

    cuerpo = "\n".join([
        "SISMOIA - NOTIFICACION INFORMATIVA",
        "",
        f"Destinatario: {destinatario.full_name}",
        f"Magnitud reportada: {magnitud}",
        f"Ubicacion: {ubicacion}",
        f"Fecha del evento (UTC): {evento.occurred_at}",
        f"Fuente de datos: {nombre_fuente}",
        f"Enlace de procedencia: {enlace}",
        "",
        "La alerta fue revisada y aprobada por un",
        "usuario autorizado de SISMOIA.",
        "",
        "Este mensaje describe un sismo ya registrado.",
        "No predice terremotos futuros y no constituye",
        "una alerta temprana oficial.",
        "",
        "Consulta los organismos competentes",
        "para instrucciones de seguridad."
    ])

    return asunto, cuerpo


def enviar_smtp(destino, asunto, cuerpo):
    estado = configuracion()

    if not estado["habilitado"]:
        raise RuntimeError("EMAIL_DESACTIVADO")

    if not estado["configurado"]:
        raise RuntimeError("SMTP_INCOMPLETO")

    servidor = os.environ["SISMOIA_SMTP_HOST"]
    usuario = os.environ["SISMOIA_SMTP_USER"]
    clave = os.environ["SISMOIA_SMTP_PASSWORD"]
    remitente = correo_valido(
        os.environ["SISMOIA_SMTP_FROM"]
    )

    destino = correo_valido(destino)

    modo = os.getenv(
        "SISMOIA_SMTP_SECURITY", "ssl"
    ).lower()

    if modo not in {"ssl", "starttls"}:
        raise RuntimeError("SMTP_SEGURIDAD_INVALIDA")

    puerto = int(os.getenv(
        "SISMOIA_SMTP_PORT",
        "465" if modo == "ssl" else "587"
    ))

    mensaje = EmailMessage()
    mensaje["From"] = remitente
    mensaje["To"] = destino
    mensaje["Subject"] = asunto
    mensaje.set_content(cuerpo)

    contexto = ssl.create_default_context()

    if modo == "ssl":
        with smtplib.SMTP_SSL(
            servidor, puerto,
            timeout=20, context=contexto
        ) as cliente:
            cliente.login(usuario, clave)
            cliente.send_message(mensaje)
    else:
        with smtplib.SMTP(
            servidor, puerto, timeout=20
        ) as cliente:
            cliente.ehlo()
            cliente.starttls(context=contexto)
            cliente.ehlo()
            cliente.login(usuario, clave)
            cliente.send_message(mensaje)


def obtener_registros(db, solicitud, bloqueo=False):
    consulta = select(SeismicAlert).where(
        SeismicAlert.id == solicitud.alert_id
    )

    if bloqueo:
        consulta = consulta.with_for_update()

    alerta = db.scalar(consulta)

    if alerta is None:
        raise HTTPException(404, "Alerta no encontrada")

    if alerta.status != "approved":
        raise HTTPException(
            409, "La alerta debe estar aprobada"
        )

    usuario = db.get(
        User, solicitud.recipient_user_id
    )

    if usuario is None or usuario.status != "active":
        raise HTTPException(
            404, "Destinatario activo no encontrado"
        )

    evento = db.get(SeismicEvent, alerta.event_id)
    fuente = db.get(DataSource, evento.source_id)

    if fuente is None:
        raise HTTPException(409, "Fuente no disponible")

    return alerta, usuario, evento, fuente


def fue_enviado(db, alerta_id, usuario_id):
    return db.scalar(
        select(AlertAction.id)
        .where(
            AlertAction.alert_id == alerta_id,
            AlertAction.action == "email.sent",
            AlertAction.details == f"user:{usuario_id}"
        )
        .limit(1)
    ) is not None


@router.get("/config")
def estado(
    usuario=Depends(requerir_permiso("alerts:approve"))
):
    return {
        **configuracion(),
        "modo": "manual",
        "canal": "email",
        "aviso": "No es un canal oficial de emergencia"
    }


@router.get("/recipients")
def destinatarios(
    usuario=Depends(requerir_permiso("alerts:approve"))
):
    with Session(engine) as db:
        usuarios = db.scalars(
            select(User)
            .where(User.status == "active")
            .order_by(User.full_name)
            .limit(100)
        ).all()

        return {
            "usuarios": [
                {
                    "id": str(u.id),
                    "nombre": u.full_name,
                    "email": u.email
                }
                for u in usuarios
            ]
        }


@router.get("/approved")
def aprobadas(
    usuario=Depends(requerir_permiso("alerts:approve"))
):
    with Session(engine) as db:
        filas = db.execute(
            select(SeismicAlert, SeismicEvent)
            .join(
                SeismicEvent,
                SeismicEvent.id == SeismicAlert.event_id
            )
            .where(SeismicAlert.status == "approved")
            .order_by(SeismicAlert.created_at.desc())
            .limit(100)
        ).all()

        return {
            "alertas": [
                {
                    "id": str(a.id),
                    "magnitud": float(e.magnitude),
                    "lugar": e.place,
                    "fecha": e.occurred_at.isoformat()
                }
                for a, e in filas
            ]
        }


@router.post("/preview")
def vista_previa(
    solicitud: Solicitud,
    usuario=Depends(requerir_permiso("alerts:approve"))
):
    with Session(engine) as db:
        alerta, destino, evento, fuente = (
            obtener_registros(db, solicitud)
        )

        asunto, cuerpo = mensaje_sismico(
            alerta, evento, fuente, destino
        )

        return {
            "destinatario": destino.email,
            "asunto": asunto,
            "mensaje": cuerpo,
            "enviado_previamente": fue_enviado(
                db, alerta.id, destino.id
            ),
            "envio_real": False
        }


@router.post("/send")
def enviar(
    solicitud: Solicitud,
    usuario=Depends(requerir_permiso("alerts:approve"))
):
    estado = configuracion()

    if not estado["habilitado"]:
        raise HTTPException(
            503, "El envio por correo esta desactivado"
        )

    if not estado["configurado"]:
        raise HTTPException(
            503, "El servidor SMTP no esta configurado"
        )

    with Session(engine) as db:
        alerta, destino, evento, fuente = (
            obtener_registros(
                db, solicitud, bloqueo=True
            )
        )

        if fue_enviado(db, alerta.id, destino.id):
            raise HTTPException(
                409,
                "Ya se registro un envio para este destinatario"
            )

        asunto, cuerpo = mensaje_sismico(
            alerta, evento, fuente, destino
        )

        try:
            enviar_smtp(
                destino.email,
                asunto,
                cuerpo
            )
        except Exception as error:
            db.add(
                AlertAction(
                    alert_id=alerta.id,
                    actor_id=UUID(str(usuario["id"])),
                    action="email.failed",
                    details=(
                        "user:" + str(destino.id)
                        + ";error:" + type(error).__name__
                    )
                )
            )
            db.commit()

            raise HTTPException(
                502,
                "El proveedor de correo no completo el envio"
            ) from None

        db.add(
            AlertAction(
                alert_id=alerta.id,
                actor_id=UUID(str(usuario["id"])),
                action="email.sent",
                details=f"user:{destino.id}"
            )
        )

        db.commit()

        return {
            "estado": "enviado",
            "alert_id": str(alerta.id),
            "recipient_user_id": str(destino.id),
            "advertencia": (
                "Notificacion informativa, no oficial"
            )
        }
