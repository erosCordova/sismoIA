# SISMOIA Enterprise

## Informe de validación automatizada

Fecha: 2026-10-17 18:51 UTC

### Resultados verificados

- Sintaxis del backend: correcta.
- Archivos Python comprobados: 34.
- API: rutas esenciales registradas.
- Alertas: cuatro pruebas de regresión superadas.
- Agrupación de IGP y USGS: validada.
- Filtro temporal de tres horas: verificado.
- Frontend: compilación de producción correcta.
- PostgreSQL: conexión y tablas esenciales verificadas en solo lectura.
- Git: comprobación básica de secretos comunes.
- Sincronización automática: workflow configurado.
- Supervisión de producción: workflow configurado.

### Validaciones pendientes

- Restauración real de un respaldo de PostgreSQL en una base aislada.
- Pruebas completas de permisos con cuentas de cada rol.
- Pruebas E2E autenticadas de los recorridos principales.
- Comprobación manual de accesibilidad.
- Verificación de extremo a extremo de una nueva alerta automática.

### Alcance

Estas pruebas no certifican ausencia de vulnerabilidades,
recuperación de datos ante desastres ni capacidad de
predicción exacta de terremotos.

SISMOIA distingue eventos sísmicos observados, alertas
operativas y estimaciones probabilísticas experimentales.
