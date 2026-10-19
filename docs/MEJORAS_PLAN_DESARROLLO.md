# Correcciones basadas en el plan de desarrollo

**Estado actualizado:** [Revisión integral de módulos](REVISION_INTEGRAL_MODULOS.md). Las tablas siguientes conservan el registro de la primera corrección; las referencias a 48 pruebas, fuente fija, registro de zonas pendiente, logout sin revocación y ausencia de restauración local quedaron superadas por la integración posterior. No confundir esa restauración ficticia con recuperación operativa de Supabase.

Fecha: 18/10/2026. El plan funcional es la referencia principal; la sesion de teoria se usa para revisar la metodologia ML. Este documento registra mejoras de la copia local. El informe de auditoria original sigue siendo evidencia del estado anterior.

## Cambios por requisito del plan

| Requisito | Mejora implementada | Validacion |
|---|---|---|
| §6.5, §12 y §14: roles en backend | Lectura y exportacion de preparacion requieren permisos de datasets; calidad tambien | Pruebas HTTP de los cinco roles y acceso anonimo |
| §7, fase 1 y §14: instalacion reproducible | Supabase como destino principal, opcion local explicita, plantilla, generador local sin sobreescritura, puerto 8011 y bootstrap de primer administrador | Revision de comandos, compilacion y migraciones en una base vacia |
| §7 y fase 9: migraciones | Nueva revision Alembic integra tablas antes aditivas, nuevos campos e historial de ingesta | Aplicacion real en PostgreSQL temporal y prueba de claves foraneas |
| §7 y §12: RLS | Tablas nuevas con RLS y revocacion de grants de Data API, igual que las originales | Comprobacion de RLS en PostgreSQL; falta auditar grants de cada despliegue remoto |
| §9 fase 6 y §10: no fuga | Snapshot conserva nulos; imputador se ajusta por bloque; flags de imputacion antigua se restituyen en memoria | Cambiar datos posteriores no cambia estadisticas del imputador del entrenamiento interno |
| §10: evaluacion temporal | Cortes estrictos, margen >120 s, IDs no compartidos y seleccion interna tambien en ruta anterior | Pruebas de instantes iguales, proximidad temporal, regresion y clasificacion |
| §6.6 y §7: reproducibilidad ML | Versiones, parametros completos por candidato, bloques efectivos, semilla y artefacto con hash | Serializacion estricta JSON y persistencia real de experimento en JSONB |
| §10: probabilidades | Brier/log loss y distribucion de clases; inferencia devuelve probabilidad de clase etiquetada como no calibrada | Pruebas numericas y consulta real del artefacto persistido |
| §6.8: fuente permitida | Se conserva en la regla y se usa tanto al simular como al evaluar | Regla IGP excluye USGS en prueba de integracion |
| §6.9 y §14: seguimiento de entrega | Bandeja/detalle consultan asignaciones y acciones SMTP, sin estado fijo ficticio | Asignacion, acuse y consulta de detalle en PostgreSQL |
| §12: idempotencia de alertas | Evaluacion serializada por bloqueo transaccional; revision bloquea la fila | Repeticion de evaluacion no crea alertas nuevas; falta prueba de carga concurrente |
| Fase 3, §6.10 y §14: ingesta trazable | Historial persistente, ejecuciones fallidas/exitosas y conteos visibles en Fuentes | Ingesta, repeticion, revision de magnitud y error de proveedor simulado sobre PostgreSQL |
| Fase 3 y §7: origen | SHA256 del contenido de proveedor y fecha de revision; upsert conserva primera recepcion | Cambio de magnitud actualiza la fila sin duplicarla |
| §7 y §14: UTC | Serializador compartido, inserciones conscientes de UTC y conversion explicita en salidas/calendarios | Pruebas con offsets y servidor temporal en zona distinta de UTC |
| §6.4 y §14: filtros coherentes | Laboratorio recibe Peru/Mundo y fuente; devuelve filtros efectivos | Prueba HTTP que comprueba parametros recibidos por la consulta |
| §6.11 y §14: reportes | Solicitante y corte en formatos; CSV informa limite y total; formatos agregados identificados | Cubierto por pruebas de exportacion y compilacion del backend; revisar maquetacion con datos propios |
| §6.7 y §7: estimaciones responsables | Se retira publicacion mundial no reproducible; Peru queda como laboratorio con fuente estable y revision pendiente | Compilacion web y respuesta controlada sin fuente configurada |
| §12: observabilidad | Correlacion de solicitud/auditoria, liveness separado de readiness y errores DB genericos | Prueba del ID y flujos HTTP; monitorizacion operativa completa pendiente |
| Fase 2: sesion | Expiracion local por tiempo y refresco de roles/permisos cada minuto y al recuperar foco | Compilacion TypeScript; prueba E2E de navegador pendiente |
| Fase 9: CI | Unitarias y flujos con PostgreSQL temporal en CI; versiones verificadas como constraints | Ejecucion local equivalente de la suite y build |

## Alcance de la verificacion

Se aplicaron las migraciones en PostgreSQL 16 temporal, limitado a localhost. Los datos de pruebas fueron sinteticos, los proveedores HTTP simulados y SMTP no se utilizo. Se verificaron rutas HTTP de reglas, evaluacion, revision, asignacion, acuse, datasets, entrenamiento, revision e inferencia. Esto es integracion de backend; no sustituye un E2E real de navegador o una validacion cientifica.

La conexion remota y los secretos existentes no se modificaron. La nueva migracion debe aplicarse expresamente en cada base de desarrollo o despliegue antes de utilizar el codigo actualizado. No ejecutar migraciones a ciegas contra una conexion recibida de otra persona.

