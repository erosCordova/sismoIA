from pathlib import Path
p = Path("app/seismic.py")
s = p.read_text(encoding="utf-8")

def cambiar(antes, despues):
    global s
    if despues not in s:
        assert antes in s, "No se encontro: " + antes[:65]
        s = s.replace(antes, despues, 1)

cambiar("def serializar(e):", "def serializar(e, origen=\"Desconocida\"):")
cambiar("\"id\": str(e.id), \"external_id\":", "\"id\": str(e.id), \"fuente\": origen, \"external_id\":")
cambiar("    usuario: dict = Depends(usuario_actual)\n):", "    fuente: str | None = Query(None, pattern=\"^(USGS|IGP)$\"),\n    usuario: dict = Depends(usuario_actual)\n):")
cambiar("        if min_magnitude is not None:", "        if fuente:\n            consulta = consulta.where(SeismicEvent.source_id == select(DataSource.id).where(DataSource.name == fuente).scalar_subquery())\n        if min_magnitude is not None:")
cambiar("        return {\"total\": total, \"peru\": peru, \"eventos\": [serializar(e) for e in eventos]}", "        nombres = dict(db.execute(select(DataSource.id, DataSource.name)).all())\n        return {\"total\": total, \"peru\": peru, \"eventos\": [serializar(e, nombres.get(e.source_id, \"Desconocida\")) for e in eventos]}")

marcador = "@router.get(\"/stats\")"
assert marcador in s
cabecera, stats = s.split(marcador, 1)
origen = "        fuente = db.scalar(select(DataSource).where(DataSource.name == \"USGS\"))"
nuevo = "        conteos = dict(db.execute(select(DataSource.name, func.count(SeismicEvent.id)).join(SeismicEvent, SeismicEvent.source_id == DataSource.id).group_by(DataSource.name)).all())\n        ultima = db.scalar(select(func.max(DataSource.last_sync_at)))"
if "conteos = dict(" not in stats:
    assert origen in stats
    stats = stats.replace(origen, nuevo, 1)
for anterior in ("fuente.last_sync_at.isoformat() + \"Z\" if fuente and fuente.last_sync_at else None", "fuente.last_sync_at.replace(tzinfo=timezone.utc).isoformat() if fuente and fuente.last_sync_at else None"):
    stats = stats.replace(anterior, "ultima.replace(tzinfo=timezone.utc).isoformat() if ultima else None")
stats = stats.replace("\"fuente\": \"USGS\" if fuente else None", "\"fuente\": \"USGS + IGP\" if len(conteos) > 1 else next(iter(conteos), None), \"eventos_por_fuente\": conteos")
s = cabecera + marcador + stats
assert "eventos_por_fuente" in s and "nombres.get(e.source_id" in s
compile(s, str(p), "exec")
p.write_text(s, encoding="utf-8")
print("CATALOGO_MULTIFUENTE=OK")
