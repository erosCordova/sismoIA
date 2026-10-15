from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
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
