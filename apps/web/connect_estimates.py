from pathlib import Path
p = Path("src/App.tsx")
s = p.read_text(encoding="utf-8")
nombre = "EstimatesWorkspace"
declaracion = "const EstimatesWorkspace = lazy(() => import(\"./EstimatesWorkspace\"));"
if declaracion not in s:
    marcador = "const permisoPorRuta:"
    assert marcador in s, "No se encontro la configuracion de rutas"
    s = s.replace(marcador, declaracion + "\n" + marcador, 1)
if "<EstimatesWorkspace peru=" not in s:
    marcador = ") : modulo.ruta === \"/modelos\" ? ("
    assert marcador in s, "No se encontro la ruta de modelos"
    nuevo = ") : modulo.ruta === \"/estimaciones\" ? (\n<Suspense fallback={<p>Cargando estimaciones...</p>}><EstimatesWorkspace peru={cobertura === \"Perú\"} /></Suspense>\n" + marcador
    s = s.replace(marcador, nuevo, 1)
p.write_text(s, encoding="utf-8")
print("MODULO_ESTIMACIONES=INTEGRADO")
