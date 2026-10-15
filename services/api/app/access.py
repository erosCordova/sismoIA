from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.auth import usuario_actual
from app.database import engine
from app.models import User
from app.permissions import tiene_permiso

router = APIRouter(prefix="/api/v1/admin", tags=["Administracion"])

def requerir_permiso(permiso: str):
    def verificar(usuario: dict = Depends(usuario_actual)):
        if not tiene_permiso(usuario["roles"], permiso):
            raise HTTPException(status_code=403, detail="Permiso insuficiente")
        return usuario
    return verificar

@router.get("/users")
def listar_usuarios(usuario: dict = Depends(requerir_permiso("users:read"))):
    with Session(engine) as db:
        return [{"id": str(u.id), "nombre": u.full_name, "email": u.email, "estado": u.status} for u in db.scalars(select(User).order_by(User.full_name)).all()]
