from sqlalchemy.orm import declarative_base

Base = declarative_base()


from uuid import uuid4
from sqlalchemy import Column, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID

class DataSource(Base):
    __tablename__ = "data_sources"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(120), unique=True, nullable=False)
    organization = Column(String(180), nullable=False)
    base_url = Column(Text, nullable=False)
    source_type = Column(String(40), nullable=False)
    status = Column(String(20), nullable=False, server_default="inactive")
    last_sync_at = Column(DateTime(timezone=True))
    config_ref = Column(String(255))
    license_name = Column(String(200))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

from sqlalchemy import ForeignKey, Numeric, CheckConstraint, UniqueConstraint, Index

class SeismicEvent(Base):
    __tablename__ = "seismic_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False)
    external_id = Column(String(150), nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    latitude = Column(Numeric(9, 6), nullable=False)
    longitude = Column(Numeric(9, 6), nullable=False)
    magnitude = Column(Numeric(5, 2), nullable=False)
    magnitude_type = Column(String(30))
    depth_km = Column(Numeric(9, 3))
    place = Column(Text)
    source_url = Column(Text)
    received_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    review_status = Column(String(30), nullable=False, server_default="unknown")
    origin_hash = Column(String(64))
    last_updated_at = Column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("source_id", "external_id", name="uq_seismic_source_external"), CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_seismic_latitude"), CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_seismic_longitude"), Index("ix_seismic_date", "occurred_at"), Index("ix_seismic_magnitude", "magnitude"), Index("ix_seismic_coordinates", "latitude", "longitude"))


class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    full_name = Column(String(180), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, server_default="active")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))

class Role(Base):
    __tablename__ = "roles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(60), unique=True, nullable=False)
    description = Column(Text)

class UserRole(Base):
    __tablename__ = "user_roles"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    assigned_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

from sqlalchemy.dialects.postgresql import JSONB
from app.request_context import get_correlation_id

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100))
    before_json = Column(JSONB)
    after_json = Column(JSONB)
    occurred_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    correlation_id = Column(String(120), default=get_correlation_id)
