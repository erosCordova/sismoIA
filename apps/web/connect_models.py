from pathlib import Path
p = Path("src/App.tsx")
s = p.read_text(encoding="utf-8")
declaracion = "const ModelsWorkspace = lazy(() => import(\"./ModelsWorkspace\"));"
if declaracion not in s:
    marcador = "const permisoPorRuta:"
    assert marcador in s, "No se encontro la configuracion de rutas"
    s = s.replace(marcador, declaracion + "\n" + marcador, 1)
if "<ModelsWorkspace />" not in s:
    marcador = ") : modulo.ruta === \"/analisis\" ? ("
    assert marcador in s, "No se encontro la ruta de analisis"
    nuevo = ") : modulo.ruta === \"/modelos\" ? (\n<Suspense fallback={<p>Cargando modelos...</p>}><ModelsWorkspace /></Suspense>\n" + marcador
    s = s.replace(marcador, nuevo, 1)
p.write_text(s, encoding="utf-8")
print("MODULO_MODELOS_ML=INTEGRADO")
