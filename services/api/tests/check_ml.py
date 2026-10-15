import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app
from app.auth import usuario_actual

cliente = TestClient(app)
assert cliente.get("/api/v1/ml/overview").status_code == 401
assert cliente.get("/api/v1/ml/clusters").status_code == 401
print("SEGURIDAD_ML=OK")

app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Administrador"]}
try:
    respuesta = cliente.get("/api/v1/ml/overview")
    assert respuesta.status_code == 200, respuesta.text[:400]
    datos = respuesta.json()
    print("KMEANS_GRUPOS=", datos["kmeans"]["grupos"])
    print("SILHOUETTE_TRAIN=", datos["kmeans"]["silhouette_train"])
    print("SILHOUETTE_EVALUACION=", datos["kmeans"]["silhouette_evaluacion"])
    print("DBSCAN_COBERTURA=", datos["dbscan"]["cobertura"])
    assert sum(datos["kmeans"]["distribucion"].values()) == datos["entrenamiento"]
    assert sum(datos["dbscan"]["distribucion"].values()) == datos["entrenamiento"]

    for conjunto in ("entrenamiento", "evaluacion"):
        r = cliente.get("/api/v1/ml/clusters", params={"conjunto": conjunto, "limite": 100})
        assert r.status_code == 200, r.text[:400]
        puntos = r.json()["puntos"]
        assert len(puntos) == 100
        assert all(0 <= p["grupo"] < datos["kmeans"]["grupos"] for p in puntos)
        print("AGRUPAMIENTO_" + conjunto.upper() + "=OK")
    print("MODULO_ML_BACKEND=OK")
finally:
    app.dependency_overrides.clear()
