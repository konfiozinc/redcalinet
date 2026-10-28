# Registro de cambios — KZ-REDCALINET-ADMIN-001

- Nuevo módulo admin/ aislado; fuentes públicas de Harness sin cambios.
- Doce entradas de navegación, con solicitudes expresamente no habilitadas por falta de canal.
- API con Firebase Auth, roles en Firestore y operaciones transaccionales/auditadas; revisiones y protección del último SUPERADMIN.
- Productos, servicios, categorías, inventario, promociones, datos empresariales y redes persistentes en emulador.
- Multimedia: transporte Cloudinary oficial desde servidor y fixture local declarada para QA. Validación, progreso, preview/reproducción, texto alternativo, orden/portada, uso, publicación y eliminación confirmada.
- Proyección pública filtrada: sin pendientes, ocultos, promociones vencidas o asociaciones que ya no sean públicas. No conectada a la web de Harness aún.
- Auditoría de precios, disponibilidad, estados, recursos y permisos sin credenciales.
- Producción bloqueada por contrato no contrastado; ninguna modificación de reglas compartidas o del backend real.
- Actualización de Firebase Admin a 14.5 y gRPC corregido; auditoría npm de dependencias de producción sin avisos en la comprobación final.

## Cierre de aislamiento de sesión

Se vacían datos, paginación, filtros y vistas al invalidar/cambiar/cerrar sesión. Una generación de sesión descarta respuestas tardías de la cuenta anterior. Cinco comprobaciones nuevas y repetición de las pruebas UI. El contrato oficial de Harness anunciado por el usuario aún no está disponible en los archivos accesibles; no se declara reconciliado. Sin cambios de producción.

## ADMIN-003 — contrato oficial recibido

Contrato Harness comprobado mediante hashes/tamaños. Catálogo unificado en servicios, configuración plana separada, roles PROPIETARIO/SUPERADMIN, estados públicos y precio entero, campos de portada/detalles/orden/agotado, iconos/notas/visibilidad, merge conservador y metadatos privados. Se conserva el candidato, sin recrearlo. Pruebas de consultas exactas y ejemplos oficiales. Hallazgos de activo y bypass de validación documentados; no se modifican reglas productivas ni se habilita Cloudinary. Informe vigente: COMPATIBILIDAD-003.md y ENTREGA.md.
