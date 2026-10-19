from app.time_utils import utc_iso, as_utc
from collections import defaultdict
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select, text
from typing import Literal
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.database import engine
from app.models import User, Role, UserRole, AuditLog, DataSource, SeismicEvent
from app.alert_models import AlertRule, SeismicAlert
from app.permissions import PERMISOS

router = APIRouter(prefix="/api/v1/management", tags=["Administracion empresarial"])

class CambioRoles(BaseModel):
    roles: list[str] = Field(min_length=1, max_length=8)

class CambioEstadoUsuario(BaseModel):
    estado: Literal['active', 'inactive']


@router.patch('/users/{user_id}/status')
def cambiar_estado_usuario(user_id: UUID, datos: CambioEstadoUsuario,
                            usuario=Depends(requerir_permiso('users:manage'))):
    try:
        actor = UUID(str(usuario['id']))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(403, 'Se requiere identidad administrativa verificable') from None
    if user_id == actor and datos.estado == 'inactive':
        raise HTTPException(409, 'No puedes desactivar tu propia cuenta')
    with Session(engine) as db:
        db.execute(text('SELECT pg_advisory_xact_lock(2026101804)'))
        own = db.get(User, actor)
        is_admin = db.scalar(select(UserRole.user_id).join(Role, Role.id == UserRole.role_id)
                             .where(UserRole.user_id == actor, Role.name == 'Administrador'))
        if own is None or own.status != 'active' or is_admin is None:
            raise HTTPException(403, 'Se requiere un administrador activo')
        target = db.get(User, user_id, with_for_update=True)
        if target is None:
            raise HTTPException(404, 'Usuario no encontrado')
        before = target.status
        target.status = datos.estado
        db.add(AuditLog(actor_id=actor, action='users.status.update', entity_type='user', entity_id=str(user_id),
                        before_json={'estado':before}, after_json={'estado':datos.estado}))
        db.commit()
        return {'usuario_id':str(user_id), 'estado':datos.estado}

def fecha(valor):
    return utc_iso(valor)

@router.get("/users")
def usuarios(usuario=Depends(requerir_permiso("users:read"))):
    with Session(engine) as db:
        registros = db.scalars(select(User).order_by(User.full_name)).all()
        asignaciones = db.execute(select(UserRole.user_id, Role.name)
            .join(Role, Role.id == UserRole.role_id)).all()
        mapa = defaultdict(list)
        for uid, nombre in asignaciones:
            mapa[uid].append(nombre)
        return {"total": len(registros), "usuarios": [{
            "id": str(u.id), "nombre": u.full_name, "email": u.email,
            "estado": u.status, "roles": sorted(mapa[u.id]),
            "creado_utc": fecha(u.created_at),
            "ultimo_acceso_utc": fecha(u.last_login_at)
        } for u in registros]}

@router.get("/roles")
def roles(usuario=Depends(requerir_permiso("users:read"))):
    with Session(engine) as db:
        registros = db.scalars(select(Role).order_by(Role.name)).all()
        conteos = dict(db.execute(select(UserRole.role_id, func.count())
            .group_by(UserRole.role_id)).all())
        return {"roles": [{
            "id": str(r.id), "nombre": r.name,
            "descripcion": r.description,
            "usuarios": int(conteos.get(r.id, 0)),
            "permisos": sorted(PERMISOS.get(r.name, frozenset()))
        } for r in registros]}

