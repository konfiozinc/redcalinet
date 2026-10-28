# Guía única de Red CaliNet

**Qué es este documento.** El punto de entrada para trabajar en el proyecto: cómo levantar el
entorno local, cómo se prueba, cómo funciona la multimedia y qué falta para publicar. Sustituye
a la guía de revisión local de KZ-015 como documento principal; los informes de misión y los
documentos técnicos complementarios siguen citándose donde aportan detalle.

**Rama de trabajo:** `integracion/panel-codex` · **sin push, sin merge, sin despliegue.**
**Producción:** nada desplegado, nada activado, sin credenciales reales.

---

## 1. Estado real (28-oct-2026)

| Pieza | Estado | Dónde |
|---|---|---|
| Panel administrativo | Integrado, 12 módulos, responsive | `admin/` |
| Catálogo público | Aprobado y en producción en GitHub Pages | `index.html`, `data.json` |
| API Node | Funcional en emuladores; **no desplegada** | `admin/server/` |
| Reglas Firestore v3 | Candidatas, certificadas en emulador | `firestore.v3.rules` |
| Reglas desplegadas en producción | **siguen siendo v2** | `firestore.rules` |
| Multimedia | **Subida directa firmada**, adaptador QA local | `admin/server/directa.mjs` |
| Cuentas administrativas | Herramienta única, probada en emulador | `admin/scripts/alta-cuentas.mjs` |
| Migración de catálogo | Vista previa por defecto, solo emuladores | `admin/scripts/migrar-catalogo.mjs` |
| Contrato Harness | `HARNESS_CONTRACT_RECEIVED_LOCAL_ONLY` | `admin/contract.json` |

El arranque productivo del API **falla cerrado** a propósito: sin contrato promovido a
`HARNESS_VERIFIED` y su hash aprobado, no arranca (`admin/server/store.mjs`).

## 2. Arquitectura en una vista

```
Navegador ─┬─ GET  /admin/api/*  ─────────────► API (admin/server) ──► Firestore (Admin SDK)
           │                                       │
           └─ POST <uploadUrl> ─────────────────► proveedor multimedia
              (firma de vida corta)                (Cloudinary real / adaptador QA)

Cliente web público ── 4 consultas exactas ──► Firestore (reglas v3: solo lectura)
```

Decisiones que no se negocian:

- **Cero escritura de cliente.** Con v3, todo `allow write` es `false`: la única puerta de
  escritura es el API, que valida sesión, rol y origen. El Admin SDK no pasa por las reglas.
- **El archivo no atraviesa la API.** El navegador lo envía directo al proveedor con una firma
  que emite el servidor. El `api_secret` nunca sale del servidor.
- **Nada se inventa.** Precio desconocido es `null`; un dato que falta no se muestra como cero.

## 3. Entorno local

Orden obligatorio: emuladores → datos → API → (opcional) sitio público.

```powershell
cd C:\Users\usuario29\Documents\KONFIO_ZINC\6-LANDING-PAGES\RedCaliNet

# 1. Firestore con las REGLAS v3 (java 21; se usa el JBR de Android Studio)
& "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" `
  '-Duser.language=en' '-Duser.country=US' `
  -jar "$env:USERPROFILE\.cache\firebase\emulators\cloud-firestore-emulator-v1.22.0.jar" `
  --host 127.0.0.1 --port 8080 --rules (Resolve-Path .\firestore.v3.rules)

# 2. Auth (otra ventana)
cd admin
node node_modules\firebase-tools\lib\bin\firebase.js emulators:start `
  --only auth --project demo-redcalinet-admin --config emulators/firebase.json

# 3. Sembrar el entorno (OBLIGATORIO tras cada reinicio: el emulador no persiste)
$env:RCL_MODE="emulator"; $env:GCLOUD_PROJECT="demo-redcalinet-admin"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
node scripts/bootstrap-emulator.mjs

# 4. API + panel (si falta admin/dist: npm run build)
$env:RCL_TEST_MEDIA="direct"
node server/index.mjs

# 5. Sitio público (otra ventana, desde la raíz del repo)
cd ..\.. ; node tools\servir-sitio.js
```

| Qué | URL |
|---|---|
| Panel | http://127.0.0.1:5176/admin/ |
| API | http://127.0.0.1:5176/admin/api/bootstrap |
| Sitio público | http://127.0.0.1:5180/ · con `?emulador=1` lee Firestore |
| Emulador Firestore | http://127.0.0.1:8080 |
| Emulador Auth | http://127.0.0.1:9099 |

**Cuentas del panel (ficticias, solo emulador):** `superadmin@rcl.example.test` (SUPERADMIN) y
`admin@rcl.example.test` (PROPIETARIO), contraseña `RCL-Only-QA-2026!`.

