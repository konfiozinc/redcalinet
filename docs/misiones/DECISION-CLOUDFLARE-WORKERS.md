# Alojamiento con infraestructura existente: Cloudflare Workers

**Decisión del propietario (28-oct-2026):** no se crean cuentas nuevas, **no se usa Render**, no
se activa Blaze y no se contrata nada. Se reutiliza lo que KONFÍO ZINC ya tiene funcionando.

**Estado:** propuesta técnica basada en una auditoría de solo lectura. **Nada desplegado, nada
modificado, ninguna credencial solicitada.**

---

## 1. Auditoría de la infraestructura existente (solo lectura)

| Plataforma | Estado comprobado | ¿Ejecuta lógica? |
|---|---|---|
| **Cloudflare Workers** | **7 configuraciones** en el workspace: `calm-heart-6828` (Asesor Konfi), `platoscan-api`, `unefibra-agente`, `konfio-qr`, `Konfio-Sports-Push-Worker`, `wrangler.toml` de herramientas y otro push-worker. Cuenta ya autenticada (`.wrangler/wrangler-account.json`, `npx wrangler login`) | **Sí** |
| GitHub Pages | En uso (sitios públicos, incluido el de Red CaliNet) | No: solo estático |
| Firebase Spark (`red-calinet`, `konfio-zinc`, `une-fibra`, `isa-arenas`, `ali-binary-options`) | Activo, **sin facturación** (`billingEnabled: false` en `red-calinet`) | No: Functions exige Blaze |
| Cloudflare KV | En uso (`KZ_LOGS`, `KZ_CONOCIMIENTO`, `SCANS`, `UNEFIBRA_*`) | Sí (almacén clave-valor) |
| Cloudflare D1 | En uso (`konfio-qr`) | Sí (base de datos) |
| Cloudinary | En uso (preset `menu-digital`, cloud de la agencia) | No: solo medios |

**No existe** ninguna infraestructura de la agencia que ejecute un proceso **Node** (ni VPS ni
contenedores). Ese es el hecho que condiciona todo lo demás.

## 2. El patrón ya está desplegado y probado en la agencia

`9-AGENTES-IA/Asistente-IA/asesor_web/worker.js` (Worker `calm-heart-6828`, en producción)
implementa **exactamente** lo que la API de Red CaliNet necesita:

| Línea | Qué demuestra |
|---|---|
| L616 | «OAuth2 por cuenta de servicio (JWT RS256) — sin credenciales en el navegador» |
| L626-627 | `scope: https://www.googleapis.com/auth/datastore` · `aud: https://oauth2.googleapis.com/token` |
| L633-634 | `crypto.subtle.importKey("pkcs8", …)` + `crypto.subtle.sign("RSASSA-PKCS1-v1_5", …)`: **la firma del JWT ocurre dentro del Worker** |
| L636 | Intercambio del JWT por un `access_token` en `oauth2.googleapis.com/token` |
| L651 | Escritura en Firestore por REST: `firestore.googleapis.com/v1/projects/<proyecto>/documents/…` |
| L594 y L774 | «El formulario público ya NO escribe directo en Firestore» · «escribe con cuenta de servicio. El navegador nunca toca Firestore» |

Secrets y bindings que ya usa: `env.FIREBASE_SA` (el JSON de la cuenta de servicio como secreto
del Worker), `env.ADMIN_SECRET`, `env.GEMINI_KEY`, KV `KZ_LOGS` y `KZ_CONOCIMIENTO`.

Además, `asesor_web/crear-sa-kz-leads.mjs` es un script **de la propia agencia** que crea una
cuenta de servicio con el rol mínimo `roles/datastore.user` y le genera la clave: el
procedimiento de credenciales también está automatizado y probado.

**Conclusión de la auditoría:** no hace falta ninguna plataforma nueva. Cloudflare Workers, que
la agencia ya opera y paga o usa en su plan actual, cubre las cinco capacidades pedidas.

## 3. Cómo cubre cada capacidad exigida

