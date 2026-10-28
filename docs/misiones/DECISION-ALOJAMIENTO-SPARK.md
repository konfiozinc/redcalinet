# Decisión de alojamiento bajo el plan Spark — Red CaliNet

**Decisión del propietario (28-oct-2026):** Firebase permanece en **Spark**. No se vincula
facturación, no se activan servicios de pago y **no se usará Blaze**.

**Consecuencia inmediata:** **Cloud Functions no está disponible**. La API Node no puede vivir
en Firebase. El resto del diseño —Firebase Auth, Firestore, reglas v3, auditoría en servidor—
se conserva intacto.

**Estado:** propuesta técnica. **Nada desplegado, nada modificado en Firebase real.**

---

## 1. Arquitectura recomendada

```
                 ┌──────────────────────────── Servicio Node (Render Free, HTTPS)
   Navegador ───►│  /admin/            → panel estático (admin/dist)
   del panel     │  /admin/assets/*    → recursos del panel
                 │  /admin/api/*       → API Node (único escritor)
                 └───────────┬─────────────────────────┬──────────────────────
                             │ Admin SDK               │ firma + registro
                             ▼                         ▼
                    Firestore (Spark)          Cloudinary (cuenta aparte)
                    Firebase Auth (Spark)

   Sitio público ──► GitHub Pages (como hoy, sin cambios)
```

**La clave de la propuesta es que el panel y la API comparten un solo origen.** Eso no es un
detalle estético: es lo que permite **no tocar la seguridad ya implementada**.

| Requisito | Cómo se cumple |
|---|---|
| 1. Mantener Firebase Authentication | Auth sigue en Spark; el host solo verifica el ID token con el Admin SDK |
| 2. Firestore dentro de Spark | 1 GiB, 50 000 lecturas/día y 20 000 escrituras/día son de sobra para dos operadores |
| 3. La API como único escritor | El servicio Node es el único proceso con credenciales; no hay otra vía de escritura |
| 4. Sin escrituras directas del navegador | Reglas v3 (`allow write: if false` en todo), certificadas 59/59 |
| 5. Auditoría obligatoria | La escribe la API en la misma transacción; nada cambia |
| 6. Alojamiento externo gratuito con Node y HTTPS | Render Web Service Free, con TLS incluido |
| 9. Panel estático sin pago | Servido por el mismo servicio Node: **mismo origen** |

### Por qué NO separar el panel de la API

Si el panel se sirve desde Firebase Hosting (gratis en Spark) y la API desde otro dominio, el
navegador pasa a hacer peticiones **entre orígenes distintos**. Eso obliga a:

- añadir **CORS** al servidor (preflight, `Access-Control-Allow-Origin`, credenciales),
- cambiar el cliente para que use una **URL absoluta** en vez de `/admin/api/…`,
- y mantener una lista de orígenes permitidos en dos sitios.

Cada uno de esos puntos es una superficie nueva de error en la única frontera de seguridad del
sistema. Servir ambos desde el mismo origen deja `sameOrigin()` funcionando **exactamente como
está hoy**, sin una línea de código nueva. Firestore Hosting sigue disponible y gratis si algún
día se quiere publicar allí otra cosa.

---

## 2. Opciones evaluadas (condiciones verificadas hoy)

| Opción | ¿Node.js? | Límite real verificado | Veredicto |
|---|---|---|---|
| **Render — Web Service Free** | Sí, proceso Node completo | Se suspende tras **15 min sin tráfico**, arranque ≈ **1 min**, **750 h de instancia/mes** por workspace (no se acumulan), sistema de ficheros **efímero**, TLS incluido. Admite **variables de entorno** y **Secret Files** | **Recomendada** |
| Cloudflare Workers Free | No (runtime distinto) | **100 000 peticiones/día**, pero **10 ms de CPU** y 128 MB por petición | **Descartada**: 10 ms no basta para verificar un JWT y hacer transacciones |
| Koyeb | Sí | Tiene *scale-to-zero* documentado, pero **no pude verificar las condiciones del plan gratuito actual** | Descartada por falta de verificación, no por precio |
| Vercel / Netlify (funciones) | Sí, serverless | Límites de duración y ejecución por invocación; exigen **adaptar el handler** y separar estático de API → **CORS** | Descartada: más cambios y más superficie |
| Fly.io | Sí | Su documentación lista un catálogo de **planes descontinuados**; sin plan gratuito general verificado | Descartada |
| Firebase Hosting + Functions | No aplica | **Functions exige Blaze** | **Descartada por la restricción** |
| VM "always free" de otro proveedor | Sí | Suele exigir tarjeta para verificar identidad y administración de sistema | No recomendada: incumple el espíritu de "sin facturación" y añade operación |

