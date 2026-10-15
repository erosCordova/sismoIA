from pathlib import Path
p = Path("src/SeismicWorkspace.tsx")
s = p.read_text(encoding="utf-8")
assert "async function cargar" in s and "MapContainer" in s

def cambiar(antes, despues):
    global s
    if despues not in s:
        assert antes in s, "No se encontro: " + antes[:65]
        s = s.replace(antes, despues, 1)

cambiar("type Evento = { id: string;", "type Evento = { fuente: string; id: string;")
cambiar("  const [magnitud, setMagnitud] = useState(\"\");", "  const [magnitud, setMagnitud] = useState(\"\");\n  const [fuente, setFuente] = useState(\"\");")
cambiar("    if (magnitud) q.set(\"min_magnitude\", magnitud);", "    if (magnitud) q.set(\"min_magnitude\", magnitud);\n      if (fuente) q.set(\"fuente\", fuente);")
cambiar("limit: \"100\"", "limit: modo === \"mapa\" ? \"500\" : \"100\"")
cambiar("[peru, magnitud]", "[peru, magnitud, fuente]")
cambiar("[token, peru, magnitud, pagina]", "[token, peru, magnitud, fuente, pagina]")
cambiar("{modo !== \"dashboard\" && <select aria-label=\"Magnitud mínima\"", "<select aria-label=\"Fuente sísmica\" value={fuente} onChange={e => setFuente(e.target.value)}><option value=\"\">USGS + IGP</option><option value=\"USGS\">USGS</option><option value=\"IGP\">IGP</option></select>\n        {modo !== \"dashboard\" && <select aria-label=\"Magnitud mínima\"")
cambiar("<th>Profundidad</th>", "<th>Profundidad</th><th>Fuente</th>")
cambiar("<td>{e.profundidad_km === null ? \"—\" : `${e.profundidad_km} km`}</td>", "<td>{e.profundidad_km === null ? \"—\" : `${e.profundidad_km} km`}</td><td>{e.fuente}</td>")
cambiar("colSpan={4}", "colSpan={5}")
cambiar("<Popup><strong>{e.lugar || \"Epicentro\"}</strong>", "<Popup><strong>{e.lugar || \"Epicentro\"}</strong><p>Fuente: {e.fuente}</p>")
s = s.replace("hasta 100 epicentros", "hasta 500 epicentros")
assert "setFuente" in s and "e.fuente" in s
p.write_text(s, encoding="utf-8")
print("FILTROS_USGS_IGP=OK")
