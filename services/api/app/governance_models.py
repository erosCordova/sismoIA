from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer,
    LargeBinary, String, Text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.models import Base


def ahora():
    return datetime.now(timezone.utc)


class DatasetVersion(Base):
    __tablename__ = "sismo_dataset_versions"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4
    )
    name = Column(String(120), nullable=False)
    signature = Column(
        String(64), nullable=False, unique=True
    )
    status = Column(
        String(20),
        nullable=False,
        default="pending"
    )
    manifest = Column(JSONB, nullable=False)
    snapshot = Column(JSONB, nullable=False)
    total_rows = Column(Integer, nullable=False)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=ahora
    )
    reviewed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at = Column(DateTime(timezone=True))
    review_note = Column(Text)


class ExperimentRun(Base):
    __tablename__ = "sismo_ml_experiments"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4
    )
    dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "sismo_dataset_versions.id",
            ondelete="RESTRICT"
        ),
        nullable=False
    )
    algorithm = Column(
        String(40), nullable=False
    )
    status = Column(
        String(20),
        nullable=False,
        default="pending"
    )
    parameters = Column(JSONB, nullable=False)
    results = Column(JSONB, nullable=False)
    artifact = Column(LargeBinary, nullable=False)
    artifact_sha256 = Column(
        String(64), nullable=False
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=ahora
    )
    reviewed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at = Column(DateTime(timezone=True))
    review_note = Column(Text)
