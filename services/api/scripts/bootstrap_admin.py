"""Crea el primer administrador de una base nueva mediante consola local."""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    from sqlalchemy import select
    from sqlalchemy.orm import Session
    from app.database import engine
    from app.models import User, Role, UserRole, AuditLog
    from app.permissions import PERMISOS
    from app.passwords import hash_password

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--nombre", required=True)
    args = parser.parse_args()
    email, name = args.email.strip().lower(), args.nombre.strip()
    if email.count("@") != 1 or any(c.isspace() for c in email) or len(name) < 2:
        parser.error("Correo o nombre invalido")
    password = getpass.getpass("Contrasena nueva (minimo 12 caracteres): ")
    if len(password) < 12 or password != getpass.getpass("Repetir contrasena: "):
        parser.error("Contrasena corta o confirmacion distinta")
    with Session(engine) as db:
        # Bloqueo transaccional para impedir dos bootstrap simultaneos.
        from sqlalchemy import text
        db.execute(text("SELECT pg_advisory_xact_lock(2026101801)"))
        if db.scalar(select(User.id).join(UserRole, UserRole.user_id == User.id)
                     .join(Role, Role.id == UserRole.role_id)
                     .where(Role.name == "Administrador", User.status == "active").limit(1)):
            raise SystemExit("Ya hay un administrador activo; usa la administracion autenticada.")
        if db.scalar(select(User.id).where(User.email == email)):
            raise SystemExit("El correo ya esta registrado; no se modifico la cuenta.")
        roles = {r.name: r for r in db.scalars(select(Role))}
        for role_name in PERMISOS:
            if role_name not in roles:
                role = Role(name=role_name)
                db.add(role)
                roles[role_name] = role
        user = User(full_name=name, email=email, password_hash=hash_password(password), status="active")
        db.add(user)
        db.flush()
        db.add(UserRole(user_id=user.id, role_id=roles["Administrador"].id))
        db.add(AuditLog(actor_id=user.id, action="users.bootstrap", entity_type="users", entity_id=str(user.id)))
        db.commit()
    print("Administrador inicial creado. Inicia sesion desde la web.")


if __name__ == "__main__":
    main()
