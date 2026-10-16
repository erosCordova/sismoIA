import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.governance import auto_preparar


class TestPoliticaCientifica(unittest.TestCase):

    def test_no_cambia_a_cobertura_global(self):
        consultas = []

        def simular(datos):
            consultas.append(datos.peru)
            raise HTTPException(
                422, "Datos insuficientes"
            )

        with patch(
            "app.governance.construir_snapshot",
            side_effect=simular
        ):
            with self.assertRaises(
                HTTPException
            ) as resultado:
                auto_preparar()

        self.assertEqual(consultas, [True])
        self.assertEqual(
            resultado.exception.status_code, 422
        )

    def test_utiliza_dataset_peruano(self):
        manifest = {
            "peru": True,
            "objetivo": "magnitud"
        }

        filas = [{"id": "ejemplo"}]

        with patch(
            "app.governance.construir_snapshot",
            return_value=(
                manifest, filas, "firma-prueba"
            )
        ):
            datos, resultado, registros, firma = (
                auto_preparar()
            )

        self.assertTrue(datos.peru)
        self.assertEqual(resultado, manifest)
        self.assertEqual(registros, filas)
        self.assertEqual(firma, "firma-prueba")


if __name__ == "__main__":
    unittest.main()
