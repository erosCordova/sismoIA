"""Agrupamientos exploratorios generados con datos reales, sin escrituras en la BD."""
import csv
import hashlib
import json
import os
import shutil
import threading
from importlib.metadata import version
import platform
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import joblib
import numpy as np
from fastapi import HTTPException
from sklearn.cluster import DBSCAN, KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler
from app.ml_data import temporal_split
from app.time_utils import utc_iso

VARIABLES = ['latitud', 'longitud', 'magnitud', 'profundidad_km']
TRAIN_LOCK = threading.Lock()


def active_directory(base):
    pointer = Path(base) / 'current.json'
    if not pointer.is_file():
        return Path(base)
    try:
        directory = json.loads(pointer.read_text(encoding='utf-8'))['directory']
        if len(directory) != 32 or any(c not in '0123456789abcdef' for c in directory):
            raise ValueError('Version invalida')
        target = Path(base) / directory
        if not target.is_dir():
            raise ValueError('Version ausente')
        return target
    except (OSError, ValueError, KeyError, TypeError):
        raise HTTPException(409, 'Version de agrupamientos incompleta; vuelve a generar los agrupamientos') from None


def database_rows(peru=False):
    from app.science import consultar
    rows = []
    for event, source in consultar(peru=peru, limite=3000):
        if event.depth_km is None:
            continue
        values = [float(event.latitude), float(event.longitude), float(event.magnitude), float(event.depth_km)]
        if not np.isfinite(values).all() or not (-90 <= values[0] <= 90 and -180 <= values[1] <= 180 and -2 <= values[2] <= 10 and 0 <= values[3] <= 750):
            continue
        rows.append(dict(zip(VARIABLES, values), id=str(event.id), fuente=source, fecha_utc=utc_iso(event.occurred_at)))
    return sorted(rows, key=lambda r: (r['fecha_utc'], r['id']))


def silhouette(matrix, labels):
    if not 1 < len(set(labels)) < len(labels):
        return None
    try:
        return round(float(silhouette_score(matrix, labels, sample_size=min(600, len(labels)), random_state=42)), 4)
    except ValueError:
        return None


def generate(base, rows, peru=False, origin='Supabase/PostgreSQL'):
    if not TRAIN_LOCK.acquire(blocking=False):
        raise HTTPException(409, 'Ya hay una generacion de agrupamientos en curso')
    target = None
    pointer = None
    try:
        if len({str(row['id']) for row in rows}) != len(rows):
            raise HTTPException(422, 'Un mismo registro aparece mas de una vez en el conjunto de agrupamientos')
        train, test = temporal_split(rows, min_train=30, min_test=8)
        train_x = np.asarray([[r[v] for v in VARIABLES] for r in train], dtype=float)
        test_x = np.asarray([[r[v] for v in VARIABLES] for r in test], dtype=float)
        if not np.isfinite(train_x).all() or not np.isfinite(test_x).all():
            raise HTTPException(422, 'Hay valores no finitos en las variables de agrupamiento')
        scaler = StandardScaler().fit(train_x)
        xt, xe = scaler.transform(train_x), scaler.transform(test_x)
        unique = len(np.unique(xt, axis=0))
        if unique < 2:
            raise HTTPException(422, 'Se necesitan al menos dos patrones distintos para agrupar')
        candidates = []
        for k in range(2, min(6, unique, len(train)-1) + 1):
            model = KMeans(n_clusters=k, random_state=42, n_init=10).fit(xt)
            score = silhouette(xt, model.labels_)
            if score is not None:
                candidates.append((score, model))
        if not candidates:
            raise HTTPException(422, 'La muestra no permite evaluar grupos separados')
        score, km = max(candidates, key=lambda pair: pair[0])
        db_candidates = []
        for eps in (0.3, 0.5, 0.7, 1.0):
            db = DBSCAN(eps=eps, min_samples=8).fit(xt)
            mask = db.labels_ != -1
            coverage = float(mask.mean())
            density_score = silhouette(xt[mask], db.labels_[mask])
            db_candidates.append((density_score, coverage, db))
        eligible = [item for item in db_candidates if item[0] is not None and item[1] >= 0.2]
        density_score, coverage, db = max(eligible, key=lambda item: item[0]) if eligible else db_candidates[2]
        signature = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        metrics = {
            'disponible': True, 'generado_utc': datetime.now(timezone.utc).isoformat(),
            'entrenamiento': len(train), 'evaluacion': len(test), 'variables': VARIABLES,
            'peru': peru, 'dataset_sha256': signature, 'origen': origin,
            'versiones': {'python':platform.python_version(),'numpy':version('numpy'),'scikit-learn':version('scikit-learn'),'joblib':version('joblib')},
            'tipo': 'agrupamiento exploratorio',
            'kmeans': {'grupos': int(km.n_clusters), 'silhouette_train': score, 'silhouette_evaluacion': silhouette(xe, km.predict(xe))},
            'dbscan': {'eps': db.eps, 'grupos': len(set(db.labels_) - {-1}), 'cobertura': coverage, 'silhouette_sin_ruido': density_score},
            'advertencia': 'Agrupamientos exploratorios, sin aprobacion cientifica. No representan riesgo ni pronosticos. Muestra limitada a 3000 registros recientes con profundidad valida; posibles duplicados entre fuentes pendientes de revision.'
        }
        base = Path(base)
        base.mkdir(parents=True, exist_ok=True)
        generation = uuid4().hex
        target = base / generation
        target.mkdir()
        for name, block in [('entrenamiento', train), ('evaluacion', test)]:
            with (target / f'sismoia_{name}.csv').open('w', encoding='utf-8', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['id', 'fuente', 'fecha_utc'] + VARIABLES)
                writer.writeheader()
                writer.writerows(block)
        for name, model in [('kmeans', km), ('dbscan', db)]:
            joblib.dump({'modelo': model, 'escalador': scaler, 'variables': VARIABLES}, target / f'{name}_model.joblib')
        (target / 'ml_metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        pointer = base / f'.current-{generation}.json'
        pointer.write_text(json.dumps({'directory': generation}), encoding='utf-8')
        os.replace(pointer, base / 'current.json')
        target = None  # Version completa publicada atomicamente; nunca se elimina la anterior.
        return metrics
    except OSError:
        raise HTTPException(503, 'No se pudieron guardar los agrupamientos; revisa los permisos y el espacio disponible del backend') from None
    finally:
        if target is not None:
            if target.resolve().parent != Path(base).resolve():
                raise RuntimeError('Directorio temporal fuera del destino de agrupamientos')
            shutil.rmtree(target, ignore_errors=True)
        if pointer is not None:
            pointer.unlink(missing_ok=True)
        TRAIN_LOCK.release()
