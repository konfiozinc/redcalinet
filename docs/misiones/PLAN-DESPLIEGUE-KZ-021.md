# Plan de despliegue a producción — KZ-REDCALINET-021

**Fecha:** 28-oct-2026
**Rama:** `integracion/panel-codex` · **artefacto certificado:** `3d7e5c6`
**Estado:** plan completo y verificado · **nada desplegado, nada activado**

> **SUPERADO EN PARTE el 28-oct-2026.** El propietario decidió mantener el proyecto en **Spark**
> y no activar **Blaze**. Por tanto la Fase 1 (paso «activar Blaze»), la Fase 2 (alojar el API
> en Cloud Functions) y los pasos 1 y 6 de la Fase 4 **ya no aplican**: el API vive en un
> servicio Node externo gratuito que sirve además el panel en el mismo origen. El análisis de
> riesgos, el orden *API antes que reglas*, los índices, las variables de entorno y la
> conciliación de pruebas **siguen siendo válidos**. La decisión vigente, con la comparación de
> opciones y sus límites verificados, está en
> [`DECISION-ALOJAMIENTO-SPARK.md`](./DECISION-ALOJAMIENTO-SPARK.md).

> **Código congelado.** Todo lo certificado en KZ-020 corresponde a `3d7e5c6`. Cualquier
> cambio de código posterior invalida esa certificación y obliga a repetirla. Por eso este
> plan **no modifica código**: describe lo que hay que hacer y en qué orden.

---

## FASE 1 — Inventario real de producción

Consultado en **solo lectura** con la sesión de Firebase CLI del propietario (`damoa1510@gmail.com`)
y con sondas públicas. **No se creó ninguna cuenta ni se modificó ninguna configuración.**

### Lo que existe

| Elemento | Estado real | Cómo se comprobó |
|---|---|---|
| Proyecto Firebase | **`red-calinet` existe** (número 64955804632) | `firebase projects:list` |
| App web | **`Red CaliNet Web`** · appId `1:64955804632:web:e6d2a2fbea3962a0a420ad` | `firebase apps:list` — coincide con `firebase-config.js` |
| Base Firestore | **`(default)` existe** | `firebase firestore:databases:list` |
| Sitio de Hosting | **`red-calinet`** existe (`https://red-calinet.web.app`) | `firebase hosting:sites:list` |
| Web pública | **publicada en GitHub Pages**: `https://konfiozinc.github.io/redcalinet/` responde 200 | sonda HTTP |
| Reglas desplegadas | **semántica v2** | discriminador: `configuracion/interna` se puede leer (v3 lo cerraría); `servicios` filtrado por PUBLICADO sí, por BORRADOR no; `usuarios` denegado |

### Lo que NO existe o está vacío

| Elemento | Estado | Consecuencia |
|---|---|---|
| **Firebase Authentication** | **NO configurada**: Identity Toolkit devuelve `CONFIGURATION_NOT_FOUND` | **Nadie puede iniciar sesión en el panel contra producción hoy** |
| Usuarios | ninguno (no hay proveedor) | hay que crear el primer SUPERADMIN a mano |
| Dominios autorizados | no aplica (Auth sin configurar) | hay que declararlos al activar Auth |
| **Datos del catálogo** | **base prácticamente vacía**: `categorias` 0 documentos; `configuracion/empresa` y `contacto` no existen; ninguna ficha PUBLICADO | el catálogo público funcionaría solo por el respaldo `data.json` |
| **Índices** | **ninguno** (`"indexes": []`) | falta el índice de auditoría que añadimos en KZ-020 |
| **Cloud Functions** | **API deshabilitada** (`SERVICE_DISABLED`) | nunca se desplegó nada; activarla exige facturación |
| **Release de Hosting** | **ninguno** (`/__/firebase/init.json` → 404 "Site Not Found") | Hosting está vacío; la web vive en Pages |

### Plan Spark o Blaze

**No se puede verificar en solo lectura** desde esta máquina (`gcloud` no está instalado y
`projects:list` no expone facturación). El indicio funcional es fuerte: la API de Cloud
Functions está deshabilitada y no hay servicios de pago en uso, lo que encaja con **Spark**.
**Confirmar en la consola** antes de activar nada.

