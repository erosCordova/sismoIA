from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Column, DateTime, ForeignKey,
    Integer, String, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID

from app.models import Base


def ahora():
    return datetime.now(timezone.utc)


class AlertDelivery(Base):
    __tablename__ = "sismo_alert_deliveries"

    __table_args__ = (
        UniqueConstraint(
            "alert_id",
            "recipient_id",
            "channel",
            name="uq_sismo_delivery_recipient"
        ),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4
    )

    alert_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "seismic_alerts.id",
            ondelete="RESTRICT"
        ),
        nullable=False
    )

    recipient_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT"
        ),
        nullable=False
    )

    channel = Column(
        String(30),
        nullable=False,
        default="internal"
    )

    status = Column(
        String(30),
        nullable=False,
        default="assigned"
    )

    attempts = Column(
        Integer,
        nullable=False,
        default=0
    )

    last_attempt_at = Column(DateTime(timezone=True))
    acknowledged_at = Column(DateTime(timezone=True))
    cancelled_at = Column(DateTime(timezone=True))
    error = Column(Text)

    assigned_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL")
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=ahora
    )
