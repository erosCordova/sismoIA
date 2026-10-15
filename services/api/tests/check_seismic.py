import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app
from app.auth import usuario_actual

cliente = TestClient(app)
try:
    sin_token = cliente.get("/api/v1/seismic/events")
    print("SIN_TOKEN=", sin_token.status_code)
    assert sin_token.status_code == 401
    app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Solo lectura"]}
    restringido = cliente.post("/api/v1/seismic/sync")
    print("SIN_PERMISOS=", restringido.status_code)
    assert restringido.status_code == 403
    app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Administrador"]}
    sincronizacion = cliente.post("/api/v1/seismic/sync")
    print("USGS_SYNC=", sincronizacion.status_code)
    print("DETALLE_SYNC=", str(sincronizacion.json())[:500])
    assert sincronizacion.status_code == 200, "No se pudo completar la sincronizacion"
    estadisticas = cliente.get("/api/v1/seismic/stats")
    mundo = cliente.get("/api/v1/seismic/events?limit=5")
    peru = cliente.get("/api/v1/seismic/events?peru=true&limit=5")
    print("ESTADISTICAS=", estadisticas.status_code, estadisticas.json())
    print("MUNDO=", mundo.status_code, "TOTAL=", mundo.json().get("total"))
    print("PERU=", peru.status_code, "TOTAL=", peru.json().get("total"))
    assert all(r.status_code == 200 for r in (estadisticas, mundo, peru))
    assert mundo.json()["total"] >= peru.json()["total"]
    print("FASE3_DATOS_REALES=OK")
finally:
    app.dependency_overrides.clear()
