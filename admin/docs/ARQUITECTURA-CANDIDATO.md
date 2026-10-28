# Arquitectura vigente — ADMIN-003

Frontend Vite/JS retenido, Firebase Auth SDK, API HTTP Node en loopback y Firebase Admin SDK hacia Firestore. Sin segunda base. El API autentica tokens y verifica usuarios/{uid}.rol y activo antes de operar. Los roles son PROPIETARIO y SUPERADMIN; administración de usuarios/auditoría completa solo SUPERADMIN. Los campos privados y revisiones están fuera de documentos públicos, en _adminRegistros. El rol nunca se toma de input del navegador.

Persistencia canónica: configuracion/empresa y contacto planos, categorias y servicios. Producto/servicio son vistas de la misma colección mediante tipo/inferencia. Actualizaciones con transacción, revisión e idempotencia; merge de campos públicos preserva datos desconocidos. Extensiones privadas: _adminRegistros, multimedia, promociones, auditoria. Todas denegadas por las reglas oficiales para SDK de navegador; solo el API privilegiado tiene acceso y las valida.

El Admin SDK omite las reglas de Firestore. Las pruebas de roles del API y las de reglas directas son independientes. Las reglas exactas de Harness se cargan solo en emulador. No comprueban activo y permiten a los roles escribir directamente sin validación/auditoría del API: consultar COMPATIBILIDAD-003.md. No puede declararse aislamiento completo en producción.

Sesión de navegador: generación por identidad, limpieza de caché privada y cursores/vista en invalidación 401/403, logout/cambio de cuenta; descarte de respuestas tardías. TLS/hosting/cookies/proveedor real no están certificados. Los emuladores solo escuchan loopback y proyecto demo-redcalinet-admin.

La web pública y sus 29 archivos permanecen intactos. Se comprueban sus consultas documentadas con un consumidor independiente de Firebase SDK en el emulador; no se sustituye su código por el API auxiliar. Las extensiones no consumidas se señalan en UI.

No hay host Node de producción autorizado. GitHub Pages sirve estáticos y no ejecuta esta API; Sites Workers tampoco se declara compatible con Firebase Admin Node. Arranque productivo bloqueado y Cloudinary real no configurado/verificado. No se añadió infraestructura ni facturación. Datos QA, exports, archivos ficticios y credenciales quedan excluidos de artefactos de aplicación.

ADMIN-003 mantiene un bloqueo explícito del proveedor Cloudinary real, incluso con variables configuradas. Se conserva el SDK de transporte para una misión posterior de configuración y verificación autorizada. Solo QA_FIXTURE local puede subir archivos en este candidato.
