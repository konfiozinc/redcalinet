# Alta de las cuentas administrativas reales — Red CaliNet

**Proyecto:** `red-calinet` · **Estado: PREVISTO, ninguna cuenta creada en producción.**

| Correo | Rol |
|---|---|
| `redcalinet9@gmail.com` | `SUPERADMIN` |
| `redcalinetmono@gmail.com` | `PROPIETARIO` |

**Herramienta única:** `admin/scripts/alta-cuentas.mjs`
**Configuración:** `admin/deploy/cuentas-previstas.json`

> El correo y el rol de cada cuenta viven en ese JSON. El script **aborta** con cualquier
> correo que no esté previsto y con cualquier rol fuera de `SUPERADMIN`/`PROPIETARIO`: el rol
> no se puede pedir por línea de comandos. No hay contraseñas ni credenciales en el
> repositorio — las cuentas se crean **sin contraseña** y cada responsable define la suya con
> el enlace de restablecimiento de Firebase.

Desde KZ-023 esta es la **única** herramienta de cuentas. La anterior
(`alta-superadmin.mjs` + `superadmin-previsto.json`) se retiró al quedar cubierta: hacía lo
mismo para un solo correo y con un solo rol.

## Qué hay que tener listo antes (lo hace el propietario en la consola)

1. **Activar Firebase Authentication** en `red-calinet` (hoy no está configurada: Identity
   Toolkit responde `CONFIGURATION_NOT_FOUND`). **No requiere Blaze.**
2. Habilitar el proveedor **correo/contraseña**.
3. Añadir a **dominios autorizados** el del panel (Hosting o Pages) y el del sitio.
4. Una **cuenta de servicio** del proyecto con permiso para Auth y Firestore; su JSON se
   guarda **fuera del repositorio** y se pasa por `GOOGLE_APPLICATION_CREDENTIALS`.
5. Que la API y las reglas v3 ya estén desplegadas (pasos 6 y 7 del plan KZ-021): el alta de
   las cuentas es el **paso 9**, después.

## Acciones

| Acción | Qué hace | Pide `--cuenta` | Pide `--confirmar` |
|---|---|---|---|
| `--estado` (por defecto) | Muestra las cuentas previstas. No escribe | No | No |
| `--revisar` | Igual que `--estado`, lectura en seco | No | No |
| `--crear` | Crea la identidad (sin contraseña, desactivada) **y** `usuarios/{uid}` | Sí | Sí |
| `--verificar` | uid, `disabled`, `emailVerified`, rol, `activo` y si el acceso está habilitado | Sí | No |
| `--activar` | Comprueba el rol y activa; **vuelve a verificar** y solo declara `LISTO` si cuadra | Sí | Sí |
| `--desactivar` | Auth `disabled=true` + `usuarios.activo=false`. El API la rechaza de inmediato | Sí | Sí |
| `--restablecer` | Enlace de restablecimiento de un solo uso | Sí | No |

`--crear` es idempotente por partes: si la identidad ya existe en Auth pero **falta** su
documento en Firestore (caso real tras restaurar Firestore sin restaurar Auth), reconstruye
solo el documento, **no toca Auth** y deja el acceso cerrado.

## Secuencia en la ventana de producción

```powershell
cd admin
$env:GCLOUD_PROJECT = "red-calinet"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\ruta\fuera\del\repositorio\servicio.json"
$env:GOOGLE_APPLICATION_CREDENTIALS  # verificar que apunta al archivo correcto

# 1. Revisión en seco: no escribe nada
node scripts/alta-cuentas.mjs --revisar --entorno produccion

# 2. Crear cada cuenta SIN contraseña, desactivada, con su documento usuarios/{uid}
node scripts/alta-cuentas.mjs --crear --entorno produccion `
  --cuenta redcalinet9@gmail.com --confirmar redcalinet9@gmail.com
node scripts/alta-cuentas.mjs --crear --entorno produccion `
  --cuenta redcalinetmono@gmail.com --confirmar redcalinetmono@gmail.com
#    cada ejecución imprime un enlace de un solo uso: NO se copia al repositorio

# 3. Cada responsable abre su enlace y define su contraseña (nadie más la conoce).

# 4. Verificar antes de habilitar
node scripts/alta-cuentas.mjs --verificar --entorno produccion --cuenta redcalinet9@gmail.com
node scripts/alta-cuentas.mjs --verificar --entorno produccion --cuenta redcalinetmono@gmail.com

# 5. Activar (comprueba el rol antes de tocar nada y verifica después)
node scripts/alta-cuentas.mjs --activar --entorno produccion `
  --cuenta redcalinet9@gmail.com --confirmar redcalinet9@gmail.com
node scripts/alta-cuentas.mjs --activar --entorno produccion `
  --cuenta redcalinetmono@gmail.com --confirmar redcalinetmono@gmail.com
```

