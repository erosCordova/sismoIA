# Revisión integral e integración de módulos

Fecha: 18 de octubre de 2026. Referencia principal: plan de desarrollo, secciones 6, 10 y 14. El material de clase orienta la metodología del laboratorio, no convierte una asociación estadística en una predicción exacta de terremotos.

## Qué significa el sistema

El plan pide monitorear eventos observados, estudiar datos históricos, ejecutar experimentos de regresión y clasificación y gestionar avisos trazables. Dice expresamente que no se puede anunciar con fiabilidad fecha, lugar y magnitud exactos de un sismo. Esa limitación se conserva en las pantallas, resultados y separación entre estimaciones y alertas.

La revisión produjo cambios funcionales, además de mensajes de error. No equivale a una certificación de todos los criterios empresariales del plan. La auditoría original describe la copia recibida; este documento describe la integración posterior.

## Revisión por módulo

| Módulo del plan | Comportamiento y correcciones verificadas | Límite relevante |
|---|---|---|
| 6.1 Inicio | Consulta PostgreSQL/Supabase con filtros de periodo, fuente y ámbito. El esquema autorizado corrigió las columnas ausentes que causaban el 503. Errores útiles y estado real de fuentes. | La disponibilidad de un proveedor no garantiza completitud del catálogo. |
| 6.2 Eventos | Catálogo y ficha con procedencia, UTC, filtros y exportación autorizada. Hash y fecha de actualización permiten seguir nuevas ingestas y revisiones sin duplicar la fila. | IDs distintos entre proveedores no resuelven por sí solos una misma entidad física. |
| 6.3 Mapa | Visualiza eventos observados con ámbito y filtros. La exploración por zonas usa cuadrículas identificadas y no presenta un área de impacto. | Cuadrícula aproximada; no reemplaza cartografía oficial ni selección arbitraria de polígonos. |
| 6.4 Estadísticas | Análisis descriptivo y laboratorios consultan datos del ámbito elegido; límites de fechas inválidos se validan. | Asociación magnitud/profundidad no demuestra causalidad ni anticipación. |
| 6.5 Preparación | Versiones de datasets con fuente, periodo UTC, snapshot, firma, calidad y aprobación. Se conservan nulos y la imputación se ajusta en entrenamiento. | La aprobación humana requiere revisar representatividad y cobertura, además de la firma. |
| 6.6 Modelos ML | Regresión/clasificación con particiones temporales y registro de parámetros, métricas y artefactos. Generación real de K-Means/DBSCAN desde datos actuales; escritura por versión y cambio de puntero al finalizar. CLI y web comparten motor de clustering. | Modelos antiguos requieren reentrenamiento para incorporar las correcciones. Clustering es exploratorio. |
| 6.7 Estimaciones | Exploración calculada desde el catálogo; se puede guardar una versión desde un dataset registrado, revisarla y consultar versiones aprobadas en Estimaciones históricas. Dataset y ejecución deben estar aprobados; se comprueban firmas. | Una aprobación administrativa no valida científicamente la estimación. No genera alertas automáticamente. |
| 6.8 Reglas | Umbral, fuente y ámbito coherentes entre simulación y evaluación; permisos y deduplicación. | No está construido el configurador completo de horarios, cooldown, polígonos, plantillas y múltiples canales del plan. |
| 6.9 Centro de alertas | Revisión, asignación, acuse e historial SMTP reales. Reintento manual con espera de 60/120 segundos y máximo de tres fallos en 24 horas; éxito bloquea repetición. Configuración SMTP lee el entorno efectivo. | Sin cola/outbox automática; aceptación SMTP no prueba recepción en la bandeja final. No se enviaron correos reales en esta revisión. |
| 6.10 Fuentes | Historial persistente, conteos, errores y actualizaciones. Si falla un proveedor HTTP, la sincronización conjunta intenta el otro y comunica resultado parcial. | Frecuencia, licencia y disponibilidad dependen del proveedor; no se ocultan fallos de base o permisos. |
| 6.11 Reportes | Eventos CSV/XLSX/PDF existentes y nuevos CSV de calidad, modelos y alertas con solicitante, corte, filtros y límite explícito. Se protegen celdas CSV frente a fórmulas. | No se implementó una cola de trabajos ni almacenamiento temporal con expiración de reportes. |
| 6.12 Usuarios | Cinco roles, permisos en API, cambio de rol y estado activo/inactivo; no permite autodesactivación. Cierre de sesión revoca el token en servidor mediante su huella, sin guardar el token. | MFA y políticas operativas de sesiones requieren una decisión de despliegue. |
| 6.13 Auditoría/configuración | Acciones trazables con correlación y exportación CSV auditada. Uso de tablas existentes, RLS y migraciones versionadas. | Sin política de retención aprobada ni almacenamiento externo inmutable. |

## Dónde interviene la regresión lineal

Mejora posterior de interfaz: los resultados tienen interpretación dinámica, unidades, comparación con referencias y definiciones desplegables. Se verificaron en navegador las lecturas de regresión simple/múltiple y clasificación. Véase [Resultados comprensibles](INTERPRETACION_RESULTADOS.md). Esta verificación visual sí se completó; el recorrido anterior de aprobación/publicación mencionado abajo sigue siendo una comprobación distinta.

En Modelos ML están el laboratorio didáctico simple/múltiple y el flujo de experimentos supervisados. Se estudian atributos numéricos de eventos históricos: una variable explicativa en regresión simple y varias en múltiple. La configuración debe revisarse para saber qué variable objetivo y predictores se utilizaron en cada ejecución. Se comparan valores reales/estimados y métricas MAE, RMSE y R² sobre datos posteriores a los de entrenamiento.

