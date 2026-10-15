from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column
from app.models import Base as AlertBase

class AlertRule(AlertBase):
    __tablename__ = "alert_rules"
    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = mapped_column(String(120), nullable=False, unique=True)
    min_magnitude = mapped_column(Numeric(5, 2), nullable=False)
    max_depth_km = mapped_column(Numeric(9, 3), nullable=True)
    peru_only = mapped_column(Boolean, default=False, nullable=False)
    enabled = mapped_column(Boolean, default=True, nullable=False)
    created_by = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SeismicAlert(AlertBase):
    __tablename__ = "seismic_alerts"
    __table_args__ = (UniqueConstraint("rule_id", "event_id", name="uq_seismic_alert_rule_event"),)
    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    rule_id = mapped_column(UUID(as_uuid=True), ForeignKey("alert_rules.id"), nullable=False)
    event_id = mapped_column(UUID(as_uuid=True), ForeignKey("seismic_events.id"), nullable=False)
    severity = mapped_column(String(20), nullable=False)
    status = mapped_column(String(20), default="pending", nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    reviewed_by = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at = mapped_column(DateTime(timezone=True), nullable=True)

class AlertAction(AlertBase):
    __tablename__ = "alert_actions"
    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    alert_id = mapped_column(UUID(as_uuid=True), ForeignKey("seismic_alerts.id"), nullable=True)
    actor_id = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = mapped_column(String(80), nullable=False)
    details = mapped_column(Text, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
