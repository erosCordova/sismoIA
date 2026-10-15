from pathlib import Path
p = Path("src/App.tsx")
s = p.read_text(encoding="utf-8")
declaracion = "const ManagementWorkspace = lazy(() => import(\"./ManagementWorkspace\"));"
if declaracion not in s:
    marcador = "const permisoPorRuta:"
    assert marcador in s, "NO_SE_ENCONTRO_CONFIGURACION_DE_RUTAS"
    s = s.replace(marcador, declaracion + "\n" + marcador, 1)
if "<ManagementWorkspace seccion=" not in s:
    marcador = ") : modulo.ruta === \"/fuentes\" ? ("
    assert marcador in s, "NO_SE_ENCONTRO_LA_RUTA_DE_FUENTES"
    nuevo = (
        ") : modulo.ruta === \"/usuarios\" ? (\n"
        "<Suspense fallback={<p>Cargando usuarios...</p>}><ManagementWorkspace seccion=\"usuarios\" /></Suspense>\n"
        ") : modulo.ruta === \"/auditoria\" ? (\n"
        "<Suspense fallback={<p>Cargando auditoría...</p>}><ManagementWorkspace seccion=\"auditoria\" /></Suspense>\n"
    )
    s = s.replace(marcador, nuevo + marcador, 1)
p.write_text(s, encoding="utf-8")
print("USUARIOS_Y_AUDITORIA_REACT=INTEGRADOS")