| Capacidad requerida | Cómo se resuelve en el Worker | Reutiliza |
|---|---|---|
| Verificar Firebase Authentication | Se llama a Identity Toolkit con el ID token y se obtiene el usuario: la verificación no consume CPU local | Patrón existente |
| Validar roles y `activo` | Lectura de `usuarios/{uid}` por Firestore REST con la cuenta de servicio | Igual que hoy |
| Administrar Firestore | Firestore REST con `access_token` de la cuenta de servicio | **Ya probado en producción** |
| Registrar auditoría | Commit por lotes en `auditoria` junto con la escritura del registro | Mismo criterio, implementado en REST |
| Firmar multimedia | `crypto.subtle.digest("SHA-1", …)` sobre los parámetros + el secreto de Cloudinary en `env` | Firma oficial de Cloudinary |
| Servir el panel | *Static Assets* del mismo Worker, en `/admin/` y `/admin/assets/` | `konfio-qr` ya usa el binding `ASSETS` |

**Mismo origen**: panel y API en el mismo Worker → `sameOrigin()` sigue intacto y **no se añade
CORS**. El cliente del panel (`admin/src/app.js` y su `dist`) **no se toca**.

## 4. Compatibilidad con Firebase Spark

Compatible y sin cambios en Firebase: el Worker usa **Firestore REST y Identity Toolkit**, que
son APIs de datos y autenticación disponibles en Spark. No requiere Cloud Functions, ni Blaze,
ni cuenta de facturación. Las **reglas v3 se pueden desplegar igual** (no requieren
facturación), y siguen cerrando toda escritura de cliente: el Worker escribe con cuenta de
servicio, igual que hoy escribe la API Node con el Admin SDK.

Queda igualmente vigente el orden **API primero, reglas después**.

## 5. Adaptaciones necesarias (con el código actual como referencia)

Se conserva mucho; **no se conserva todo**, y conviene decirlo sin adornos: ningún runtime
existente ejecuta Node, así que el adaptador de datos debe portarse.

| Módulo actual | Líneas | ¿Se conserva? | Qué habría que cambiar |
|---|---|---|---|
| `admin/server/schema.mjs` | 65 | **Sí, íntegro en esencia** | `node:crypto` para `digest` → WebCrypto. Es validación pura |
| `admin/server/directa.mjs` | 193 | **Casi íntegro** | `node:fs`/`node:path` (solo el adaptador QA) · `Buffer` → `ArrayBuffer` · `timingSafeEqual` → comparación constante manual · SHA-1 → `crypto.subtle.digest` |
| `admin/server/store.mjs` | 92 | **No** | Es el núcleo: `firebase-admin`, transacciones y paginación. **Se reescribe sobre Firestore REST** manteniendo los mismos contratos |
| `admin/server/index.mjs` | 45 | **No** | `node:http` → `fetch` handler · Busboy → `request.formData()` |
| Panel (`admin/src`, `admin/dist`) | — | **Sí, sin cambios** | Ninguno: mismo origen |
| Suites de prueba | — | **Sí, adaptando el transporte** | Las que hablan con `127.0.0.1:5176` pasan a hablar con `wrangler dev` |

**Punto crítico y honesto:** la parte que más trabajo cuesta es la **atomicidad**. Hoy
`save()`, `deleteMedia()` y `users()` usan `runTransaction` de Firestore (idempotencia por
auditoría, control de revisión y auditoría en la misma transacción). En REST eso se hace con
`beginTransaction`/`commit` y precondiciones `updateTime`, pero **hay que escribirlo y volver a
certificarlo**: es el riesgo funcional principal de esta migración.

## 6. Lo que NO cambia (por tanto, no se re-certifica)

- Las **reglas v3** y su certificación determinista (59/59).
- La **firma y validación de multimedia** (`directa.mjs`), salvo el detalle de plataforma.
- El **contrato público** del catálogo y su verificación de sincronización.
- El **cliente del panel**, sus pantallas y su comportamiento.
- La **cuenta de servicio de `red-calinet`**: existe (`firebase-adminsdk-*`) con
  `roles/firebase.sdkAdminServiceAgent`. **No se reutiliza ninguna credencial de otro proyecto.**

## 7. Reutilizar Node donde sí sirve: GitHub Actions

