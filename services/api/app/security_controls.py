"""Limitacion de solicitudes al inicio de sesion."""

import math
import os
import time

from collections import deque
from threading import Lock

from starlette.responses import JSONResponse


class WindowLimiter:
    def __init__(self, limit=10, window=60):
        self.limit = max(1, int(limit))
        self.window = max(1, int(window))
        self.lock = Lock()
        self.hits = {}

    def check(self, key, now=None):
        now = time.monotonic() if now is None else now

        with self.lock:
            if key not in self.hits and len(self.hits) >= 4096:
                expired = [
                    k for k, q in self.hits.items()
                    if not q or now - q[-1] >= self.window
                ]

                for k in expired:
                    self.hits.pop(k, None)

                if len(self.hits) >= 4096:
                    return False, self.window

            q = self.hits.setdefault(key, deque())

            while q and now - q[0] >= self.window:
                q.popleft()

            if len(q) >= self.limit:
                wait = self.window - (now - q[0])
                return False, max(1, math.ceil(wait))

            q.append(now)
            return True, 0


class LoginRateLimitMiddleware:
    def __init__(self, app, limit=None, window=None):
        self.app = app

        self.limiter = WindowLimiter(
            limit if limit is not None else
            os.getenv("SISMOIA_LOGIN_RATE_LIMIT", "10"),
            window if window is not None else
            os.getenv("SISMOIA_LOGIN_RATE_WINDOW", "60")
        )

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        login = (
            scope.get("method") == "POST"
            and scope.get("path", "").rstrip("/")
            == "/api/v1/auth/login"
        )

        if not login:
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        address = str(client[0]) if client else "unknown"

        allowed, retry = self.limiter.check(address)

        if not allowed:
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        "Demasiados intentos de acceso. "
                        "Vuelve a intentarlo mas tarde."
                    )
                },
                headers={
                    "Retry-After": str(retry),
                    "Cache-Control": "no-store"
                }
            )

            await response(scope, receive, send)
            return

        async def send_no_cache(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append(
                    (b"cache-control", b"no-store")
                )
                message["headers"] = headers

            await send(message)

        await self.app(scope, receive, send_no_cache)
