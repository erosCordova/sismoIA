from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import engine
from app.models import User, Role, UserRole, AuditLog
from app.passwords import verify_password
from app.permissions import tiene_permiso, PERMISOS

class JWTConfig(BaseSettings):
    jwt_secret_key: str
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[3] / ".env", extra="ignore")

config = JWTConfig()
if len(config.jwt_secret_key) < 48:
    raise RuntimeError("Clave JWT demasiado corta")

router = APIRouter(prefix="/api/v1/auth", tags=["Autenticacion"])
bearer = HTTPBearer(auto_error=False)

class LoginRequest(BaseModel):
    email: str
    password: str

def obtener_roles(db, usuario):
    consulta = select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == usuario.id)
    return list(db.scalars(consulta).all())

def usuario_actual(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials is None:
        raise HTTPException(401, "Autenticacion requerida", headers={"WWW-Authenticate": "Bearer"})
    try:
        datos = jwt.decode(credentials.credentials, config.jwt_secret_key, algorithms=["HS256"], issuer="sismoia")
        usuario_id = UUID(datos["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(401, "Token invalido o vencido")
    with Session(engine) as db:
        usuario = db.get(User, usuario_id)
        if usuario is None or usuario.status != "active":
            raise HTTPException(401, "Usuario no autorizado")
        return {"id": str(usuario.id), "nombre": usuario.full_name, "email": usuario.email, "roles": obtener_roles(db, usuario)}

@router.post("/login")
def login(datos: LoginRequest):
    with Session(engine) as db:
        usuario = db.scalar(select(User).where(User.email == datos.email.strip().lower()))
        if usuario is None or usuario.status != "active" or not verify_password(datos.password, usuario.password_hash):
            raise HTTPException(401, "Credenciales invalidas")
        ahora = datetime.now(timezone.utc)
        token = jwt.encode({"sub": str(usuario.id), "iss": "sismoia", "iat": ahora, "exp": ahora + timedelta(hours=1)}, config.jwt_secret_key, algorithm="HS256")
        usuario.last_login_at = ahora
        db.add(AuditLog(actor_id=usuario.id, action="auth.login", entity_type="users", entity_id=str(usuario.id), after_json={"resultado":"exitoso"}))
        db.commit()
        return {"access_token": token, "token_type": "bearer", "expires_in": 3600}

@router.get("/me")
def me(usuario=Depends(usuario_actual)):
    permisos = set().union(*(PERMISOS.get(r, frozenset()) for r in usuario["roles"]))
    return {**usuario, "permisos": sorted(permisos)}

@router.get("/admin-check")
def admin_check(usuario=Depends(usuario_actual)):
    if not tiene_permiso(usuario["roles"], "users:write"):
        raise HTTPException(403, "Permiso insuficiente")
    return {"authorized": True}
