LECTURA = frozenset({"dashboard:read", "events:read", "map:read", "analytics:read", "estimates:read", "reports:read"})

PERMISOS = {
    "Administrador": frozenset({"*"}),
    "Analista": LECTURA | frozenset({"datasets:read", "datasets:write", "models:read", "models:train", "reports:create", "sources:read"}),
    "Operador de alertas": LECTURA | frozenset({"alerts:read", "alerts:approve", "alerts:retry", "rules:manage"}),
    "Auditor": LECTURA | frozenset({"audit:read", "users:read", "sources:read", "alerts:read"}),
    "Solo lectura": LECTURA,
}

def tiene_permiso(roles: list[str], permiso: str) -> bool:
    return any("*" in PERMISOS.get(rol, ()) or permiso in PERMISOS.get(rol, ()) for rol in roles)
