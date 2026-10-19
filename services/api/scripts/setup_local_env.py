"""Genera secretos locales; nunca sobrescribe configuracion existente."""
from pathlib import Path
import secrets


def main():
    root = Path(__file__).resolve().parents[3]
    password = secrets.token_hex(24)
    content = (
        f"POSTGRES_PASSWORD={password}\n"
        f"DATABASE_URL=postgresql+psycopg://sismoia:{password}@127.0.0.1:55432/sismoia\n"
        f"JWT_SECRET_KEY={secrets.token_urlsafe(64)}\n"
        "CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\n"
        "SISMOIA_EMAIL_ENABLED=false\n"
    )
    target = root / ".env.local"
    try:
        with target.open("x", encoding="utf-8") as output:
            output.write(content)
    except FileExistsError:
        raise SystemExit("Ya existe .env.local; se conserva sin cambios.")
    print("Configuracion local creada en .env.local. Secretos omitidos de la salida.")


if __name__ == "__main__":
    main()
