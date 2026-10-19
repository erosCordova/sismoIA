"""Estados opcionales, archivos incompletos y modelos realmente entrenados."""
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock
from types import SimpleNamespace
from uuid import UUID
from sqlalchemy.exc import IntegrityError

from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import ml, ml_artifacts, seismic_forecast_api, user_management
from app.auth import usuario_actual
from app.main import app


def sample(size=80):
    start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    return [{'id': str(i), 'fuente': 'IGP', 'fecha_utc': (start + timedelta(days=i)).isoformat(),
             'latitud': -18 + (i % 12), 'longitud': -80 + (i % 7),
             'magnitud': 3 + (i % 4) / 2, 'profundidad_km': 10 + i % 40} for i in range(size)]


class MLAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.base_patch = patch.object(ml, 'BASE', self.base)
        self.base_patch.start()
        app.dependency_overrides[usuario_actual] = lambda: {'roles': ['Administrador']}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()
        self.base_patch.stop()
        self.temp.cleanup()

    def test_empty_installation_is_not_service_failure(self):
        for path in ('overview', 'clusters'):
            response = self.client.get('/api/v1/ml/' + path)
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json()['disponible'])
        self.assertEqual(self.client.get('/api/v1/ml/registry').status_code, 200)

    def test_generated_models_are_readable_and_predict(self):
        with patch.object(ml, 'database_rows', return_value=sample()) as loader:
            response = self.client.post('/api/v1/ml/train-clustering?peru=true')
        self.assertEqual(response.status_code, 200, response.text)
        loader.assert_called_once_with(peru=True)
        metrics = self.client.get('/api/v1/ml/overview').json()
        self.assertTrue(metrics['disponible'])
        self.assertEqual(metrics['entrenamiento'] + metrics['evaluacion'], 80)
        self.assertIn('dataset_sha256', metrics)
        groups = self.client.get('/api/v1/ml/clusters').json()
        self.assertEqual(len(groups['puntos']), metrics['evaluacion'])
        self.assertTrue(all(isinstance(point['grupo'], int) for point in groups['puntos']))
        registry = self.client.get('/api/v1/ml/registry').json()
        self.assertTrue(all(model['estado'] == 'Artefacto disponible' for model in registry['experimentos']))
        self.assertTrue(all(dataset['disponible'] for dataset in registry['datasets']))

    def test_degenerate_data_does_not_publish_partial_generation(self):
        with self.assertRaises(HTTPException):
            ml_artifacts.generate(self.base, sample(8))
        constant = [{**row, **dict.fromkeys(ml_artifacts.VARIABLES, 1)} for row in sample()]
        with self.assertRaises(HTTPException):
            ml_artifacts.generate(self.base, constant)
        self.assertFalse((self.base / 'current.json').exists())
        with self.assertRaises(HTTPException):
            ml_artifacts.generate(self.base,sample()+sample()[:1])

    def test_failed_retraining_preserves_previous_generation(self):
        ml_artifacts.generate(self.base, sample())
        pointer = (self.base / 'current.json').read_bytes()
        with patch.object(ml_artifacts.joblib, 'dump', side_effect=OSError('Disco lleno')):
            with self.assertRaises(HTTPException) as caught:
                ml_artifacts.generate(self.base, sample())
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual((self.base / 'current.json').read_bytes(), pointer)
        self.assertTrue(self.client.get('/api/v1/ml/overview').json()['disponible'])

    def test_corrupted_artifacts_and_pointer_show_recovery(self):
        ml_artifacts.generate(self.base, sample())
        (ml_artifacts.active_directory(self.base) / 'ml_metrics.json').write_text('{invalid', encoding='utf-8')
        response = self.client.get('/api/v1/ml/overview')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['disponible'])
        (self.base / 'current.json').write_text(json.dumps({'directory': '../outside'}), encoding='utf-8')
        self.assertFalse(self.client.get('/api/v1/ml/clusters').json()['disponible'])

    def test_forecast_preparation_state_and_real_failure_are_different(self):
        with patch.object(seismic_forecast_api, 'generar_pronostico', side_effect=HTTPException(409, 'Historial insuficiente')):
            response = self.client.get('/api/v1/forecasts/zones')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['detail'], 'Historial insuficiente')
        with patch.object(seismic_forecast_api, 'generar_pronostico', side_effect=HTTPException(503, 'Conexion no disponible')):
            self.assertEqual(self.client.get('/api/v1/forecasts/zones').status_code, 503)

    def test_training_and_forecast_preserve_permissions(self):
        app.dependency_overrides[usuario_actual] = lambda: {'roles': ['Solo lectura']}
        with patch.object(ml, 'database_rows') as loader:
            self.assertEqual(self.client.post('/api/v1/ml/train-clustering').status_code, 403)
            loader.assert_not_called()
        self.assertEqual(self.client.get('/api/v1/forecasts/zones').status_code, 403)

    def test_regression_reads_database_with_selected_region(self):
        with patch.object(ml, 'database_rows', return_value=sample()) as loader:
            response = self.client.get('/api/v1/ml/regression-validation?peru=true')
        self.assertEqual(response.status_code, 200, response.text)
        loader.assert_called_once_with(peru=True)
        self.assertTrue(response.json()['peru'])
        self.assertEqual(response.json()['origen'], 'Supabase/PostgreSQL')
        self.assertIn('Regresion lineal multiple', [row['modelo'] for row in response.json()['comparacion']])

    def test_extreme_dates_return_validation_instead_of_internal_error(self):
        paths = ['/catalog/events?fecha_hasta=', '/analytics/explorer?fecha_hasta=',
                 '/preparation/dataset-report?fecha_hasta=', '/science/analytics?hasta=', '/alerts/inbox?hasta=']
        for path in paths:
            with self.subTest(path=path):
                response = self.client.get('/api/v1' + path + '9999-12-31')
                self.assertEqual(response.status_code, 422, response.text)

    def test_whitespace_user_name_is_rejected_before_database(self):
        response = self.client.post('/api/v1/admin/users', json={
            'nombre': '   ', 'email': 'example@example.invalid', 'password': 'solo_prueba_123', 'rol': 'Analista'})
        self.assertEqual(response.status_code, 422)

    def test_duplicate_user_during_flush_returns_conflict(self):
        db = MagicMock()
        db.scalar.side_effect = [SimpleNamespace(id=UUID(int=1), name='Analista'), None]
        db.flush.side_effect = IntegrityError('insert', {}, Exception('duplicate'))
        with patch.object(user_management, 'Session') as session, patch.object(user_management, 'hash_password', return_value='hash-sintetico'):
            session.return_value.__enter__.return_value = db
            response = self.client.post('/api/v1/admin/users', json={
                'nombre': 'Prueba', 'email': 'example@example.invalid', 'password': 'solo_prueba_123', 'rol': 'Analista'})
        self.assertEqual(response.status_code, 409, response.text)
        db.rollback.assert_called_once()
