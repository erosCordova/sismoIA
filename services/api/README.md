# SISMOIA Enterprise - Backend

## Proposito

API empresarial para monitoreo sismico, analisis
historico, experimentos ML y alertas internas.

El sistema no predice con certeza terremotos
futuros ni emite alertas oficiales.

## Tecnologias

Python, FastAPI, SQLAlchemy, PostgreSQL,
Supabase, NumPy, scikit-learn y joblib.

Frontend independiente desarrollado con
React, TypeScript y Vite.

## Iniciar backend

Desde la carpeta services/api:

    python -m uvicorn app.main:app --reload

Documentacion interactiva:

    http://127.0.0.1:8000/docs

## Configuracion

Los secretos y conexiones se configuran
mediante variables de entorno.

Verificar los nombres requeridos en
app/database.py y app/auth.py.

Variables de seguridad:

    SISMOIA_LOGIN_RATE_LIMIT=10
    SISMOIA_LOGIN_RATE_WINDOW=60

No almacenar secretos reales en GitHub.

## Autenticacion

Las rutas privadas usan tokens Bearer.
Los permisos se verifican en el backend.

El login aplica un limite de solicitudes
por IP, por instancia y por ventana temporal.

Cuando se excede el limite, responde HTTP 429
con la cabecera Retry-After.

La solucion utiliza memoria del proceso.
No es un limitador distribuido entre instancias.

La IP debe proceder de un proxy confiable.
No confiar en cabeceras IP arbitrarias.

## Machine Learning

Datasets y experimentos pueden persistirse
en PostgreSQL.

Los modelos usan datos historicos y
sus resultados son experimentales.

Las metricas no significan que el sistema
pueda anticipar la ocurrencia de terremotos.

## Alertas

Se detectan condiciones en eventos registrados.

Las alertas requieren revision humana para
la asignacion a destinatarios internos.

Se registra la recepcion, cancelacion y auditoria.

No existe envio externo automatico verificado.

## Base de datos

Las migraciones se encuentran en migrations.

Antes de migrar produccion debe existir un
respaldo verificable y un plan de recuperacion.

Se comprobo una restauracion del esquema public
en PostgreSQL aislado mediante Docker.

Los respaldos permanecen fuera del repositorio.

## Comprobar seguridad

Desde services/api ejecutar:

    python -m unittest discover -s tests -p "test_security_controls.py" -v

## Incidentes

1. Verificar el estado de la API.
2. Comprobar conexion PostgreSQL.
3. Revisar registros sin exponer secretos.
4. Verificar estado de fuentes e ingesta.
5. Revisar alertas y entregas.
6. Identificar el respaldo mas reciente.
7. Restaurar primero en entorno aislado.
8. Validar integridad antes de operar.

## Pendientes operativos

- Backups automaticos programados.
- Limitacion distribuida si se escala.
- Pruebas periodicas de restauracion.
- Revision de accesibilidad y carga.
- Aprobacion de politicas de retencion.

Consultar RETENCION.md.
