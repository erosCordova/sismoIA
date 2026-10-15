import sys
from pathlib import Path
from uuid import UUID, uuid4
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.main import app
from app.auth import usuario_actual
from app.database import engine
from app.alert_models import AlertRule, SeismicAlert, AlertAction

cliente = TestClient(app)
assert cliente.get("/api/v1/alerts/rules").status_code == 401
assert cliente.get("/api/v1/alerts").status_code == 401
print("SIN_TOKEN=401")

app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Solo lectura"]}
r = cliente.post("/api/v1/alerts/rules", json={
    "nombre": "Regla restringida", "magnitud_minima": 5})
assert r.status_code == 403
print("SIN_PERMISOS=403")

app.dependency_overrides[usuario_actual] = lambda: {"roles": ["Administrador"]}
nombre = "PRUEBA-" + uuid4().hex
regla_id = None
try:
    creada = cliente.post("/api/v1/alerts/rules", json={
        "nombre": nombre, "magnitud_minima": 7, "solo_peru": False})
    assert creada.status_code == 201, creada.text[:400]
    regla_id = UUID(creada.json()["id"])
    print("CREACION_REGLA=201")

    primera = cliente.post("/api/v1/alerts/evaluate?dias=7")
    assert primera.status_code == 200, primera.text[:400]
    print("EVALUACION=", primera.json())
    segunda = cliente.post("/api/v1/alerts/evaluate?dias=7")
    assert segunda.status_code == 200
    assert segunda.json()["nuevas_alertas"] == 0
    print("SIN_DUPLICADOS=OK")

    pendientes = cliente.get("/api/v1/alerts?estado=pending")
    assert pendientes.status_code == 200
    print("CONSULTA_ALERTAS=OK")

    with Session(engine) as db:
        ids = db.scalars(select(SeismicAlert.id).where(SeismicAlert.rule_id == regla_id)).all()
    if ids:
        revision = cliente.post(f"/api/v1/alerts/{ids[0]}/review", json={"decision": "approved"})
        assert revision.status_code == 200, revision.text[:300]
        repetida = cliente.post(f"/api/v1/alerts/{ids[0]}/review", json={"decision": "approved"})
        assert repetida.status_code == 409
        print("REVISION_Y_AUDITORIA=OK")
    else:
        print("SIN_EVENTOS_QUE_CUMPLAN_LA_REGLA_TEMPORAL")

    historial = cliente.get("/api/v1/alerts/history")
    assert historial.status_code == 200
    print("HISTORIAL=OK")
    print("FASE7_BACKEND=OK")
finally:
    app.dependency_overrides.clear()
    if regla_id:
        with Session(engine) as db:
            ids = db.scalars(select(SeismicAlert.id).where(SeismicAlert.rule_id == regla_id)).all()
            if ids:
                db.execute(delete(AlertAction).where(AlertAction.alert_id.in_(ids)))
            db.execute(delete(AlertAction).where(AlertAction.details == "Regla creada: " + str(regla_id)))
            db.execute(delete(SeismicAlert).where(SeismicAlert.rule_id == regla_id))
            db.execute(delete(AlertRule).where(AlertRule.id == regla_id))
            db.commit()
