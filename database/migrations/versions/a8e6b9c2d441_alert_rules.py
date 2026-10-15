"""Reglas y alertas sismicas SISMOIA"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a8e6b9c2d441"
down_revision = "579e94444c25"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("alert_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("min_magnitude", sa.Numeric(5, 2), nullable=False),
        sa.Column("max_depth_km", sa.Numeric(9, 3), nullable=True),
        sa.Column("peru_only", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_table("seismic_alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("rule_id", UUID(as_uuid=True), sa.ForeignKey("alert_rules.id"), nullable=False),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("seismic_events.id"), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("rule_id", "event_id", name="uq_seismic_alert_rule_event"))
    op.create_index("ix_seismic_alert_status", "seismic_alerts", ["status", "created_at"])
    op.create_table("alert_actions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("alert_id", UUID(as_uuid=True), sa.ForeignKey("seismic_alerts.id"), nullable=True),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))

def downgrade():
    op.drop_table("alert_actions")
    op.drop_index("ix_seismic_alert_status", table_name="seismic_alerts")
    op.drop_table("seismic_alerts")
    op.drop_table("alert_rules")
