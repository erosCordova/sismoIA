from pathlib import Path
p = Path("src/App.tsx")
s = p.read_text(encoding="utf-8")
declaracion = "const AlertsWorkspace = lazy(() => import(\"./AlertsWorkspace\"));"
if declaracion not in s:
    assert "const permisoPorRuta:" in s
    s = s.replace("const permisoPorRuta:", declaracion + "\nconst permisoPorRuta:", 1)
if "<AlertsWorkspace seccion=" not in s:
    marcador = ") : modulo.ruta === \"/estimaciones\" ? ("
    assert marcador in s, "RUTAS_NO_ENCONTRADAS"
    nuevo = ") : modulo.ruta === \"/reglas\" ? (\n<Suspense fallback={<p>Cargando reglas...</p>}><AlertsWorkspace seccion=\"reglas\" /></Suspense>\n) : modulo.ruta === \"/alertas\" ? (\n<Suspense fallback={<p>Cargando alertas...</p>}><AlertsWorkspace seccion=\"centro\" /></Suspense>\n" + marcador
    s = s.replace(marcador, nuevo, 1)
p.write_text(s, encoding="utf-8")
print("MODULOS_ALERTAS=INTEGRADOS")
