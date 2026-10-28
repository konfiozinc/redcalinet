# Red CaliNet — candidato administrativo ADMIN-003

Trabajo recuperado sobre codex/redcalinet-admin-001, sin reiniciar el proyecto. Desarrollo y revisión PRIVADOS LOCALES. Sin push, merge ni despliegue. No cambiar visibilidad ni producción.

El contrato oficial de Harness, entregado el 27-10-2026 y comprobado por SHA-256, sustituye el contrato provisional de ADMIN-001. Ver docs/COMPATIBILIDAD-003.md y docs/ENTREGA.md para resultados y bloqueos actuales. Los informes ADMIN-001/002 en Git son históricos.

Catálogo único servicios para productos y servicios; configuracion/empresa y configuracion/contacto planos; categorias con visible/icono/nota/tipo; roles PROPIETARIO y SUPERADMIN. Los únicos estados públicos son BORRADOR, PUBLICADO y OCULTO. Precio entero COP/null; 0 o null significan consultar. Sin precios ni inventario comercial inventados.

Se conserva el frontend y API Node/Firebase Admin existentes, con Firestore como única fuente de datos. Las extensiones privadas (_adminRegistros, multimedia, promociones, auditoria) no sustituyen ni modifican el contrato público y requieren el backend privilegiado. Las reglas oficiales deniegan su acceso directo. Galerías/promociones NO están consumidas por la web pública. Cloudinary real deshabilitado sin configuración y revisión verificadas; las pruebas de carga usan QA_FIXTURE declarado.

IMPORTANTE: GitHub Pages es estático y no ejecuta este API Node. No hay backend de producción autorizado/provisionado. No se certifica compatibilidad de Node/Firebase Admin con Sites Workers. El arranque productivo permanece bloqueado, incluso con el contrato recibido. Las reglas suministradas no comprueban activo: el API sí, pero eso no resuelve los accesos directos a Firestore.

Node 22–24: npm ci, npm run build, npm test. Para pruebas de integración consultar docs/OPERACION.md. No incluir .env, .runtime, perfiles, logs, exports, bases QA, node_modules ni el paquete privado de Harness en repositorios públicos o despliegues.

ADMIN-003 mantiene un bloqueo explícito del proveedor Cloudinary real, incluso con variables configuradas. Se conserva el SDK de transporte para una misión posterior de configuración y verificación autorizada. Solo QA_FIXTURE local puede subir archivos en este candidato.
