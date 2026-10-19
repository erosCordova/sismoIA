-- Revision d18a2026b001: revisar y autorizar antes de aplicar en Supabase.
-- Conserva datos existentes. Cambia esquema y permisos de las tablas indicadas.
-- Alternativa a alembic upgrade head: ejecutar el bloque completo, no fragmentos.
BEGIN;
SET LOCAL search_path TO public;
SELECT pg_advisory_xact_lock(2026101803);
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.alembic_version) <> 1 OR
     NOT EXISTS (SELECT 1 FROM public.alembic_version WHERE version_num IN ('c0ed8126a9b3', 'd18a2026b001')) THEN
    RAISE EXCEPTION 'Revision inesperada: detener y revisar el estado de migraciones';
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS sismo_dataset_versions (
	id UUID NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	signature VARCHAR(64) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	manifest JSONB NOT NULL, 
	snapshot JSONB NOT NULL, 
	total_rows INTEGER NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	reviewed_by UUID, 
	reviewed_at TIMESTAMP WITH TIME ZONE, 
	review_note TEXT, 
	PRIMARY KEY (id), 
	UNIQUE (signature), 
	FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(reviewed_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sismo_ml_experiments (
	id UUID NOT NULL, 
	dataset_id UUID NOT NULL, 
	algorithm VARCHAR(40) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	parameters JSONB NOT NULL, 
	results JSONB NOT NULL, 
	artifact BYTEA NOT NULL, 
	artifact_sha256 VARCHAR(64) NOT NULL, 
	created_by UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	reviewed_by UUID, 
	reviewed_at TIMESTAMP WITH TIME ZONE, 
	review_note TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(dataset_id) REFERENCES sismo_dataset_versions (id) ON DELETE RESTRICT, 
	FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(reviewed_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sismo_alert_deliveries (
	id UUID NOT NULL, 
	alert_id UUID NOT NULL, 
	recipient_id UUID NOT NULL, 
	channel VARCHAR(30) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	attempts INTEGER NOT NULL, 
	last_attempt_at TIMESTAMP WITH TIME ZONE, 
	acknowledged_at TIMESTAMP WITH TIME ZONE, 
	cancelled_at TIMESTAMP WITH TIME ZONE, 
	error TEXT, 
	assigned_by UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_sismo_delivery_recipient UNIQUE (alert_id, recipient_id, channel), 
	FOREIGN KEY(alert_id) REFERENCES seismic_alerts (id) ON DELETE RESTRICT, 
	FOREIGN KEY(recipient_id) REFERENCES users (id) ON DELETE RESTRICT, 
	FOREIGN KEY(assigned_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
	id UUID NOT NULL, 
	source_id UUID NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	finished_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(20) NOT NULL, 
	records_seen INTEGER NOT NULL, 
	records_inserted INTEGER NOT NULL, 
	records_updated INTEGER NOT NULL, 
	records_rejected INTEGER NOT NULL, 
	error_summary TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_ingestion_source_started ON ingestion_runs (source_id, started_at);

ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS allowed_source VARCHAR(20);

ALTER TABLE public.seismic_events ADD COLUMN IF NOT EXISTS origin_hash VARCHAR(64);

ALTER TABLE public.seismic_events ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.sismo_dataset_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.sismo_dataset_versions FROM PUBLIC;

DO $permissions$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'sismo_dataset_versions', role_name);
  END LOOP;
END $permissions$;

ALTER TABLE public.sismo_ml_experiments ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.sismo_ml_experiments FROM PUBLIC;

DO $permissions$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'sismo_ml_experiments', role_name);
  END LOOP;
END $permissions$;

ALTER TABLE public.sismo_alert_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.sismo_alert_deliveries FROM PUBLIC;

DO $permissions$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'sismo_alert_deliveries', role_name);
  END LOOP;
END $permissions$;

ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.ingestion_runs FROM PUBLIC;

DO $permissions$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'ingestion_runs', role_name);
  END LOOP;
END $permissions$;

UPDATE public.alembic_version SET version_num = 'd18a2026b001' WHERE version_num = 'c0ed8126a9b3';

COMMIT;
