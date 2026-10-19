"""Exploracion actual y versiones revisables usando el gobierno de datasets existente."""
import hashlib
import json
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.access import requerir_permiso
from app.database import engine
from app.governance_models import DatasetVersion, ExperimentRun
from app.governance import firma_snapshot_valida, experimento_json, auditar, actor
from app.zone_analysis import current_zones as generar_pronostico, snapshot_zones, METHOD

router = APIRouter(prefix='/api/v1/forecasts', tags=['Exploracion experimental por zonas'])


class NewZoneRun(BaseModel):
    dataset_id: UUID
    fuente: Literal['IGP', 'USGS'] = 'IGP'
    peru: bool = True


@router.get('/zones')
def consultar_zonas(response: Response, peru: bool = True, fuente: Literal['IGP', 'USGS'] = 'IGP',
                    dias: int = Query(365, ge=7, le=3650),
                    _usuario=Depends(requerir_permiso('models:read'))):
    response.headers['Cache-Control'] = 'no-store'
    return generar_pronostico(peru=peru, fuente=fuente, dias=dias)


@router.post('/runs', status_code=201)
def guardar_zonas(data: NewZoneRun, usuario=Depends(requerir_permiso('models:train'))):
    with Session(engine) as db:
        dataset = db.get(DatasetVersion, data.dataset_id)
        if dataset is None:
            raise HTTPException(404, 'Dataset no encontrado')
        if dataset.status == 'rejected':
            raise HTTPException(409, 'El dataset esta rechazado')
        if not data.peru and dataset.manifest.get('peru'):
            raise HTTPException(422, 'Un dataset limitado a Peru no puede presentarse como un catalogo mundial')
        if not firma_snapshot_valida(dataset.manifest, dataset.snapshot, dataset.signature):
            raise HTTPException(409, 'La firma del dataset no coincide con su contenido')
        result = snapshot_zones(dataset, data.fuente, data.peru)
        artifact = json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
        run = ExperimentRun(dataset_id=dataset.id, algorithm='zonas_historicas', status='pending',
                            parameters={'version_motor': METHOD, 'fuente': data.fuente, 'peru': data.peru,
                                        'firma_dataset': dataset.signature, 'tipo': 'estadistica_descriptiva'},
                            results=result, artifact=artifact, artifact_sha256=hashlib.sha256(artifact).hexdigest(),
                            created_by=actor(usuario))
        db.add(run)
        db.flush()
        auditar(db, usuario, 'zones.create', 'sismo_ml_experiment', run.id, None,
                {'dataset_id': str(dataset.id), 'fuente': data.fuente, 'peru': data.peru, 'version': METHOD})
        db.commit()
        return experimento_json(run)


@router.get('/runs')
def listar_zonas(peru: bool | None = None, limite: int = Query(30, ge=1, le=100),
                 usuario=Depends(requerir_permiso('models:read'))):
    with Session(engine) as db:
        query = select(ExperimentRun).where(ExperimentRun.algorithm == 'zonas_historicas')
        if peru is not None:
            query = query.where(ExperimentRun.parameters['peru'].as_boolean() == peru)
        rows = db.scalars(query.order_by(ExperimentRun.created_at.desc()).limit(limite)).all()
        return {'experimentos': [experimento_json(row) for row in rows]}


def checked_result(db, run, approved=False):
    if run is None or run.algorithm != 'zonas_historicas':
        raise HTTPException(404, 'Version de zonas no encontrada')
    dataset = db.get(DatasetVersion, run.dataset_id)
    if dataset is None or dataset.status == 'rejected' or run.status == 'rejected':
        raise HTTPException(409, 'La version o su dataset fueron rechazados')
    if approved and (run.status != 'approved' or dataset.status != 'approved'):
        raise HTTPException(409, 'La publicacion requiere dataset y evaluacion aprobados')
    if not firma_snapshot_valida(dataset.manifest, dataset.snapshot, dataset.signature):
        raise HTTPException(409, 'El dataset fue alterado')
    if hashlib.sha256(bytes(run.artifact)).hexdigest() != run.artifact_sha256:
        raise HTTPException(409, 'La version guardada fue alterada')
    try:
        result = json.loads(bytes(run.artifact))
    except (ValueError, TypeError):
        raise HTTPException(409, 'La version guardada no es compatible') from None
    return {**result, 'experimento_id': str(run.id), 'dataset_id': str(dataset.id),
            'estado_revision': run.status, 'publicado': approved,
            'revisada_por': str(run.reviewed_by) if run.reviewed_by else None,
            'motivo_revision': run.review_note}


@router.get('/runs/{run_id}')
def detalle_zonas(run_id: UUID, usuario=Depends(requerir_permiso('models:read'))):
    with Session(engine) as db:
        return checked_result(db, db.get(ExperimentRun, run_id))


@router.get('/published/{run_id}')
def publicacion_zonas(run_id: UUID, usuario=Depends(requerir_permiso('estimates:read'))):
    with Session(engine) as db:
        return checked_result(db, db.get(ExperimentRun, run_id), approved=True)


@router.get('/published')
def listar_publicaciones(peru: bool = True, usuario=Depends(requerir_permiso('estimates:read'))):
    with Session(engine) as db:
        rows = db.scalars(select(ExperimentRun).join(DatasetVersion, DatasetVersion.id == ExperimentRun.dataset_id)
                          .where(ExperimentRun.algorithm == 'zonas_historicas', ExperimentRun.status == 'approved',
                                 DatasetVersion.status == 'approved', ExperimentRun.parameters['peru'].as_boolean() == peru)
                          .order_by(ExperimentRun.reviewed_at.desc()).limit(30)).all()
        return {'versiones': [{'id': str(row.id), 'dataset_id': str(row.dataset_id),
                              'fuente': row.parameters.get('fuente'), 'revisada_utc': row.reviewed_at.isoformat(),
                              'metodo': row.parameters.get('version_motor')} for row in rows]}