Fuentes leídas para esta tabla:
[cuotas de Firestore](https://firebase.google.com/docs/firestore/quotas) ·
[planes de Firebase](https://firebase.google.com/pricing) ·
[Render Free](https://render.com/docs/free) ·
[Render: variables y secretos](https://render.com/docs/configure-environment-variables) ·
[Koyeb scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero) ·
[límites de Workers](https://developers.cloudflare.com/workers/platform/limits/)

**Cifras de Spark verificadas:** Firestore 1 GiB, 50 000 lecturas/día, 20 000 escrituras/día,
20 000 borrados/día, 10 GiB/mes de salida. Hosting 10 GB y 360 MB/día. El plan Spark se
describe como *«No payment method needed»*.

---

## 3. Recomendación única

**Publicar el panel con un único servicio Node en Render (plan Free) que sirve el panel
estático y la API en el mismo origen HTTPS**, manteniendo Firestore y Authentication en
**Spark**.

Es la única opción que cumple los diez requisitos sin degradar seguridad y **sin reescribir el
panel**: el servidor ya sirve `/admin/` y `/admin/assets/` desde `admin/dist`, y el cliente ya
habla con `/admin/api/…` en rutas relativas.

---

## 4. Limitaciones verificadas (y su mitigación)

| # | Limitación real | Impacto | Mitigación |
|---|---|---|---|
| L-01 | Render Free **se suspende a los 15 min** sin tráfico; el primer acceso tarda ≈1 min con página de carga | Molestia de uso, no de seguridad | Aceptarla; el panel es de uso humano y esporádico. No hay que "mantenerlo despierto" con tráfico artificial: eso consumiría las 750 h y podría agotar la cuota |
| L-02 | **750 h de instancia/mes** por workspace, no acumulables | Un solo servicio casi siempre encendido cabe (un mes ≈ 730 h); **dos servicios no** | Un único servicio. No desplegar el sitio público aquí |
| L-03 | Sistema de ficheros **efímero** (se pierde al suspender o redesplegar) | El adaptador QA local escribe en disco → **no sirve en el host** | En producción el proveedor es Cloudinary; el modo QA queda para local. No se guarda estado en disco |
| L-04 | **Sin Secret Manager** en Spark | El `api_secret` de Cloudinary no puede vivir en Google Secret Manager | Variable de entorno **secreta** en Render (cifrada). Nunca en el repositorio |
| L-05 | **Sin respaldo gestionado ni exportación a bucket** (requieren facturación) | No hay backup automático de Firestore | Respaldo manual periódico desde la máquina del propietario (script de volcado por Admin SDK). **Pendiente de escribir** |
| L-06 | **Sin Cloud Functions**: no hay logs de Cloud Logging ni reintentos gestionados | Diagnóstico y operación más manuales | Logs del propio host; la API ya devuelve errores en JSON |
| L-07 | Firestore Spark: **50 000 lecturas/día** | Suficiente para el panel; limita si el catálogo público pasara a leer Firestore de forma masiva | El sitio público sigue con `data.json` en GitHub Pages |
| L-08 | Un solo operador de infraestructura gratuito: si el proveedor cambia su plan, hay que migrar | Riesgo de plataforma | La API es un proceso Node estándar: se puede mover a otro host sin reescribir |

**Limitaciones que NO cambian:** el panel sigue exigiendo rol válido y `activo`, las reglas v3
siguen cerrando toda escritura de cliente, la auditoría sigue siendo obligatoria, y la API
sigue negándose a arrancar en producción si el contrato no está promovido y su hash aprobado.

---

## 5. Cambios necesarios (mínimos y enumerados)

**Configuración, sin tocar código:**

| Variable | Valor |
|---|---|
| `RCL_MODE` | `production` |
| `GCLOUD_PROJECT` | `red-calinet` |
| `RCL_HOST` | `0.0.0.0` (el servidor escucha en loopback por defecto) |
| `RCL_PUBLIC_ORIGIN` | `https://<servicio>.onrender.com` |
| `RCL_CONTRACT_APPROVED_HASH` | el hash de `admin/contract.json` **después** de promover el contrato |
| `FIREBASE_WEB_API_KEY` / `FIREBASE_AUTH_DOMAIN` | configuración pública real del proyecto |
| `GOOGLE_APPLICATION_CREDENTIALS` | ruta del **Secret File** con el JSON de la cuenta de servicio |
| `RCL_MEDIA_MODE` + `CLOUDINARY_*` + `RCL_CLOUDINARY_QUOTA_REVIEWED` | solo cuando se ensaye la subida real |

**Build:** en el host, `cd admin && npm install && npm run build` y arranque `node server/index.mjs`
con `PORT` que inyecta el proveedor. `admin/dist` se genera en el despliegue; no se versiona.

**Código: ninguno obligatorio.** El servidor ya sirve el panel y la API en el mismo origen, ya
lee `PORT`/`RCL_HOST` de entorno, ya usa REST en producción (`preferRest:true`) y ya acepta
credenciales por `GOOGLE_APPLICATION_CREDENTIALS`.

---

## 6. Procedimiento de despliegue seguro

**Orden no negociable: el API primero, las reglas después.** Al revés, el propietario se queda
sin ninguna forma de editar el catálogo.

### Antes de la ventana (verificar en consola, sin desplegar)

- [ ] **Confirmar que el proyecto sigue en Spark** y sin cuenta de facturación.
- [ ] **Confirmar que se puede crear una clave JSON de cuenta de servicio** con permisos de
      Firestore y Auth. *No verificado en esta sesión; es la primera condición que hay que
      comprobar en la consola, porque de ella depende toda la arquitectura.*
- [ ] Crear la cuenta de servicio, descargar el JSON y **guardarlo fuera del repositorio**.
- [ ] Decidir la promoción del contrato a `HARNESS_VERIFIED` (decisión del propietario).

### Ventana de despliegue

1. **Crear el servicio en Render** (Free) apuntando al repositorio y a la rama acordada, con el
   comando de build y de arranque de §5. Sin secretos todavía.
2. **Cargar variables y Secret File**: el JSON de la cuenta de servicio como *Secret File*, y
   `GOOGLE_APPLICATION_CREDENTIALS` apuntando a su ruta.
3. **Promover el contrato** en el repositorio y fijar `RCL_CONTRACT_APPROVED_HASH`. Sin esto la
   API falla cerrado y no arranca: es el comportamiento correcto.
4. **Arrancar y verificar** `GET https://<servicio>/admin/api/bootstrap`:
   - `local: false`
   - `contractStatus` verificado y hash correcto
   - `media.mode` = `REAL_UPLOADS_DISABLED_ADMIN_003` (hasta que se ensaye Cloudinary)
5. **Probar el login real** del panel desde el navegador, en móvil y escritorio.
6. **Certificar que no hay escritura directa de cliente**: con el token real del SUPERADMIN,
   un PATCH directo a `configuracion`, `categorias` y `servicios` debe devolver **403** y no
   modificar el dato. Ejecutarlo con `admin/test/sonda-ruleset-023.mjs` adaptado al proyecto
   real, **nunca** con la sonda apuntando al emulador.
7. **Desplegar las reglas v3**: `git mv firestore.v3.rules firestore.rules` y
   `firebase deploy --only firestore:rules`. **Las reglas sí se despliegan en Spark**: no
   requieren facturación.
8. **Repetir la prueba del paso 6** con las reglas ya desplegadas, y comprobar que el panel
   sigue pudiendo crear, editar, publicar y ocultar (todo entra por la API).
9. **Alta de las dos cuentas reales** con `alta-cuentas.mjs --entorno produccion`.
10. **Sembrar el catálogo** con `migrar-catalogo.mjs`: hoy es solo-emuladores. Requiere una
    misión corta que le añada el guardián de producción (mismo patrón que `alta-cuentas.mjs`),
    con vista previa obligatoria y `--aplicar` explícito.
11. **Ensayo de Cloudinary**: una carga real, comprobar que queda registrada y auditada, y solo
    entonces poner `RCL_MEDIA_MODE=cloudinary`.

### Reversión

| Qué | Cómo |
|---|---|
| Reglas | Volver a desplegar `firestore.rules` v2 del commit `17a2d06` |
| API | Volver a desplegar el despliegue anterior en el host, o suspender el servicio |
| Panel | Viene con la API: revertir el despliegue del host lo revierte también |
| Datos | **Sin exportación a bucket no hay respaldo gestionado** → volcado manual previo (L-05) |

---

## 7. Riesgos de seguridad de esta decisión

| # | Riesgo | Severidad | Salvaguarda |
|---|---|---|---|
| S-01 | Credenciales de servicio en un host externo gratuito | **Alta** | Secreto como *Secret File* cifrado, nunca en el repositorio; rotación tras cualquier exposición; la clave solo tiene permisos de Firestore y Auth |
| S-02 | El panel y la API comparten host: cae el host, cae la operación | Media | Disponibilidad, no confidencialidad; los datos siguen en Firestore |
| S-03 | Desplegar reglas v3 antes que un API funcionando | **Alta** | Orden fijo de §6; prueba de escritura del panel antes del paso 7 |
| S-04 | Sin respaldo automático, un borrado accidental es definitivo | **Alta** | Volcado manual antes de la siembra y periódico después (L-05) |
| S-05 | Alguien "despierta" el servicio con tráfico artificial y agota las 750 h | Media | No automatizar pings; documentarlo |
| S-06 | Producción sigue con reglas v2 hasta el paso 7 | **Alta** | No publicar la URL del panel antes de completar el paso 8 |

**Dictamen: NO-GO para publicar** hasta completar los pasos 4, 6 y 8 con evidencia, y hasta que
el propietario autorice la promoción del contrato y verifique la creación de la cuenta de
servicio.
