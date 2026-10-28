# Alta del primer SUPERADMIN real — Red CaliNet

**Correo autorizado:** `redcalinet9@gmail.com` · **Rol:** `SUPERADMIN`
**Proyecto:** `red-calinet` · **Estado: PREVISTO, no creado en producción.**

Herramienta: `admin/scripts/alta-superadmin.mjs` · Configuración: `admin/deploy/superadmin-previsto.json`

> El correo autorizado vive en ese JSON. El script **aborta** si se intenta dar de alta
> cualquier otro correo. No hay contraseñas ni credenciales en el repositorio: la cuenta se
> crea **sin contraseña** y el propietario define la suya con el enlace de restablecimiento
> de Firebase.

## Qué hay que tener listo antes (lo hace el propietario en la consola)

1. **Activar Firebase Authentication** en `red-calinet` (hoy no está configurada: Identity
   Toolkit responde `CONFIGURATION_NOT_FOUND`). **No requiere Blaze.**
2. Habilitar el proveedor **correo/contraseña**.
3. Añadir a **dominios autorizados** el del panel (Hosting o Pages) y el del sitio.
4. Una **cuenta de servicio** del proyecto con permiso para Auth y Firestore; su JSON se
   guarda **fuera del repositorio** y se pasa por `GOOGLE_APPLICATION_CREDENTIALS`.
5. Que la API y las reglas v3 ya estén desplegadas (pasos 6 y 7 del plan KZ-021): el alta
   del SUPERADMIN es el **paso 9**, después.

## Secuencia en la ventana de producción

```powershell
cd admin
$env:GCLOUD_PROJECT = "red-calinet"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\ruta\fuera\del\repositorio\servicio.json"
$env:GOOGLE_APPLICATION_CREDENTIALS  # verificar que apunta al archivo correcto

# 1. Revisión en seco: no escribe nada
node scripts/alta-superadmin.mjs --revisar --entorno produccion

# 2. Crear la cuenta SIN contraseña, desactivada, y el documento usuarios/{uid}
node scripts/alta-superadmin.mjs --crear --entorno produccion --confirmar redcalinet9@gmail.com
#    imprime un enlace de restablecimiento de un solo uso: NO se copia al repositorio.

# 3. El propietario abre ese enlace y define su contraseña (nadie más la conoce).

# 4. Verificar antes de habilitar: uid, rol, activo, disabled
node scripts/alta-superadmin.mjs --verificar --entorno produccion

# 5. Activar (comprueba que el rol es SUPERADMIN antes de tocar nada)
node scripts/alta-superadmin.mjs --activar --entorno produccion --confirmar redcalinet9@gmail.com
#    vuelve a verificar después y solo declara LISTO si el acceso queda habilitado.
```

**Criterio de acceso habilitado** — el script lo exige en el paso 5 y lo vuelve a comprobar
después: `disabled=false` en Auth **y** `usuarios/{uid}` con `rol=SUPERADMIN` y `activo=true`.
Si algo no cuadra, no activa y no declara éxito.

## Recuperación de acceso

| Caso | Procedimiento |
|---|---|
| Contraseña olvidada | `--restablecer` genera un enlace de un solo uso y caducidad corta. Se envía al correo autorizado; nunca se guarda en el repositorio |
| Cuenta desactivada por error | `--activar --confirmar <correo>` (verifica rol antes) |
| Sesión robada o baja de la persona | `--desactivar --confirmar <correo>`: Auth `disabled=true` **y** `usuarios.activo=false`; el API la rechaza de inmediato y `verifyIdToken(token, true)` corta los tokens vigentes |
| Pérdida del acceso a Google Workspace | Se resuelve en la consola de Firebase (reset del proveedor). El script no puede resolver eso |
| Hay que dar el rol a otra persona | Se edita `superadmin-previsto.json` → nuevo `--crear`; el anterior se desactiva con `--desactivar` |

## Verificado en el emulador (rehearsal del 28-oct-2026)

Ejecutado contra el emulador, **con el correo real**, para probar el camino exacto:

| Paso | Resultado |
|---|---|
| `--revisar` | cuenta NO, documento NO, acceso bloqueado |
| `--crear` | cuenta creada **sin contraseña**, `disabled=true`, `usuarios/{uid}` con `rol=SUPERADMIN` y `activo=false`; enlace de restablecimiento emitido |
| `--confirmar otro@example.com` | **abortado**: solo se acepta el correo autorizado |
| `--verificar` | uid, `disabled`, `emailVerified`, rol y `activo` mostrados; acceso bloqueado |
| `--activar` | `disabled=false` + `activo=true` → **acceso HABILITADO** (verificado antes y después) |
| `--desactivar` | `disabled=true` + `activo=false` → acceso bloqueado de inmediato |
| Reactivación | vuelve a HABILITADO |

**En producción no se ha ejecutado nada**: sin Blaze, sin cuentas reales, sin escribir en
Firestore real, sin desplegar y sin push.

## Lo que NO hace el script

- No elige ni escribe contraseñas.
- No crea cuentas de prueba ni correos ficticios.
- No toca reglas, funciones ni datos del catálogo.
- No imprime credenciales; el enlace de restablecimiento es de un solo uso y va a la consola.
