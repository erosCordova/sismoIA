from pathlib import Path
import re

p = Path("src/App.tsx")
s = p.read_text(encoding="utf-8")
nombres = ("SeismicWorkspace", "PreparationWorkspace", "AnalyticsWorkspace")

for nombre in nombres:
    anterior = f"import {nombre} from \"./{nombre}\";"
    assert anterior in s or f"const {nombre} = lazy(" in s, f"Falta {nombre}"

if "import { lazy, Suspense } from \"react\";" not in s:
    s = "import { lazy, Suspense } from \"react\";\n" + s

declaraciones = []
for nombre in nombres:
    s = s.replace(f"import {nombre} from \"./{nombre}\";\n", "")
    if f"const {nombre} = lazy(" not in s:
        declaraciones.append(f"const {nombre} = lazy(() => import(\"./{nombre}\"));")

if declaraciones:
    marcador = "const permisoPorRuta:"
    assert marcador in s, "No se encontro la configuracion de rutas"
    s = s.replace(marcador, "\n".join(declaraciones) + "\n\n" + marcador, 1)

for nombre in nombres:
    patron = rf"(<{nombre}\b[^>]*?/>)"
    coincidencia = re.search(patron, s)
    assert coincidencia, f"No se encontro el componente {nombre}"
    inicio = coincidencia.start()
    if "<Suspense" not in s[max(0, inicio - 90):inicio]:
        s = s[:inicio] + "<Suspense fallback={<p>Cargando módulo...</p>}>" + coincidencia.group(1) + "</Suspense>" + s[coincidencia.end():]

p.write_text(s, encoding="utf-8")
print("CARGA_OPTIMIZADA=OK")