### Trampas conocidas del entorno

- **El emulador de Firestore debe arrancar con `--rules firestore.v3.rules`.** Si se arranca
  sin ese argumento, aplica las reglas v2 del repositorio y **las pruebas de denegación pasan
  a dar 200**: cualquier PATCH directo de un PROPIETARIO a `servicios`, `categorias` o
  `configuracion` se acepta. Comprobado el 28-oct-2026: comprueba siempre que un PATCH directo
  devuelve 403 antes de creer los resultados.
- Los argumentos `-Duser.language=en -Duser.country=US` no son decorativos: con locale español
  el emulador falla al compilar las reglas.
- **Vite y Playwright necesitan crear procesos hijo con tuberías** (esbuild su canal de
  servicio, Chromium su IPC mojo). Un entorno que niegue tuberías nombradas los aborta con
  `EPERM` aunque las rutas de archivo estén permitidas. No se arregla con CDP sobre TCP:
  Chromium muere igual en `mojo platform_channel`. Si aparece el error, la ejecución de
  compilación + navegador debe hacerse **de una sola vez** en el entorno que lo permita,
  no suite por suite.
- `revision-017` no existe: la numeración de misiones va de 015 a 018.
- Si `admin/dist` no existe, `/admin/` devuelve 404: `npm run build`.

## 4. Pruebas

### Unitarias (sin emuladores)

```powershell
cd admin
node test/directa.test.mjs      # 16 · firma, validación del resultado, fallo cerrado
```

`node --test test/*.test.mjs` no sirve en entornos que bloqueen procesos hijo: `node:test`
lanza un hijo por archivo. Ejecuta el archivo directamente, que corre en el mismo proceso.

### Contra emuladores (API incluida)

```powershell
$env:RCL_CHROMIUM="$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe"
node test/integration.mjs            # 45 · ciclo del API y contrato público
node test/subida-directa-023.mjs     # 43 · subida directa firmada de punta a punta
node test/rules.mjs                  # 42 · contrato Harness
node test/rules-v3.mjs               # 35 · reglas v3 con rules-unit-testing
node test/joint-014.mjs              # 23 · panel + web + denegación directa
node test/users.mjs                  #  9 · ciclo de vida de cuentas
node test/auditoria-020.mjs          # 15 · paginación y orden en servidor
node test/harness-contract.mjs       # 42 · contrato del Harness
```

### Navegador

```powershell
node test/certificacion-023.mjs      # 30 · recorrido completo (ver §5)
node test/browser.mjs                # 80 · la interfaz de punta a punta
node test/ui-failures.mjs            # 10 · fallos y teclado
node test/contract-ui.mjs            #  8 · contrato en pantalla
node test/revision-015.mjs           # 16 · panel y sitio, capturas
node test/revision-018.mjs           # 16 pasos funcionales + capturas
node test/session-isolation.mjs      #  7 · aislamiento de sesión
node test/visual-login-016.mjs kz    # login en 7 resoluciones + teclado
```

**Orden obligatorio:** `integration.mjs` **antes** que `browser.mjs`; la suite de navegador lee
los identificadores de multimedia de `admin/.runtime/integration-results.json`.

**Precondiciones de volumen.** `auditoria-020` necesita **más de 100 entradas** de auditoría
para ejercitar la paginación; en un emulador recién sembrado falla en «el cursor avanza» sin
que haya defecto alguno. Ejecuta antes `joint-014` o `integration` para generar volumen.

**Inestabilidad conocida (28-oct-2026).** Las dos comprobaciones `DENEGAR` de `joint-014`
(petición directa a Firestore con token real) dan **403 correctamente en un emulador recién
arrancado** y pasaron a dar **200 tras horas de uso continuo**, con reinicios de conexión
repetidos en el log del emulador. No es un defecto del API ni de `firestore.v3.rules` (que
declaran `allow write: if false` sin condiciones): es el motor de reglas del emulador. Si
aparece, reinicia el emulador y vuelve a comprobarlo antes de dar por roto el aislamiento.

**No ejecutado en KZ-023:** `persistence.mjs`, que es un ciclo de dos fases
(`before` → exportar → reiniciar el emulador importando → verificar). Requiere reiniciar los
emuladores y volver a sembrar; se dejó fuera para no invalidar el resto de la certificación.

## 5. Certificación del recorrido completo (KZ-023)

`node test/certificacion-023.mjs` ejecuta en un solo pase, contra emuladores:

**Login → crear producto → subir fotografía → editar → publicar → comprobar catálogo →
ocultar → verificar auditoría → comprobación en móvil.**

