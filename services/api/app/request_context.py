"""Identificador de solicitud compartido con auditoria, sin datos sensibles."""
from contextvars import ContextVar
from uuid import uuid4
import re

_request_id = ContextVar("sismoia_request_id", default=None)


def get_correlation_id():
    return _request_id.get()


class RequestContextMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        supplied = headers.get(b"x-request-id", b"").decode("ascii", errors="ignore")
        identifier = supplied if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", supplied) else uuid4().hex
        token = _request_id.set(identifier)

        async def traced_send(message):
            if message["type"] == "http.response.start":
                message = {**message, "headers": list(message.get("headers", [])) + [(b"x-request-id", identifier.encode("ascii"))]}
            await send(message)

        try:
            await self.app(scope, receive, traced_send)
        finally:
            _request_id.reset(token)
