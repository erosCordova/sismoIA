import sys, secrets
from pathlib import Path
from uuid import uuid4, UUID
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from app.main import app
from app.auth import usuario_actual
from app.database import engine
from app.models import User, Role, UserRole, AuditLog
from app.passwords import verify_password
db = Session(engine)
admin = db.scalar(select(User.id).join(UserRole).join(Role).where(Role.name == "Administrador"))
assert admin is not None, "Administrador no encontrado"
email = "prueba-" + uuid4().hex + "@example.invalid"
password = secrets.token_urlsafe(24)
datos = {"nombre": "Usuario de Prueba", "email": email, "password": password, "rol": "Analista"}
app.dependency_overrides[usuario_actual] = lambda: {"id": str(admin), "roles": ["Administrador"]}
created_id = None
try:
    client = TestClient(app)
    respuesta = client.post("/api/v1/admin/users", json=datos)
    assert respuesta.status_code == 201, str(respuesta.status_code)
    created_id = respuesta.json()["id"]
    assert client.post("/api/v1/admin/users", json=datos).status_code == 409
    db.expire_all()
    usuario = db.scalar(select(User).where(User.email == email))
    assert usuario is not None and verify_password(password, usuario.password_hash)
    assert "password_hash" not in respuesta.json()
    assert db.scalar(select(UserRole).where(UserRole.user_id == usuario.id)) is not None
    assert db.scalar(select(AuditLog).where(AuditLog.entity_id == created_id, AuditLog.action == "users.create")) is not None
    print("CREACION=201 | DUPLICADOS=409 | ROL=OK | HASH=OK | AUDITORIA=OK")
finally:
    app.dependency_overrides.clear()
    if created_id:
        db.execute(delete(AuditLog).where(AuditLog.entity_id == created_id, AuditLog.action == "users.create"))
        db.execute(delete(UserRole).where(UserRole.user_id == UUID(created_id)))
        db.execute(delete(User).where(User.id == UUID(created_id)))
        db.commit()
    db.close()
