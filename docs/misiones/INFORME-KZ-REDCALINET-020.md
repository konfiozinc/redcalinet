# Informe técnico — KZ-REDCALINET-020

**Fecha:** 28-oct-2026
**Rama:** `integracion/panel-codex` (local, sin push) · **base:** `f488119`
**Objetivo:** cerrar los problemas técnicos pendientes antes de preparar el despliegue.

---

## 1. Auditoría: orden y paginación en el servidor

**Antes:** `list()` ordenaba por `__name__` (id del documento) para todas las colecciones.
Como los id de auditoría son UUID, el orden era arbitrario: no había forma de garantizar
"lo más reciente primero" ni de que las páginas fueran consecutivas en el tiempo.

**Ahora:** la auditoría tiene su propia consulta en `store.mjs`:

```js
orderBy('fecha','desc').orderBy('__name__','desc').limit(101)
// cursor opaco = base64url("fecha|id") → startAfter(fecha, id)
```

- **Más reciente primero**, sin reordenar en el cliente (el panel ya solo corta la página).
- **Paginación estable**: el cursor lleva fecha **y** id, así que dos entradas con la misma
  fecha no se pisan ni se repiten. Antes el cursor era solo un id.
- **Sin duplicados ni omisiones**: verificado recorriendo las 205 entradas reales.
- **Índice declarado** para producción en `firestore.indexes.json`
  (`auditoria`: `fecha DESC, __name__ DESC`). El emulador no lo exige, Firestore real sí.
- **Solo lectura**: se comparó el hash de los 205 documentos antes y después de paginar.

| Comprobación (`test/auditoria-020.mjs`) | Resultado |
|---|---|
| La primera entrada es la más reciente | 2026-10-28T03:19:17.893Z |
| Secuencia completa de más reciente a más antigua | 205 entradas en 3 páginas |
| Sin duplicados | 205 entregados, 205 únicos |
| Sin omisiones | 205 de 205 |
| Recorrido repetido devuelve lo mismo | sí |
| Actor, operación, fecha, registro, colección | presentes en todas |
| Información de cambios | `campos` en las de catálogo; `rolAnterior`/`rolNuevo`/`activo` en las de permisos |
| El API no recorta campos | 205/205 con el juego de claves del documento |
| Los documentos no cambian al consultar | 205/205 idénticos |
| Cursor inválido | no rompe: devuelve la primera página |

**15/15.**

## 2. Recuperación de Firebase Auth

El hueco de KZ-014 (`firebase auth:export` fallaba con `PROJECT_NOT_FOUND`) **está cerrado**.
La exportación funciona con `--only auth` y el emulador arrancado por la CLI; el
`accounts.json` incluye `localId`, `email`, `salt` y `passwordHash`, así que se recuperan
identidades, contraseñas y el estado `disabled`.

Ciclo ejecutado de verdad: crear cuenta ficticia → desactivarla → exportar →
**detener el emulador de Auth** → arrancarlo con `--import` → verificar.

| Fase | Comprobaciones |
|---|---|
| Antes (5/5) | cuenta desactivada en Firestore y en Auth (`disabled=true`), no puede entrar; SUPERADMIN y PROPIETARIO sí |
| Después (17/17) | 4 cuentas con los mismos uid y correo · `disabled` sobrevive · documentos de `usuarios` idénticos (hash) · ambos roles entran con su contraseña original · PROPIETARIO sigue sin acceso a usuarios ni auditoría · la cuenta cesada sigue bloqueada · **token emitido antes del reinicio rechazado (401)** · dos sesiones simultáneas conservan su propio rol |

**22/22 en total.** La guía de revisión local (`GUIA-REVISION-LOCAL-015.md`) ya recoge el
procedimiento verificado en lugar de la limitación.

## 3. Certificación conjunta

Todo repetido sobre el entorno local con los emuladores reales:

| Bloque | Comprobaciones |
|---|---|
| Panel: integración, navegador, fallos/teclado, aislamiento, contrato UI | 45 + 80 + 10 + 7 + 8 |
| Panel: unitarias, ejemplos oficiales, contrato Harness, usuarios, persistencia | 8 + 8 + 42 + 9 + 4 |
| Revisión 015 (panel + web) | 16 |
| Revisión 018 (recorrido funcional) | 16/16 pasos, **0 problemas** |
| Revisión 019 (6 resoluciones, tablas y tacto) | sin regresiones |
| Auditoría en servidor (nueva) | 15 |
| Recuperación de Auth (nueva) | 5 + 17 |
| Harness: catálogo, contrato estático, DOM, reglas v3 | 51 + 50 + 157 + 26 |
| Conjuntas: denegación de escrituras, negocio | 35 + 23 |

