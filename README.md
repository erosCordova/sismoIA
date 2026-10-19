# SISMOIA

Plataforma de monitoreo de eventos observados, analisis historico y laboratorio de Machine Learning. La referencia funcional principal es el plan de desarrollo entregado; el material de clase apoya el laboratorio. Estado: desarrollo con correcciones verificadas, no MVP empresarial certificado.

## Requisitos

Python 3.12 o 3.13, Node.js 24 y PostgreSQL 16. Docker Desktop permite iniciar PostgreSQL con los archivos Compose. Las correcciones se verificaron localmente con Python 3.12, Node.js 24 y PostgreSQL 16; CI usa Python 3.13.

## Entorno principal: Supabase

El proyecto utiliza PostgreSQL alojado en Supabase. La conexion existente se conserva en `.env`; no hace falta reemplazarla por una base local.

Instalar dependencias desde la raiz:

```powershell
python -m venv services/api/.venv
& ./services/api/.venv/Scripts/python.exe -m pip install -r services/api/requirements.txt -c services/api/requirements.constraints.txt
```

Por defecto se usa Supabase: `.env.supabase` si existe, de lo contrario `.env`. Las variables del proceso tienen prioridad. La web usa FastAPI y no recibe secretos PostgreSQL ni JWT. Consultar `docs/SUPABASE.md` para el estado del esquema y la migracion nueva. Con una cuenta existente no ejecutar bootstrap.

La migracion `d18a2026b001` ya se aplico al Supabase de este proyecto con autorizacion del propietario. Agrega columnas/historial y protege tablas adicionales. En otra instalacion, revisar el destino y aplicar las migraciones antes de ejecutar. Docker y los siguientes pasos son solo una alternativa aislada.

## Alternativa: instalacion local desde cero (PowerShell)

Ejecutar desde la raiz del proyecto, donde esta este README.

```powershell
python -m venv services/api/.venv
& ./services/api/.venv/Scripts/python.exe -m pip install -r services/api/requirements.txt -c services/api/requirements.constraints.txt
python services/api/scripts/setup_local_env.py
$env:SISMOIA_TARGET = "local"
docker compose --env-file .env.local up -d db
& ./services/api/.venv/Scripts/python.exe -m alembic upgrade head
& ./services/api/.venv/Scripts/python.exe services/api/scripts/bootstrap_admin.py --email admin@ejemplo.com --nombre "Administrador local"
```

El script solicita la contrasena sin mostrarla. Solo crea el primer administrador; rechaza cuentas existentes y bases que ya tienen un administrador activo. El script de entorno genera secretos aleatorios, apunta a `127.0.0.1:55432` y conserva cualquier `.env.local` existente.

**Configuracion local:** seleccionar `SISMOIA_TARGET=local` tanto al migrar como al iniciar el backend. La existencia de `.env.local` por si sola no cambia el entorno Supabase. No copiar secretos reales al codigo ni compartir archivos `.env`. Los comandos anteriores estan destinados a una base local nueva.

Instalar frontend:

```powershell
cd apps/web
npm ci
```

## Ejecutar

Terminal 1, desde la raiz:

```powershell
& ./services/api/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir services/api --reload --host 127.0.0.1 --port 8011
```

Terminal 2, desde la raiz:

```powershell
cd apps/web
npm run dev -- --host 127.0.0.1 --port 5173
```

- Web: http://127.0.0.1:5173
- API/OpenAPI: http://127.0.0.1:8011/docs
- Proceso HTTP: http://127.0.0.1:8011/api/v1/health
- Conexion y esquema: http://127.0.0.1:8011/api/v1/ready

La base nueva empieza vacia. Tras ingresar como administrador, usar Fuentes de datos para sincronizar registros. La sincronizacion consulta proveedores externos, registra cada intento y actualiza revisiones del proveedor. Las alertas requieren reglas habilitadas y revision; el correo permanece desactivado por defecto.

Si se eligio la alternativa local, establecer `$env:SISMOIA_TARGET = "local"` en la terminal del backend antes de iniciarlo. Para Supabase, conservar el valor por defecto o establecer `supabase`.

## Actualizar una instalacion existente

Conservar un respaldo y verificar la configuracion del destino. La revision `d18a2026b001` incorpora gobierno ML, entregas, historial de ingesta, fuente de reglas y hashes/revisiones de eventos. `alembic upgrade head` reemplaza el recorrido incompleto de ejecutar migraciones aditivas por separado. Los scripts antiguos se conservan por compatibilidad, pero no completan el esquema nuevo.

