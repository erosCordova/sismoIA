from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.database import engine
from app.models import User, Role, UserRole, AuditLog
from app.passwords import hash_password
router = APIRouter(prefix="/api/v1/admin", tags=["Usuarios"])

class UsuarioNuevo(BaseModel):
    nombre: str = Field(min_length=2, max_length=180)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    rol: str

@router.post("/users", status_code=201)
def crear_usuario(datos: UsuarioNuevo, actor: dict = Depends(requerir_permiso("users:write"))):
    correo = datos.email.strip().lower()
    if "@" not in correo or correo.startswith("@") or correo.endswith("@"):
        raise HTTPException(422, "Correo invalido")
    with Session(engine) as db:
        rol = db.scalar(select(Role).where(Role.name == datos.rol))
        if rol is None:
            raise HTTPException(422, "Rol no valido")
        if db.scalar(select(User.id).where(User.email == correo)) is not None:
            raise HTTPException(409, "Correo ya registrado")
        usuario = User(full_name=datos.nombre.strip(), email=correo, password_hash=hash_password(datos.password), status="active")
        db.add(usuario)
        db.flush()
        db.add(UserRole(user_id=usuario.id, role_id=rol.id))
        db.add(AuditLog(actor_id=UUID(actor["id"]), action="users.create", entity_type="users", entity_id=str(usuario.id), after_json={"email":correo,"rol":rol.name}))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Correo ya registrado")
        return {"id": str(usuario.id), "nombre": usuario.full_name, "email": correo, "rol": rol.name, "estado": usuario.status}
