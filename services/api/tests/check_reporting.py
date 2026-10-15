import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.auth import usuario_actual
from app.main import app

cliente = TestClient(app)
assert cliente.get("/api/v1/sources").status_code == 401
assert cliente.get("/api/v1/reports/summary").status_code == 401
assert cliente.get("/api/v1/reports/export.csv").status_code == 401
print("SIN_AUTENTICACION=401_OK")

try:
    app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Solo lectura"]}
    assert cliente.get("/api/v1/sources").status_code == 403
    assert cliente.get("/api/v1/reports/export.csv").status_code == 403
    assert cliente.get("/api/v1/reports/summary").status_code == 200
    print("PERMISOS_SOLO_LECTURA=OK")

    app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Administrador"]}
    r = cliente.get("/api/v1/sources")
    assert r.status_code == 200, r.text[:500]
    fuentes = r.json()
    assert sum(f["registros"] for f in fuentes["fuentes"]) == fuentes["total_registros"]
    print("FUENTES=", fuentes["total_fuentes"])
    print("REGISTROS_ALMACENADOS=", fuentes["total_registros"])
    print("FUENTES_BACKEND=OK")

    for dias, peru in ((7, True), (30, True), (365, False)):
        respuesta = cliente.get("/api/v1/reports/summary",
            params={"dias": dias, "peru": peru})
        assert respuesta.status_code == 200, respuesta.text[:500]
        datos = respuesta.json()
        total = datos["total"]
        assert sum(x["cantidad"] for x in datos["por_fuente"]) == total
        assert sum(x["cantidad"] for x in datos["por_mes"]) == total
        assert sum(x["cantidad"] for x in datos["por_magnitud"]) == total
        print(f"REPORTE_{dias}_DIAS_PERU_{peru}={total} REGISTROS_OK")

    csv_respuesta = cliente.get("/api/v1/reports/export.csv",
        params={"dias": 7, "peru": True})
    assert csv_respuesta.status_code == 200, csv_respuesta.text[:500]
    assert csv_respuesta.text.startswith("\ufeffid_externo,")
    assert "text/csv" in csv_respuesta.headers["content-type"]
    print("EXPORTACION_CSV=OK")
    print("FUENTES_Y_REPORTES_BACKEND=OK")
finally:
    app.dependency_overrides.clear()
