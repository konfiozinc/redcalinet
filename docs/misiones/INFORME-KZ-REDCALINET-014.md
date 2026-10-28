# INFORME KZ-REDCALINET-014 — Integración local del panel Admin con Red CaliNet

**Fecha:** 28-oct-2026
**Rama:** `integracion/panel-codex` (local, **sin push ni merge**)
**Base:** `17a2d06` (web aprobada: catálogo + portada institucional KZ-011)
**Panel:** `efe7b09` (bundle verificado en KZ-REDCALINET-013)
**Estado:** integración y validación completas en local · **NO desplegado, NO publicado**

---

## 1. Decisión aplicada

Adoptar el panel de Codex Sites con la API Node como único escritor de Firestore,
conservando el catálogo público y el hero institucional KZ-REDCALINET-011. La web
aprobada no se toca: el panel entra como capa de administración y el navegador deja de
escribir en Firestore.

## 2. Fase 1 — Integración

Cinco commits sobre la web aprobada:

| Commit | Qué |
|---|---|
| `53a5e12` | Integra los 38 archivos del panel; resuelve la colisión; retira el MVP |
| `5ccc71c` | Portabilidad Windows del panel |
| `2f38e5a` | La API exporta su handler para poder alojarse |
| `9936a43` | Reglas v3 candidatas y pruebas conjuntas |
| `3177850` | Paquete de despliegue gen 2 y documentación |

- **Archivos traídos del bundle**, no copiados a mano: `git fetch <bundle>` y
  `git checkout refs/codex/admin-001 -- admin/`, con la ref apuntando a `efe7b09`.
- **Colisión resuelta:** `admin/index.html`. Se queda la entrada de Vite del panel.
- **Panel MVP retirado** (`admin/panel.js`, `panel.html`, `panel.css`): tenía **14
  escrituras directas** a Firestore desde el navegador (`setDoc`/`updateDoc`/`deleteDoc`
  sobre `configuracion`, `categorias`, `servicios`) — el bypass de validación y auditoría
  que señalaba la auditoría 012. Sigue recuperable: `git show 17a2d06:admin/panel.js`.
- **La web pública no cambió.** En todo el diff solo hay dos archivos fuera de `admin/`:
  `firestore.v3.rules` (archivo nuevo, candidato) y `tools/test-contrato-estatico.js`
  (prueba actualizada). `index.html`, `styles.css`, `script.js`, `data.json`,
  `firestore.rules`, `firebase-config.js` y `firestore.indexes.json`: intactos.

**Diff exacto:** `53 files changed, 14227 insertions(+), 618 deletions(-)` — 48 altas,
2 modificaciones, 3 bajas.

## 3. Fase 2 — Seguridad

`firestore.v3.rules` es **candidata**: producción sigue con `firestore.rules` (v2). La
promoción es un acto explícito (`git mv` + `firebase deploy --only firestore:rules`).

| Antes (v2) | Ahora (v3) | Hallazgo que cierra |
|---|---|---|
| `allow write: if esPropietario()` en las 4 colecciones | `allow write: if false` | **A-02**: la escritura de cliente eludía validación y auditoría |
| `usuarios` legible por el propio usuario y por SUPERADMIN | sin acceso de cliente | **A-01**: `activo` no se aplicaba; ya no hay lectura de rol que ignorar |
| `configuracion/{id}` público entero | solo `empresa` y `contacto` | exposición innecesaria |
| `auditoria`, `_adminRegistros`, `multimedia`, `promociones` sin regla | cerradas explícitamente | intención documentada |

Las **cuatro consultas públicas oficiales** se conservan y están verificadas: **26/26**
de `tools/test-reglas-publico.js` pasan contra v3.

Lo que el API ya hacía y ahora es la única puerta: `verifyIdToken(token, true)` con
revocación, `usuarios/{uid}` con `activo === true` y rol válido, y **auditoría escrita en
la misma transacción** que el cambio (con idempotencia y revisión optimista).

## 4. Fase 3 — Validación

### 4.1 Harness (suite del sitio aprobado) — 284 comprobaciones, 0 fallos

