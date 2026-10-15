from pathlib import Path
p = Path("src/App.tsx")
s = p.read_text(encoding="utf-8")
declaraciones = [
    "const SourcesWorkspace = lazy(() => import(\"./SourcesWorkspace\"));",
    "const ReportsWorkspace = lazy(() => import(\"./ReportsWorkspace\"));"
]
for declaracion in declaraciones:
    if declaracion not in s:
        assert "const permisoPorRuta:" in s
        s = s.replace("const permisoPorRuta:", declaracion + "\nconst permisoPorRuta:", 1)
if "<SourcesWorkspace />" not in s:
    marcador = ") : modulo.ruta === \"/reglas\" ? ("
    assert marcador in s, "NO_SE_ENCONTRO_LA_RUTA_REGLAS"
    nuevo = (
        ") : modulo.ruta === \"/fuentes\" ? (\n"
        "<Suspense fallback={<p>Cargando fuentes...</p>}><SourcesWorkspace /></Suspense>\n"
        ") : modulo.ruta === \"/reportes\" ? (\n"
        "<Suspense fallback={<p>Cargando reportes...</p>}><ReportsWorkspace peru={cobertura === \"Perú\"} /></Suspense>\n"
    )
    s = s.replace(marcador, nuevo + marcador, 1)
compile("1+1", "<validacion>", "eval")
p.write_text(s, encoding="utf-8")
print("FUENTES_Y_REPORTES_REACT=INTEGRADOS")
