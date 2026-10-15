from datetime import date, datetime, time, timedelta, timezone
# SISMOIA_OPERACIONES_V4
from decimal import Decimal
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.database import engine
from app.models import SeismicEvent, DataSource
from app.alert_models import AlertRule, SeismicAlert, AlertAction

router = APIRouter(prefix="/api/v1/alerts", tags=["Alertas sismicas"])

class NuevaRegla(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    magnitud_minima: float = Field(ge=0, le=9.9)
    profundidad_maxima: float | None = Field(None, ge=0, le=750)
    solo_peru: bool = False

class CambiarEstado(BaseModel):
    habilitada: bool

class Revision(BaseModel):
    decision: Literal["approved", "dismissed"]

def actor_id(usuario):
    return UUID(str(usuario["id"])) if usuario.get("id") else None

def regla_json(r):
    return {"id": str(r.id), "nombre": r.name,
            "magnitud_minima": float(r.min_magnitude),
            "profundidad_maxima": float(r.max_depth_km) if r.max_depth_km is not None else None,
            "solo_peru": r.peru_only, "habilitada": r.enabled}

@router.get("/rules")
def listar_reglas(usuario=Depends(requerir_permiso("alerts:read"))):
    with Session(engine) as db:
        reglas = db.scalars(select(AlertRule).order_by(AlertRule.created_at.desc())).all()
        return {"reglas": [regla_json(r) for r in reglas]}

@router.post("/rules", status_code=201)
def crear_regla(datos: NuevaRegla, usuario=Depends(requerir_permiso("rules:manage"))):
    nombre = datos.nombre.strip()
    if len(nombre) < 3:
        raise HTTPException(422, "Nombre de regla demasiado corto")
    with Session(engine) as db:
        regla = AlertRule(name=nombre, min_magnitude=Decimal(str(datos.magnitud_minima)),
            max_depth_km=Decimal(str(datos.profundidad_maxima)) if datos.profundidad_maxima is not None else None,
            peru_only=datos.solo_peru, created_by=actor_id(usuario))
        db.add(regla)
        try:
            db.flush()
            db.add(AlertAction(actor_id=actor_id(usuario), action="rules.create",
                               details="Regla creada: " + str(regla.id)))
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Ya existe una regla con ese nombre")
        return regla_json(regla)

@router.patch("/rules/{rule_id}")
def actualizar_regla(rule_id: UUID, datos: CambiarEstado,
                    usuario=Depends(requerir_permiso("rules:manage"))):
    with Session(engine) as db:
        regla = db.get(AlertRule, rule_id)
        if not regla:
            raise HTTPException(404, "Regla no encontrada")
        regla.enabled = datos.habilitada
        db.add(AlertAction(actor_id=actor_id(usuario), action="rules.update",
                           details=f"Regla {rule_id}: habilitada={datos.habilitada}"))
        db.commit()
        return regla_json(regla)

def evaluar_registros(dias=7, limite=5000, usuario=None):
    ahora = datetime.now(timezone.utc)
    desde = (ahora - timedelta(days=dias)).replace(tzinfo=None)
    with Session(engine) as db:
        reglas = db.scalars(select(AlertRule).where(AlertRule.enabled.is_(True))).all()
        eventos = db.scalars(select(SeismicEvent).where(
            SeismicEvent.occurred_at >= desde).order_by(
            SeismicEvent.occurred_at.desc()).limit(limite + 1)).all()
        truncado = len(eventos) > limite
        eventos = eventos[:limite]
        ids = [e.id for e in eventos]
        existentes = set(db.execute(select(SeismicAlert.rule_id, SeismicAlert.event_id)
            .where(SeismicAlert.event_id.in_(ids))).all()) if ids else set()
        nuevos = 0
        for evento in eventos:
            magnitud = float(evento.magnitude)
            lat, lon = float(evento.latitude), float(evento.longitude)
            for regla in reglas:
                if (regla.id, evento.id) in existentes or magnitud < float(regla.min_magnitude):
                    continue
                if regla.peru_only and not (-19 <= lat <= 1 and -82 <= lon <= -68):
                    continue
                if regla.max_depth_km is not None and (
                    evento.depth_km is None or float(evento.depth_km) > float(regla.max_depth_km)):
                    continue
                db.add(SeismicAlert(rule_id=regla.id, event_id=evento.id,
                    severity="critical" if magnitud >= 6 else "warning", status="pending"))
                nuevos += 1
        if nuevos:
            db.add(AlertAction(actor_id=actor_id(usuario or {}), action="alerts.evaluate",
                details=f"Detectadas {nuevos} alertas internas pendientes de revision"))
        db.commit()
        return {"reglas_activas": len(reglas), "eventos_evaluados": len(eventos),
                "nuevas_alertas": nuevos, "consulta_limitada": truncado,
                "aviso": "Alertas internas basadas en observaciones; no son predicciones ni avisos oficiales"}

@router.post("/evaluate")
def evaluar(dias: int = Query(7, ge=1, le=30),
            usuario=Depends(requerir_permiso("rules:manage"))):
    return evaluar_registros(dias=dias, usuario=usuario)

@router.get("")
def listar_alertas(estado: Literal["pending", "approved", "dismissed"] | None = None,
                  limite: int = Query(100, ge=1, le=500),
                  usuario=Depends(requerir_permiso("alerts:read"))):
    with Session(engine) as db:
        consulta = (select(SeismicAlert, AlertRule, SeismicEvent, DataSource.name)
            .join(AlertRule, AlertRule.id == SeismicAlert.rule_id)
            .join(SeismicEvent, SeismicEvent.id == SeismicAlert.event_id)
            .join(DataSource, DataSource.id == SeismicEvent.source_id))
        if estado:
            consulta = consulta.where(SeismicAlert.status == estado)
        filas = db.execute(consulta.order_by(SeismicAlert.created_at.desc()).limit(limite)).all()
        return {"alertas": [{
            "id": str(a.id), "regla": r.name, "estado": a.status,
            "severidad": a.severity, "fuente": fuente,
            "magnitud": float(e.magnitude), "lugar": e.place,
            "fecha_evento_utc": e.occurred_at.isoformat(),
            "creada_utc": a.created_at.isoformat()
        } for a, r, e, fuente in filas]}

@router.post("/{alert_id}/review")
def revisar(alert_id: UUID, datos: Revision,
            usuario=Depends(requerir_permiso("alerts:approve"))):
    with Session(engine) as db:
        alerta = db.get(SeismicAlert, alert_id)
        if alerta is None:
            raise HTTPException(404, "Alerta no encontrada")
        if alerta.status != "pending":
            raise HTTPException(409, "La alerta ya fue revisada")
        alerta.status = datos.decision
        alerta.reviewed_by = actor_id(usuario)
        alerta.reviewed_at = datetime.now(timezone.utc)
        db.add(AlertAction(alert_id=alert_id, actor_id=actor_id(usuario),
            action="alerts.review", details="Decision: " + datos.decision))
        db.commit()
        return {"id": str(alerta.id), "estado": alerta.status}

@router.get("/history")
def historial(usuario=Depends(requerir_permiso("audit:read"))):
    with Session(engine) as db:
        acciones = db.scalars(select(AlertAction).order_by(
            AlertAction.created_at.desc()).limit(100)).all()
        return {"acciones": [{"id": str(a.id), "accion": a.action,
            "detalle": a.details, "fecha_utc": a.created_at.isoformat()}
            for a in acciones]}


# SISMOIA_ALERTAS_OPERATIVAS_V2
# Ampliaciones de solo lectura, simulación y trazabilidad.
# No ejecutan entregas externas.

from collections import Counter
from sqlalchemy import case, func


def fecha_alerta(valor):
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(timezone.utc).isoformat()


def alerta_extendida(alerta, regla, evento, fuente):
    return {
        "id": str(alerta.id),
        "regla_id": str(regla.id),
        "evento_id": str(evento.id),
        "regla": regla.name,
        "estado": alerta.status,
        "titulo": f"Evento observado M{float(evento.magnitude):.1f}",
        "mensaje": (
            f"Registro de {fuente}: magnitud {float(evento.magnitude):.1f}, "
            f"ubicación {evento.place or 'no especificada'}. "
            "Aviso interno no oficial."
        ),
        "severidad": alerta.severity,
        "fuente": fuente,
        "id_externo": evento.external_id,
        "magnitud": float(evento.magnitude),
        "tipo_magnitud": evento.magnitude_type,
        "profundidad_km": (
            float(evento.depth_km)
            if evento.depth_km is not None else None
        ),
        "latitud": float(evento.latitude),
        "longitud": float(evento.longitude),
        "lugar": evento.place,
        "url_fuente": evento.source_url,
        "fecha_evento_utc": fecha_alerta(
            evento.occurred_at
        ),
        "fecha_recepcion_utc": fecha_alerta(
            evento.received_at
        ),
        "creada_utc": fecha_alerta(
            alerta.created_at
        ),
        "revisada_utc": fecha_alerta(
            alerta.reviewed_at
        ),
        "revisor_id": (
            str(alerta.reviewed_by)
            if alerta.reviewed_by else None
        ),
        "entrega": {
            "estado": "no_implementada",
            "canal": None,
            "destinatarios": None,
            "entregada_utc": None,
            "intentos": 0,
            "ultimo_intento_utc": None,
            "error": None,
            "acuse": None,
        },
    }


@router.get("/summary")
def resumen_operativo_alertas(
    usuario=Depends(requerir_permiso("alerts:read")),
):
    with Session(engine) as db:
        estados = db.execute(
            select(
                SeismicAlert.status,
                func.count(SeismicAlert.id)
            )
            .group_by(SeismicAlert.status)
        ).all()

        severidades = db.execute(
            select(
                SeismicAlert.severity,
                func.count(SeismicAlert.id)
            )
            .group_by(SeismicAlert.severity)
        ).all()

        reglas_activas = db.scalar(
            select(func.count(AlertRule.id))
            .where(AlertRule.enabled.is_(True))
        ) or 0

        reglas_totales = db.scalar(
            select(func.count(AlertRule.id))
        ) or 0

    conteos = {
        str(estado): int(cantidad)
        for estado, cantidad in estados
    }

    por_severidad = {
        str(severidad): int(cantidad)
        for severidad, cantidad in severidades
    }

    return {
        "total": sum(conteos.values()),
        "pendientes": conteos.get("pending", 0),
        "aprobadas": conteos.get("approved", 0),
        "descartadas": conteos.get("dismissed", 0),
        "por_estado": conteos,
        "por_severidad": por_severidad,
        "reglas_activas": int(reglas_activas),
        "reglas_totales": int(reglas_totales),
        "calculado_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "envio_externo": False,
    }


@router.get("/inbox")
def bandeja_alertas(
    estado: Literal[
        "pending", "approved", "dismissed"
    ] | None = None,
    severidad: Literal[
        "warning", "critical"
    ] | None = None,
    fuente: Literal["USGS", "IGP"] | None = None,
    q: str | None = Query(None, max_length=100),
    magnitud_min: float | None = Query(None, ge=0, le=9.9),
    desde: date | None = None,
    hasta: date | None = None,
    pagina: int = Query(1, ge=1),
    limite: int = Query(25, ge=1, le=100),
    usuario=Depends(requerir_permiso("alerts:read")),
):
    if desde and hasta and desde > hasta:
        raise HTTPException(
            422, "La fecha inicial supera la fecha final"
        )

    condiciones = []

    if q and q.strip():
        patron = "%" + q.strip() + "%"
        condiciones.append(or_(
            AlertRule.name.ilike(patron),
            SeismicEvent.place.ilike(patron),
            SeismicEvent.external_id.ilike(patron),
        ))

    if magnitud_min is not None:
        condiciones.append(
            SeismicEvent.magnitude >= magnitud_min
        )

    if desde:
        condiciones.append(
            SeismicEvent.occurred_at >= datetime.combine(
                desde, time.min, tzinfo=timezone.utc
            )
        )

    if hasta:
        condiciones.append(
            SeismicEvent.occurred_at < datetime.combine(
                hasta + timedelta(days=1),
                time.min,
                tzinfo=timezone.utc
            )
        )

    if estado:
        condiciones.append(
            SeismicAlert.status == estado
        )

    if severidad:
        condiciones.append(
            SeismicAlert.severity == severidad
        )

    if fuente:
        condiciones.append(
            DataSource.name == fuente
        )

    base = (
        select(SeismicAlert.id)
        .select_from(SeismicAlert)
        .join(
            AlertRule,
            AlertRule.id == SeismicAlert.rule_id
        )
        .join(
            SeismicEvent,
            SeismicEvent.id == SeismicAlert.event_id
        )
        .join(
            DataSource,
            DataSource.id == SeismicEvent.source_id
        )
        .where(*condiciones)
    )

    prioridad_estado = case(
        (SeismicAlert.status == "pending", 0),
        (SeismicAlert.status == "approved", 1),
        else_=2,
    )

    prioridad_severidad = case(
        (SeismicAlert.severity == "critical", 0),
        else_=1,
    )

    consulta = (
        select(
            SeismicAlert,
            AlertRule,
            SeismicEvent,
            DataSource.name,
        )
        .select_from(SeismicAlert)
        .join(
            AlertRule,
            AlertRule.id == SeismicAlert.rule_id
        )
        .join(
            SeismicEvent,
            SeismicEvent.id == SeismicAlert.event_id
        )
        .join(
            DataSource,
            DataSource.id == SeismicEvent.source_id
        )
        .where(*condiciones)
        .order_by(
            prioridad_estado,
            prioridad_severidad,
            SeismicAlert.created_at.desc(),
            SeismicAlert.id.desc(),
        )
        .offset((pagina - 1) * limite)
        .limit(limite)
    )

    with Session(engine) as db:
        total = db.scalar(
            select(func.count())
            .select_from(base.subquery())
        ) or 0

        filas = db.execute(consulta).all()

    return {
        "total": int(total),
        "pagina": pagina,
        "limite": limite,
        "paginas": max(
            1,
            (int(total) + limite - 1) // limite
        ),
        "alertas": [
            alerta_extendida(a, r, e, nombre)
            for a, r, e, nombre in filas
        ],
        "actualizado_utc": datetime.now(
            timezone.utc
        ).isoformat(),
    }


@router.get("/inbox/{alert_id}")
def detalle_operativo_alerta(
    alert_id: UUID,
    usuario=Depends(requerir_permiso("alerts:read")),
):
    with Session(engine) as db:
        fila = db.execute(
            select(
                SeismicAlert,
                AlertRule,
                SeismicEvent,
                DataSource.name,
            )
            .select_from(SeismicAlert)
            .join(
                AlertRule,
                AlertRule.id == SeismicAlert.rule_id
            )
            .join(
                SeismicEvent,
                SeismicEvent.id == SeismicAlert.event_id
            )
            .join(
                DataSource,
                DataSource.id == SeismicEvent.source_id
            )
            .where(SeismicAlert.id == alert_id)
        ).first()

        if fila is None:
            raise HTTPException(
                404,
                "Alerta no encontrada"
            )

        alerta, regla, evento, fuente = fila

        acciones = db.scalars(
            select(AlertAction)
            .where(AlertAction.alert_id == alert_id)
            .order_by(
                AlertAction.created_at.desc()
            )
            .limit(50)
        ).all()

        respuesta = alerta_extendida(
            alerta, regla, evento, fuente
        )

        respuesta["regla_configuracion"] = regla_json(
            regla
        )

        respuesta["historial"] = [
            {
                "accion": accion.action,
                "detalle": accion.details,
                "fecha_utc": fecha_alerta(
                    accion.created_at
                ),
            }
            for accion in acciones
        ]

        return respuesta


class SimulacionRegla(NuevaRegla):
    fuente_permitida: Literal["IGP", "USGS"] | None = None
    dias: int = Field(
        default=7,
        ge=1,
        le=30,
    )


@router.post("/simulate")
def simular_regla(
    datos: SimulacionRegla,
    usuario=Depends(
        requerir_permiso("rules:manage")
    ),
):
    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(days=datos.dias)

    condiciones_simulacion = [
        SeismicEvent.occurred_at >= desde,
        SeismicEvent.occurred_at <= ahora,
        SeismicEvent.magnitude >= datos.magnitud_minima,
    ]

    if datos.fuente_permitida:
        condiciones_simulacion.append(
            DataSource.name == datos.fuente_permitida
        )

    with Session(engine) as db:
        filas = db.execute(
            select(
                SeismicEvent,
                DataSource.name,
            )
            .join(
                DataSource,
                DataSource.id == SeismicEvent.source_id
            )
            .where(*condiciones_simulacion)
            .order_by(
                SeismicEvent.occurred_at.desc()
            )
            .limit(5001)
        ).all()

    limitada = len(filas) > 5000
    filas = filas[:5000]

    coincidencias = []
    fuentes = Counter()
    severidades = Counter()

    for evento, fuente in filas:
        lat = float(evento.latitude)
        lon = float(evento.longitude)

        if datos.solo_peru and not (
            -19 <= lat <= 1
            and -82 <= lon <= -68
        ):
            continue

        if datos.profundidad_maxima is not None:
            if evento.depth_km is None:
                continue

            if (
                float(evento.depth_km)
                > datos.profundidad_maxima
            ):
                continue

        fuentes[fuente] += 1

        severidades[
            "critical"
            if float(evento.magnitude) >= 6
            else "warning"
        ] += 1

        coincidencias.append({
            "id": str(evento.id),
            "fecha_utc": fecha_alerta(
                evento.occurred_at
            ),
            "fuente": fuente,
            "magnitud": float(
                evento.magnitude
            ),
            "profundidad_km": (
                float(evento.depth_km)
                if evento.depth_km is not None
                else None
            ),
            "lugar": evento.place,
        })

    return {
        "nombre": datos.nombre,
        "periodo_dias": datos.dias,
        "eventos_examinados": len(filas),
        "coincidencias": len(coincidencias),
        "consulta_limitada": limitada,
        "por_fuente": dict(fuentes),
        "por_severidad": dict(severidades),
        "fuente_permitida": datos.fuente_permitida,
        "guarda_configuracion_de_envio": False,
        "muestra": coincidencias[:10],
        "fecha_simulacion_utc": fecha_alerta(
            ahora
        ),
        "modo": "simulacion_sin_escritura",
        "advertencia": (
            "La simulación no crea ni aprueba alertas, "
            "no modifica reglas y no envía notificaciones. "
            "Las coincidencias son registros históricos, "
            "no pronósticos de terremotos. Si la consulta "
            "está limitada, el conteo es parcial."
        ),
    }
