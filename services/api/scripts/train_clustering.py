import csv
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import joblib
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

BASE = Path(
    os.environ.get("SISMOIA_ML_OUTPUT_DIR")
    or Path(__file__).resolve().parents[1] / "data" / "processed"
)
VARIABLES = ["latitud", "longitud", "magnitud", "profundidad_km"]

def cargar(nombre):
    with (BASE / nombre).open(encoding="utf-8-sig", newline="") as f:
        registros = list(csv.DictReader(f))
    matriz = np.array([[float(r[v]) for v in VARIABLES] for r in registros])
    assert matriz.ndim == 2 and np.isfinite(matriz).all()
    return registros, matriz

train, x_train = cargar("sismoia_entrenamiento.csv")
test, x_test = cargar("sismoia_evaluacion.csv")
assert len(train) > 20 and len(test) > 10
assert set(r["id"] for r in train).isdisjoint(r["id"] for r in test)

escalador = StandardScaler()
xt = escalador.fit_transform(x_train)
xe = escalador.transform(x_test)

mejor = None
mejor_k = None
mejor_score = -2.0
for k in range(2, 7):
    modelo = KMeans(n_clusters=k, random_state=42, n_init=10)
    etiquetas = modelo.fit_predict(xt)
    score = silhouette_score(xt, etiquetas, sample_size=min(600, len(xt)), random_state=42)
    print(f"KMEANS_K={k} SILHOUETTE={score:.4f}")
    if score > mejor_score:
        mejor, mejor_k, mejor_score = modelo, k, score

eval_labels = mejor.predict(xe)
eval_score = silhouette_score(xe, eval_labels) if 1 < len(set(eval_labels)) < len(xe) else None

mejor_db = None
mejor_db_info = None
mejor_db_score = -2.0
for eps in (0.3, 0.5, 0.7, 1.0):
    modelo = DBSCAN(eps=eps, min_samples=8)
    etiquetas = modelo.fit_predict(xt)
    mascara = etiquetas != -1
    grupos = len(set(etiquetas[mascara]))
    cobertura = float(mascara.mean())
    score = None
    if 1 < grupos < int(mascara.sum()):
        score = silhouette_score(xt[mascara], etiquetas[mascara], sample_size=min(500, int(mascara.sum())), random_state=42)
    print(f"DBSCAN_EPS={eps} GRUPOS={grupos} COBERTURA={cobertura:.3f} SILHOUETTE={score}")
    if score is not None and cobertura >= 0.2 and score > mejor_db_score:
        mejor_db, mejor_db_score = modelo, score
        mejor_db_info = {"eps": eps, "grupos": grupos, "cobertura": round(cobertura, 4), "silhouette_sin_ruido": round(score, 4)}

if mejor_db is None:
    mejor_db = DBSCAN(eps=0.7, min_samples=8).fit(xt)
    mejor_db_info = {"eps": 0.7, "advertencia": "No se encontro una configuracion con dos grupos y cobertura suficiente"}

joblib.dump({"modelo": mejor, "escalador": escalador, "variables": VARIABLES}, BASE / "kmeans_model.joblib")
joblib.dump({"modelo": mejor_db, "escalador": escalador, "variables": VARIABLES}, BASE / "dbscan_model.joblib")

metricas = {
    "generado_utc": datetime.now(timezone.utc).isoformat(),
    "entrenamiento": len(train), "evaluacion": len(test),
    "variables": VARIABLES, "tipo": "agrupamiento exploratorio",
    "kmeans": {"grupos": mejor_k, "silhouette_train": round(mejor_score, 4), "silhouette_evaluacion": round(eval_score, 4) if eval_score is not None else None},
    "dbscan": mejor_db_info,
    "advertencia": "No predice terremotos; posibles registros compartidos USGS-IGP pendientes de revision"
}
(BASE / "ml_metrics.json").write_text(json.dumps(metricas, indent=2, ensure_ascii=False), encoding="utf-8")

print("ENTRENAMIENTO_ML=OK")
print("REGISTROS_TRAIN=", len(train))
print("REGISTROS_EVALUACION=", len(test))
print("KMEANS_GRUPOS=", mejor_k)
print("KMEANS_SILHOUETTE=", round(mejor_score, 4))
print("DBSCAN=", mejor_db_info)
print("MODELOS_GUARDADOS=OK")
