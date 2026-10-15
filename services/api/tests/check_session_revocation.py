from datetime import datetime, timedelta, timezone
from uuid import uuid4
import jwt
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.auth import config
from app.database import engine
from app.main import app
from app.models import User, Role, UserRole

cliente = TestClient(app)
uid = None

try:
    with Session(engine) as db:
        auditor = db.scalar(select(Role).where(Role.name == "Auditor"))
        lectura = db.scalar(select(Role).where(Role.name == "Solo lectura"))
        assert auditor is not None and lectura is not None
        lectura_id = lectura.id
        temporal = User(full_name="PRUEBA SEGURIDAD SISMOIA",
            email=f"prueba-{uuid4().hex}@example.invalid",
            password_hash="HASH_INVALIDO_CUENTA_DE_PRUEBA",
            status="active")
        db.add(temporal)
        db.flush()
        uid = temporal.id
        db.add(UserRole(user_id=uid, role_id=auditor.id))
        db.commit()

    ahora = datetime.now(timezone.utc)
    token = jwt.encode({
        "sub": str(uid), "iss": "sismoia",
        "iat": ahora, "exp": ahora + timedelta(minutes=5)
    }, config.jwt_secret_key, algorithm="HS256")
    cabeceras = {"Authorization": "Bearer " + token}
    ruta = "/api/v1/management/users"

    r = cliente.get(ruta, headers=cabeceras)
    assert r.status_code == 200, r.status_code
    print("ACCESO_INICIAL_AUDITOR=200_OK")

    with Session(engine) as db:
        db.execute(delete(UserRole).where(UserRole.user_id == uid))
        db.add(UserRole(user_id=uid, role_id=lectura_id))
        db.commit()

    r = cliente.get(ruta, headers=cabeceras)
    assert r.status_code == 403, r.status_code
    print("PERMISO_RETIRADO_TOKEN_ANTERIOR=403_OK")

    with Session(engine) as db:
        temporal = db.get(User, uid)
        temporal.status = "inactive"
        db.commit()

    r = cliente.get("/api/v1/auth/me", headers=cabeceras)
    assert r.status_code == 401, r.status_code
    print("CUENTA_DESACTIVADA_TOKEN_ANTERIOR=401_OK")
    print("REVOCACION_INMEDIATA=VALIDADA")

finally:
    if uid is not None:
        with Session(engine) as db:
            db.execute(delete(UserRole).where(UserRole.user_id == uid))
            db.execute(delete(User).where(User.id == uid))
            db.commit()
        print("CUENTA_TEMPORAL_ELIMINADA=OK")