---

## FASE 2 — Alojamiento del API

### Lo que ya está preparado (en el repositorio, sin desplegar)

`admin/deploy/` con envoltorio `onRequest`, empaquetador firmado con SHA-256 y
`admin/docs/DESPLIEGUE-FUNCTIONS.md`. **Verificado en local**: el paquete empaquetado
respondió igual que la API (`/admin/api/bootstrap` → 200 con el mismo JSON).

### Confirmaciones pedidas

| Requisito | Estado |
|---|---|
| **Runtime Node** | Declarado `nodejs22` y `engines: >=22 <25`. El entorno local se validó con Node 24.20; **confirmar que el runtime elegido está disponible para gen 2 en el proyecto** al desplegar |
| **Requisitos de Blaze** | **Sí o sí**: gen 2 es Cloud Run por debajo y la API de Cloud Functions está deshabilitada. Activar Blaze + habilitar `cloudfunctions.googleapis.com`, `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, `eventarc.googleapis.com` |
| **Variables de entorno** | `RCL_MODE=production`, `GCLOUD_PROJECT=red-calinet`, `RCL_PUBLIC_ORIGIN` (origen/es del panel, separados por coma), `RCL_CONTRACT_APPROVED_HASH`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`. **Nunca** `*_EMULATOR_HOST` ni `RCL_TEST_MEDIA` |
| **Autenticación** | `applicationDefault()` dentro de Functions (credenciales nativas). `verifyIdToken(token, true)` con revocación + `usuarios/{uid}` con `activo === true` y rol válido |
| **CORS y dominios** | `sameOrigin()` exige cabecera `Origin` en toda escritura y la compara con `RCL_PUBLIC_ORIGIN`. Si la variable falta, **deniega** (falla cerrado). Debe incluir el origen real del panel y el del sitio |
| **Límites de petición** | Hoy el API acepta imágenes de hasta 10 MB y vídeo de 25 MB en streaming. **Con la Fase 3 el archivo deja de pasar por la función**, así que el límite de gen 2 deja de ser crítico. Verificar el límite vigente en la [página de cuotas](https://firebase.google.com/docs/functions/quotas) antes de publicar |
| **Registro de errores** | Cloud Logging captura `console.*` de la función. Hoy el API devuelve errores en JSON **sin emitir una línea de log** en los 5xx: añadir `console.error(JSON.stringify({...}))` en el `catch` del handler es un cambio de 3 líneas, **propuesto para la ventana de despliegue** (no aplicado, para no invalidar `3d7e5c6`) |
| **Reversión** | Desplegar el commit anterior, o `firebase functions:delete api --region <región> --project red-calinet`. Al revertir, primero se devuelve la escritura de cliente (reglas v2) y **después** se retira la API |

---

## FASE 3 — Multimedia sin exponer credenciales

### Revisión de lo que hay

`media.mjs` tiene dos proveedores: `FixtureMediaProvider` (QA local) y
`CloudinaryMediaProvider` (sube desde el servidor con `upload_stream`, exige leer la cuota
antes de enviar bytes). El proveedor real está **deshabilitado a propósito**
(`REAL_UPLOADS_DISABLED_ADMIN_003`) y no hay credenciales en el repositorio.

### Cómo subir sin exponer credenciales y sin romper el límite de 25 MB

**Subida directa firmada.** El secreto no sale nunca del servidor y el archivo no atraviesa
la función:

1. El navegador pide una firma: `POST /admin/api/multimedia/firma` con el ID token del
   panel. El API valida rol/activo **igual que cualquier otra escritura**.
2. El API calcula `signature = SHA1(timestamp + "folder=redcalinet/admin" + api_secret)`,
   con `api_secret` en **Secret Manager**, y devuelve solo `{timestamp, signature, api_key,
   cloud_name, folder, allowed_formats, max_file_size}`.
3. El navegador sube el archivo **directo a Cloudinary** (`/v1_1/<cloud>/auto/upload`) con
   esos parámetros. El límite de tamaño lo pone Cloudinary, no Cloud Functions: los 25 MB
   dejan de ser un problema.
4. El navegador envía al API **solo los metadatos** que devolvió Cloudinary
   (`public_id`, `secure_url`, `bytes`, `format`, `width`/`height` o `duration`).
5. El API valida: proveedor autorizado, `folder` esperado, formato permitido, tamaño dentro
   del límite, y registra el medio con auditoría en la misma transacción. Si algo no cuadra,
   borra el recurso en Cloudinary y no registra nada.
6. La **eliminación** sigue siendo del servidor (necesita `api_key` + `api_secret`).

**Reglas de seguridad que no se negocian:**

- Nada de *unsigned preset* para el panel: cualquiera podría subir. Solo firmado.
- La firma es de un solo uso y de vida corta (`timestamp`), y el endpoint exige sesión
  autorizada.
- `api_secret` únicamente en Secret Manager. Nunca en `firebase-config.js`, ni en el repo,
  ni en el navegador.
- El `sha256` del archivo, si se calcula en el cliente, se guarda **marcado como declarado
  por el cliente**; si se quiere garantía real, el servidor lo recalcula al leer la URL.

**Estado:** diseñado y documentado. **No implementado, no existe el endpoint, no se ha
hecho ninguna carga real** y Cloudinary sigue deshabilitado.

---

## FASE 4 — Secuencia de publicación y dependencias

Cada paso indica qué rompe si se adelanta. El orden **no es negociable** en los pasos 3-7.

| # | Paso | Depende de | Si se adelanta… |
|---|---|---|---|
| 0 | **Respaldo**: exportar Firestore a un bucket (`gcloud firestore export`) y guardar el estado de Auth tras configurarla | Blaze activo | sin respaldo no hay vuelta atrás de datos |
| 1 | **Activar Blaze** y las APIs de Functions/Run/Build/Artifact/Eventarc | aprobación del propietario | el paso 6 es imposible |
| 2 | **Configurar Auth**: proveedor correo/contraseña, dominio(s) autorizado(s) | paso 1 | el panel no puede autenticar |
| 3 | **Sembrar Firestore** (`configuracion/empresa`, `contacto`, `categorias`, `servicios` desde `data.json`), con cuenta de servicio y auditoría | paso 2 (para que el seed use el mismo modelo de datos) | el catálogo saldría vacío (la web cae a `data.json`, pero el panel trabajaría sobre nada) |
| 4 | **Desplegar índices** (`firestore.indexes.json`) | paso 3 | la auditoría ordenada por fecha **fallaría en producción** |
| 5 | **Promover el contrato** a `HARNESS_VERIFIED` y fijar `RCL_CONTRACT_APPROVED_HASH` | decisión del propietario | el API arranca y **se niega a servir** (falla cerrado) |
| 6 | **Desplegar el API** (`functions:api`) y verificar `/admin/api/bootstrap` (`local:false`, contrato verificado) | pasos 1, 2, 5 | sin API verificada no se puede tocar reglas |
| 7 | **Desplegar reglas v3** (`ya promocionado en KZ-031 (una sola fuente de verdad)` + deploy) | **paso 6 funcionando** | **si se adelanta, nadie puede editar nada**: se cierra la escritura de cliente sin que exista la única puerta (la API) |
| 8 | **Publicar el panel** (Hosting o Pages) con el origen del API configurado | pasos 2, 6, 7 | panel sin backend o sin poder escribir |
| 9 | **Crear el primer SUPERADMIN** a mano en Auth y en `usuarios` | pasos 2, 6, 7 | sin cuenta no se entra (y nunca con cuentas ficticias) |
| 10 | **Publicar el catálogo aprobado** (línea `17a2d06`) en Pages | pasos 3, 7 | si se publica sin datos, la web funciona igual por `data.json`; no rompe nada |
| 11 | **Pruebas posteriores** (sección siguiente) | todo | — |

**Dependencia crítica en una línea:** *API primero, reglas después*. Al revés, el dueño se
queda sin ninguna forma de editar el catálogo.

**Reversión por paso:** reglas → volver a desplegar el `firestore.rules` v2 del commit
`17a2d06`; API → desplegar el commit anterior o borrar la función; datos → restaurar el
export del paso 0; panel → volver a publicar el artefacto anterior; sitio → Pages conserva
el historial del deployment.

### Pruebas posteriores al despliegue

1. `GET /admin/api/bootstrap` → `local:false`, `contractStatus` verificado, hash correcto.
2. Login real del SUPERADMIN en el panel publicado y carga del Dashboard.
3. Crear, editar, publicar y ocultar una ficha **real** y comprobar que aparece y
   desaparece del catálogo publicado.
4. Auditoría: 25 por página, orden por fecha, sin duplicados, y que el índice no falle.
5. Intentar una escritura directa a Firestore con el SDK y un usuario real → debe dar 403.
6. Recorrido visual en 320, 375, 390, 768, 1024 y 1440 px sin desbordamientos.
7. **Nunca** con cuentas ficticias: la cuenta de prueba se crea y se borra en la ventana.

---

## FASE 5 — Resumen para la aprobación

### Configuraciones que faltan en producción

| # | Falta | Bloquea |
|---|---|---|
| C-01 | Firebase Auth sin configurar (proveedor correo/contraseña) | **login del panel** |
| C-02 | Dominios autorizados de Auth (Pages y origen del panel) | login desde el navegador |
| C-03 | Primer SUPERADMIN real | operar el panel |
| C-04 | Datos del catálogo en Firestore (empresa, contacto, categorías, fichas) | contenido real en el panel y en el catálogo |
| C-05 | Índice compuesto de auditoría (`fecha DESC, __name__ DESC`) | auditoría en producción |
| C-06 | Blaze + APIs de Functions habilitadas | el API |
| C-07 | Variables de entorno y `RCL_CONTRACT_APPROVED_HASH` | arranque del API |
| C-08 | Contrato promovido a `HARNESS_VERIFIED` | arranque del API |
| C-09 | Alojamiento del panel (Hosting o Pages) | interfaz del panel |
| C-10 | Credenciales de Cloudinary en Secret Manager | subida real de medios |

### Requisitos de Cloudinary

- Cuenta con `cloud_name`, `api_key` y `api_secret`; el secreto **solo** en Secret Manager.
- Cuota y plan verificables antes de enviar bytes (el código ya lo exige).
- Endpoint de firma autorizado (Fase 3) y formatos permitidos: `jpg, png, webp` para imagen
  y `mp4, webm` para vídeo.
- Confirmar el límite de tamaño por plan; con subida directa el tope lo pone Cloudinary, no
  la función.
- **No se ha hecho ninguna carga real ni se ha habilitado nada.**

### Costos y condiciones

Estructura, sin cifras inventadas:

- **Spark** (gratuito) no sirve para este plan: las Functions de gen 2 exigen **Blaze**.
- **Blaze** es pago por uso, con cuotas gratuitas mensuales. Los factores de costo reales de
  este proyecto son acotados: **una** función HTTP, tráfico de panel (uso humano, no masivo),
  lecturas de Firestore del catálogo y almacenamiento de medios **en Cloudinary** (fuera de
  Google).
- Con la subida directa (Fase 3), el tráfico grande (vídeo) **no pasa por Google**, que es
  justo donde el costo por egreso se dispararía.
- Cifras vigentes a verificar antes de activar, en las páginas oficiales:
  [planes de Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans),
  [precios de Firestore](https://firebase.google.com/docs/firestore/pricing) y
  [cuotas de Functions](https://firebase.google.com/docs/functions/quotas).
- **No cito importes a propósito**: no pude verificarlos en el momento de escribir esto, y un
  número de memoria es peor que ninguno.

### Riesgos de despliegue

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R-01 | Desplegar reglas v3 antes que la API deja el panel sin poder escribir | **Alta** | Orden fijo del paso 6 → 7 |
| R-02 | Activar Blaze sin alerta de presupuesto | **Alta** | Alerta de presupuesto + límite de instancias (`maxInstances: 10`) |
| R-03 | Auth mal configurado deja el panel inaccesible | Alta | Probar el login en la ventana, con la cuenta real, antes de publicar la interfaz |
| R-04 | Sin datos sembrados el panel trabaja sobre vacío | Media | Paso 3 antes del 8 |
| R-05 | Índice faltante rompe la auditoría en producción (el emulador no lo exige) | Media | Paso 4 y prueba posterior 4 |
| R-06 | Contrato sin promover: el API arranca y se niega a servir | Media | Paso 5 y verificación del paso 6 |
| R-07 | Web pública publicada sin reglas v3: sigue con escritura de cliente abierta | Media | Publicar el sitio solo después del paso 7 |
| R-08 | Fuga del `api_secret` de Cloudinary | **Alta** | Solo Secret Manager, solo firma en servidor, nunca preset unsigned |
| R-09 | Ruptura de la certificación por tocar código después de `3d7e5c6` | Media | Congelar; si hay cambio, repetir las pruebas |

---

## Conciliación del total de pruebas (corrige KZ-020)

El informe KZ-020 decía **600**. **Estaba mal sumado.** Recalculado bloque por bloque:

| Bloque | Ejecuciones | Comprobación |
|---|---|---|
| Panel (10 suites del candidato) | 221 | 45+9+42+8+80+10+7+4+8+8 |
| Revisión 015 | 16 | panel + web |
| Revisión 018 | 16 | pasos funcionales |
| Auditoría en servidor | 15 | KZ-020 |
| Recuperación de Auth | 22 | 5 antes + 17 después |
| Harness (sitio público) | 284 | 51+50+157+26 |
| Conjuntas | 58 | 35 + 23 |
| **Total real** | **632** | |

### Únicas frente a repetidas

Criterio: una comprobación es **única** si verifica un comportamiento que ninguna otra
comprueba; es **repetida** si vuelve a ejercitar algo ya cubierto —lo cual es legítimo
cuando el objetivo es certificar **después de un cambio**—.

| Bloque | Únicas | Repetidas | Por qué |
|---|---|---|---|
| Panel 221 | 221 | 0 | es el conjunto certificado del panel: cada suite cubre una capa distinta |
| Harness 284 | 284 | 0 | sujeto distinto (web pública), nada lo cubre dos veces dentro del bloque |
| Auditoría 15 | 15 | 0 | paginación/orden en servidor no se probaba en ningún otro sitio |
| Auth 22 | 14 | 8 | desactivación y aislamiento repiten `users`/`session-isolation`, pero **bajo la condición nueva** del reinicio |
| Conjuntas 58 | 24 | 34 | `rules-v3` (35) es único; de `joint-014` (23), 6 son únicos (lectura pública con reglas v3) y 17 repiten el ciclo de producto de `integration`/`browser` |
| Revisión 015 16 | 5 | 11 | únicas: renderizado de la web pública y modo Firestore; el resto répiten login y navegación |
| Revisión 018 16 | 4 | 12 | únicas: visibilidad en catálogo tras publicar y los tres mensajes; el resto repiten el ciclo |
| **Totales** | **567** | **65** | **632 ejecuciones = 567 únicas + 65 repeticiones deliberadas** |

Las 65 repeticiones no son ruido: son la verificación de que lo ya probado **sigue
funcionando después de un cambio** (reglas, orden de auditoría, reinicio del emulador). Es
la diferencia entre "probado una vez" y "certificado".

---

## Checklist para la aprobación del propietario

- [ ] Confirmar el **plan actual** del proyecto (Spark/Blaze) en la consola.
- [ ] Aprobar el **orden** de la Fase 4, en especial *API antes que reglas*.
- [ ] Aprobar **activar Blaze** con alerta de presupuesto.
- [ ] Aprobar la **subida directa firmada** a Cloudinary como mecanismo de medios.
- [ ] Aprobar **promover el contrato** a `HARNESS_VERIFIED`.
- [ ] Nombrar las **cuentas reales** (quién será SUPERADMIN) — nunca ficticias.
- [ ] Decidir **dónde se publica el panel**: Firebase Hosting o GitHub Pages.

---

*Documento de preparación. Sin push, sin merge, sin despliegue, sin Blaze, sin cuentas
reales, sin cargas a Cloudinary y sin credenciales expuestas.*
