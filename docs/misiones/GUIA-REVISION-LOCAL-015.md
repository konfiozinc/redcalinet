# Guía de revisión local — KZ-REDCALINET-015

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

## 5. Copia recuperable de la rama

```
C:\Users\usuario29\Documents\KONFIO_ZINC\_respaldos\redcalinet\2026-10-28-kz-015\
  integracion-panel-codex.bundle   3 006 004 bytes
  SHA256SUMS.txt                   5381cc43…  (sha256 del bundle)
```

Contiene la historia completa (36 commits), con punta `5a8f215`. Restaurar en cualquier
máquina — hay que indicar la rama, porque el bundle no guarda `HEAD`:

```powershell
git bundle verify integracion-panel-codex.bundle            # "is okay"
git clone -b integracion/panel-codex integracion-panel-codex.bundle redcalinet-015
cd redcalinet-015
git log --oneline -1                                        # 5a8f215
git status --porcelain                                      # vacío
```

Restauración comprobada el 28-oct-2026: el clon sale en `integracion/panel-codex`, con
36 commits, 49 archivos en `admin/`, `firestore.v3.rules` y los informes de misión. La
rama también vive en el repositorio local, intacta, sin upstream.

## 6. Limitación pendiente (declarada, no resuelta)

**La recuperación del emulador de Auth no está ejercitada.** En la validación de
KZ-REDCALINET-014:

- La de **Firestore sí fue real**: se destruyó el emulador y se reconstruyó desde el
  export, con hash y conteos idénticos en las 8 colecciones (`test/persistence.mjs`
  → 4/4).
- La de **Auth no**: `firebase auth:export` falló contra el emulador con
  `PROJECT_NOT_FOUND` en `identitytoolkit`; el CLI intentó ir a la API de Google en lugar
  del emulador. Así que el emulador de Auth **no se reinició** y la comprobación de
  cuentas pasó sin ejercer destrucción/recuperación.

Consecuencia práctica para esta revisión: si se reinicia el emulador de Auth, las cuentas
desaparecen y hay que volver a ejecutar `scripts/bootstrap-emulator.mjs`. No hay
procedimiento automático de exportación/importación de Auth verificado.

## 7. Lo que esta revisión NO es

- No es certificación de producción: todo corre contra emuladores en loopback.
- No hay reglas desplegadas: producción sigue con `firestore.rules` (v2).
- No hay alojamiento: el contrato está en `HARNESS_CONTRACT_RECEIVED_LOCAL_ONLY`, así que
  el arranque productivo falla cerrado a propósito.
- Cloudinary real sigue deshabilitado; solo existe la subida de fixture QA.
- Los datos del panel son de prueba y se pierden al apagar el emulador.