La inspeccion inicial de solo lectura encontro el Supabase en `c0ed8126a9b3`, con tablas adicionales sin RLS y sin los nuevos campos/historial. Despues de probar la adopcion en PostgreSQL temporal, el 18 de octubre de 2026 el propietario autorizo aplicar el SQL transaccional al Supabase del proyecto. La migracion quedo confirmada en `d18a2026b001`, con columnas, tabla de ingesta, RLS y permisos verificados. No se eliminaron registros ni se cambiaron credenciales. Detalles en SUPABASE.md.

Resultado actualizado: 48 pruebas unitarias/de integracion superadas, compilacion web correcta y 22 advertencias de lint heredadas. Se probaron CSV/XLSX/PDF; el PDF de datos ficticios se renderizo y reviso visualmente. La revision posterior comprobo 43 rutas GET de Supabase sin errores y los principales flujos ML en navegador. Detalles y limites en CORRECCIONES_ERRORES_INTERFAZ.md. PostgreSQL temporal se mantiene separado de Supabase y se detiene al terminar la verificacion.

La separacion temporal de 120 segundos es una salvaguarda frente a registros proximos; no sustituye resolver entidades de eventos fisicos, completitud del catalogo ni validacion por especialistas. Las firmas previas de datasets no se modifican. Los modelos previamente entrenados no mejoran retroactivamente: deben reevaluarse/reentrenarse.

## Estado de los 30 hallazgos originales

| Hallazgo | Estado tras estas correcciones |
|---|---|
| H01 secretos y claves duplicadas | Mitigacion local y plantilla; credenciales existentes requieren revision/rotacion por su propietario si se compartieron |
| H02 arranque | Corregido el recorrido local, puerto, plantilla y primer administrador |
| H03 migraciones | Corregido y verificado en base vacia; falta ensayar adopcion de cada esquema remoto preexistente |
| H04 permisos | Corregido el acceso a preparacion/calidad/exportaciones de datasets; revisar politicas de exportacion cliente segun rol |
| H05 artefactos ausentes | Documentada generacion local exploratoria; publicacion automatica de candidatos aprobados pendiente |
| H06 UUID fijo | Eliminado; fuente estable explicitamente configurada; requiere disponer del historial real |
| H07 probabilidades mundiales | Publicacion retirada; original archivado. Generador y validacion cientifica pendientes |
| H08 aprobacion transversal | Se distingue laboratorio de publicacion; registro para publicar metodos estadisticos pendiente |
| H09 fuga de imputacion | Corregida y probada para nuevos entrenamientos y lectura de flags de snapshots antiguos |
| H10 independencia temporal | Corregido cruce de instantes/proximidad e IDs; resolucion cientifica completa de eventos entre proveedores pendiente |
| H11 seleccion por prueba | Ruta anterior reutiliza seleccion interna; ganador marcado como seleccionado en desarrollo |
| H12 reproducibilidad | Versiones, hiperparametros y constraints incorporados; despliegue de artefactos y commit de entrenamiento pendiente |
| H13 incertidumbre | Probabilidades de clase y metricas agregadas; calibracion e intervalos de regresion pendientes |
| H14 validez de pronosticos | No se considera resuelta por cambiar codigo; requiere datos, evaluacion temporal y revision especializada |
| H15 historial de ingesta | Implementado en base y frontend, con prueba real de exito/fallo |
| H16 revisiones de proveedor | Upsert con contenido firmado y bloqueo comun a HTTP/worker; probado sin duplicados |
| H17 UTC | Corregidas rutas e inserciones revisadas; mantener pruebas al integrar nuevas fuentes |
| H18 reglas | Fuente persistida y ventana operativa aclarada; horarios, cooldown, plantillas, poligonos y canales configurables pendientes |
| H19 detalle de entrega | Corregido; refleja asignaciones y SMTP sin afirmar entrega final de email |
| H20 outbox/reintentos | Pendiente; el correo sigue siendo manual y no garantiza exactamente una entrega |
| H21 concurrencia | Bloqueo de evaluacion y revision agregados; falta stress test concurrente y entidad fisica comun |
| H22 reportes | Metadatos y alcance mejorados; jobs, expiracion y reportes especializados completos pendientes |
| H23 trazabilidad | Hash real para nuevas ingestas; identificador de consulta sigue siendo consulta, no snapshot inmutable |
| H24 ambito geografico | Corregido en laboratorio supervisado; exploradores con formularios independientes permanecen identificados |
| H25 CI | Pruebas de negocio e integracion incorporadas; E2E de navegador, carga y accesibilidad pendientes |
| H26 respaldo/retencion | Pendiente de implementacion operativa y evidencia; no se declara restauracion aprobada |
| H27 observabilidad | Correlacion y salud mejoradas; inmutabilidad, retencion y metricas operativas completas pendientes |
| H28 nuevas tablas RLS | Migracion protege nuevas tablas; auditar permisos reales del despliegue sigue siendo necesario |
| H29 sesion | Expiracion/perfil visual mejorados; revocacion de JWT por logout y E2E pendientes |
| H30 memoria cientifica/escala | Pendiente: requiere experimento con datos reales, justificacion y mediciones, no solo codigo |

## Criterios que no se declaran aprobados

No hay certificacion de peligro sismico, calibracion validada para uso operativo ni autorizacion de comunicados oficiales. Tampoco se declaran aprobados el respaldo/recuperacion operativa, la politica de retencion, la accesibilidad, la carga, el envio real de email ni los recorridos E2E en produccion. Se mantiene el enfoque del plan: eventos observados, laboratorio experimental y alertas internas claramente separados.
