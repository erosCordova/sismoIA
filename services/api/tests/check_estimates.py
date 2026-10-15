import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app
from app.auth import usuario_actual

cliente = TestClient(app)
assert cliente.get("/api/v1/estimates/historical").status_code == 401
print("SEGURIDAD_ESTIMACIONES=OK")

app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Administrador"]}
try:
    for fuente in ("IGP", "USGS"):
        r = cliente.get("/api/v1/estimates/historical",
                        params={"fuente": fuente, "peru": True, "magnitud_umbral": 4})
        assert r.status_code == 200, r.text[:300]
        datos = r.json()
        n = datos["registros_validos"]
        assert sum(x["cantidad"] for x in datos["distribucion"]) == n
        assert sum(x["cantidad"] for x in datos["mensual"]) == n
        assert 0 <= datos["registros_superiores_umbral"] <= n
        if n >= 30:
            intervalo = datos["intervalo_wilson_95"]
            assert intervalo is not None
            assert intervalo["inferior"] <= datos["porcentaje_observado"] <= intervalo["superior"]
        print(f"{fuente}_REGISTROS={n} | PORCENTAJE={datos["porcentaje_observado"]} | ESTIMACION=OK")
    print("FASE6_BACKEND=OK")
finally:
    app.dependency_overrides.clear()
