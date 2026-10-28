# ADMIN-003 — Compatibilidad con Harness

27 de octubre de 2026. Informe del candidato local, no certificación de producción.

## Evidencia recibida

Se recibieron seis archivos separados, NO el ZIP original: CONTRATO-FIRESTORE.md, PERMISOS-PANEL.md, EJEMPLOS-DOCUMENTOS.json, LEEME-CODEX-SITES.md, MANIFIESTO.json y SHA256SUMS.txt. Coinciden las cinco sumas del listado y los cuatro tamaños/sumas del manifiesto. La suma del ZIP no puede verificarse sin su archivo. Los hashes no son firma digital ni verificación del código desplegado.

Origen declarado por Harness: integracion/codex-sites @ 2dfff109984b3a67cd1967a91d831a4508da8814. Ese código y su batería original de 26 pruebas no vienen en el paquete. Se volvió a consultar origin sin modificarlo: solo ofrece main@74103ce; integracion/codex-sites no está publicada en el remoto accesible. No se afirma haberlos ejecutado o comparado con producción. La documentación privada original se conserva fuera del repositorio público; no se publica ni se copia a dist.

## Diferencias y correcciones

| Área | ADMIN-001 | ADMIN-003 |
|---|---|---|
| Catálogo | Colecciones productos y servicios separadas | Única colección servicios. Productos/servicios/inventario son vistas. Tipo explícito o inferido de categoría/icono i-tech. No migración automática de datos reales. |
| Campos catálogo | Galerías y validación en el documento público | Campos exactos del contrato: categoriaId, nombre, descripcion, precio, detalles, imagen, estado, orden, destacado, agotado y tipo. Metadatos, actor, revisión, fuente y galerías en _adminRegistros, no legibles por el público. |
| Estados | Cinco estados públicos | BORRADOR/PUBLICADO/OCULTO. Pendiente de validación usa BORRADOR; ARCHIVADO solo existe en extensiones privadas, no en fichas. |
| Precios | Hasta dos decimales | Entero COP o null; cero/null se presentan como consultar, nunca se estima. |
| Portada | Solo IDs de galería | Imagen URL HTTPS/ruta relativa/null editable. Primera imagen asociada actualiza imagen canónica. No se sustituye null por imagen inventada. |
| Categorías | activo; PRODUCTOS/SERVICIOS/AMBOS | visible, icono, nota legal, orden y tipo producto/servicio. No se crean categorías ficticias comerciales. |
| Empresa | Objeto anidado en empresa | Documento empresa plano; incluye descripcion del hero, direccionNota y campos históricos. |
| Contacto | Mezclado con empresa | Documento contacto plano; teléfono/WhatsApp, correo, redes y horarios como objetos dia/hora. |
| Guardado configuración | Reemplazo del documento | merge transaccional, preserva campos ajenos al formulario; revisiones privadas. |
| Roles | ADMIN/SUPERADMIN | PROPIETARIO/SUPERADMIN; rol leído del documento en servidor, no de headers/claims. Email se conserva en usuarios. |
| Lectura pública | API y filtro adicional validado | Compatibilidad con cuatro consultas exactas Harness, incluido where estado PUBLICADO sin orderBy. No se exige índice compuesto. Publicaciones históricas sin validado permanecen legibles/editables. |
| Seguridad | Reglas provisionales API-only | Reglas exactas suministradas cargadas SOLO en emulador. Permiten escritura directa a los roles; no se afirma que toda escritura tenga auditoría del API. |

Publicar sigue siendo explícito. Las nuevas publicaciones desde el API requieren confirmación y fuente QA/comercial autorizada (control administrativo adicional). El formulario no publica automáticamente al guardar. No se agrega validado al filtro de la web. Las ofertas ya publicadas con el contrato legado se editan sin exigir una migración. Ocultar categoría elimina sus fichas de la proyección, pero NO restringe su lectura por Firestore: las reglas permiten leer cualquier ficha PUBLICADO aunque su categoría esté oculta. Esta distinción está probada.

## Funcionalidades adicionales conservadas

Auditoría, control de revisión/idempotencia, stock/variantes, galería/video y promociones se conservan en extensiones privadas del mismo Firestore, separadas de los cuatro recursos públicos. El backend usa Admin SDK, que NO evalúa las reglas: se autentica y autoriza explícitamente cada solicitud. Las reglas oficiales dejan las extensiones denegadas a navegadores, incluidos los roles. No se crean extensiones ni se modifica información en producción.

La web actual no muestra promociones, galerías, videos, stock o variantes adicionales. El estado PUBLICADO de una promoción solo actúa en el API auxiliar del candidato y la UI lo advierte; NO acredita publicación en la web real. El canal de solicitudes sigue sin captura. No se usan Firebase Storage, Cloud Functions, D1, nuevas suscripciones ni otro almacenamiento de negocio.

## Hallazgos de seguridad y arquitectura (bloqueos)

1. Las reglas exactas ignoran usuarios.activo. Las pruebas demuestran lectura de catálogo privado y escritura de categorías con rol PROPIETARIO y activo:false. El API verifica activo y Auth disabled/revocation, pero NO protege los accesos directos permitidos por esas reglas. No se cambia producción. Requiere resolución conjunta autorizada de reglas y nueva batería antes de uso real.
2. Reglas de escritura amplias: un rol con acceso directo puede escribir fuera de las validaciones/auditoría del API. La auditoría de este panel no cubre esas escrituras, consola ni otros administradores. No es inmutable ni exhaustiva de todo el proyecto.
3. El stack del candidato es Node/Firebase Admin; GitHub Pages no ejecuta Node. Falta acordar/provisionar un backend privado con identidad de mínimo privilegio o una integración de cliente compatible. No se declara desplegable en Pages ni en Workers y no se contratan servicios para resolverlo.
4. Firebase config y cuentas reales/dominos no suministrados; sin pruebas de propietario o aislamiento en alojamiento real. El contrato llegó, pero el arranque productivo continúa bloqueado por estado local-only.
5. Cloudinary real continúa sin credenciales/preset/plan/cuota verificados. No se habilitó su carga ni se hicieron peticiones al proveedor. SDK de transporte probado de forma controlada; end-to-end únicamente con fixture declarado.
6. No se incluye la fuente pública de Harness ni sus 26 pruebas. Se prueba un consumidor independiente con sus cuatro onSnapshot exactos; no se certifica el DOM, hosting o funcionamiento conjunto de la web en vivo.

## Dictamen

GO para revisión privada de compatibilidad de datos/consultas con la evidencia local descrita. NO-GO para integración definitiva, uso real o publicación mientras existan los bloqueos de reglas, backend y entorno real. Ninguna credencial, cuenta real, precio, producto o disponibilidad comercial se importó del paquete de ejemplos.

ADMIN-003 mantiene un bloqueo explícito del proveedor Cloudinary real, incluso con variables configuradas. Se conserva el SDK de transporte para una misión posterior de configuración y verificación autorizada. Solo QA_FIXTURE local puede subir archivos en este candidato.