| Suite | Resultado |
|---|---|
| `tools/test-catalogo-datos.js` | 51/51 |
| `tools/test-contrato-estatico.js` | 50/50 |
| `tools/test-catalogo-dom.js` | 157/157 |
| `tools/test-reglas-publico.js` (contra **v3**) | 26/26 |

El contrato estático pasó de 46 (45 + 1 fallo) a 50 porque su bloque 8 comprobaba
`admin/panel.js`, que ya no existe. Se reescribió para contrastar `PUBLIC_FIELDS` del API
contra lo que el catálogo realmente lee — la comprobación que se buscaba — y ahora
verifica 11 campos de catálogo y 7 de categoría.

### 4.2 Panel de Codex Sites — 221 comprobaciones, 0 fallos

| Suite | Resultado |
|---|---|
| `test/schema.test.mjs` (unitarias) | 8/8 |
| `test/harness-examples.mjs` | 8/8 |
| `test/harness-contract.mjs` | 42/42 |
| `test/users.mjs` | 9/9 |
| `test/integration.mjs` | 45/45 |
| `test/ui-failures.mjs` | 10/10 |
| `test/session-isolation.mjs` | 7/7 |
| `test/contract-ui.mjs` | 8/8 |
| `test/browser.mjs` | 80/80 (59 capturas) |
| `test/persistence.mjs` | 4/4 |

Se ejecutaron de verdad en esta máquina (emuladores de Firestore y Auth en loopback,
API en `127.0.0.1:5176`), no se transcribieron resultados ajenos. El build de Vite es
**reproducible**: genera `index-B-oaafxl.js` y `index-PK6NVpsH.css`, los mismos nombres
con hash que el build que Codex preservó.

### 4.3 Pruebas conjuntas (escritas por el Harness) — 58 comprobaciones

- `admin/test/rules-v3.mjs` — **35/35**: lectura pública intacta y **escritura directa
  denegada** para PROPIETARIO, SUPERADMIN, cuenta desactivada y anónimo; `_adminRegistros`,
  `auditoria`, `multimedia` y `promociones` inaccesibles; verificación de que los datos no
  se movieron.
- `admin/test/joint-014.mjs` — **23/23**: los nueve escenarios del encargo de punta a
  punta, escribiendo por la API y leyendo por la consulta pública real.

Los nueve escenarios pedidos, todos verdes:

| Escenario | Qué se comprobó |
|---|---|
| Crear producto | nace en BORRADOR y no aparece en ningún catálogo |
| Editar producto | el cambio persiste |
| Publicar | sin sello de validación el API lo rechaza; con sello publica |
| Cambiar precio | el precio nuevo llega a la consulta pública |
| Ocultar | desaparece del catálogo público y el panel sigue viéndolo |
| Desactivar usuario | su token deja de servir en la API |
| Denegar escrituras directas | token real de PROPIETARIO → 403 en `servicios` y en `configuracion/empresa` |
| Registrar auditoría | cada cambio con su actor; el PROPIETARIO no puede leerla; sin contraseñas |
| Visibilidad en catálogo | publicado presente / oculto y borrador ausentes, y el documento público solo expone los 11 campos del contrato |

### 4.4 Fallos reales encontrados y corregidos

El panel se escribió para Linux y **no arrancaba en Windows**. Todo lo siguiente se
descubrió ejecutando, no leyendo:

1. `scripts/create-fixtures.mjs` y `server/media.mjs` usaban `URL.pathname`, que en
   Windows produce `/C:/...`. En `media.mjs` rompía **la subida de archivos de verdad**:
   la API respondía 502 en cada intento. Corregido con `fileURLToPath`.
2. Las mismas construcciones en los `setInputFiles` y capturas de las pruebas de navegador.
3. Las pruebas lanzaban Chromium desde `/usr/bin/chromium`. Ahora `RCL_CHROMIUM` o el
   navegador de Playwright. `RESTORE-HARNESS.md` ya preveía este ajuste.
4. `server/index.mjs` no se podía importar sin arrancar el servidor: se separó
   `handler(req,res)` del `listen`, para alojarlo sin duplicar rutas.
