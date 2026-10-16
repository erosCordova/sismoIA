import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware

from app.security_controls import (
    WindowLimiter,
    LoginRateLimitMiddleware
)


class SecurityTests(unittest.TestCase):

    def test_limite_por_ip(self):
        limiter = WindowLimiter(2, 60)

        self.assertEqual(
            limiter.check("ip1", now=100), (True, 0)
        )

        self.assertEqual(
            limiter.check("ip1", now=101), (True, 0)
        )

        allowed, wait = limiter.check("ip1", now=102)

        self.assertFalse(allowed)
        self.assertGreater(wait, 0)

        self.assertEqual(
            limiter.check("ip2", now=102), (True, 0)
        )

        self.assertEqual(
            limiter.check("ip1", now=161), (True, 0)
        )

    def test_http_429(self):
        app = FastAPI()

        app.add_middleware(
            LoginRateLimitMiddleware,
            limit=2,
            window=60
        )

        app.add_middleware(
            CORSMiddleware,
            allow_origins=[
                "https://sismo-ia.vercel.app"
            ],
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"]
        )

        @app.post("/api/v1/auth/login")
        def login():
            return {"ok": True}

        @app.get("/api/v1/health")
        def health():
            return {"status": "ok"}

        headers = {
            "Origin": "https://sismo-ia.vercel.app"
        }

        with TestClient(app) as client:
            first = client.post(
                "/api/v1/auth/login",
                headers=headers
            )

            second = client.post(
                "/api/v1/auth/login",
                headers=headers
            )

            third = client.post(
                "/api/v1/auth/login",
                headers=headers
            )

            self.assertEqual(first.status_code, 200)
            self.assertEqual(second.status_code, 200)
            self.assertEqual(third.status_code, 429)

            self.assertIn(
                "Retry-After",
                third.headers
            )

            self.assertEqual(
                third.headers.get(
                    "access-control-allow-origin"
                ),
                "https://sismo-ia.vercel.app"
            )

            self.assertEqual(
                client.get(
                    "/api/v1/health"
                ).status_code,
                200
            )


if __name__ == "__main__":
    unittest.main()
