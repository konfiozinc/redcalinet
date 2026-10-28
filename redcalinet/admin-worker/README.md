# Worker administrativo de Red CaliNet

API y panel de Red CaliNet en **Cloudflare Workers**, para no depender de Cloud Functions
(que exigiría Blaze). El proyecto Firebase sigue en **Spark**.

**Estado: funcionando en local contra los emuladores. No desplegado.**

## Por qué existe

| Pieza | Antes (KZ-023) | Ahora (KZ-025) |
|---|---|---|
| API | Proceso Node en 5176 | Worker en 8787 (`wrangler dev`) |
| Panel | Servido por el proceso Node | `public/admin/` como estáticos del mismo Worker |
| Datos | `firebase-admin` (Admin SDK) | Firestore REST con cuenta de servicio |
| Credenciales | ADC / JSON | Emulador: `Bearer owner` · Producción: `FIREBASE_SA` firmado con WebCrypto |
| Origen | Mismo origen | **El mismo origen se conserva**: sin CORS |

## Arranque local

```powershell
# 1. Emuladores (Firestore 8080 y Auth 9099) y datos sembrados
cd ../../../admin
node scripts/bootstrap-emulator.mjs

# 2. Panel compilado + copia al Worker
npm run build
cd ../redcalinet/admin-worker
npm install
node scripts/preparar-panel.mjs

# 3. Worker
node node_modules/wrangler/bin/wrangler.js dev --port 8787 --ip 127.0.0.1
#    Panel: http://127.0.0.1:8787/admin/
#    API:   http://127.0.0.1:8787/admin/api/bootstrap
```

Cuentas del emulador: `superadmin@rcl.example.test` (SUPERADMIN) y
`admin@rcl.example.test` (PROPIETARIO), contraseña `RCL-Only-QA-2026!`.

## Pruebas

```powershell
$env:RCL_CHROMIUM="$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe"
node test/worker-025.mjs     # 27/27 · API, permisos, auditoría, idempotencia, multimedia
node test/interfaz-025.mjs   #  7/7  · panel desde el Worker, escritorio y móvil
```

## Qué conserva del diseño anterior

- **El navegador nunca escribe en Firestore.** La única puerta es el Worker, con sesión
  verificada, rol, `activo === true` y `Origin` obligatorio.
- **Auditoría obligatoria**: cada escritura incluye su entrada en `auditoria` en el mismo commit.
- **Validación idéntica**: se reutiliza `src/schema.mjs`, copia del certificado en KZ-023.
- **Multimedia firmada**: misma semántica, con la firma SHA-1 adaptada a WebCrypto.
- **Reglas v3 intactas**: siguen cerrando toda escritura de cliente (certificado 59/59).

## Atomicidad e idempotencia

Cada escritura va en **un solo `:commit`** con:

- `currentDocument.updateTime` → **precondición de versión** (una edición concurrente se rechaza);
- `currentDocument.exists: false` → **alta que no duplica** si dos peticiones coinciden;
- la entrada de auditoría en el mismo lote, creada con `exists: false` → **idempotencia**
  (reintentar con la misma `Idempotency-Key` devuelve el mismo registro y no audita dos veces).

**Desviación declarada:** la validación de relaciones (categoría visible, archivo existente) se
hace **antes** del commit, no dentro de una transacción como en la versión Node. El documento
escrito queda protegido igual por la precondición de `updateTime`.

## Límites del plan gratuito (respetados)

| Límite | Cómo se respeta |
|---|---|
| CPU por petición (10 ms) | El ID token se verifica en Identity Toolkit, **no** con criptografía local; el `access_token` de la cuenta de servicio se firma una vez por hora y se cachea en el isolate |
| Sin cifrar en cada petición | Se cachea el token; las lecturas se deduplican (`leer()` elimina rutas repetidas) |
| Firestore Spark (50k lecturas / 20k escrituras al día) | Un `leer()` por operación en vez de lecturas sueltas; el listado filtra por tipo en memoria tras una sola consulta |
| Peticiones 100k/día | Muy por debajo del uso de dos operadores |

**No se relaja ninguna comprobación para ahorrar recursos.** Si una operación superara el CPU
disponible, el bloqueo real es el límite del plan y se documentaría aquí en lugar de debilitar
la verificación.

## Pendiente antes de producción (no ejecutado)

1. Cuenta de servicio de `red-calinet` con rol mínimo y su clave. **No se reutiliza la de otro
   proyecto.**
2. `wrangler secret put FIREBASE_SA` (JSON de la cuenta de servicio) y, cuando toque,
   `CLOUDINARY_API_SECRET`.
3. `MODO_EMULADOR = "0"`, `PROYECTO_FIREBASE = "red-calinet"`, `FIREBASE_API_KEY` real y
   `RCL_PUBLIC_ORIGIN` con el origen del Worker.
4. Alta de cuentas por lotes con `admin/scripts/alta-cuentas.mjs` (GitHub Actions): el Worker
   **no** crea identidades en Auth — no expone esa capacidad a propósito.
