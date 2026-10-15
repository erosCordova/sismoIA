from pathlib import Path
import re

p = Path("src/SeismicWorkspace.tsx")
s = p.read_text(encoding="utf-8")
assert "MapContainer" in s and "async function cargar" in s

if not re.search(r"type Evento\s*=\s*\{[^}]*\bfuente\s*:", s, re.S):
    s, n = re.subn(r"(type Evento\s*=\s*\{)", r"\1\n  fuente: string;", s, count=1)
    assert n == 1, "No se encontro el tipo Evento"

if "const [fuente, setFuente]" not in s:
    m = re.search(r"(?m)^[ \t]*const \[magnitud, setMagnitud\] = useState\(\"\"\);", s)
    assert m, "No se encontro el estado de magnitud"
    s = s[:m.end()] + "\n  const [fuente, setFuente] = useState(\"\");" + s[m.end():]

if "set(\"fuente\", fuente)" not in s:
    m = re.search(r"(?m)^([ \t]*)if \(magnitud\) (\w+)\.set\(\"min_magnitude\", magnitud\);", s)
    assert m, "No se encontro el filtro HTTP"
    s = s[:m.end()] + "\n" + m.group(1) + "if (fuente) " + m.group(2) + ".set(\"fuente\", fuente);" + s[m.end():]

s = s.replace("[peru, magnitud]", "[peru, magnitud, fuente]")
s = s.replace("[token, peru, magnitud, pagina]", "[token, peru, magnitud, fuente, pagina]")

if "aria-label=\"Fuente sísmica\"" not in s:
    m = re.search(r"<div className=\"(?:seis-actions|seismic-actions)\">", s)
    assert m, "No se encontro la barra de filtros"
    selector = "<select aria-label=\"Fuente sísmica\" value={fuente} onChange={e => setFuente(e.target.value)}><option value=\"\">Todas las fuentes</option><option value=\"USGS\">USGS</option><option value=\"IGP\">IGP</option></select>"
    s = s[:m.end()] + "\n          " + selector + s[m.end():]

if "<th>Fuente</th>" not in s:
    m = re.search(r"</tr>\s*</thead>", s)
    assert m, "No se encontro la cabecera de la tabla"
    s = s[:m.start()] + "<th>Fuente</th>" + s[m.start():]
    if "<td>{e.latitud.toFixed(3)}, {e.longitud.toFixed(3)}</td>" in s:
        a = "<td>{e.latitud.toFixed(3)}, {e.longitud.toFixed(3)}</td>"
    else:
        a = "<td>{e.profundidad_km === null ? \"—\" : `${e.profundidad_km} km`}</td>"
    assert a in s, "No se encontro la fila de eventos"
    s = s.replace(a, a + "<td>{e.fuente}</td>", 1)
    s = re.sub(r"colSpan=\{(\d+)\}", lambda m: "colSpan={" + str(int(m.group(1)) + 1) + "}", s, count=1)

if "Fuente: {e.fuente}" not in s:
    m = re.search(r"<Popup><strong>[^<]+</strong>", s)
    assert m, "No se encontro el popup del mapa"
    s = s[:m.end()] + "<p>Fuente: {e.fuente}</p>" + s[m.end():]

assert "setFuente" in s and "set(\"fuente\", fuente)" in s
assert "<td>{e.fuente}</td>" in s and "Fuente: {e.fuente}" in s
p.write_text(s, encoding="utf-8")
print("FILTROS_USGS_IGP=CORREGIDOS")
