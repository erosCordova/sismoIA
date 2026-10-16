import os
import unittest

from types import SimpleNamespace
from unittest.mock import patch

from app.email_notifications import (
    configuracion,
    correo_valido,
    mensaje_sismico,
    enviar_smtp
)


class EmailTests(unittest.TestCase):

    def test_desactivado_por_defecto(self):
        with patch.dict(
            os.environ,
            {"SISMOIA_EMAIL_ENABLED": "false"}
        ):
            self.assertFalse(
                configuracion()["habilitado"]
            )

    def test_destino_valido(self):
        self.assertEqual(
            correo_valido("usuario@ejemplo.com"),
            "usuario@ejemplo.com"
        )

        with self.assertRaises(ValueError):
            correo_valido("usuario\n@ejemplo.com")

    def test_solo_alerta_aprobada(self):
        alerta = SimpleNamespace(status="pending")
        evento = SimpleNamespace()
        fuente = SimpleNamespace()
        destino = SimpleNamespace()

        with self.assertRaises(ValueError):
            mensaje_sismico(
                alerta, evento, fuente, destino
            )

    def test_mensaje_informativo(self):
        alerta = SimpleNamespace(status="approved")

        evento = SimpleNamespace(
            magnitude=5.2,
            place="Lima",
            occurred_at="2026-10-15T10:00:00",
            source_url="https://earthquake.usgs.gov"
        )

        fuente = SimpleNamespace(name="USGS")

        destino = SimpleNamespace(
            full_name="Usuario de prueba"
        )

        asunto, cuerpo = mensaje_sismico(
            alerta, evento, fuente, destino
        )

        self.assertIn("M5.2", asunto)
        self.assertIn("Lima", cuerpo)
        self.assertIn("USGS", cuerpo)
        self.assertIn("no constituye", cuerpo)

    def test_no_envia_sin_autorizacion(self):
        with patch.dict(
            os.environ,
            {"SISMOIA_EMAIL_ENABLED": "false"}
        ):
            with self.assertRaises(RuntimeError):
                enviar_smtp(
                    "usuario@ejemplo.com",
                    "Prueba",
                    "Mensaje"
                )


if __name__ == "__main__":
    unittest.main()