La aplicacion autorizada a Supabase esta documentada en `docs/SUPABASE.md`. La integracion posterior de zonas, reportes y sesiones reutiliza las tablas existentes. Los experimentos ya entrenados conservan sus artefactos; las correcciones de preparacion se aplican a nuevos entrenamientos. Reentrenar y revisar antes de publicar resultados.

## Machine Learning

Los resultados incluyen una lectura en lenguaje sencillo, sus unidades, comparación con referencias y ayuda desplegable. Consultar `docs/INTERPRETACION_RESULTADOS.md`: este criterio debe mantenerse al agregar resultados, para que el usuario entienda qué significan y cómo utilizarlos.

Preparacion permite registrar instantaneas con nulos conservados. El pipeline ajusta imputacion y escalado dentro de cada particion. La seleccion usa un bloque cronologico interno y la evaluacion final otro posterior, con mas de 120 segundos entre bloques. Ese margen reduce cruces de registros proximos; no es una certificacion de independencia fisica de todo el catalogo.

El flujo de Gobierno ML guarda dataset, configuracion, versiones de librerias, metricas, artefacto y revision. Se clasifican/estiman atributos de eventos observados. Una probabilidad de clase no es la probabilidad de un terremoto futuro ni esta calibrada por defecto.

Los archivos de clustering no se distribuyen con el codigo. Usar **Generar agrupamientos con datos actuales** en Modelos ML, o el mismo motor desde una base configurada con datos:

```powershell
& ./services/api/.venv/Scripts/python.exe services/api/scripts/train_clustering.py --from-database --peru
```

Eso no los aprueba ni acredita prediccion de sismos. La publicacion/despliegue de candidatos del workflow semanal sigue requiriendo un proceso revisado. Los archivos de `data/processed` se conservan fuera de Git.

Las probabilidades mundiales anteriores se archivaron en `docs/referencias`. La exploracion actual de Peru y mundo calcula conteos, tasa historica e intervalo Poisson desde la fuente y periodo seleccionados; no requiere `SISMOIA_FORECAST_SOURCE_NAME` ni un catalogo fijo 2010-2025. Con muestra insuficiente informa ese estado y no inventa probabilidades. Para conservar resultados se calcula una version desde un dataset registrado. Solo se muestra en Estimaciones historicas cuando dataset y ejecucion estan aprobados. La aprobacion administrativa no equivale a validacion cientifica. Ninguno de estos calculos predice exactamente un terremoto ni dispara alertas oficiales.

## Pruebas

Pruebas unitarias, sin base real:

```powershell
$env:PYTHONPATH = "$PWD/services/api"
$env:DATABASE_URL = "postgresql+psycopg://test:test@127.0.0.1:1/isolated"
$env:JWT_SECRET_KEY = "unit-tests-only-0123456789012345678901234567890123456789"
& ./services/api/.venv/Scripts/python.exe -m unittest discover -s services/api/tests -p "test_*.py" -v
```

Para integracion con una base temporal independiente:

```powershell
docker compose -f compose.test.yaml up -d --wait
$env:PYTHONPATH = "$PWD/services/api"
$env:DATABASE_URL = "postgresql+psycopg://sismoia_test:local_test_only@127.0.0.1:55433/sismoia_test"
$env:SISMOIA_TEST_POSTGRES_URL = $env:DATABASE_URL
$env:JWT_SECRET_KEY = "integration-tests-only-0123456789012345678901234567890123456789"
& ./services/api/.venv/Scripts/python.exe -m unittest discover -s services/api/tests -p "test_*.py" -v
docker compose -f compose.test.yaml down
Remove-Item Env:SISMOIA_TEST_POSTGRES_URL, Env:DATABASE_URL, Env:JWT_SECRET_KEY, Env:PYTHONPATH
```

Las pruebas de integracion solo admiten un destino localhost con nombre `sismoia_test...`, aplican migraciones y revierten las filas de cada caso. Compose usa almacenamiento temporal, sin el volumen de la base de desarrollo. No ejecutar los antiguos scripts `check_*.py` contra una base de trabajo como si fueran pruebas aisladas.

Frontend: `npm run build` y `npm run lint`, desde `apps/web`. CI ahora ejecuta la suite de negocio con PostgreSQL temporal ademas de compilar.

## Pendientes del plan

Consultar `docs/REVISION_INTEGRAL_MODULOS.md` para el estado actual por modulo, recorrido y evidencia. Hay reintentos manuales SMTP limitados; siguen pendientes cola/outbox automatica, reglas avanzadas, validacion cientifica, recuperacion operativa remota, retencion, completar E2E visual, carga y accesibilidad. Se verifico restauracion de una base local ficticia. La presencia de pantallas no equivale a cumplir todos los criterios del MVP.
