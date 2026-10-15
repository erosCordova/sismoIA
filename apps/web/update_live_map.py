from pathlib import Path
p = Path("src/SeismicWorkspace.tsx")
s = p.read_text(encoding="utf-8")

if "SISMOIA_AUTO_REFRESH" not in s:
    marcador = "  async function sincronizar() {"
    assert marcador in s, "No se encontro la funcion de sincronizacion"
    bloque = "\n".join([
        "  // SISMOIA_AUTO_REFRESH: consultar la base de datos cada minuto",
        "  useEffect(() => {",
        "    if (!token) return;",
        "    const temporizador = window.setInterval(() => {",
        "      if (document.visibilityState === \"visible\") void cargar();",
        "    }, 60_000);",
        "    return () => window.clearInterval(temporizador);",
        "  }, [token, peru, magnitud, fuente, pagina]);",
        ""
    ])
    s = s.replace(marcador, bloque + "\n" + marcador, 1)

if "limit: modo ===" not in s:
    original = "limit: \"100\", offset: String(pagina * 100)"
    nuevo = "limit: modo === \"mapa\" ? \"500\" : \"100\", offset: String(pagina * (modo === \"mapa\" ? 500 : 100))"
    assert original in s, "Formato de paginacion distinto"
    s = s.replace(original, nuevo, 1)

s = s.replace("(pagina + 1) * 100 >= total",
              "(pagina + 1) * (modo === \"mapa\" ? 500 : 100) >= total")
s = s.replace("hasta 100 epicentros", "hasta 500 epicentros")

assert "SISMOIA_AUTO_REFRESH" in s
p.write_text(s, encoding="utf-8")
print("REFRESCO_AUTOMATICO=OK")
print("MAPA_500_EVENTOS=OK")