5. Desplegar el Worker, verificar y **solo después** desplegar las reglas v3.

## Publicar y revertir (producción)

**No ejecutado en esta misión.** No requiere cuenta nueva: es la cuenta de Cloudflare que ya
opera la agencia.

```powershell
cd redcalinet/admin-worker

# 1. Panel compilado y copiado (mismo dist que se aprobó)
npm run panel

# 2. Secretos: se piden una vez, no se escriben en el repositorio
node node_modules/wrangler/bin/wrangler.js secret put FIREBASE_SA --env produccion
node node_modules/wrangler/bin/wrangler.js secret put CLOUDINARY_API_SECRET --env produccion   # solo al habilitar la subida real

# 3. Completar los marcadores de wrangler.toml (entorno produccion)
#    <FIREBASE_WEB_API_KEY_PUBLICA>, <SUBDOMINIO>, <CLOUDINARY_CLOUD_NAME>, <CLOUDINARY_API_KEY>

# 4. Publicar
node node_modules/wrangler/bin/wrangler.js deploy --env produccion

# 5. Verificar antes de tocar nada más
curl https://<SUBDOMINIO>.workers.dev/admin/api/bootstrap   # esperado: local=false, entorno=WORKER_CLOUDFLARE
```

**Reversión inmediata** (vuelve a la versión anterior ya publicada):

```powershell
node node_modules/wrangler/bin/wrangler.js deployments list --env produccion
node node_modules/wrangler/bin/wrangler.js rollback <ID_DESPLIEGUE> --env produccion
```

**Reversión de datos**: la migración deja un respaldo JSON antes de escribir; se restaura con
`node scripts/migrar-catalogo.mjs --revertir <archivo.json>`. Las reglas v3 se revierten
desplegando el `firestore.rules` v2 del commit `17a2d06`.

**Orden obligatorio:** Worker publicado y verificado → reglas v3 → certificación de permisos →
activación de cuentas → migración del catálogo → publicación de la URL del panel.
## Credenciales exactas que necesita el Worker

| Nombre | Tipo | Contenido | Dónde vive |
|---|---|---|---|
| `FIREBASE_SA` | **secreto** | JSON de cuenta de servicio de `red-calinet` (`client_email`, `private_key`, `project_id`, `token_uri`) | `wrangler secret put` |
| `FIREBASE_API_KEY` | público | API key web del proyecto (viaja al navegador) | `wrangler.toml` — **ya completada** |
| `PROYECTO_FIREBASE` | público | `red-calinet` | idem |
| `CARPETA_MEDIA` | público | `redcalinet/admin` | idem |
| `MODO_EMULADOR` | público | `0` en producción | idem |
| `RCL_PUBLIC_ORIGIN` | público | `https://redcalinet-admin.konfiozinc.workers.dev` | idem |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` | públicos | solo al habilitar la subida real | idem (marcadores) |
| `CLOUDINARY_API_SECRET` | **secreto** | solo al habilitar la subida real | `wrangler secret put` |

**Permiso mínimo de la cuenta de servicio: `roles/datastore.user`, y nada más.**
El Worker verifica los ID tokens contra Identity Toolkit con la API key pública, así que
**no necesita permisos de Auth Admin** ni la Admin API de Identity Toolkit.

## Activación (comandos exactos, en este orden)

```powershell
cd redcalinet/admin-worker

# 0. Seguridad previa: empaqueta y valida SIN publicar
node node_modules/wrangler/bin/wrangler.js deploy --env produccion --dry-run

# 1. Secreto de la cuenta de servicio (se pega el JSON completo; no se guarda en el repo)
node node_modules/wrangler/bin/wrangler.js secret put FIREBASE_SA --env produccion

# 2. Publicar el Worker (crea 'redcalinet-admin'; no toca los otros tres)
node node_modules/wrangler/bin/wrangler.js deploy --env produccion

# 3. Verificar el despliegue
curl https://redcalinet-admin.konfiozinc.workers.dev/admin/api/bootstrap
#    esperado: "local":false  ·  "entorno":"WORKER_CLOUDFLARE"  ·  media.mode REAL_UPLOADS_DISABLED

# 4. Registrar el origen en Firebase Authentication (consola → Authentication → Settings →
#    Authorized domains): redcalinet-admin.konfiozinc.workers.dev

# 5. Probar el login real del SUPERADMIN en el panel publicado.
#    Si falla con "auth/unauthorized-domain", el paso 4 no está guardado.

# 6. Reversión inmediata si algo va mal
node node_modules/wrangler/bin/wrangler.js deployments list --env produccion
node node_modules/wrangler/bin/wrangler.js rollback <ID> --env produccion
```

**No desplegar las reglas v3 antes del paso 5.** El orden es: Worker verificado → login real →
certificación de permisos → reglas v3 → activación de cuentas → migración → URL pública.