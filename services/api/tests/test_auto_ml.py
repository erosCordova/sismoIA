import unittest
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.governance import auto_contar_nuevos
from app.main import app


class AutoMLTests(unittest.TestCase):

    def test_primera_preparacion(self):
        filas = [{"id": "a"}, {"id": "b"}]

        self.assertEqual(
            auto_contar_nuevos(filas, None),
            2
        )

    def test_detecta_solo_datos_nuevos(self):
        anterior = SimpleNamespace(
            snapshot=[
                {"id": "a"},
                {"id": "b"}
            ]
        )

        filas = [
            {"id": "a"},
            {"id": "b"},
            {"id": "c"}
        ]

        self.assertEqual(
            auto_contar_nuevos(filas, anterior),
            1
        )

    def test_endpoint_protegido(self):
        with TestClient(app) as cliente:
            respuesta = cliente.post(
                "/api/v1/governance/auto-run"
            )

            self.assertIn(
                respuesta.status_code,
                (401, 403)
            )

    def test_api_registrada(self):
        self.assertIn(
            "/api/v1/governance/auto-run",
            app.openapi()["paths"]
        )


if __name__ == "__main__":
    unittest.main()
