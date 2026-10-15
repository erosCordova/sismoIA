import re
import subprocess
from pathlib import Path

nombres = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split(b"\0")
problemas = []
revisados = 0
patron_url = re.compile(r"(?i)\b(?:postgres(?:ql)?(?:\+[a-z0-9_]+)?|mysql|mongodb(?:\+srv)?|redis)://[A-Za-z0-9_.%-]+:([^@/\s\x22\x27]+)@")
patron_token = re.compile(r"(?:ghp_|github_pat_|xox[baprs]-|sk-proj-|sk_live_|AIza)[A-Za-z0-9_-]{12,}")
patron_literal = re.compile(r"(?i)^\s*(?:jwt_secret_key|openai_api_key|gemini_api_key|supabase_service_role_key)\s*(?::\s*str)?\s*=\s*[\x22\x27]([^\x22\x27]+)")
marcadores = ("CHANGE_ME", "PLACEHOLDER", "YOUR_", "EXAMPLE_")

for bruto in set(nombres):
    if not bruto:
        continue
    ruta = Path(bruto.decode("utf-8"))
    if not ruta.is_file():
        continue
    revisados += 1
    if ruta.name == ".env" or (ruta.name.startswith(".env.") and ruta.name != ".env.example") or ruta.suffix.lower() in (".pem", ".p12", ".pfx", ".key"):
        problemas.append((str(ruta), 0, "ARCHIVO_SENSIBLE"))
        continue
    if ruta.stat().st_size > 10 * 1024 * 1024:
        problemas.append((str(ruta), 0, "ARCHIVO_MAYOR_10MB"))
        continue
    contenido = ruta.read_bytes()
    if b"\0" in contenido[:4096]:
        continue
    for numero, linea in enumerate(contenido.decode("utf-8", errors="replace").splitlines(), 1):
        if re.search(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", linea):
            problemas.append((str(ruta), numero, "CLAVE_PRIVADA"))
        if patron_token.search(linea):
            problemas.append((str(ruta), numero, "TOKEN_EXTERNO"))
        if re.search(r"\bAKIA[A-Z0-9]{16}\b", linea):
            problemas.append((str(ruta), numero, "AWS_KEY"))
        for coincide in patron_url.finditer(linea):
            if not coincide.group(1).upper().startswith(marcadores):
                problemas.append((str(ruta), numero, "URL_CON_PASSWORD"))
        literal = patron_literal.match(linea)
        if literal and not literal.group(1).upper().startswith(marcadores):
            problemas.append((str(ruta), numero, "CLAVE_LITERAL"))
        if ruta.name == ".env.example":
            par = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", linea)
            if par:
                clave, valor = par.group(1).upper(), par.group(2).strip().strip(chr(34) + chr(39))
                if clave.endswith(("_SECRET", "_KEY", "_TOKEN", "_PASSWORD")) and valor and not valor.upper().startswith(marcadores):
                    problemas.append((str(ruta), numero, "VALOR_DE_EJEMPLO_NO_FICTICIO"))

print("ARCHIVOS_REVISADOS=", revisados)
print("INCIDENCIAS=", len(problemas))
for nombre, linea, tipo in sorted(set(problemas)):
    print(f"REVISAR={nombre}:{linea}:{tipo}")
if problemas:
    raise SystemExit(2)
print("ESCANEO_SEGURO_PRELIMINAR=OK")
