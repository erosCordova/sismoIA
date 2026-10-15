from pathlib import Path

p = Path("scripts/seismic_worker.py")
s = p.read_text(encoding="utf-8")

if "from app.alerts import evaluar_registros" not in s:
    importacion = "from app.igp import sincronizar_igp as sync_igp\n"
    assert importacion in s, "IMPORTACION_IGP_NO_ENCONTRADA"
    s = s.replace(importacion, importacion + "from app.alerts import evaluar_registros\n", 1)

if "fuente=\"ALERTAS\"" not in s:
    marcador = "        finally:\n            conexion.execute("
    assert marcador in s, "BLOQUE_DE_LIBERACION_NO_ENCONTRADO"
    insercion = (
        "            try:\n"
        "                resultado = evaluar_registros(dias=7)\n"
        "                registrar(fuente=\"ALERTAS\", estado=\"OK\", **resultado)\n"
        "            except Exception as error:\n"
        "                errores += 1\n"
        "                registrar(fuente=\"ALERTAS\", estado=\"ERROR\",\n"
        "                    detalle=str(error)[:240])\n"
    )
    s = s.replace(marcador, insercion + marcador, 1)

compile(s, str(p), "exec")
p.write_text(s, encoding="utf-8")
print("EVALUACION_AUTOMATICA=INTEGRADA")
