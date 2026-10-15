import getpass
import httpx
from pathlib import Path

correo = input("Correo del administrador: ").strip().lower()
clave = getpass.getpass("Contraseña: ")
resultado = []
try:
    with httpx.Client(timeout=15) as cliente:
        login = cliente.post("http://127.0.0.1:8000/api/v1/auth/login", json={"email": correo, "password": clave})
        resultado.append(f"LOGIN={login.status_code}")
        if login.status_code == 200:
            token = login.json().get("access_token", "")
            headers = {"Authorization": f"Bearer {token}"}
            perfil = cliente.get("http://127.0.0.1:8000/api/v1/auth/me", headers=headers)
            usuarios = cliente.get("http://127.0.0.1:8000/api/v1/admin/users", headers=headers)
            resultado.append(f"PERFIL={perfil.status_code}")
            resultado.append(f"USUARIOS={usuarios.status_code}")
            if perfil.status_code == 200:
                datos = perfil.json()
                resultado.append("ROLES=" + ",".join(datos.get("roles", [])))
                resultado.append("PERMISOS=" + str(len(datos.get("permisos", []))))
except Exception as error:
    resultado.append("ERROR=" + str(error))
Path("tests/sismoia_sesion.txt").write_text("\n".join(resultado), encoding="utf-8")
print("\n".join(resultado))
