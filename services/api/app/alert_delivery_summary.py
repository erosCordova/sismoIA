"""Estados reales de asignaciones internas y aceptacion SMTP, sin confundirlos."""
from collections import defaultdict
from sqlalchemy import select
from app.alert_models import AlertAction
from app.delivery_models import AlertDelivery
from app.time_utils import utc_iso, as_utc


def summarize_deliveries(deliveries, actions):
    entries = []
    for item in deliveries:
        entries.append({
            "canal": "internal", "destinatario": str(item.recipient_id),
            "estado": item.status, "acuse_utc": utc_iso(item.acknowledged_at),
            "creada_utc": utc_iso(item.created_at),
        })
    latest_email = {}
    for item in sorted(actions, key=lambda a: as_utc(a.created_at)):
        destination = (item.details or "").split(";", 1)[0].removeprefix("user:")
        latest_email[destination] = item
    for destination, item in latest_email.items():
        entries.append({
            "canal": "email", "destinatario": destination,
            "estado": "smtp_accepted" if item.action == "email.sent" else "smtp_failed",
            "creada_utc": utc_iso(item.created_at), "acuse_utc": None,
        })
    acknowledgements = [as_utc(d.acknowledged_at) for d in deliveries if d.acknowledged_at]
    last_attempt = max((as_utc(a.created_at) for a in actions), default=None)
    states = sorted({x["estado"] for x in entries})
    return {
        "estado": ", ".join(states) if states else "sin_entregas_registradas",
        "canal": ", ".join(sorted({x["canal"] for x in entries})) or None,
        "destinatarios": sorted({x["destinatario"] for x in entries}),
        "intentos": len(actions), "ultimo_intento_utc": utc_iso(last_attempt),
        "entregada_utc": utc_iso(max(acknowledgements)) if acknowledgements else None,
        "acuse": utc_iso(max(acknowledgements)) if acknowledgements else None,
        "error": "Hay envios SMTP fallidos" if "smtp_failed" in states else None,
        "registros": entries,
        "nota": "SMTP aceptado no confirma llegada al buzon ni lectura. Acuse corresponde a la bandeja interna.",
    }


def delivery_summaries(db, alert_ids):
    if not alert_ids:
        return {}
    internal, email = defaultdict(list), defaultdict(list)
    for item in db.scalars(select(AlertDelivery).where(AlertDelivery.alert_id.in_(alert_ids))).all():
        internal[item.alert_id].append(item)
    for item in db.scalars(select(AlertAction).where(AlertAction.alert_id.in_(alert_ids), AlertAction.action.in_(["email.sent", "email.failed"]))).all():
        email[item.alert_id].append(item)
    return {key: summarize_deliveries(internal[key], email[key]) for key in alert_ids}
