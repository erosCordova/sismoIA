
import unittest
import inspect
import sys

from pathlib import Path
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1])
)

from app.alerts import (
    _agrupar_sismos,
    _mismo_sismo_probable,
    evaluar_registros
)

class TestAlertas(unittest.TestCase):

    def evento(
        self, fuente, lat, lon, mag, segundo=59
    ):
        return SimpleNamespace(
            id=uuid4(),
            source_id=fuente,
            occurred_at=datetime(
                2026, 10, 11, 13, 42,
                segundo,
                tzinfo=timezone.utc
            ),
            latitude=lat,
            longitude=lon,
            magnitude=mag,
            depth_km=45
        )

    def test_agrupar_igp_usgs(self):
        usgs = self.evento(
            "USGS",
            -16.7849, -72.6601, 5.2
        )

        igp = self.evento(
            "IGP",
            -16.7800, -72.5600, 5.1, 58
        )

        grupo, duplicados = _agrupar_sismos(
            [usgs, igp]
        )

        self.assertEqual(len(grupo), 1)
        self.assertEqual(duplicados, 1)

    def test_no_agrupar_sismos_distintos(self):
        usgs = self.evento(
            "USGS",
            -16.7849, -72.6601, 5.2
        )

        igp = self.evento(
            "IGP",
            -13.0, -72.5600, 5.1, 58
        )

        self.assertFalse(
            _mismo_sismo_probable(usgs, igp)
        )

    def test_conservar_misma_fuente(self):
        a = self.evento(
            "USGS",
            -16.7849, -72.6601, 5.2
        )

        b = self.evento(
            "USGS",
            -16.7849, -72.6601, 5.2, 58
        )

        grupo, _ = _agrupar_sismos([a, b])

        self.assertEqual(len(grupo), 2)

    def test_filtro_de_tres_horas(self):
        codigo = inspect.getsource(
            evaluar_registros
        )

        self.assertIn(
            "ventana_maxima_horas = 3",
            codigo
        )

        self.assertIn(
            "SeismicEvent.occurred_at.between",
            codigo
        )

if __name__ == "__main__":
    unittest.main(verbosity=2)
