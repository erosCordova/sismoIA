# Correcciones de errores observados en la interfaz

**Registro histórico de la primera corrección.** La integración posterior reemplazó el requisito de fuente fija e historial 2010-2025 del punto 4 por un motor de catálogo y versiones revisables. Consultar [la revisión integral actual](REVISION_INTEGRAL_MODULOS.md) antes de seguir indicaciones antiguas de preparación.

Fecha: 18 de octubre de 2026. Supabase conserva la revision autorizada `d18a2026b001`.

## Causas y cambios

1. **K-Means/DBSCAN devolvian 503 por archivos ausentes.** Una instalacion sin modelos ahora informa un estado de preparacion. El boton **Generar agrupamientos con datos actuales**, reservado a `models:train`, consulta hasta 3000 registros recientes con variables validas, divide cronologicamente, ajusta el escalador solo con entrenamiento y genera K-Means/DBSCAN reales. La seleccion de grupos usa entrenamiento. Sus metricas se muestran como exploratorias, sin atribuirles riesgo sismico. Se indica el ambito geografico guardado y se avisa si difiere del seleccionado.
2. **Los archivos podian quedar a medias si fallaba un entrenamiento.** Se escriben versiones en directorios independientes y se cambia un puntero atomico al terminar. Un error conserva la version anterior. Las versiones historicas no se borran automaticamente. Se manejan archivos incompletos o incompatibles con una indicacion de recuperacion.
3. **La comparacion de regresion dependia de CSV no distribuidos.** Ahora consulta la base principal, conserva la fuente, calcula una firma de la muestra y respeta Peru/Mundo. El laboratorio simple/multiple tambien respeta un corte temporal independiente. Cambiar el ambito descarta los resultados del laboratorio anterior.
4. **Exploracion por zonas devolvia 503 por configuracion pendiente.** Se distingue preparacion pendiente de una averia real de la base. La configuracion se lee tambien del archivo de entorno elegido. No se selecciona una fuente automaticamente ni se publican cifras sin historial: se exige cobertura de los anos 2010-2025 antes de aplicar el metodo existente, ademas de la revision de completitud que debe hacer el responsable.
5. **La interfaz ocultaba el motivo de varios errores.** Dashboard, catalogo, preparacion, estadisticas y modelos muestran el detalle util de la API, incluidos problemas de permisos y validacion.
6. **Una fecha final extrema podia producir un error 500.** Catalogo, estadisticas, preparacion, explorador cientifico y alertas ahora responden con validacion 422 para ese limite.
7. **Una colision al crear usuarios podia escapar del manejo de duplicados.** El `flush` queda dentro del bloque transaccional que devuelve 409 y revierte el intento. Los nombres que solo contienen espacios se rechazan antes de consultar la base.
8. **La referencia media se etiquetaba como si utilizara profundidad.** Se corrige la lista de variables del resultado de laboratorio: esa referencia predice una constante.

## Comprobaciones

- 48 pruebas unitarias/de integracion sobre PostgreSQL temporal aislado: datos ficticios y rollback, sin SMTP real.
- 43 rutas GET revisadas contra Supabase en transacciones de solo lectura: HTTP 200 en todas. La revision usa TestClient con identidad de pruebas; no sustituye probar cada combinacion de rol y cada boton en navegador.
- Navegador con la sesion existente: generacion de agrupamientos, metricas y puntos visibles; comparacion de regresion y laboratorio supervisado con resultados reales; aviso explicito de preparacion en zonas.
- Compilacion TypeScript/Vite y lint sin errores. Permanecen 22 advertencias de lint heredadas sobre hooks y Fast Refresh.

Los agrupamientos generados en esta comprobacion utilizaron 3000 registros: 2399 para entrenamiento y 601 para evaluacion. Sus archivos permanecen en el backend local, dentro de `services/api/data/processed/`, excluidos de Git y del paquete de distribucion. No se modificaron filas de eventos, usuarios, reglas o experimentos de Supabase en esta revision.

## Limites que siguen siendo reales

La exploracion por zonas requiere configurar `SISMOIA_FORECAST_SOURCE_NAME=IGP` o `USGS` en el entorno efectivo y revisar el historial antes de habilitar el calculo; no se modificaron secretos para elegir una fuente en nombre del propietario. La presencia de eventos en cada ano no demuestra completitud cientifica. Las probabilidades mundiales siguen pendientes de validacion. No se realizaron envios reales de correo, pruebas de carga, fallos reales de proveedores ni pruebas exhaustivas de navegadores. Un R2 negativo o no superar la referencia es un resultado del modelo, no un error que deba ocultarse.
