
"""Consulta protegida de pronosticos experimentales."""

from fastapi import APIRouter, Depends, Response

from app.access import requerir_permiso
from app.seismic_forecast_snapshot import generar_pronostico


router = APIRouter(
    prefix="/api/v1/forecasts",
    tags=["Pronosticos sismicos experimentales"]
)


@router.get("/zones")
def consultar_zonas(
    response: Response,
    _usuario=Depends(requerir_permiso("models:read"))
):
    response.headers["Cache-Control"] = "no-store"
    return generar_pronostico()
