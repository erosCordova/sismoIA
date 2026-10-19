"""Integra gobierno ML y entregas en Alembic y protege las tablas nuevas."""
from alembic import op
import sqlalchemy as sa

revision = "d18a2026b001"
down_revision = "c0ed8126a9b3"
branch_labels = None
depends_on = None


def upgrade():
    from app import alert_models  # noqa: F401: registra claves foraneas
    from app.governance_models import DatasetVersion, ExperimentRun
    from app.delivery_models import AlertDelivery
    from app.ingestion import IngestionRun

    bind = op.get_bind()
    # checkfirst permite adoptar instalaciones que usaron los scripts antiguos.
    tables = [DatasetVersion.__table__, ExperimentRun.__table__, AlertDelivery.__table__, IngestionRun.__table__]
    for table in tables:
        table.create(bind, checkfirst=True)
    existing = {c["name"] for c in sa.inspect(bind).get_columns("alert_rules")}
    if "allowed_source" not in existing:
        op.add_column("alert_rules", sa.Column("allowed_source", sa.String(20), nullable=True))
    event_columns = {c["name"] for c in sa.inspect(bind).get_columns("seismic_events")}
    if "origin_hash" not in event_columns:
        op.add_column("seismic_events", sa.Column("origin_hash", sa.String(64), nullable=True))
    if "last_updated_at" not in event_columns:
        op.add_column("seismic_events", sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=True))
    roles = set(bind.execute(sa.text("SELECT rolname FROM pg_roles")).scalars())
    for table in tables:
        # Identificadores constantes de modelos propios; no provienen del usuario.
        op.execute(f"ALTER TABLE public.{table.name} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table.name} FROM PUBLIC")
        for role in ("anon", "authenticated", "service_role"):
            if role in roles:
                op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table.name} FROM {role}")


def downgrade():
    raise RuntimeError("Requiere una migracion de recuperacion revisada; no se eliminan datasets ni entregas automaticamente")