El pipeline conserva el tratamiento de nulos, ajusta imputación/escalado sin consultar el bloque de evaluación y selecciona candidatos en un bloque interno. Se mantiene un margen temporal mayor a 120 segundos entre particiones. Esto reduce ciertos cruces de registros, pero no demuestra independencia física entre réplicas o catálogos de distintos proveedores.

El mapa de zonas no utiliza regresión lineal. Resume una tasa histórica y calcula un indicador Poisson condicionado a supuestos. K-Means y DBSCAN agrupan registros; tampoco son regresión ni predicción exacta.

## Cómo recorrer el flujo integrado

1. Fuentes de datos: consultar historial y sincronizar cuando corresponda. El catálogo, mapa y estadísticas describen los registros recibidos.
2. Preparación: elegir fuente, ámbito y periodo; guardar una versión. Revisar calidad y aprobar el dataset cuando tenga sentido.
3. Modelos ML → Exploración por zonas: seleccionar fuente, periodo de consulta y horizonte de 7/30 días. El mapa colorea conteos y muestra la tasa e incertidumbre de la zona seleccionada.
4. Para conservar un resultado, seleccionar un dataset registrado y pulsar **Calcular y guardar versión**. Este cálculo usa el snapshot del dataset, no el periodo móvil de la consulta en vivo. Revisar los periodos y firmas mostrados.
5. Aprobar o rechazar la ejecución con un motivo. Estimaciones históricas solo publica versiones cuyo dataset y ejecución estén aprobados. Un registro rechazado no se puede publicar.
6. El laboratorio de regresión y el entrenamiento supervisado siguen su propio registro. Las estimaciones estadísticas no se convierten automáticamente en avisos del Centro de alertas.
7. Reportes permite exportar las vistas autorizadas; Auditoría registra las acciones relevantes. Usuarios permite retirar acceso sin esperar al vencimiento del JWT.

## Interpretación de la exploración por zonas

Se agregan en PostgreSQL los registros válidos del proveedor seleccionado, sin recortar el catálogo por un límite de descarga. Perú usa 12 celdas y mundo 24. El ámbito Perú es una caja geográfica aproximada, no su frontera administrativa exacta.

La tasa usa registros de magnitud ≥4 divididos por días entre el primer y último registro observado. El intervalo de consulta y el intervalo observado se informan por separado: no se suponen años vacíos fuera de la muestra. Se exige al menos 30 registros y siete días observados para mostrar el indicador; con menos datos se muestran conteos y estado de muestra insuficiente, sin inventar probabilidades.

El indicador es `1 − exp(−tasa × horizonte)` y el intervalo del 95% se obtiene del conteo Poisson. Depende de independencia, tasa constante y cobertura del catálogo; no corrige réplicas ni subregistro. Cero registros en una celda no significa peligro nulo. El porcentaje describe un cálculo bajo esos supuestos, no una promesa sobre un terremoto próximo. Las versiones guardadas indican si el dataset estaba limitado en número de filas.

## Evidencia de verificación

- Suite completa del código final con PostgreSQL 16 temporal: **59 pruebas aprobadas**, con datos ficticios, proveedores y SMTP simulados. Duración: 10,485 segundos.
- Comprobación posterior del código final sin base: **59 casos descubiertos, 52 ejecutados correctamente y siete de integración omitidos**. Incluye un caso adicional de muestra insuficiente.
- Frontend final: compilación correcta y lint sin errores, con **20 advertencias** pendientes. No se declaran corregidas todas las advertencias de React.
- Consulta de **45 rutas GET** contra Supabase, en modo de solo lectura: todas respondieron 200. Esto no prueba todas las combinaciones de datos o permisos.
- Respaldo/restauración real sobre bases exclusivamente locales y ficticias: **14 tablas** con conteos preservados y revisión `d18a2026b001`. Evidencia: `output/mejoras_sismoia/prueba_restauracion_local.json`, en el workspace que contiene el proyecto.
- Navegador aislado: se comprobó acceso, exploración Perú/mundo, cambio de proveedor y registro de dataset. La continuación de aprobación quedó interrumpida por un cuadro de confirmación; después el control del navegador no pudo reconectarse. No se declara completado ese recorrido visual. El circuito aprobación/publicación sí fue probado por integración HTTP/PostgreSQL.

La revisión automática de aprobación bloqueó inicialmente la repetición por cuota; posteriormente volvió a permitirla. Tras corregir el puerto de arranque del clúster de pruebas, la suite final completa pasó con 59 casos. Se detuvieron los servicios ficticios web/API de los puertos 5175/8021 y PostgreSQL temporal 55433, conservando la instalación principal.

## Estado de Supabase y pendientes

La migración previamente autorizada quedó aplicada en `d18a2026b001`. Esta integración reutiliza sus tablas y no ejecutó otra migración ni escribió datos de negocio de prueba en Supabase. No se cambiaron sus credenciales.

Quedan pendientes la revisión científica de completitud/calibración, reglas avanzadas, cola automática de correo, envío SMTP real controlado, backup/restauración operativa de Supabase, retención, despliegue con TLS, pruebas de carga y accesibilidad y completar el recorrido visual tras reconectar el navegador. La restauración local verificada no sustituye ensayar la recuperación remota. Estos límites son distintos de exigir una predicción exacta: el plan no pide ni permite prometerla.
