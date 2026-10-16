import unittest

from app.governance import (
    firma_snapshot,
    firma_snapshot_valida,
)


class FirmaJSONBTests(unittest.TestCase):

    def setUp(self):
        self.manifest = {"peru": True}

        self.original = [{
            "hora_utc": 18,
            "mes": 9,
            "magnitud": 4.0,
            "ciclo_hora_sin": -1.0,
            "ciclo_hora_cos": -0.0,
            "ciclo_mes_sin": -1.0,
            "ciclo_mes_cos": -0.0,
        }]

        self.firma = firma_snapshot(
            self.manifest,
            self.original
        )

    def test_firma_original(self):
        self.assertTrue(
            firma_snapshot_valida(
                self.manifest,
                self.original,
                self.firma
            )
        )

    def test_normalizacion_jsonb(self):
        filas = [dict(self.original[0])]
        filas[0]["ciclo_hora_cos"] = 0.0
        filas[0]["ciclo_mes_cos"] = 0.0

        self.assertTrue(
            firma_snapshot_valida(
                self.manifest,
                filas,
                self.firma
            )
        )

    def test_detecta_alteracion_real(self):
        filas = [dict(self.original[0])]
        filas[0]["magnitud"] = 8.0

        self.assertFalse(
            firma_snapshot_valida(
                self.manifest,
                filas,
                self.firma
            )
        )


if __name__ == "__main__":
    unittest.main()