Resultado del 28-oct-2026: **30/30 pasos**. Deja el detalle en
`admin/.runtime/certificacion-023-results.json` y capturas `cert023-0*.png`. Comprueba, entre
otras cosas, que en la subida ocurren **las tres llamadas en orden** (firma → carga al
proveedor → registro), que el catálogo público sirve la imagen real, y que la auditoría guarda
la subida con su vía (`SUBIDA_DIRECTA`).

## 6. Multimedia: subida directa firmada

### Cómo funciona

1. `POST /admin/api/multimedia/firma` con la sesión del panel → `{timestamp, signature,
   apiKey, cloudName, uploadUrl, publicId, carpeta, formatos, maxBytes, vigenciaSegundos}`.
2. El navegador envía el archivo **directo** a `uploadUrl` con esos campos.
3. `POST /admin/api/multimedia/registrar` con el resultado del proveedor → el API valida y
   crea la ficha.

La firma es SHA-1 sobre los parámetros ordenados (`allowed_formats`, `folder`, `public_id`,
`timestamp`) más el secreto, con **15 minutos** de vigencia. Cubre el `public_id`, que decide
el servidor: el registro solo puede referirse al archivo que este servidor autorizó, y una
limpieza tras un fallo **nunca** puede borrar el archivo de otro.

### Qué se valida antes de escribir nada

Carpeta autorizada (`redcalinet/admin`), formato permitido por tipo (`jpg/jpeg/png/webp` para
imagen, `mp4/webm` para vídeo), `resource_type` igual al tipo firmado, tamaño dentro del límite
(10 MB imagen / 25 MB vídeo) y URL del proveedor autorizado. La huella SHA-256 la calcula el
servidor cuando puede leer el archivo; si viene del navegador se guarda marcada
(`sha256Origen: 'CLIENTE'`).

### Modos

| Modo | Cuándo | Qué hace |
|---|---|---|
| `QA_DIRECT_FIXTURE` | `RCL_MODE=emulator` + `RCL_TEST_MEDIA=direct` | Adaptador local que imita el endpoint firmado del proveedor en loopback. Sin cuenta, sin cuota, sin red externa |
| `CLOUDINARY_DIRECT` | `RCL_MEDIA_MODE=cloudinary` + las tres credenciales + `RCL_CLOUDINARY_QUOTA_REVIEWED=yes` | Subida real. **No certificado contra el servicio real** |
| `REAL_UPLOADS_DISABLED_ADMIN_003` | cualquier otro caso | Falla cerrado: la firma devuelve 503 |

Las credenciales por sí solas **nunca** habilitan el transporte real.

### Límites del diseño (declarados, no ocultos)

- Dos peticiones de firma dentro del mismo segundo producen la **misma** firma: el esquema de
  Cloudinary no incluye nonce. Por eso el registro rechaza un `public_id` ya guardado (409) y
  un reintento del navegador no puede duplicar la ficha.
- Si la validación falla **antes** de poder probar la firma, el archivo queda en el proveedor
  y no se borra: borrar un `public_id` no verificado podría destruir el archivo de otro.
- El adaptador real usa `fetch` firmado, no el SDK `cloudinary`; el SDK ya no se usa en ningún
  módulo y se retiró del paquete de despliegue.

## 7. Cuentas administrativas

Herramienta única: `admin/scripts/alta-cuentas.mjs` con `admin/deploy/cuentas-previstas.json`
(solo correo y rol; nunca contraseñas). Cuentas previstas:

| Correo | Rol |
|---|---|
| `redcalinet9@gmail.com` | `SUPERADMIN` |
| `redcalinetmono@gmail.com` | `PROPIETARIO` |

Acciones: `--estado`, `--revisar`, `--crear`, `--verificar`, `--activar`, `--desactivar`,
`--restablecer`. Toda acción que modifica exige `--confirmar <correo>`; en producción exige
además `--entorno produccion`, el proyecto correcto y credenciales de servicio por
`GOOGLE_APPLICATION_CREDENTIALS`.

Procedimiento completo, blindajes y rehearsal: [`PROCEDIMIENTO-SUPERADMIN.md`](./PROCEDIMIENTO-SUPERADMIN.md).

`alta-superadmin.mjs` y `superadmin-previsto.json` **ya no existen**: quedaron cubiertos por la
herramienta única y se retiraron tras comprobar que nada más los referenciaba.

## 8. Preparación de producción (candidata, nada ejecutado)

La secuencia y las dependencias están en [`PLAN-DESPLIEGUE-KZ-021.md`](./PLAN-DESPLIEGUE-KZ-021.md)
§ Fase 4. **El orden no es negociable: API primero, reglas después.** Al revés, el propietario
se queda sin ninguna forma de editar el catálogo.

