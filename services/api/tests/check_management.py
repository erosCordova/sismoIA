import sys
from pathlib import Path
from uuid import uuid4
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.main import app
from app.auth import usuario_actual
from app.database import engine
from app.models import User, Role, UserRole, AuditLog

cliente = TestClient(app)
rutas = ["/api/v1/management/users", "/api/v1/management/roles",
         "/api/v1/management/audit", "/api/v1/management/system"]
for ruta in rutas:
    assert cliente.get(ruta).status_code == 401, ruta
print("SIN_TOKEN=401_OK")

try:
    app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Solo lectura"]}
    for ruta in rutas:
        assert cliente.get(ruta).status_code == 403, ruta
    print("SOLO_LECTURA=403_OK")

    app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Auditor"]}
    for ruta in rutas:
        r = cliente.get(ruta)
        assert r.status_code == 200, f"{ruta}: {r.text[:300]}"
    print("CONSULTAS_AUDITOR=OK")

    with Session(engine) as db:
        admin = db.scalar(select(User).join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.name == "Administrador", User.status == "active").limit(1))
        assert admin is not None, "NO_HAY_ADMINISTRADOR_ACTIVO"
        admin_id = admin.id
        analista = db.scalar(select(Role).where(Role.name == "Analista"))
        assert analista is not None, "FALTA_ROL_ANALISTA"

    app.dependency_overrides[usuario_actual] = lambda: {"id": str(admin_id), "roles": ["Administrador"]}
    for ruta in rutas:
        r = cliente.get(ruta)
        assert r.status_code == 200, f"{ruta}: {r.text[:300]}"
    assert cliente.get("/api/v1/management/system").json()["base_datos"] == "Conectada"
    print("CONSULTAS_ADMIN=OK")

    bloqueo = cliente.patch(f"/api/v1/management/users/{admin_id}/roles",
        json={"roles": ["Analista"]})
    assert bloqueo.status_code == 409, bloqueo.text[:300]
    print("AUTOMODIFICACION_ADMIN_BLOQUEADA=OK")

    prueba_id = None
    try:
        with Session(engine) as db:
            prueba = User(full_name="SISMOIA PRUEBA TEMPORAL",
                email=f"sismoia-{uuid4().hex}@example.invalid",
                password_hash="CUENTA_INACTIVA_NO_UTILIZABLE", status="inactive")
            db.add(prueba)
            db.flush()
            prueba_id = prueba.id
            db.commit()
        actualizacion = cliente.patch(
            f"/api/v1/management/users/{prueba_id}/roles",
            json={"roles": ["Analista"]})
        assert actualizacion.status_code == 200, actualizacion.text[:300]
        assert actualizacion.json()["roles"] == ["Analista"]
        with Session(engine) as db:
            asignados = db.scalars(select(Role.name)
                .join(UserRole, UserRole.role_id == Role.id)
                .where(UserRole.user_id == prueba_id)).all()
            registro = db.scalar(select(AuditLog)
                .where(AuditLog.entity_id == str(prueba_id),
                       AuditLog.action == "users.roles.update"))
            assert asignados == ["Analista"]
            assert registro is not None
        print("ASIGNACION_ROLES=OK")
        print("AUDITORIA_CAMBIO_ROLES=OK")
    finally:
        if prueba_id:
            with Session(engine) as db:
                db.execute(delete(AuditLog).where(
                    AuditLog.entity_type == "user",
                    AuditLog.entity_id == str(prueba_id)))
                db.execute(delete(UserRole).where(UserRole.user_id == prueba_id))
                db.execute(delete(User).where(User.id == prueba_id))
                db.commit()
        print("LIMPIEZA_CUENTA_TEMPORAL=OK")

    print("ADMINISTRACION_Y_AUDITORIA_BACKEND=OK")
finally:
    app.dependency_overrides.clear()

esquema = app.openapi()
alta = esquema["paths"].get("/api/v1/admin/users", {}).get("post", {})
cuerpo = alta.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
referencia = cuerpo.get("$ref", "").split("/")[-1]
definicion = esquema.get("components", {}).get("schemas", {}).get(referencia, {})
print("ALTA_EXISTENTE_CAMPOS=", list(definicion.get("properties", {}).keys()))
print("ALTA_EXISTENTE_REQUERIDOS=", definicion.get("required", []))
