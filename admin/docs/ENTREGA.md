# KZ-REDCALINET-ADMIN-003 — Entrega de integración local

27 de octubre de 2026. Este informe sustituye el de ADMIN-001. Consultar COMPATIBILIDAD-003.md para matriz de cambios y bloqueos.

## Candidato y alcance

Se retiene la rama local codex/redcalinet-admin-001 y la cadena c15d27e → 4c1baae → d7e8cce. No se reinició ni reconstruyó la plataforma, no hubo push, merge o despliegue. El nuevo commit integra el contrato recibido; su SHA se entrega con el manifiesto de artefactos (no se escribe el SHA propio dentro del mismo commit).

Paquete Harness: seis archivos individuales recibidos y leídos íntegramente; cinco SHA-256 y cuatro tamaños coinciden con listado/manifiesto. No se recibió el ZIP original, por lo que su hash no se certifica. Tampoco se recibió código público del commit 2dfff10 ni la batería original de 26 pruebas. No se publican los documentos privados.

## Funcionalidad vigente

Login/logout, roles PROPIETARIO/SUPERADMIN y limpieza de sesión conservados. Productos/servicios/inventario consultan y editan la colección compartida servicios. Se añadieron/adaptaron detalles, imagen URL/ruta/null, orden, agotado y tipo; los estados son BORRADOR/PUBLICADO/OCULTO. Categorías con icono, aviso legal, visible y filtros efectivos. Empresa/contacto son documentos planos distintos; descripcion del hero es editable y las actualizaciones preservan campos no conocidos. Los precios son enteros COP/null; cero/null significa consultar.

Auditoría/revisión/idempotencia y metadatos del panel son privados, fuera de los documentos públicamente legibles. Se conserva galería/video y promociones como extensiones privadas, sin afirmar que la web actual las consume. Primera imagen puede actualizar la portada canónica. Solicitudes sigue sin canal real; no se simulan chats. Usuarios mantiene el campo email y los roles oficiales. No se incorporan datos personales, precios o inventario reales. Las nueve referencias del encargo son BORRADOR solo en QA; los ocho documentos de ejemplo se validan sin importarse como inventario.

Cloudinary REAL tiene bloqueo explícito, incluso con variables configuradas. Se conserva el SDK para posterior verificación autorizada. Las pruebas de subida/progreso/reproducción/galería usan QA_FIXTURE declarado en UI. No se hicieron cargas reales, no se habilitaron preset, servicios o facturación.

## Pruebas ejecutadas

**221 comprobaciones locales con resultado esperado**; dos demuestran limitaciones de seguridad en las reglas suministradas, no seguridad aprobada de producción:

| Grupo | Comprobaciones | Evidencia |
|---|---:|---|
| Unitarias | 8 | Tipos/dinero/estados, firmas/MIME/tamaño, transporte Cloudinary con cliente controlado y bloqueo del proveedor real. |
| API/Auth/Firestore | 45 | Roles, referencias, transacciones/revisiones, precio/stock, estados, multimedia QA, promociones, configuración, auditoría y arranque productivo bloqueado. |
| Usuarios | 9 | Crear cuenta ficticia, permisos, revisión, desactivar/reactivar, denegar token previo y auditoría sin contraseña. |
| Contrato/reglas Harness | 42 | Reglas exactas en emulador, consultas y cambios onSnapshot, privacidad de borradores/metadatos, campos/merge/legado y demostración de activo ignorado en lecturas/escrituras directas. |
| Ejemplos oficiales | 8 | Todos aceptados estructuralmente; marcadores reemplazados solo en memoria por valores QA, sin importación. |
| Navegador | 80 | Login/sesión/CRUD/filtros, medios QA, publicar, galería, configuración y siete viewports. |
| Fallos/teclado | 10 | Fallos explícitos de consulta/proveedor, reintentos, conservación del formulario y foco/Tab/Escape. |
| Aislamiento de sesión | 7 | 401/403, limpieza de vista privada, cambio SUPERADMIN/PROPIETARIO, logout y descarte de respuesta privilegiada tardía. |
| Recuperación | 4 | Exportación/restauración de Auth y Firestore; hashes de todas las filas/campos de ocho colecciones (cuatro canónicas y cuatro extensiones), conteos, cuentas/activación y login/rol recuperados. |
| UI contrato | 8 | Icono/nota, filtros visible/oculta y recarga, ficha de servicio BORRADOR, precio cero consultable, imagen/detalles/agotado, vista móvil. |

Compilación Vite correcta, node --check y git diff --check. Se detectó y corrigió una validación HTML de paso en el porcentaje de promoción durante la primera ejecución UI; solo la repetición completa aprobada cuenta en los 80. Las ocho comprobaciones anteriores de reglas provisionales quedan sustituidas por la suite de 42; test/rules.mjs delega en ella y NO se cuenta dos veces.

Se mejoró la legibilidad de tablas móviles con desplazamiento interno y se regeneraron capturas con movimiento reducido para evitar transiciones a medio recorrido; se repitieron las 80 de navegador y las 8 específicas de contrato UI.

59 capturas QA: 57 de ocho escenas y navegación móvil a 320, 360, 375, 390, 768, 1024 y 1440 px, más dos de categorías bajo contrato oficial. Viewports de Chromium, no dispositivos físicos Android/iPhone ni Safari/Firefox. Las capturas muestran QA; los medios azules no son imágenes reales del negocio.

La prueba de recuperación usa exportación explícita y metadata verificada ANTES de detener, seguida de reinicio real desde exports. No configura backups automáticos o retención de Firestore de producción y no respalda Cloudinary. Una versión Git no respalda los datos del negocio. Los exports QA se conservan privados y quedan fuera de ZIP de aplicación/evidencias.

## Integridad

29 archivos públicos originales idénticos byte a byte a main@74103ce37bb393c0531ef3d71e4ca9803f15be67. SHA-256 agregado: 1dc1a730413dee1b995e259133d8ca328c2c1f35a23442b61a445844c37522d0. Todos los cambios de código están bajo admin/. No se modifican producción, reglas desplegadas, bases reales, cuentas del cliente, permisos, web pública, intranet o premium.

## Pendientes y dictamen

**GO para revisión privada de compatibilidad local de datos y consultas. NO-GO para certificación conjunta final, uso real o publicación.**

1. Las reglas recibidas ignoran activo y permiten escritura directa de un rol desactivado en su documento de usuario. El API sí lo bloquea, pero no puede cubrir esos accesos directos. Además, esas escrituras eluden la validación/auditoría del API. Resolver con Harness en una modificación de reglas expresamente autorizada; no se altera producción aquí.
2. Falta un backend Node autorizado: GitHub Pages no lo ejecuta; no se presume compatibilidad con Sites Workers. La arquitectura/runtime/identidad de mínimo privilegio debe quedar certificada sin contratar servicios ni habilitar facturación en esta misión.
3. Faltan configuración Firebase/cuentas/dominos reales y pruebas de aislamiento del alojamiento. El contrato recibido no habilita el arranque productivo del candidato.
4. Cloudinary real queda para configuración/verificación autorizada de credenciales/preset/plan/cuota y cargas; no certificarlo por el adaptador QA.
5. Falta ejecutar la batería original de Harness y verificar juntos el código real del sitio público y el panel en un entorno de integración autorizado. La reproducción independiente de sus cuatro consultas no certifica su DOM/producción.

Código, resultados y capturas se preservan localmente para revisión. No se publica ni se amplía acceso. No se declara integración definitiva mientras estos bloqueos sigan presentes.
