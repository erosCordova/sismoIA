# Supabase como base principal

El backend usa PostgreSQL de Supabase mediante SQLAlchemy y psycopg. La web usa la API FastAPI. Las claves de base y JWT pertenecen al backend y no se publican en variables Vite.

## Configuracion

- `SISMOIA_TARGET=supabase` es el valor por defecto.
- Se lee `.env.supabase` si existe; de lo contrario `.env`.
- `DATABASE_URL` del proceso tiene prioridad. Usar el usuario y host de la conexion directa o pooler del proyecto propio. No reutilizar UUID de fuentes de otra base.
- Se admiten los prefijos PostgreSQL habituales y se selecciona psycopg. Los destinos remotos solicitan TLS si el URL no define ya su politica SSL.
- `.env.local` solo se usa al seleccionar expresamente `SISMOIA_TARGET=local`.

La configuracion recibida contiene claves repetidas en `.env`. No se reescribieron sus secretos. Conviene dejar una sola definicion efectiva por clave con ayuda del propietario. Usar un `.env` excluido de Git no es por si solo un defecto: el riesgo es distribuirlo con secretos reales.

## Inspeccion previa a la migracion (historico)

Se inspeccionaron solo tablas, columnas, RLS y version Alembic en una transaccion de solo lectura. No se consultaron filas de usuarios ni eventos.

- Revision actual: `c0ed8126a9b3`.
- Gobierno ML y entregas ya tienen tablas creadas por el recorrido anterior.
- `ingestion_runs` no existe todavia.
- Faltan `seismic_events.origin_hash`, `seismic_events.last_updated_at` y `alert_rules.allowed_source` para las mejoras nuevas.
- Las tablas adicionales de datasets, experimentos y entregas tienen RLS desactivado en el estado inspeccionado. No se comprobo acceso anonimo ni se afirma que sus datos sean publicos.
- La conexion utilizada pertenece al propietario de esas tablas; la via de FastAPI utiliza esa conexion, no los roles de Data API.

## Migracion preparada

Revision: `database/migrations/versions/d18a2026b001_gobierno_entregas_y_fuentes_reglas.py`.

Conserva los eventos, usuarios, reglas y experimentos existentes. Crea o adopta tablas, agrega campos nullable, crea el historial de ingesta y habilita RLS/revoca grants de Data API sobre tablas adicionales. No borra filas, no cambia contrasenas y no reentrena modelos existentes.

Como cambia esquema y permisos de una base compartida, coordinarlo con su propietario. Antes de aplicarla, revisar respaldo, destino y compatibilidad del backend desplegado. Una vez autorizada, desde la raiz:

```powershell
$env:SISMOIA_TARGET = "supabase"
& ./services/api/.venv/Scripts/python.exe -m alembic upgrade head
```

Tambien se entrega SQL transaccional revisable en `database/manual/d18a2026b001_supabase.sql`. Elegir un solo recorrido. El SQL comprueba la revision y actualiza `alembic_version` al finalizar; no ejecutar solo fragmentos aislados. Un error debe revertir la transaccion completa.

Despues: comprobar `/api/v1/ready`, login, catalogo, fuentes, reglas, entregas y laboratorio. Los hashes de eventos anteriores se completan en futuras resincronizaciones; no se fabrican huellas para payloads que no se conservaron.

## Aplicacion autorizada el 18 de octubre de 2026

El propietario autorizo aplicar la migracion en este chat. Se ejecuto el SQL completo en una transaccion, con limites de espera de bloqueos y consultas. La revision paso de `c0ed8126a9b3` a `d18a2026b001`. Se confirmaron las tres columnas nuevas, la tabla `ingestion_runs`, RLS y la revocacion de permisos Data API en las cuatro tablas adicionales. Se conservaron los registros y las credenciales. La inspeccion anterior queda como referencia historica, no como estado actual.

El error 503 del Dashboard coincidia con las columnas que faltaban en Supabase al ejecutar el backend actualizado. La migracion sincroniza ese esquema con los modelos del codigo.

Verificacion posterior: las consultas reales del Dashboard para Peru y mundo completaron correctamente dentro de una transaccion de solo lectura. La API local en el puerto 8011 respondio HTTP 200 en `/api/v1/ready`, con esquema completo. No se realizo una prueba visual del navegador ni se modificaron datos de eventos para esta comprobacion.

## Limites

La integración posterior de exploración por zonas, reportes y revocación de sesión reutiliza las tablas existentes. No requiere una migración adicional. No se registraron datasets o ejecuciones ficticias de prueba en Supabase: se usó PostgreSQL local separado. Véase `REVISION_INTEGRAL_MODULOS.md`.

La base temporal de pruebas es independiente de Supabase. No prueba latencia, limites del pooler, backups del plan contratado, integraciones externas ni permisos reales de cada despliegue. La calibracion cientifica y las publicaciones oficiales siguen pendientes segun el plan de desarrollo.