**Total: 632 comprobaciones ejecutadas, 0 fallos** (este informe decía 600 por un error de
suma; la conciliación detallada está en `PLAN-DESPLIEGUE-KZ-021.md` §«Conciliación del total
de pruebas»). Persistencia de Firestore re-verificada
con un reinicio real desde exportación (4/4) y reglas v3 intactas (26/26 oficiales + 35/35
conjuntas).

## 4. Defectos que introduje y corregí en esta misión

Los declaro porque los detectaron las suites, no yo:

1. **Auditoría colgada en el panel.** Al mover el orden al servidor borré la variable
   local `orden`, pero el paginador seguía citando `orden.length`: `render()` lanzaba y el
   aviso «Consultando información…» se quedaba fijo. Detectado por `browser.mjs` y
   `session-isolation.mjs`. Corregido y verificado (la vista carga en 505 ms con 25
   entradas).
2. **Dos aserciones mías demasiado rígidas** en `rules-v3.mjs` (contaban registros
   absolutos: 2 categorías, 1 servicio). Con datos acumulados fallaban aunque las reglas
   fueran correctas. Ahora comprueban la propiedad real (lo sembrado se lee, lo oculto no
   se cuela).
3. **Mi aserción sobre `campos`** en la nueva prueba de auditoría: los cambios de permisos
   no llevan lista `campos` sino `rolAnterior`/`rolNuevo`/`activo`. Corregida y ampliada con
   una comprobación más fuerte (que el API no recorte ningún campo).

## 5. Archivos modificados

| Archivo | Cambio |
|---|---|
| `admin/server/store.mjs` | Consulta de auditoría ordenada por fecha desc + id desc, cursor opaco `fecha｜id` |
| `admin/src/app.js` | La vista confía en el orden del servidor; rótulo «Cargar 100 registros anteriores» |
| `firestore.indexes.json` | Índice compuesto `auditoria` (`fecha` DESC, `__name__` DESC) |
| `admin/test/auditoria-020.mjs` | Nuevo: certificación de la paginación en servidor |
| `admin/test/auth-recuperacion-020.mjs` | Nuevo: recuperación de Auth en dos fases |
| `admin/test/rules-v3.mjs` | Dos aserciones reescritas para no depender del volumen de datos |
| `docs/misiones/GUIA-REVISION-LOCAL-015.md` | Sección 6: procedimiento de recuperación de Auth verificado |

No se tocó el diseño aprobado, ni el Dashboard, ni el acceso, ni el catálogo público, ni
Firebase real, ni Cloudinary. No se activó Blaze. Sin push, sin merge, sin despliegue.

## 6. Bloqueos restantes para producción

| # | Bloqueo | Estado |
|---|---|---|
| P-01 | **Reglas v3 sin desplegar**: producción sigue con las reglas permisivas (v2) | Requiere ventana autorizada |
| P-02 | **Sin alojamiento para la API**: gen 2 exige Blaze; no hay host decidido | Decisión del propietario |
| P-03 | **Sin proyecto Firebase real**: no hay cuentas ni dominios autorizados; el contrato sigue en `HARNESS_CONTRACT_RECEIVED_LOCAL_ONLY` | Falta promoverlo a `HARNESS_VERIFIED` |
| P-04 | **Cloudinary real deshabilitado**: no hay subida de imágenes reales | Misión aparte |
| P-05 | **Índice de auditoría**: hay que crear el índice declarado en el proyecto real (`firebase deploy --only firestore:indexes`) | Se resuelve con el despliegue |
| P-06 | Tope de vídeo de 25 MB frente al límite de petición de gen 2 | Verificar antes de habilitar vídeo |

## 7. Dictamen

**GO para preparar el despliegue.** Los dos problemas técnicos pendientes están cerrados:
la auditoría se pagina en el servidor en orden cronológico estable, sin duplicados ni
omisiones y sin tocar los documentos, y la recuperación de Auth está ejercitada de verdad
tras un reinicio. Las 632 comprobaciones pasan y no hay regresiones visuales ni de permisos.

**NO-GO para producción** por los seis bloqueos de la sección 6, que no son de código: son
de despliegue, de proyecto real y de decisiones que no me corresponden.

---

*Sin push, sin merge, sin despliegue, sin Blaze, sin credenciales reales, sin Cloudinary.
Todos los datos son del emulador y desaparecen al reiniciarlo sin exportación.*