@router.patch("/users/{user_id}/roles")
def asignar_roles(user_id: UUID, datos: CambioRoles,
                 usuario=Depends(requerir_permiso("users:manage"))):
    solicitados = list(dict.fromkeys(n.strip() for n in datos.roles))
    if len(solicitados) != len(datos.roles) or any(not n for n in solicitados):
        raise HTTPException(422, "No se permiten roles vacios o repetidos")
    try:
        actor = UUID(str(usuario["id"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(403, "Se requiere identidad administrativa verificable")
    if user_id == actor:
        raise HTTPException(409, "No puedes modificar tus propios roles")
    with Session(engine) as db:
        administrador = db.get(User, actor)
        db.execute(text('SELECT pg_advisory_xact_lock(2026101804)'))
        db.refresh(administrador) if administrador is not None else None
        admin_real = db.scalar(select(func.count()).select_from(UserRole)
            .join(Role, Role.id == UserRole.role_id)
            .where(UserRole.user_id == actor, Role.name == "Administrador"))
        if not administrador or administrador.status != "active" or not admin_real:
            raise HTTPException(403, "La cuenta ya no tiene privilegios administrativos activos")
        destino = db.get(User, user_id)
        if not destino:
            raise HTTPException(404, "Usuario no encontrado")
        encontrados = db.scalars(select(Role).where(Role.name.in_(solicitados))).all()
        if len(encontrados) != len(solicitados):
            raise HTTPException(422, "Uno o varios roles no existen")
        anteriores = db.scalars(select(Role.name).join(UserRole,
            UserRole.role_id == Role.id).where(UserRole.user_id == user_id)).all()
        if "Administrador" in anteriores and "Administrador" not in solicitados:
            otros = db.scalar(select(func.count()).select_from(UserRole)
                .join(Role, Role.id == UserRole.role_id)
                .join(User, User.id == UserRole.user_id)
                .where(Role.name == "Administrador", User.status == "active",
                       User.id != user_id))
            if not otros:
                raise HTTPException(409, "Debe existir al menos otro administrador activo")
        db.execute(delete(UserRole).where(UserRole.user_id == user_id))
        db.add_all([UserRole(user_id=user_id, role_id=r.id) for r in encontrados])
        db.add(AuditLog(actor_id=actor, action="users.roles.update",
            entity_type="user", entity_id=str(user_id),
            before_json={"roles": sorted(anteriores)},
            after_json={"roles": sorted(solicitados)}))
        db.commit()
        return {"usuario_id": str(user_id), "roles": sorted(solicitados),
                "auditoria": "registrada", "requiere_nuevo_inicio_sesion": True}

@router.get("/audit")
def auditoria(
    busqueda: str = Query("", max_length=80),
    limite: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    usuario=Depends(requerir_permiso("audit:read"))
):
    with Session(engine) as db:
        filtro = []
        if busqueda.strip():
            patron = "%" + busqueda.strip() + "%"
            filtro.append(or_(AuditLog.action.ilike(patron),
                              AuditLog.entity_type.ilike(patron)))
        total = db.scalar(select(func.count()).select_from(AuditLog).where(*filtro))
        filas = db.execute(select(AuditLog, User.full_name)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(*filtro)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .offset(offset).limit(limite)).all()
        return {"total": int(total or 0), "registros": [{
            "id": str(a.id), "accion": a.action,
            "entidad": a.entity_type, "entidad_id": a.entity_id,
            "actor": nombre or "Sistema o usuario no disponible",
            "fecha_utc": fecha(a.occurred_at),
            "correlacion": a.correlation_id
        } for a, nombre in filas]}


@router.get('/audit/export')
def exportar_auditoria(busqueda: str = Query('', max_length=80), dias: int = Query(365, ge=1, le=365),
                       usuario=Depends(requerir_permiso('audit:read'))):
    import csv
    import io
    from datetime import timedelta
    from fastapi.responses import Response
    from app.reports import texto_seguro, registrar_descarga
    cutoff = datetime.now(timezone.utc)
    conditions = [AuditLog.occurred_at.between(cutoff-timedelta(days=dias), cutoff)]
    if busqueda.strip():
        pattern = '%' + busqueda.strip() + '%'
        conditions.append(or_(AuditLog.action.ilike(pattern), AuditLog.entity_type.ilike(pattern)))
    with Session(engine) as db:
        rows = db.execute(select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.actor_id)
                          .where(*conditions).order_by(AuditLog.occurred_at.desc()).limit(10001)).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['fecha_corte_utc','solicitante_id','filtro_dias','filtro_busqueda','limitado','fecha_operacion_utc','actor','accion','entidad','id_entidad','correlacion'])
    for entry, name in rows[:10000]:
        values = [fecha(cutoff),usuario.get('id'),dias,busqueda,len(rows)>10000,fecha(entry.occurred_at),name or 'Sistema',entry.action,entry.entity_type,entry.entity_id,entry.correlation_id]
        writer.writerow([texto_seguro(value) if isinstance(value,str) else value for value in values])
    registrar_descarga(usuario, 'auditoria.csv', dias, False, None)
    return Response('\ufeff'+output.getvalue(), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition':'attachment; filename=sismoia_auditoria.csv', 'Cache-Control':'no-store'})

@router.get("/system")
def sistema(usuario=Depends(requerir_permiso("audit:read"))):
    with Session(engine) as db:
        def contar(modelo):
            return int(db.scalar(select(func.count()).select_from(modelo)) or 0)
        pendientes = db.scalar(select(func.count()).select_from(SeismicAlert)
            .where(SeismicAlert.status == "pending"))
        sincronizaciones = db.execute(select(DataSource.name, DataSource.last_sync_at)
            .order_by(DataSource.name)).all()
        return {"base_datos": "Conectada",
            "usuarios": contar(User), "roles": contar(Role),
            "fuentes": contar(DataSource), "eventos": contar(SeismicEvent),
            "reglas": contar(AlertRule),
            "alertas_pendientes": int(pendientes or 0),
            "entradas_auditoria": contar(AuditLog),
            "sincronizaciones": [{
                "nombre": nombre, "fecha_utc": fecha(ultima)
            } for nombre, ultima in sincronizaciones],
            "fecha_consulta_utc": datetime.now(timezone.utc).isoformat(),
            "zona_horaria_visual": "America/Lima",
            "aviso": "Estado de datos y configuracion visible; no se muestran secretos ni credenciales."}