5. El paquete de despliegue **no incluía `contract.json`** y no arrancaba. Se descubrió al
   servir el paquete empaquetado; ahora `preparar.mjs` lo copia y lo firma.

### 4.5 Límites de esta validación (honestidad)

- **La recuperación de Firestore fue real**: el emulador se destruyó y se reconstruyó
  desde el export, con hash y conteos idénticos en las 8 colecciones. **La de Auth no**:
  `firebase auth:export` falló contra el emulador (`PROJECT_NOT_FOUND` en
  identitytoolkit), así que el emulador de Auth no se reinició. Las 4 comprobaciones
  pasan, pero la de cuentas no ejerció destrucción/recuperación.
- Las 80 pruebas de navegador usan Chromium **1243** (Playwright 1.64 pide 1248). La
  diferencia no alteró ningún resultado, pero no es la combinación exacta del emisor.
- Nada de esto es certificación de producción: todo corrió contra emuladores en loopback.

## 5. Fase 4 — Preparación de alojamiento

`admin/deploy/` queda preparado y **verificado en local**: el paquete empaquetado
responde igual que la API (`/admin/api/bootstrap` → HTTP 200 con el mismo JSON).

- Envoltorio `onRequest` para gen 2 que importa el mismo handler del servidor local.
- `preparar.mjs` copia `server/*.mjs` + `contract.json` y firma cada archivo con SHA-256.
- `firebase.json` con `runtime: nodejs22`.
- `admin/docs/DESPLIEGUE-FUNCTIONS.md`: requisitos de Blaze, variables de entorno,
  seguridad, límites operativos, procedimiento y reversión.

**No se activó facturación, no se desplegó nada, no se crearon credenciales.**

## 6. Riesgos pendientes

| # | Riesgo | Estado |
|---|---|---|
| R-01 | **Las reglas v3 no están desplegadas.** Producción sigue con v2: la escritura de cliente abierta sigue siendo real hasta la ventana autorizada | Bloquea la seguridad definitiva |
| R-02 | **No hay alojamiento.** Blaze no activado; el contrato está en `HARNESS_CONTRACT_RECEIVED_LOCAL_ONLY`, así que el arranque productivo **falla cerrado a propósito** | Bloquea publicar el panel |
| R-03 | Cloudinary real sigue deshabilitado: no hay subida de imágenes reales; solo URL o fixture QA | Pendiente de misión autorizada |
| R-04 | Sin proyecto Firebase real, cuentas ni dominios autorizados | Bloquea operar |
| R-05 | El tope de vídeo son 25 MB; hay que verificar el límite de petición de gen 2 antes de habilitar vídeo, o pasar a carga directa firmada | Revisar antes de desplegar |
| R-06 | `scripts/verify-public-files.mjs` sigue exigiendo que todo cambio esté bajo `admin/` con base `74103ce`; en esta rama hay dos archivos fuera (`firestore.v3.rules`, el test del contrato). Es la salvaguarda de la rama del panel, no de la de integración | Documentado; no se usa como compuerta |
| R-07 | La interfaz del panel (`admin/dist/`) no la sirve Functions: necesita Hosting o Pages | Decisión de alojamiento |

## 7. Dictamen

**GO técnico para revisión del propietario sobre la rama local.** La integración está
hecha, el sitio público aprobado está intacto, las 563 comprobaciones ejecutadas pasan
(284 Harness + 221 panel + 58 conjuntas) y las reglas candidatas cierran A-01 y A-02.

**NO-GO para publicar o desplegar** hasta que se resuelvan, en este orden:

1. Autorizar y desplegar `firestore.v3.rules` (después de que la API responda).
2. Decidir alojamiento: Cloud Functions gen 2 (Blaze) o host Node externo con cuenta de
   servicio dedicada.
3. Crear el proyecto Firebase real con cuentas y dominios autorizados.
4. Promover el contrato a `HARNESS_VERIFIED` y fijar `RCL_CONTRACT_APPROVED_HASH`.
5. Decidir sobre Cloudinary real en una misión aparte.

---

*Sin push, sin merge, sin despliegue, sin cambios en producción, sin Blaze, sin
credenciales reales. Todo el trabajo vive en la rama local `integracion/panel-codex`.*