### Lo que ya está configurado en el repositorio

| Elemento | Archivo | Estado |
|---|---|---|
| Función gen 2 | `admin/deploy/index.mjs` | `nodejs22`, 512 MiB, **60 s**, `maxInstances: 10`, `concurrency: 10` |
| Empaquetado firmado del API | `admin/deploy/preparar.mjs` | copia `admin/server/*.mjs` a `deploy/server/` con manifiesto SHA-256 |
| Dependencias del API | `admin/deploy/package.json` | `busboy`, `firebase-admin`, `firebase-functions` |
| Índice de auditoría | `firestore.indexes.json` | índice compuesto `auditoria: fecha DESC, __name__ DESC` ya declarado |
| Variables de entorno | `admin/.env.example` | completo, con el secreto marcado como «solo Secret Manager» |
| Hosting del panel | `firebase.hosting-candidato.json` + `admin/deploy/preparar-hosting.mjs` | ensambla `hosting-public/admin` para conservar la ruta `/admin/` |
| Cuentas | `admin/scripts/alta-cuentas.mjs` | probado en emulador |
| Migración inicial | `admin/scripts/migrar-catalogo.mjs` | vista previa por defecto, `--aplicar` para escribir, `--revertir` disponible |

El timeout bajó de 120 s a 60 s porque **el archivo ya no pasa por la función**: solo viaja JSON
pequeño.

### Hosting: cómo se sirve el panel

El panel se construye con `base: '/admin/'`, así que el HTML pide `/admin/assets/...`. Publicar
`admin/dist` tal cual rompería esas rutas. `preparar-hosting.mjs` copia el resultado a
`hosting-public/admin/`, de modo que Hosting sirve exactamente las mismas rutas que el servidor
local. La configuración candidata enruta `/admin/api/**` a la función `api`.

`hosting-public/` está en `.gitignore`: es un artefacto, se regenera con `npm run build` +
`node admin/deploy/preparar-hosting.mjs`.

**No verificado localmente:** el emulador de Hosting no arrancó en esta máquina (el *hub* del
CLI de Firebase ya estaba ocupado por otra instancia). La estructura del artefacto **sí** está
comprobada en disco; el enrutado de Hosting es la semántica documentada de Firebase, pero no se
marcó como probado. Es lo primero que hay que ensayar en la ventana de despliegue.

### Cloudinary: lo que falta antes de habilitarlo

1. Cuenta con `cloud_name`, `api_key` y `api_secret`.
2. `firebase functions:secrets:set CLOUDINARY_API_SECRET --project red-calinet`.
3. Enlazar el secreto a la función y definir `RCL_MEDIA_MODE=cloudinary`,
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `RCL_CLOUDINARY_QUOTA_REVIEWED=yes`.
4. Revisar cuota y plan; `RCL_PUBLIC_ORIGIN` con los orígenes reales (si falta, toda escritura
   se deniega: falla cerrado).
5. **Hacer una carga real de ensayo y comprobarla.** El adaptador real nunca se ha ejecutado
   contra el servicio.

## 9. Bloqueos externos

| # | Bloqueo | Quién lo desbloquea |
|---|---|---|
| B-01 | Firebase Auth **no configurada** en `red-calinet` (Identity Toolkit: `CONFIGURATION_NOT_FOUND`) | Propietario, en la consola. No requiere Blaze |
| B-02 | Cloud Functions deshabilitada; gen 2 exige **Blaze** | Propietario: aprobar plan + alerta de presupuesto |
| B-03 | Contrato sin promover a `HARNESS_VERIFIED` ni hash aprobado | Decisión del propietario |
| B-04 | Credenciales de Cloudinary en Secret Manager | Propietario |
| B-05 | Decisión: publicar el panel en **Hosting o GitHub Pages** | Propietario |
| B-06 | Dominios autorizados de Auth | Propietario, al configurar Auth |
| B-07 | Migración inicial a producción: la herramienta solo corre en emuladores | Requiere una misión autorizada que añada el guardián de producción |
| B-08 | Ensayo real de Cloudinary | Requiere B-04 |

## 10. Reglas de trabajo

- Sin push, sin merge, sin despliegue, sin Blaze, sin tocar Firebase real, sin Cloudinary real.
- Commits por etapa, en `integracion/panel-codex`, con el árbol limpio entre etapas.
- No se declara terminado lo que no está probado; lo no probado se dice aquí.
- Los secretos van a Secret Manager o variables de entorno. Nunca al repositorio ni a un
  documento de entrega.
