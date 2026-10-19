"""Regresiones de los criterios del plan; no usa red, SMTP ni una base real."""
import io
import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import joblib
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_mock_engine
from sqlalchemy.schema import CreateTable

from app import preparation, governance, ml_engine, science, seismic
from app.auth import usuario_actual
from app.main import app
from app.time_utils import utc_iso, parse_utc
from app.ml_data import temporal_split
from app.alert_models import AlertRule
from app.delivery_models import AlertDelivery
from app.governance_models import DatasetVersion, ExperimentRun
from app.alert_delivery_summary import summarize_deliveries
from app.seismic_forecast import fuente_historica


def rows():
    start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    return [{
        "id": str(i), "fuente": "IGP" if i % 2 else "USGS",
        "fecha_utc": utc_iso(start + timedelta(days=i)),
        "particion": "entrenamiento" if i < 80 else "validacion",
        "latitud": -12 + i / 100, "longitud": -77,
        "magnitud": 3.0 + i % 3, "profundidad_km": None if i < 56 else 10.0,
        "estado_calidad": "INCOMPLETO" if i < 56 else "VALIDO",
        "banderas": ["profundidad_faltante"] if i < 56 else [],
    } for i in range(100)]


class PlanRegressionTests(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def test_roles_exportacion_y_consulta(self):
        for roles, expected_read, expected_export in [
            (["Solo lectura"], 403, 403), (["Auditor"], 403, 403),
            (["Operador de alertas"], 403, 403), (["Analista"], 200, 200),
            (["Administrador"], 200, 200),
        ]:
            app.dependency_overrides[usuario_actual] = lambda roles=roles: {"id": str(uuid4()), "roles": roles}
            with self.subTest(roles=roles), patch.object(preparation, "preparar", return_value=[]):
                with TestClient(app) as client:
                    self.assertEqual(client.get("/api/v1/preparation/profile").status_code, expected_read)
                    self.assertEqual(client.get("/api/v1/preparation/export").status_code, expected_export)

    def test_preparacion_requiere_autenticacion(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/v1/preparation/export").status_code, 401)

    def test_fechas_con_zona_y_sin_zona(self):
        base = datetime(2026, 10, 18, 15, tzinfo=timezone.utc)
        self.assertEqual(utc_iso(base), "2026-10-18T15:00:00Z")
        self.assertEqual(utc_iso(base.astimezone(timezone(timedelta(hours=-5)))), utc_iso(base))
        self.assertEqual(parse_utc(utc_iso(base)), base)
        self.assertEqual(utc_iso(base.replace(tzinfo=None)), utc_iso(base))

    def test_serializador_anterior_devuelve_fecha_valida(self):
        event = SimpleNamespace(id=uuid4(), external_id="x", occurred_at=datetime.now(timezone.utc), latitude=-12,
                                longitude=-77, magnitude=5, depth_km=20, place="Lima", source_url=None,
                                magnitude_type="Mw", review_status="reviewed")
        result = seismic.serializar(event)
        self.assertNotIn("+00:00Z", result["fecha_utc"])
        self.assertEqual(parse_utc(result["fecha_utc"]), event.occurred_at)

    def test_snapshot_conserva_nulos_y_no_muta_origen(self):
        source = rows()
        before = [dict(r) for r in source]
        data = governance.NuevaVersion(nombre="Dataset de prueba", limite=100, imputar_profundidad=True)
        with patch.object(governance, "obtener_dataset", return_value=source):
            manifest, snapshot, signature = governance.construir_snapshot(data)
        self.assertIsNone(snapshot[0]["profundidad_km"])
        self.assertFalse(snapshot[0]["profundidad_imputada"])
        self.assertEqual(source, before)
        self.assertEqual(source[0]["profundidad_km"], None)
        self.assertEqual(manifest["reglas"], "SISMOIA_DATASET_SNAPSHOT_V2")
        self.assertTrue(governance.firma_snapshot_valida(manifest, snapshot, signature))

    def test_seleccion_no_imputa_con_filas_del_futuro(self):
        from sklearn.impute import SimpleImputer
        fitted = []

        def imputer(**kwargs):
            result = SimpleImputer(**kwargs)
            fitted.append(result)
            return result

        for future in (20.0, 200.0):
            source = rows()
            for row in source[64:]:
                row["profundidad_km"] = future
            fitted.clear()
            ds = SimpleNamespace(manifest={"objetivo": "magnitud"}, snapshot=source, signature="test")
            with patch.object(ml_engine, "SimpleImputer", side_effect=imputer):
                params, results, blob, digest = ml_engine.ejecutar_experimento_v2(ds, "regresion")
            # Primer imputador: referencia ajustada SOLO con desarrollo_train.
            self.assertEqual(fitted[0].statistics_[0], 10.0)
            self.assertIn("scikit-learn", params["versiones_librerias"])
            self.assertIn("hiperparametros_candidatos", params)
            json.dumps(params, allow_nan=False)
            json.dumps(results, allow_nan=False)
            self.assertEqual(len(digest), 64)
            self.assertTrue(hasattr(joblib.load(io.BytesIO(blob))["modelo"], "predict"))

    def test_snapshot_antiguo_imputado_se_restaura_en_memoria(self):
        source = rows()
        for row in source[:56]:
            row["profundidad_km"] = 999.0
            row["profundidad_imputada"] = True
        from sklearn.impute import SimpleImputer
        fitted = []
        def imputer(**kwargs):
            item = SimpleImputer(**kwargs)
            fitted.append(item)
            return item
        ds = SimpleNamespace(manifest={"objetivo": "magnitud"}, snapshot=source, signature="test")
        with patch.object(ml_engine, "SimpleImputer", side_effect=imputer):
            ml_engine.ejecutar_experimento_v2(ds, "regresion")
        self.assertEqual(fitted[0].statistics_[0], 10.0)
        self.assertEqual(source[0]["profundidad_km"], 999.0)

    def test_mismo_instante_en_ambos_bloques_rechazado(self):
        source = rows()
        for row in source:
            row["fecha_utc"] = "2026-10-18T10:00:00Z"
        with self.assertRaises(HTTPException) as error:
            ml_engine.ejecutar_experimento_v2(SimpleNamespace(manifest={"objetivo": "magnitud"}, snapshot=source), "regresion")
        self.assertEqual(error.exception.status_code, 422)

    def test_corte_no_separa_eventos_proximos(self):
        source = rows()
        source[80]["fecha_utc"] = utc_iso(parse_utc(source[79]["fecha_utc"]) + timedelta(seconds=30))
        train, test = temporal_split(source, min_train=40, min_test=8)
        self.assertGreater((parse_utc(test[0]["fecha_utc"]) - parse_utc(train[-1]["fecha_utc"])).total_seconds(), 120)
        self.assertEqual(len(train) + len(test), 100)

    def test_clasificacion_guarda_metricas_probabilisticas(self):
        source = rows()
        ds = SimpleNamespace(manifest={"objetivo": "magnitud"}, snapshot=source, signature="test")
        _, results, _, _ = ml_engine.ejecutar_experimento_v2(ds, "clasificacion")
        self.assertEqual(sum(results["distribucion_clases"]["validacion"]), 20)
        for model in results["comparacion"]:
            self.assertGreaterEqual(model["brier"], 0)
            self.assertLessEqual(model["brier"], 1)
            self.assertGreaterEqual(model["log_loss"], 0)

    def test_laboratorio_respeta_filtro_peru(self):
        app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Analista"]}
        with patch.object(science, "consultar", return_value=[]) as query, TestClient(app) as client:
            result = client.post("/api/v1/science/ml/compare?peru=true&fuente=IGP")
        self.assertEqual(result.status_code, 422)  # muestra insuficiente; el filtro si llego.
        query.assert_called_once_with(peru=True, fuente="IGP", limite=3001)

    def test_regla_conserva_fuente_de_simulacion(self):
        from app.alerts import SimulacionRegla, NuevaRegla
        simulation = SimulacionRegla(nombre="IGP prueba", magnitud_minima=4, fuente_permitida="IGP")
        rule = NuevaRegla.model_validate(simulation.model_dump())
        self.assertEqual(rule.fuente_permitida, "IGP")
        self.assertIn("allowed_source", AlertRule.__table__.columns)

    def test_esquema_entregas_compila_con_claves_foraneas(self):
        statements = []
        engine = create_mock_engine("postgresql+psycopg://", lambda statement, *args, **kwargs: statements.append(str(statement.compile(dialect=engine.dialect))))
        for table in (DatasetVersion.__table__, ExperimentRun.__table__, AlertDelivery.__table__):
            table.create(engine, checkfirst=False)
        self.assertTrue(any("REFERENCES seismic_alerts" in sql for sql in statements))

    def test_entrega_interna_y_smtp_no_equivalen_a_lectura(self):
        now = datetime.now(timezone.utc)
        internal = SimpleNamespace(recipient_id=uuid4(), status="acknowledged", acknowledged_at=now, created_at=now)
        email = SimpleNamespace(action="email.sent", details="user:otro", created_at=now)
        result = summarize_deliveries([internal], [email])
        self.assertIn("acknowledged", result["estado"])
        self.assertIn("smtp_accepted", result["estado"])
        self.assertEqual(result["acuse"], utc_iso(now))
        smtp_only = summarize_deliveries([], [email])
        self.assertIsNone(smtp_only["entregada_utc"])
        self.assertIsNone(smtp_only["acuse"])

    def test_pronostico_sin_fuente_falla_antes_de_usar_db(self):
        with patch.dict(os.environ, {"SISMOIA_FORECAST_SOURCE_NAME": ""}):
            with self.assertRaises(HTTPException) as error:
                fuente_historica()
        self.assertEqual(error.exception.status_code, 409)

    def test_identificador_solicitud_y_salud_no_confunden_base(self):
        from app.request_context import get_correlation_id
        with TestClient(app) as client:
            response = client.get("/api/v1/health", headers={"X-Request-ID":"prueba-local-123"})
        self.assertEqual(response.headers["X-Request-ID"], "prueba-local-123")
        self.assertEqual(response.json()["tipo"], "liveness")
        self.assertEqual(response.json()["base_datos"], "no_verificada")
        self.assertIsNone(get_correlation_id())

    def test_fuente_sin_permiso_no_usa_base(self):
        app.dependency_overrides[usuario_actual] = lambda: {"roles":["Solo lectura"]}
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/v1/sources/runs").status_code, 403)

    def test_huella_de_proveedor_detecta_correcciones(self):
        from app.ingestion import origin_hash
        self.assertEqual(origin_hash({"mag":4,"lat":-12}), origin_hash({"lat":-12,"mag":4}))
        self.assertNotEqual(origin_hash({"mag":4}), origin_hash({"mag":5}))

    def test_uri_supabase_usa_driver_instalado_sin_alterar_clave(self):
        from app.database import Settings
        original = "postgresql://usuario:valor%40ejemplo@host.invalid:5432/postgres?sslmode=require"
        self.assertEqual(Settings.usar_psycopg(original), original.replace("postgresql://", "postgresql+psycopg://", 1))


if __name__ == "__main__":
    unittest.main()
