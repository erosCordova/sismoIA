from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="SISMOIA Enterprise API",
    description="Sistema empresarial de monitoreo y analitica sismica mundial",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ] + [origen.strip().rstrip("/") for origen in __import__("os").getenv("CORS_ORIGINS", "").split(",") if origen.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.get("/")
def inicio():
    return {
        "sistema": "SISMOIA Enterprise",
        "version": "1.0.0",
        "cobertura": "Mundial",
        "pais_principal": "Peru",
        "estado": "desarrollo",
    }

@app.get("/api/v1/health")
def verificar_salud():
    return {
        "status": "ok",
        "servicio": "SISMOIA API",
        "base_datos": "pendiente",
    }


from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from app.database import comprobar_conexion


@app.get("/api/v1/health/database")
def verificar_base_datos():
    try:
        nombre = comprobar_conexion()

        return {
            "status": "ok",
            "database": "connected",
            "name": nombre,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible",
        )

from app.auth import router as auth_router
app.include_router(auth_router)

from app.access import router as access_router
app.include_router(access_router)

from app.user_management import router as users_router
app.include_router(users_router)

from app.seismic import router as seismic_router
app.include_router(seismic_router)

from app.igp import router as igp_router
app.include_router(igp_router)

from app.quality import router as quality_router
app.include_router(quality_router)

from app.preparation import router as preparation_router
app.include_router(preparation_router)

from app.analytics import router as analytics_router
app.include_router(analytics_router)

from app.ml import router as ml_router
app.include_router(ml_router)

from app.estimates import router as estimates_router
app.include_router(estimates_router)

from app.alerts import router as alerts_router
app.include_router(alerts_router)

from app.sources import router as sources_router
from app.reports import router as reports_router
app.include_router(sources_router)
app.include_router(reports_router)

from app.management import router as management_router
app.include_router(management_router)

from app.dashboard import router as dashboard_router
app.include_router(dashboard_router)

from app.catalog import router as catalog_router
app.include_router(catalog_router)
