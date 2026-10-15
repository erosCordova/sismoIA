"""Proteger tablas de SISMOIA frente a acceso directo por Data API."""
from alembic import op
import sqlalchemy as sa

revision = "c0ed8126a9b3"
down_revision = "a8e6b9c2d441"
branch_labels = None
depends_on = None

TABLAS = (
    "data_sources", "seismic_events", "roles", "users",
    "user_roles", "audit_logs", "alert_rules",
    "seismic_alerts", "alert_actions", "alembic_version",
)

ROLES_API = ("anon", "authenticated", "service_role")

def upgrade():
    conexion = op.get_bind()
    existentes = set(conexion.execute(sa.text("SELECT rolname FROM pg_roles")).scalars())
    revocar = [rol for rol in ROLES_API if rol in existentes]
    destinatarios = ", ".join(revocar)
    for tabla in TABLAS:
        op.execute(f"ALTER TABLE public.{tabla} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{tabla} FROM PUBLIC")
        if destinatarios:
            op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{tabla} FROM {destinatarios}")

def downgrade():
    raise RuntimeError("La proteccion RLS no debe revertirse automaticamente")
