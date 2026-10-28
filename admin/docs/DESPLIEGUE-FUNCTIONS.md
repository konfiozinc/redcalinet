# Despliegue de la API del panel en Cloud Functions gen 2 — KZ-REDCALINET-014

**Estado: PREPARADO, NO EJECUTADO.** No se activó facturación (Blaze), no se desplegó
ninguna función, no se desplegaron reglas y no se creó ninguna credencial real.

Este documento describe lo que hay que hacer para alojar la API del panel. El paquete
está verificado en local: `admin/deploy/` sirvió el mismo `handler` que `server/index.mjs`
y respondió igual en `/admin/api/bootstrap`.

---

## 1. Qué se despliega

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| `admin/deploy/index.mjs` | Cloud Functions gen 2 | Envoltorio `onRequest` que importa el handler de la API |
| `admin/deploy/server/*.mjs` | generado por `preparar.mjs` | Copia firmada del servidor (`index`, `store`, `schema`, `media`) |
| `admin/deploy/contract.json` | generado por `preparar.mjs` | **Compuerta de arranque**: sin contrato certificado la API no arranca |
| `admin/dist/` (build Vite) | Hosting/Pages, **no** Functions | La interfaz del panel. Functions no sirve estáticos |

Un solo `handler(req,res)` atiende las dos formas de ejecución (Node local y
`onRequest`), así que lo probado en local es lo que se despliega.

## 2. Requisitos previos

1. **Plan Blaze.** Las funciones de gen 2 son Cloud Run por debajo y **no funcionan en el
   plan Spark**. Activar Blaze es una decisión del propietario, con alerta de presupuesto.
2. Proyecto Firebase real con Firestore y Auth habilitados (hoy no existe: producción
   sigue estática y sin Firestore).
3. `firebase-tools`, Node 22–24.
4. **Contrato certificado.** `server/store.mjs` bloquea el arranque productivo salvo que
   `contract.status === 'HARNESS_VERIFIED'` **y** `RCL_CONTRACT_APPROVED_HASH` coincida
   con el hash del contrato. Hoy el contrato está en
   `HARNESS_CONTRACT_RECEIVED_LOCAL_ONLY` con hash `b02f4ea1…`, así que **el arranque
   productivo está bloqueado a propósito**. Promoverlo es un acto explícito y autorizado.
5. Verificar la versión de `firebase-functions` antes de instalar (el `package.json`
   declara `^6.0.0` y fija `runtime: nodejs22`).

## 3. Variables de entorno

**Producción (Cloud Functions):**

| Variable | Ejemplo | Nota |
|---|---|---|
| `RCL_MODE` | `production` | Cualquier otro valor entra en modo QA y exige emuladores |
| `GCLOUD_PROJECT` | `red-calinet` | Proyecto real |
| `RCL_PUBLIC_ORIGIN` | `https://konfiozinc.github.io` | Origen(es) permitidos, separados por coma. Sin esto, **toda escritura se deniega** (falla cerrado) |
| `RCL_CONTRACT_APPROVED_HASH` | `sha256…` | Debe coincidir con `contract.json` |
| `FIREBASE_WEB_API_KEY` | `AIza…` | Solo la pública web; viaja al navegador |
| `FIREBASE_AUTH_DOMAIN` | `red-calinet.firebaseapp.com` | |

**Nunca en producción:** `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`,
`RCL_TEST_MEDIA`, `RCL_MODE=emulator`. En cuanto `RCL_TEST_MEDIA=fixture` aparece, el
servidor se niega a arrancar fuera de QA (`media.mjs`).

**Credenciales:** la API usa `applicationDefault()`. En Cloud Functions son nativas; en un
host externo se pasa `GOOGLE_APPLICATION_CREDENTIALS` con una cuenta de servicio limitada
a Firestore + Auth de ese proyecto. **Nunca** un JSON de cuenta de servicio en el repo.

## 4. Seguridad

1. **El Admin SDK no pasa por las reglas.** Por eso `firestore.v3.rules` cierra toda
   escritura de cliente: la API es el único camino de escritura, y con eso la validación y
   la auditoría no se pueden eludir.
