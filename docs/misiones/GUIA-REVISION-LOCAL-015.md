# Guía de revisión local — KZ-REDCALINET-015

> **Documento histórico (28-oct-2026).** La guía principal vigente es
> [`GUIA-REDCALINET.md`](./GUIA-REDCALINET.md), que recoge el arranque del entorno, las
> pruebas y la preparación de producción. Este documento se conserva porque dos cosas siguen
> siendo útiles y no se repiten allí con detalle: la **copia recuperable de la rama** (§5) y la
> **recuperación del emulador de Auth** (§6). Lo de §3 y §4 quedó superado.

Cómo dejar el panel y la web funcionando en el navegador para revisión del
propietario, y cómo reiniciar todo si se cierra la sesión.

**Estado:** rama `integracion/panel-codex` (local, **sin push ni merge**), 6 commits
sobre `17a2d06`. Nada desplegado, nada publicado, sin Blaze, sin credenciales reales.

---

## 1. URLs de la revisión

| Qué | URL | Origen de los datos |
|---|---|---|
| **Panel administrativo** | http://127.0.0.1:5176/admin/ | Emulador de Firestore (`demo-redcalinet-admin`) |
| **Web pública (catálogo aprobado)** | http://127.0.0.1:5180/ | `data.json` del repositorio |
| Web pública leyendo Firestore | http://127.0.0.1:5180/?emulador=1 | Emulador (`red-calinet`), fixtures QA |
| API del panel | http://127.0.0.1:5176/admin/api/bootstrap | — |
| Emulador Firestore | http://127.0.0.1:8080 | — |
| Emulador Auth | http://127.0.0.1:9099 | — |

**Cuentas del panel (solo emulador, ficticias):**

| Cuenta | Contraseña | Rol |
|---|---|---|
| `superadmin@rcl.example.test` | `RCL-Only-QA-2026!` | SUPERADMIN |
| `admin@rcl.example.test` | `RCL-Only-QA-2026!` | PROPIETARIO |

No son credenciales de producción ni cuentas del cliente. Viven solo en el emulador y
se borran al reiniciarlo.

## 2. Qué es ficticio y qué no

- **Ficticio (emulador):** todos los registros del panel, las cuentas, los medios QA
  (cuadros azules) y los fixtures del catálogo en Firestore (`iPhone 15`,
  `Plan Streaming`, etc.).
- **Real:** el contenido de `data.json` — es el catálogo aprobado del negocio, el mismo
  que se publica hoy. La web local lo muestra tal cual, sin precios inventados.
- **No se tocó ningún dato real:** no hay proyecto Firebase real conectado, no se
  modificó Firestore de producción y no se subió nada a Cloudinary.

## 3. Reiniciar los servicios (si se cerraron)

Orden obligatorio: emuladores → bootstrap → API → sitio.

```powershell
# 0. Situarse
cd C:\Users\usuario29\Documents\KONFIO_ZINC\6-LANDING-PAGES\RedCaliNet

# 1. Emulador de Firestore (reglas v3 candidatas, multiproyecto)
& "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" `
  '-Duser.language=en' '-Duser.country=US' `
  -jar "$env:USERPROFILE\.cache\firebase\emulators\cloud-firestore-emulator-v1.22.0.jar" `
  --host 127.0.0.1 --port 8080 --rules (Resolve-Path .\firestore.v3.rules)

# 2. Emulador de Auth (otra ventana)
cd admin
node node_modules\firebase-tools\lib\bin\firebase.js emulators:start `
  --only auth --project demo-redcalinet-admin --config emulators/firebase.json

# 3. Sembrar el entorno QA (OBLIGATORIO tras cada reinicio del emulador:
#    el emulador pierde los datos al apagarse)
$env:RCL_MODE="emulator"; $env:GCLOUD_PROJECT="demo-redcalinet-admin"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
node scripts/bootstrap-emulator.mjs

# 4. API + interfaz del panel (necesita admin/dist: si falta, npm run build)
$env:RCL_TEST_MEDIA="fixture"
node server/index.mjs

# 5. Web pública (otra ventana, desde la raíz del repo)
cd ..\..
node tools\servir-sitio.js
```

Notas que ahorran tiempo:

- El emulador de Firestore requiere **Java**. Se usa el JBR de Android Studio porque es
  el que está en la máquina; cualquier Java 21 sirve.
- Los argumentos `-Duser.language=en` no son decorativos: con locale español el emulador
  falla al compilar las reglas.
- Si `admin/dist` no existe, el panel devuelve 404 en `/admin/`: `npm run build`.
- Para las pruebas de navegador hace falta indicar el Chromium instalado:
  `$env:RCL_CHROMIUM = "$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe"`.

