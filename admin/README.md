# Red CaliNet — candidato administrativo ADMIN-003

Trabajo recuperado sobre codex/redcalinet-admin-001, sin reiniciar el proyecto. Desarrollo y revisión PRIVADOS LOCALES. Sin push, merge ni despliegue. No cambiar visibilidad ni producción.

El contrato oficial de Harness, entregado el 27-10-2026 y comprobado por SHA-256, sustituye el contrato provisional de ADMIN-001. Ver docs/COMPATIBILIDAD-003.md y docs/ENTREGA.md para resultados y bloqueos actuales. Los informes ADMIN-001/002 en Git son históricos.

## Estructura del panel (KZ-037)

`src/app.js` ya no contiene la aplicación entera: solo arranca. El resto está
repartido por responsabilidad, para que cada cambio se haga en un archivo corto
en lugar de en plantillas de miles de caracteres.

| Carpeta | Contenido |
|---|---|
| `src/nucleo/` | `estado.js` (estado y formato), `api.js` (única puerta al Worker) y `pintar.js` (acceso, armazón, menú y capa modal) |
| `src/vistas/` | Tablero, listados con sus filtros, Fotografías y Videos, configuración y auditoría |
| `src/editor/` | `campos.js` (primitivas), `catalogo.js` (productos y servicios), `publicacion.js` (sello y lista de comprobación), `medios.js` (selector visual) y `otros.js`; `index.js` lleva el ciclo de vida del editor |
| `src/acciones.js` | Un solo punto donde se decide qué hace cada `data-action` |

Reglas que se mantienen al editar el panel:

- El payload de cada formulario y las rutas de la API **no cambian** sin actualizar
  el contrato y las pruebas del Worker.
- Publicar exige sello comercial y fuente; la comprobación del servidor manda.
- Toda escritura pasa por `nucleo/api.js`, que añade el token y la clave de
  idempotencia. Ninguna vista llama a `fetch` por su cuenta.

Catálogo único servicios para productos y servicios; configuracion/empresa y configuracion/contacto planos; categorias con visible/icono/nota/tipo; roles PROPIETARIO y SUPERADMIN. Los únicos estados públicos son BORRADOR, PUBLICADO y OCULTO. Precio entero COP/null; 0 o null significan consultar. Sin precios ni inventario comercial inventados.

Se conserva el frontend y API Node/Firebase Admin existentes, con Firestore como única fuente de datos. Las extensiones privadas (_adminRegistros, multimedia, promociones, auditoria) no sustituyen ni modifican el contrato público y requieren el backend privilegiado. Las reglas oficiales deniegan su acceso directo. Galerías/promociones NO están consumidas por la web pública. Cloudinary real deshabilitado sin configuración y revisión verificadas; las pruebas de carga usan QA_FIXTURE declarado.

IMPORTANTE: GitHub Pages es estático y no ejecuta este API Node. No hay backend de producción autorizado/provisionado. No se certifica compatibilidad de Node/Firebase Admin con Sites Workers. El arranque productivo permanece bloqueado, incluso con el contrato recibido. Las reglas suministradas no comprueban activo: el API sí, pero eso no resuelve los accesos directos a Firestore.

Node 22–24: npm ci, npm run build, npm test. Para pruebas de integración consultar docs/OPERACION.md. No incluir .env, .runtime, perfiles, logs, exports, bases QA, node_modules ni el paquete privado de Harness en repositorios públicos o despliegues.

ADMIN-003 mantiene un bloqueo explícito del proveedor Cloudinary real, incluso con variables configuradas. Se conserva el SDK de transporte para una misión posterior de configuración y verificación autorizada. Solo QA_FIXTURE local puede subir archivos en este candidato.
