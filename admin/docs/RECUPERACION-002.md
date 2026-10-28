# KZ-REDCALINET-ADMIN-002 — Recuperación y cierre

Fecha: 2026-10-27. Sin push, merge, despliegue ni actividad de producción.

## Integridad y recuperación

Rama local existente: codex/redcalinet-admin-001.
Base recuperada: c15d27e48ad161d39f68bb125384a5750a7ff8ab.
Candidato de aplicación: 4c1baaea003eed235af8ad7d7cb5c352a19d6b78, descendiente directo de la base. Árbol limpio al iniciar la revisión; no existen cambios pendientes que recuperar. No se reconstruyó ni se retrocedió la rama.

El ajuste confirmado limpia datos, cursores, filtros, vista y modal al cambiar/cerrar/invalidar sesión. Las respuestas de una generación anterior no repueblan la caché de colecciones ni el dashboard.

## Validación

En esta revisión se repitieron compilación Vite, pruebas unitarias y comprobación de diferencias. Aprobadas. Se verificaron la integridad ZIP y los SHA-256 del manifiesto de entrega.

Los resultados conservados del cierre anterior contienen 168 comprobaciones aprobadas: 7 unitarias, 45 API, 9 usuarios, 8 reglas candidatas, 80 navegador, 10 errores/teclado, 4 recuperación y 5 aislamiento de sesión. Las 80 de navegador y 10 de errores se repitieron después del ajuste. No se presentan como una nueva ejecución completa en esta revisión. Las cinco específicas comprueban acceso de SUPERADMIN, invalidación 401, cambio a ADMIN, ausencia de controles privilegiados y respuesta tardía de la cuenta anterior. Auth/Firestore son emuladores oficiales; la invalidación 401 se inyecta de forma explícita. Hay 57 capturas QA conservadas; no certifican dispositivos físicos ni producción.

Se volvió a comparar cada uno de los 29 archivos originales con la base 74103ce37bb393c0531ef3d71e4ca9803f15be67: todos intactos. SHA-256 agregado: 1dc1a730413dee1b995e259133d8ca328c2c1f35a23442b61a445844c37522d0.

## Paquete Harness y límites

No está disponible REDCALINET_CODEX_SITES_20261027.zip ni los archivos CONTRATO-FIRESTORE.md, PERMISOS-PANEL.md o EJEMPLOS-DOCUMENTOS.json en el espacio de trabajo accesible. Los ZIP de entrega del candidato no son el contrato de Harness. No se puede inferir su contenido ni certificar compatibilidad. El contrato local permanece provisional y el arranque productivo bloqueado.

Cloudinary real sigue deshabilitado sin configuración y revisión; el adaptador multimedia QA se identifica como tal. No se modificaron reglas, bases, permisos ni archivos públicos de producción. Solicitudes continúa sin canal de captura real, según ENTREGA.md.

## Dictamen

Recuperación y cierre local de sesiones: APROBADOS con el alcance de emuladores descrito. Integración con Harness: BLOQUEADA por paquete no disponible. NO-GO para certificación conjunta, uso real o publicación. El criterio completo de ADMIN-002 no está cumplido mientras no se contraste el contrato oficial y se pruebe la integración resultante.