2. **Origen explícito.** `sameOrigin()` exige `Origin` en toda escritura y compara contra
   `RCL_PUBLIC_ORIGIN`. Sin variable, no hay orígenes permitidos.
3. **ID token verificado con revocación** (`verifyIdToken(token, true)`) + documento
   `usuarios/{uid}` con `activo === true` y rol `PROPIETARIO`/`SUPERADMIN`.
4. **Cloudinary real sigue deshabilitado** (`REAL_UPLOADS_DISABLED_ADMIN_003`): el
   despliegue no lo habilita. Activarlo exige credenciales en Secret Manager y una misión
   autorizada aparte.
5. **Secretos:** Secret Manager de Firebase, nunca en `firebase.json` ni en el repo.

## 5. Límites operativos a revisar antes de desplegar

- **Cuerpo de la petición.** La API acepta imágenes de hasta 10 MB y vídeos de hasta
  25 MB, en streaming con Busboy. El alojamiento debe admitir cuerpos de ese tamaño.
  Comprobar el límite exacto de gen 2 en la
  [página de cuotas de Cloud Functions](https://firebase.google.com/docs/functions/quotas)
  **antes** de habilitar vídeo; si es menor que 25 MB, la subida de vídeo debe pasar a
  carga directa firmada a Cloudinary en lugar de atravesar la función.
- **Arranque en frío.** El módulo resuelve Firestore/Auth al importarse; la primera
  petición tras un arranque en frío paga ese coste. Para el panel (uso humano, baja
  frecuencia) es aceptable.
- **Concurrencia e instancias.** El envoltorio declara `maxInstances: 10` y
  `concurrency: 10`; ajustar según presupuesto. El panel no necesita más.
- **Escritorio de archivos.** En Functions el sistema de archivos es de solo lectura salvo
  `/tmp`. El proveedor de fixtures escribe en `.runtime/media/`, que en producción no
  existe: con Cloudinary deshabilitado, la subida de medios responde 503 de forma
  controlada.
- **Auditoría.** El registro en `auditoria` es de la aplicación, atómico con el cambio,
  pero **no es inmutable frente a administradores del proveedor**.

## 6. Procedimiento de despliegue (a ejecutar solo con autorización)

```bash
# 1. Empaquetar el servidor dentro del despliegue (genera server/ + contract.json + manifiesto)
cd admin/deploy && npm run preparar

# 2. Instalar dependencias del paquete (no en el panel)
npm ci

# 3. Desplegar SOLO la función, indicando proyecto
firebase deploy --only functions:api --project red-calinet

# 4. Verificar
curl https://<region>-<proyecto>.cloudfunctions.net/api/admin/api/bootstrap
#    Debe responder local:false y contractStatus HARNESS_VERIFIED con el hash esperado.

# 5. Reglas, DESPUÉS de que la API responda (si no, el dueño se queda sin poder editar)
git mv firestore.v3.rules firestore.rules
firebase deploy --only firestore:rules --project red-calinet
```

**Antes del paso 3** hay que promover el contrato a `HARNESS_VERIFIED` y fijar
`RCL_CONTRACT_APPROVED_HASH`; si no, la función arranca y se niega a servir
(`non-demo production startup fails closed`), que es el comportamiento correcto.

## 7. Reversión

| Qué | Cómo |
|---|---|
| Función | Volver a desplegar el commit anterior, o `firebase functions:delete api --region <region> --project red-calinet` |
| Reglas | Volver a desplegar el archivo anterior (`git checkout <commit> -- firestore.rules`) |
| Datos | Un despliegue no toca Firestore; la recuperación de datos es un tema aparte (exportaciones) |

**Orden inverso al de subida:** al revertir, primero se devuelve la escritura de cliente
(`firestore.rules` con `esPropietario()`) y solo después se retira la API.

## 8. Lo que NO se hizo en esta misión

- No se activó Blaze ni ninguna facturación.
- No se desplegaron funciones, reglas ni hosting.
- No se creó ningún proyecto real, cuenta real ni credencial de Cloudinary.
- No se subieron medios reales a ningún proveedor.