**Criterio de acceso habilitado** — el script lo exige en el paso 5 y lo vuelve a comprobar
después: `disabled=false` en Auth **y** `usuarios/{uid}` con el rol previsto y `activo=true`.
Si algo no cuadra, no activa y no declara éxito.

## Blindajes de entorno (verificados)

| Situación | Respuesta del script |
|---|---|
| `--entorno produccion` con `RCL_MODE=emulator` | Aborta: contradicción |
| `--entorno produccion` con otro `GCLOUD_PROJECT` | Aborta: exige `red-calinet` |
| `--entorno produccion` sin `GOOGLE_APPLICATION_CREDENTIALS` | Aborta |
| Modo emulador sin `RCL_MODE` o sin los dos `*_EMULATOR_HOST` | Aborta con instrucciones |
| Correo no previsto | Aborta y lista los correos permitidos |
| Acción que modifica sin `--confirmar <correo>` | Aborta |

## Recuperación de acceso

| Caso | Procedimiento |
|---|---|
| Contraseña olvidada | `--restablecer --cuenta <correo>` genera un enlace de un solo uso. Se envía al correo autorizado; nunca se guarda en el repositorio |
| Cuenta desactivada por error | `--activar --cuenta <correo> --confirmar <correo>` (verifica el rol antes) |
| Sesión robada o baja de la persona | `--desactivar --cuenta <correo> --confirmar <correo>`: Auth `disabled=true` **y** `usuarios.activo=false`; el API la rechaza de inmediato y `verifyIdToken(token, true)` corta los tokens vigentes |
| Firestore restaurado y falta `usuarios/{uid}` | `--crear --cuenta <correo> --confirmar <correo>` reconstruye el documento sin tocar Auth |
| Pérdida del acceso a Google Workspace | Se resuelve en la consola de Firebase. El script no puede resolver eso |
| Hay que dar el rol a otra persona | Se edita `cuentas-previstas.json` → `--crear` para la nueva; la anterior se desactiva con `--desactivar` |

## Rehearsal en el emulador (KZ-023, 28-oct-2026)

Ejecutado con `alta-cuentas.mjs` contra los emuladores, con los correos previstos reales:

| Paso | Resultado |
|---|---|
| `--revisar` / `--estado` | Ambas cuentas listadas; `usuarios/doc` ausente y acceso **bloqueado** |
| `--crear` (identidad ya existente en Auth, documento ausente) | Documento reconstruido con el rol previsto y `activo=false`; **Auth no se modificó**; enlace de restablecimiento emitido |
| `--verificar` con el documento recién creado | `disabled=false` pero `activo=false` → acceso **bloqueado** (correcto) |
| `--activar` | `disabled=false` + `activo=true` → **HABILITADO**, verificado antes y después |
| `--desactivar` | `disabled=true` + `activo=false` → bloqueado de inmediato |
| `--activar` de nuevo | Vuelve a **HABILITADO** |
| Barreras | Correo no previsto, falta de `--confirmar`, falta de `--cuenta`, las tres de producción y la de emulador: todas rechazan |

**En producción no se ha ejecutado nada**: sin Blaze, sin cuentas reales, sin escribir en
Firestore real, sin desplegar y sin push.

## Lo que NO hace

- No elige ni escribe contraseñas.
- No crea cuentas de prueba ni correos ficticios.
- No toca reglas, funciones ni datos del catálogo.
- No imprime credenciales; el enlace de restablecimiento es de un solo uso.

## Credenciales separadas por servicio (KZ-029)

La herramienta usa **dos credenciales distintas**, cada una con el permiso mínimo:

| Servicio | Credencial | Permiso |
|---|---|---|
| Firestore | cuenta de servicio del Worker (ADC) | `roles/datastore.user` |
| Authentication | sesión del propietario en Firebase CLI | administrar usuarios de Auth (ya la tenía) |

Así la cuenta de servicio `redcalinet-admin-worker` **no recibe ningún privilegio nuevo**.

```powershell
# El token del CLI vive solo en la variable de entorno de ese proceso: nunca en
# argumentos, archivos, logs ni repositorio.
$env:RCL_ACCESS_TOKEN = (Get-Content "$env:USERPROFILE\.config\configstore\firebase-tools.json" -Raw | ConvertFrom-Json).tokens.access_token
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\ruta\fuera\del\repositorio\servicio.json"
$env:GCLOUD_PROJECT = "red-calinet"

node scripts/alta-cuentas.mjs --revisar --entorno produccion
node scripts/alta-cuentas.mjs --crear --entorno produccion --cuenta <correo> --confirmar <correo>

Remove-Item Env:RCL_ACCESS_TOKEN   # al terminar
```

Sin `RCL_ACCESS_TOKEN`, la herramienta se comporta como antes (todo por cuenta de servicio) y
fallará en Authentication si esa cuenta no tiene permisos de Auth Admin.

**Estado tras KZ-029:** las dos cuentas existen en Auth con `disabled=true`, sin contraseña, y
con su documento `usuarios/{uid}` en `rol` correcto y `activo=false`. **Acceso bloqueado.**