## 4. Comprobar que todo está en pie

```powershell
cd admin
node test/revision-015.mjs          # 15 comprobaciones + 9 capturas
```

Deja las capturas en `admin/.runtime/screenshots/revision-015-*.png` (ignoradas por Git).
Cubre: acceso y login del panel, indicadores, tres secciones, panel en móvil, portada
institucional KZ-011, catálogo desde `data.json`, modo Firestore y ausencia de excepciones.
Es la prueba de que ambas superficies están listas para revisar.

**Orden obligatorio de las suites del panel.** Tras reiniciar el emulador hay que ejecutar
`test/integration.mjs` **antes** de `test/browser.mjs`: la suite de navegador lee los
identificadores de multimedia que produce la de integración
(`admin/.runtime/integration-results.json`). Si se invierte el orden, `browser.mjs` falla al
seleccionar multimedia con un `selectOption` que no encuentra opciones — parece un fallo del
panel y en realidad es del entorno. Comprobado el 28-oct-2026.

El acceso administrativo tiene además su propia medición visual, que compara antes/después
en las siete resoluciones y comprueba teclado: `node test/visual-login-016.mjs <etiqueta>`.

## 5. Copia recuperable de la rama

```
C:\Users\usuario29\Documents\KONFIO_ZINC\_respaldos\redcalinet\2026-10-28-kz-015\
  integracion-panel-codex.bundle
  SHA256SUMS.txt                   (sha256 del bundle, regenerado con él)
```

Contiene la historia completa de la rama. Se regenera con
`git bundle create <ruta> integracion/panel-codex` al cerrar cualquier cambio; el hash
vigente es el que diga `SHA256SUMS.txt`, no el de este documento (que no se actualiza
solo y por tanto no debe citarse de memoria).

Restaurar en cualquier máquina — hay que indicar la rama, porque el bundle no guarda `HEAD`:

```powershell
git bundle verify integracion-panel-codex.bundle            # debe decir "is okay"
git bundle list-heads integracion-panel-codex.bundle        # punta de la rama
git clone -b integracion/panel-codex integracion-panel-codex.bundle redcalinet-015
cd redcalinet-015
git log --oneline -1                                        # debe coincidir con list-heads
git status --porcelain                                      # vacío
```

Restauración comprobada el 28-oct-2026 (clon en `integracion/panel-codex`, historia
completa, `admin/` con los 49 archivos, `firestore.v3.rules` y los informes de misión). La
rama también vive en el repositorio local, intacta, sin upstream.

## 6. Recuperación del emulador de Auth (RESUELTO en KZ-020)

En KZ-014 la exportación de Auth fallaba con `PROJECT_NOT_FOUND`. **Ya está resuelto**: la
clave es exportar con `--only auth` y con el emulador arrancado por la CLI, que es quien
registra el hub.

```powershell
cd admin
# 1. Exportar el estado de Auth (con el emulador arriba)
node node_modules\firebase-tools\lib\bin\firebase.js emulators:export .runtime\export-auth `
  --only auth --project demo-redcalinet-admin --config emulators/firebase.json

# 2. Reiniciar el emulador importando la exportación
node node_modules\firebase-tools\lib\bin\firebase.js emulators:start --only auth `
  --project demo-redcalinet-admin --config emulators/firebase.json --import=.runtime\export-auth
```

El `accounts.json` exportado lleva `localId`, `email`, `salt` y `passwordHash`, así que se
recuperan **identidades, contraseñas y el estado `disabled`**. Verificado el 28-oct-2026 con
`node test/auth-recuperacion-020.mjs antes|despues`: 5/5 antes del reinicio y 17/17 después
(mismas cuentas y uid, `disabled` intacto, login con la contraseña original, roles y
permisos iguales, cuenta cesada sigue bloqueada y un token emitido antes del reinicio queda
rechazado con 401).

Si se reinicia el emulador **sin** importar, las cuentas desaparecen y hay que volver a
ejecutar `scripts/bootstrap-emulator.mjs`.

## 7. Lo que esta revisión NO es

- No es certificación de producción: todo corre contra emuladores en loopback.
- No hay reglas desplegadas: producción sigue con `firestore.rules` (v2).
- No hay alojamiento: el contrato está en `HARNESS_CONTRACT_RECEIVED_LOCAL_ONLY`, así que
  el arranque productivo falla cerrado a propósito.
- Cloudinary real sigue deshabilitado; solo existe la subida de fixture QA.
- Los datos del panel son de prueba y se pierden al apagar el emulador.
