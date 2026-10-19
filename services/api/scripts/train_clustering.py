"""CLI compatible con CSV anteriores y el mismo motor seguro del frontend."""
import argparse
import csv
import os
import sys
from pathlib import Path
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.ml_artifacts import VARIABLES, active_directory, database_rows, generate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--from-database', action='store_true', help='Consultar datos actuales de la base configurada')
    parser.add_argument('--peru', action='store_true', help='Limitar la consulta de base a Peru')
    options = parser.parse_args()
    base = Path(os.environ.get('SISMOIA_ML_OUTPUT_DIR') or ROOT/'data/processed')
    if options.from_database:
        rows = database_rows(peru=options.peru)
        origin = 'Supabase/PostgreSQL'
    else:
        rows = []
        directory = active_directory(base)
        for name in ('sismoia_entrenamiento.csv', 'sismoia_evaluacion.csv'):
            with (directory/name).open(encoding='utf-8-sig', newline='') as stream:
                for row in csv.DictReader(stream):
                    rows.append({'id':row['id'], 'fuente':row['fuente'], 'fecha_utc':row['fecha_utc'],
                                 **{key:float(row[key]) for key in VARIABLES}})
        origin = 'CSV local; comprobar su procedencia'
        if options.peru:
            rows = [row for row in rows if -19 <= row['latitud'] <= 1 and -82 <= row['longitud'] <= -68]
    metrics = generate(base, rows, peru=options.peru, origin=origin)
    print('ENTRENAMIENTO_ML=OK')
    print('REGISTROS_TRAIN=', metrics['entrenamiento'])
    print('REGISTROS_EVALUACION=', metrics['evaluacion'])
    print('KMEANS_GRUPOS=', metrics['kmeans']['grupos'])
    print('MODELOS_GUARDADOS=VERSION_LOCAL_EXPLORATORIA')


if __name__ == '__main__':
    try:
        main()
    except HTTPException as error:
        print(error.detail, file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError) as error:
        print('No se pudo leer el conjunto: ' + type(error).__name__ + '. Comprueba los CSV o usa --from-database.', file=sys.stderr)
        sys.exit(1)
