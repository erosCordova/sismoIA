"""Tasas del catalogo por zonas, con incertidumbre y procedencia verificable."""
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from scipy.stats import chi2
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.database import engine
from app.models import SeismicEvent, DataSource
from app.time_utils import as_utc, utc_iso

METHOD = 'CATALOGO-POISSON-ZONAS-2.0'


def grid(peru):
    return (-19., 1., -82., -68., 4, 3) if peru else (-90., 90., -180., 180., 4, 6)


def zone_index(lat, lon, peru):
    south, north, west, east, rows, columns = grid(peru)
    if not (south <= lat <= north and west <= lon <= east):
        return None
    row = min(rows - 1, max(0, int((lat-south)/(north-south)*rows)))
    column = min(columns-1, max(0, int((lon-west)/(east-west)*columns)))
    return row*columns+column


def describe(counts, start, end, source, peru, total, qualifying, metadata=None):
    start, end = as_utc(start), as_utc(end)
    days = (end-start).total_seconds()/86400
    if days <= 0:
        raise HTTPException(422, 'El periodo debe tener una duracion positiva')
    enough = total >= 30 and days >= 7
    south, north, west, east, rows, columns = grid(peru)
    zones = []
    for index in range(rows*columns):
        row, column = divmod(index, columns)
        count = int(counts.get(index, 0))
        rate = count/days
        # Intervalo exacto del conteo Poisson, condicionado al catalogo y al periodo.
        low = float(chi2.ppf(.025, 2*count)/2/days) if count else 0.
        high = float(chi2.ppf(.975, 2*(count+1))/2/days)
        item = {'id': f'Z{index+1:02d}', 'latitud_sur': south+row*(north-south)/rows,
                'latitud_norte': south+(row+1)*(north-south)/rows,
                'longitud_oeste': west+column*(east-west)/columns,
                'longitud_este': west+(column+1)*(east-west)/columns,
                'registros_umbral': count, 'eventos_entrenamiento': count,
                'tasa_registros_dia': round(rate, 8)}
        for horizon in (7, 30):
            item[f'probabilidad_{horizon}d'] = round(-math.expm1(-rate*horizon), 6) if enough else None
            item[f'intervalo_{horizon}d'] = {'inferior': round(-math.expm1(-low*horizon), 6),
                                          'superior': round(-math.expm1(-high*horizon), 6)} if enough else None
        zones.append(item)
    stable_metadata = {key:value for key,value in (metadata or {}).items() if key not in ('consulta_desde_utc','consulta_hasta_utc')}
    signature_data = {'conteos': counts, 'inicio': utc_iso(start), 'fin': utc_iso(end), 'fuente': source,
                      'peru': peru, 'total': int(total), 'metadatos': stable_metadata, 'metodo': METHOD}
    digest = hashlib.sha256(json.dumps(signature_data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'disponible': True, 'modelo': 'Tasa historica del catalogo por zonas (Poisson)', 'version_metodo': METHOD,
            'version_datos': digest, 'estado': 'EXPERIMENTAL' if enough else 'MUESTRA_INSUFICIENTE' if total else 'SIN_REGISTROS',
            'indicador_disponible': enough, 'requisitos_indicador': 'Al menos 30 registros y 7 dias entre el primer y ultimo registro observado',
            'estado_revision': 'laboratorio_sin_aprobacion', 'publicado': False, 'peru': peru, 'fuente': source,
            'periodo_inicio_utc': utc_iso(start), 'periodo_fin_utc': utc_iso(end),
            'fecha_calculo_utc': utc_iso(datetime.now(timezone.utc)), 'dias_observacion': round(days, 3),
            'registros_historicos': int(total), 'registros_umbral': int(qualifying), 'magnitud_minima': 4.,
            'zonas': zones, 'horizontes_dias': [7, 30], 'apto_para_alertas_automaticas': False,
            'incertidumbre': 'Intervalo Poisson 95%, condicionado a tasa constante, independencia y cobertura del catalogo. No corrige subregistro ni dependencia entre replicas.',
            'advertencia': 'Analisis del catalogo observado, no pronostico validado. Las zonas son cuadriculas aproximadas. Un valor bajo o cero no significa ausencia de peligro. No integra alertas oficiales.',
            'metadatos': metadata or {}}


def current_zones(peru=True, fuente='IGP', dias=365):
    now = datetime.now(timezone.utc)
    start = now-timedelta(days=dias)
    south, north, west, east, rows, columns = grid(peru)
    # Agregacion en PostgreSQL: no se descartan filas por un limite de descarga.
    lat_bin = func.least(rows-1, func.floor((SeismicEvent.latitude-south)/(north-south)*rows))
    lon_bin = func.least(columns-1, func.floor((SeismicEvent.longitude-west)/(east-west)*columns))
    number = lat_bin*columns+lon_bin
    conditions = [DataSource.name == fuente, SeismicEvent.occurred_at.between(start, now),
                  SeismicEvent.latitude.between(south, north), SeismicEvent.longitude.between(west, east),
                  SeismicEvent.magnitude.between(-2, 10)]
    with Session(engine) as db:
        query = select(number.label('zona'), func.count(),
                       func.count().filter(SeismicEvent.magnitude >= 4),
                       func.min(SeismicEvent.occurred_at), func.max(SeismicEvent.occurred_at),
                       func.max(SeismicEvent.received_at)).join(DataSource, DataSource.id == SeismicEvent.source_id)
        data = db.execute(query.where(*conditions).group_by(number)).all()
    total = sum(row[1] for row in data)
    counts = {int(row[0]): int(row[2]) for row in data}
    minimum = min((row[3] for row in data), default=None)
    maximum = max((row[4] for row in data), default=None)
    received = max((row[5] for row in data), default=None)
    first = as_utc(minimum) if minimum else start
    last = as_utc(maximum) if maximum else now
    if last <= first:
        last = first+timedelta(seconds=1)
    return describe(counts, first, last, fuente, peru, total, sum(counts.values()), {
        'origen': 'catalogo_vivo', 'consulta_limitada': False, 'primer_registro_utc': utc_iso(minimum),
        'ultimo_registro_utc': utc_iso(maximum), 'ultima_recepcion_utc': utc_iso(received),
        'consulta_desde_utc': utc_iso(start), 'consulta_hasta_utc': utc_iso(now),
        'cobertura_completa_verificada': False})


def snapshot_zones(dataset, fuente, peru):
    # El periodo es el contenido real de la version; no presupone los anos 2010-2025.
    from app.time_utils import parse_utc
    rows = []
    for row in dataset.snapshot:
        if row.get('fuente') != fuente:
            continue
        try:
            lat, lon, mag = float(row['latitud']), float(row['longitud']), float(row['magnitud'])
            when = parse_utc(row['fecha_utc'])
        except (KeyError, TypeError, ValueError):
            continue
        if not all(math.isfinite(value) for value in (lat, lon, mag)):
            continue
        index = zone_index(lat, lon, peru)
        if index is not None and -2 <= mag <= 10:
            rows.append((index, mag, when))
    if len(rows) < 30:
        raise HTTPException(422, 'El dataset necesita al menos 30 registros de la fuente y ambito seleccionados')
    first, last = min(row[2] for row in rows), max(row[2] for row in rows)
    if (last-first).total_seconds() < 7*86400:
        raise HTTPException(422, 'El dataset debe abarcar al menos siete dias de observaciones')
    counts = {}
    for index, magnitude, _when in rows:
        if magnitude >= 4:
            counts[index] = counts.get(index, 0)+1
    return describe(counts, first, last, fuente, peru, len(rows), sum(counts.values()), {
        'origen': 'dataset_versionado', 'dataset_id': str(dataset.id), 'dataset_sha256': dataset.signature,
        'consulta_limitada': bool(dataset.manifest.get('muestra_limitada')), 'cobertura_completa_verificada': False})