El código Node actual **no se tira**. Las tareas que no necesitan HTTP interactivo se ejecutan
con él en GitHub Actions, que la agencia ya usa (`UneFibra-SAS/.github/workflows/deploy.yml`,
`Konfio-Zinc-Web/.github/workflows/calidad.yml`):

| Tarea | Herramienta | Código |
|---|---|---|
| Migración inicial del catálogo | Workflow con `migrar-catalogo.mjs` | Node actual, sin portar |
| Alta de las cuentas administrativas | Workflow con `alta-cuentas.mjs` | Node actual, sin portar |
| **Respaldo periódico de Firestore** | Workflow de volcado por Admin SDK | Resuelve la limitación L-05 de Spark |

Así se conserva el código donde aporta valor y solo se porta lo que debe ser interactivo.

## 8. Riesgos

| # | Riesgo | Severidad | Salvaguarda |
|---|---|---|---|
| S-01 | **Límite de CPU del plan Free (10 ms por petición)** si la cuenta no está en plan de pago | **Alta** | Verificar el plan antes de nada. El precedente del Asesor demuestra que firma + REST cabe, pero ese tráfico es esporádico. Mitigación técnica: cachear el `access_token` en KV (se firma una vez por hora, no por petición) |
| S-02 | **Pérdida de atomicidad** al portar las transacciones | **Alta** | `commit` con precondiciones + auditoría en el mismo lote; prueba dedicada de idempotencia y de revisión optimista |
| S-03 | Usar credenciales de otro proyecto por comodidad | **Alta** | Prohibido: la cuenta de servicio debe ser **de `red-calinet`** con rol mínimo, como ya hace `crear-sa-kz-leads.mjs` |
| S-04 | Reglas v3 desplegadas antes de que el Worker escriba | **Alta** | Orden fijo: Worker operativo y verificado → reglas |
| S-05 | Un Worker nuevo afecta a los existentes | Media | Worker independiente, KV propio, sin tocar `calm-heart-6828` ni sus bindings |
| S-06 | Sin respaldo gestionado (Spark) | **Alta** | Workflow de volcado de §7 |

## 9. Limitaciones verificadas

- **No hay runtime Node**: es la limitación de origen y la razón de portar la capa de datos.
- **Plan Free, si aplica**: 100 000 peticiones/día, 10 ms de CPU y 128 MB por petición. El
  volumen del panel (dos operadores) está muy por debajo en peticiones; el CPU es el que hay que
  vigilar.
- **Firestore Spark**: 20 000 escrituras/día. La capa REST debe evitar lecturas redundantes
  (cachear el token, no releer lo que no cambió).
- **Sin Secret Manager**: el JSON de la cuenta de servicio y el `api_secret` de Cloudinary van
  como **secretos del Worker** (`wrangler secret put`), cifrados y fuera del repositorio.
- **El código Node no se ejecuta en el Worker**: se conserva para las tareas batch de §7.

## 10. Siguiente paso de implementación (sin desplegar)

1. **Verificar el plan de la cuenta Cloudflare** en el panel (solo lectura). De él depende si el
   límite es 10 ms o 30 s.
2. Crear `redcalinet/admin-worker/` con `wrangler.toml` propio (sin tocar los existentes) y el
   `ASSETS` del panel ya construido.
3. Portar `schema.mjs` y `directa.mjs`; empezar la capa REST por los endpoints **de solo
   lectura** (`bootstrap`, `me`, `list`, `public/catalogo`).
4. **Certificar localmente con `wrangler dev` contra el emulador de Firestore**: el emulador
   acepta Firestore REST en loopback sin OAuth, así que toda la lógica se prueba **sin
   desplegar y sin credenciales**.
5. Portar las escrituras con `beginTransaction`/`commit` y precondiciones; volver a ejecutar
   `escrituras-v3-023.mjs`, `enrutado-024.mjs` y `sincronizacion-024.mjs`.
6. Solo entonces: cuenta de servicio de `red-calinet` con rol mínimo, secretos del Worker,
   despliegue del Worker, verificación, y **por último** las reglas v3.

**Dictamen: VIABLE, con una condición y un costo.** La condición es confirmar el plan de
Cloudflare; el costo es portar la capa de datos (no el panel). Nada se publica hasta repetir las
certificaciones sobre el Worker.
