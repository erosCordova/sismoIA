"""Historial persistente e ingesta idempotente con actualizacion de revisiones."""
from datetime import datetime, timezone
from functools import wraps
from hashlib import sha256
import json
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Index, select, text
from sqlalchemy.dialects.postgresql import UUID, insert
from sqlalchemy.orm import Session

from app.database import engine
from app.models import Base, DataSource, SeismicEvent


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime(timezone=True))
    status = Column(String(20), nullable=False, default="running")
    records_seen = Column(Integer, nullable=False, default=0)
    records_inserted = Column(Integer, nullable=False, default=0)
    records_updated = Column(Integer, nullable=False, default=0)
    records_rejected = Column(Integer, nullable=False, default=0)
    error_summary = Column(Text)
    __table_args__ = (Index("ix_ingestion_source_started", "source_id", "started_at"),)


def origin_hash(record):
    return sha256(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def store_events(db, source, events):
    if not events:
        return {"inserted": 0, "updated": 0, "unchanged": 0}
    current = dict(db.execute(select(SeismicEvent.external_id, SeismicEvent.origin_hash)
                             .where(SeismicEvent.source_id == source.id,
                                    SeismicEvent.external_id.in_([e["external_id"] for e in events]))).all())
    changed = [e for e in events if e["external_id"] not in current or current[e["external_id"]] != e["origin_hash"]]
    now = datetime.now(timezone.utc)
    for offset in range(0, len(changed), 250):
        batch = [{**e, "last_updated_at": now} for e in changed[offset:offset+250]]
        statement = insert(SeismicEvent).values(batch)
        updates = {key: getattr(statement.excluded, key) for key in batch[0]
                   if key not in ("id", "source_id", "external_id", "received_at")}
        db.execute(statement.on_conflict_do_update(
            constraint="uq_seismic_source_external", set_=updates,
            where=SeismicEvent.origin_hash.is_distinct_from(statement.excluded.origin_hash)))
    inserted = sum(e["external_id"] not in current for e in changed)
    return {"inserted": inserted, "updated": len(changed) - inserted, "unchanged": len(events) - len(changed)}


def tracked_ingestion(name, organization, url, source_type):
    def decorator(function):
        @wraps(function)
        def wrapped(usuario):
            if "Administrador" not in usuario.get("roles", []):
                raise HTTPException(403, "Solo administradores pueden sincronizar fuentes")
            # Todas las entradas (HTTP y worker) comparten este bloqueo por proveedor.
            with engine.connect() as guard:
                guard.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name))"), {"name": "sismoia.ingestion." + name})
                with Session(engine) as db:
                    source = db.scalar(select(DataSource).where(DataSource.name == name))
                    if source is None:
                        source = DataSource(name=name, organization=organization, base_url=url, source_type=source_type, status="inactive")
                        db.add(source)
                        db.flush()
                    run = IngestionRun(source_id=source.id)
                    db.add(run)
                    db.flush()
                    run_id = run.id
                    db.commit()
                try:
                    result = function(usuario)
                except Exception as error:
                    with Session(engine) as db:
                        run = db.get(IngestionRun, run_id)
                        run.finished_at = datetime.now(timezone.utc)
                        run.status = "failed"
                        # No persistir URLs de conexion, tokens ni cuerpos externos.
                        run.error_summary = type(error).__name__ + (f" (HTTP {error.status_code})" if isinstance(error, HTTPException) else "")
                        db.get(DataSource, run.source_id).status = "error"
                        db.commit()
                    raise
                with Session(engine) as db:
                    run = db.get(IngestionRun, run_id)
                    run.finished_at = datetime.now(timezone.utc)
                    run.status = "success"
                    run.records_seen = result["recibidos"]
                    run.records_inserted = result["importados"]
                    run.records_updated = result.get("actualizados", 0)
                    run.records_rejected = result.get("descartados", 0)
                    db.get(DataSource, run.source_id).status = "active"
                    db.commit()
                return {**result, "ejecucion_id": str(run_id)}
        return wrapped
    return decorator
