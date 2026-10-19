import math
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4
from fastapi import HTTPException
from app.zone_analysis import describe, snapshot_zones, zone_index
from app import igp, seismic
from unittest.mock import patch


class ZoneAnalysisTests(unittest.TestCase):
    def test_poisson_intervals_and_empty_catalog_are_explicit(self):
        start = datetime(2025,1,1,tzinfo=timezone.utc)
        result = describe({0:10},start,start+timedelta(days=100),'IGP',True,100,10)
        z = result['zonas'][0]
        self.assertAlmostEqual(z['probabilidad_7d'],1-math.exp(-.7),places=5)
        self.assertLess(z['intervalo_7d']['inferior'],z['probabilidad_7d'])
        self.assertGreater(z['intervalo_7d']['superior'],z['probabilidad_7d'])
        self.assertGreater(result['zonas'][1]['intervalo_7d']['superior'],0)
        self.assertEqual(len(result['zonas']),12)
        empty = describe({},start,start+timedelta(days=100),'USGS',False,0,0)
        self.assertEqual(len(empty['zonas']),24)
        self.assertIsNone(empty['zonas'][0]['probabilidad_7d'])
        self.assertFalse(empty['publicado'])
        self.assertFalse(empty['apto_para_alertas_automaticas'])
        a=describe({0:10},start,start+timedelta(days=100),'IGP',True,100,10,{'consulta_hasta_utc':'2026-01-01'})
        b=describe({0:10},start,start+timedelta(days=100),'IGP',True,100,10,{'consulta_hasta_utc':'2026-01-02'})
        self.assertEqual(a['version_datos'],b['version_datos'])

    def test_grid_edges_and_region_restriction(self):
        self.assertEqual(zone_index(-19,-82,True),0)
        self.assertEqual(zone_index(1,-68,True),11)
        self.assertEqual(zone_index(90,180,False),23)
        self.assertIsNone(zone_index(25,30,True))

    def test_insufficient_data_preserves_map_without_inventing_indicator(self):
        start=datetime(2025,1,1,tzinfo=timezone.utc)
        for total,days in ((29,100),(100,2)):
            result=describe({0:10},start,start+timedelta(days=days),'IGP',True,total,10)
            self.assertEqual(result['estado'],'MUESTRA_INSUFICIENTE')
            self.assertEqual(result['zonas'][0]['registros_umbral'],10)
            self.assertIsNone(result['zonas'][0]['probabilidad_7d'])

    def test_snapshot_period_and_fingerprint_are_reproducible(self):
        start = datetime(2023,1,1,tzinfo=timezone.utc)
        rows = [{'fuente':'IGP','latitud':-12,'longitud':-77,'magnitud':4,
                 'fecha_utc':(start+timedelta(days=i)).isoformat()} for i in range(40)]
        dataset = SimpleNamespace(id=uuid4(),signature='a'*64,manifest={'muestra_limitada':True},snapshot=rows)
        a = snapshot_zones(dataset,'IGP',True)
        b = snapshot_zones(dataset,'IGP',True)
        self.assertEqual(a['version_datos'],b['version_datos'])
        self.assertEqual(a['dias_observacion'],39)
        self.assertEqual(a['registros_historicos'],40)
        self.assertTrue(a['metadatos']['consulta_limitada'])
        self.assertEqual(a['metadatos']['dataset_sha256'],dataset.signature)
        with self.assertRaises(HTTPException):
            snapshot_zones(dataset,'USGS',True)

    def test_invalid_rows_do_not_crash_snapshot(self):
        dataset = SimpleNamespace(id=uuid4(),signature='a'*64,manifest={},snapshot=[
            {'fuente':'IGP','latitud':float('nan'),'longitud':-77,'magnitud':4,'fecha_utc':'2025-01-01T00:00:00Z'}]*40)
        with self.assertRaises(HTTPException) as caught:
            snapshot_zones(dataset,'IGP',True)
        self.assertEqual(caught.exception.status_code,422)

    def test_sync_all_continues_after_one_provider_failure(self):
        with patch.object(seismic,'sincronizar',side_effect=HTTPException(502,'Proveedor simulado caido')), patch.object(igp,'sincronizar_igp',return_value={'importados':3,'duplicados':1}) as alternate:
            response=igp.sincronizar_todas({'roles':['Administrador']})
        self.assertEqual(response['estado'],'partial')
        self.assertEqual(response['importados'],3)
        alternate.assert_called_once()
