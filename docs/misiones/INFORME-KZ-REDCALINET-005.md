# KZ-REDCALINET-005 — Cierre de certificación

**Proyecto:** Red CaliNet (`6-LANDING-PAGES/RedCaliNet`)
**Base:** commit `e14785d`
**Fecha:** 27-oct-2026
**Resultado:** certificación de reglas e integración **completa** · visual **sigue bloqueada** · **un bug crítico encontrado y corregido**

---

## Resumen

| Prioridad | Estado | Evidencia |
|---|---|---|
| 1. Verificación visual (36 pruebas + 7 resoluciones) | ⛔ **Bloqueada** por el sandbox | 4 intentos, todos abortan con `0x80000003`; script listo |
| 2. Firebase Emulator Suite | ✅ **Completa, sin instalar nada** | 26/26 con el JRE de Android Studio |
| 3. Verificación comercial | ✅ **Completa** (lo que no es visual) | 49 + 51 comprobaciones |

**Pruebas ejecutadas en esta misión: 126 comprobaciones, 126 en verde.**

```
node tools/test-catalogo-datos.js        → 51 · PASA 51 · FALLA 0
node tools/test-contrato-estatico.js     → 49 · PASA 49 · FALLA 0
node tools/test-reglas-publico.js        → 26 · PASA 26 · FALLA 0   (contra emulador)
```

---

## 1. Bug crítico encontrado y corregido

La prueba contra el emulador destapó un defecto que ninguna prueba anterior podía ver:

```js
// script.js — negocioDesdeFirestore()
return {
  marca, contacto, horarios,
  redes: redesDesdeContacto(contacto),
  categorias: categorias,
  beneficios, origen: "firestore"
  // ← FALTABA `servicios: servicios`
};
```

**Consecuencia real:** en producción, con Firestore respondiendo, `mapearCatalogo` recibía
categorías pero **ningún servicio**, así que el catálogo habría aparecido **vacío** en la web
pública. Las 8 fichas que se veían en las pruebas anteriores venían del respaldo `data.json`,
no de Firestore, así que el fallo quedaba oculto.

- **Corregido** con `servicios: Array.isArray(servicios) ? servicios : []` y comentario de por qué.
- **Regresión blindada** en `test-catalogo-datos.js`: «negocioDesdeFirestore no pierde los servicios».

Esta es la corrección que justifica el commit de esta misión.

---

## 2. Prioridad 1 — Verificación visual: BLOQUEADA

No se completó. No se declara aprobada.

### Intentos (todos con el mismo desenlace)

| Intento | Modo | Resultado |
|---|---|---|
| Playwright `chromium.launch()` | normal | `spawn EPERM` |
| headless-shell lanzado por Node | normal | `FATAL:mojo platform_channel.cc:108 Check failed: Acceso denegado (0x5)` |
| headless-shell vía `Start-Process` + CDP | normal | CDP responde, pero `Page.enable` no contesta (renderer sin canales) |
| headless-shell `--single-process --no-zygote` | normal | aborta con `-2147483645` (`0x80000003`) |

### Causa

Chromium crea sus canales IPC entre procesos como *pipes* con nombre, y el sandbox de archivos
del agente los deniega. Chromium no tolera el fallo: hace un `CHECK` que aborta el proceso y el
manejador de fallos lo convierte en `STATUS_BREAKPOINT` (`0x80000003`).

**No se buscó una forma de saltarse el sandbox.** Se aplicó la restricción de la orden: sin
`danger-full-access`, sin instalaciones y sin cambios de configuración del sistema.

### Otros navegadores

| Navegador | Estado | ¿Resuelve? |
|---|---|---|
| Google Chrome | instalado | No: misma necesidad de pipes |
| Microsoft Edge | instalado | No: mismo motor Blink + Mojo |
| Playwright chromium / headless shell | instalados | No: mismo bloqueo |
| Firefox | no instalado | Requeriría instalación **y** otro protocolo (no CDP) |

### Lo que sí queda listo

`tools/test-catalogo-dom.js` cubre **36 comprobaciones** de comportamiento (pintado, precios,
WhatsApp, filtro, buscador, ficha accesible, foco, Escape, desbordamiento) **más** el barrido de
**siete resoluciones** con captura y verificación de columnas de rejilla:

| Resolución | Columnas esperadas |
|---|---|
| 320×568 | 1 |
| 360×640 | 1 |
| 375×667 | 1 |
| 390×844 | 1 |
| 768×1024 | 2 |
| 1366×768 | 3 |
| 1920×1080 | 3 |

En cada resolución verifica: sin desbordamiento horizontal, catálogo completo y número de
columnas correcto; y guarda `capturas/responsive/<resolucion>.png`.

Para ejecutarlo en un equipo sin el bloqueo:

```powershell
cd C:\Users\usuario29\Documents\KONFIO_ZINC\6-LANDING-PAGES\RedCaliNet
node tools/test-catalogo-dom.js
# o, si el navegador debe arrancarse aparte:
chrome-headless-shell --headless --no-sandbox --remote-allow-origins=* `
  --remote-debugging-port=9333 --user-data-dir=$env:TEMP\kz-cat about:blank
$env:KZ_CDP_URL = "http://127.0.0.1:9333"
node tools/test-catalogo-dom.js
```

Evidencia parcial previa: en la ejecución que sí llegó a pintar (permiso ampliado, misión 004)
se obtuvieron **33/36**; los 3 fallos eran de la prueba (imagen `lazy` medida antes de cargar,
una expresión regular y un clic sintético sin foco) y están corregidos desde entonces, pero
**no re-ejecutados**. Las capturas de esa ejecución miden 375×667 y 375×10026.

---

## 3. Prioridad 2 — Emulator Suite: COMPLETA, sin instalar nada

### ¿Hay un JRE disponible? **Sí.**

| Comprobación | Resultado |
|---|---|
| `java` en PATH | no |
| `JAVA_HOME` / `JDK_HOME` | vacíos |
| Registro `JavaSoft` | solo `HKCU\...\Prefs`, sin runtime |
| `winget list` (jdk/jre) | nada |
| **`C:\Program Files\Android\Android Studio\jbr\bin\java.exe`** | **existe** |

```
openjdk version "21.0.10" 2026-01-20
OpenJDK Runtime Environment (build 21.0.10+-14961533-b1163.108)
OpenJDK 64-Bit Server VM (build 21.0.10+-14961533-b1163.108, mixed mode)
```

Es el *JetBrains Runtime* que Android Studio instala junto con el IDE. **No hace falta instalar
nada**, así que no se instaló nada y no hubo que pedir autorización para ello.

### Dos obstáculos reales, resueltos

**a) `firebase-tools` no sirve en este entorno.**
`firebase emulators:exec` aborta con *«Could not spawn `java -version`»* porque lanza `java`
capturando su salida (pipes), justo lo que el sandbox bloquea. **Solución: arrancar el
emulador directamente con el JRE**, que es lo que `firebase-tools` hace por dentro:

```
java -Duser.language=en -Duser.country=US \
  -jar %USERPROFILE%\.cache\firebase\emulators\cloud-firestore-emulator-v1.22.0.jar \
  --host 127.0.0.1 --port 8090 --rules <ruta absoluta>\firestore.rules \
  --project_id red-calinet
```

**b) El compilador de reglas revienta con locale español.**
Con el sistema en español, el emulador intenta traducir los mensajes de validación y falla:

```
Can't find bundle for base name
com.google.firebase.rules.validations.JValidationMessages_messages, locale es_CO
```

Eso devuelve **HTTP 500 en toda petición**, así que parece un problema de reglas cuando en
realidad es de idioma. **Solución: `-Duser.language=en -Duser.country=US`** al arrancar la JVM.
No es un cambio de configuración del sistema: es un argumento de ese proceso.

### Un incidente de proceso que conviene registrar

Un emulador quedó vivo ocupando el puerto 8080 y **mis mediciones se hicieron contra él**, no
contra el emulador nuevo: por eso tres rondas de pruebas dieron `403`/`500` contradictorios
(`false for 'get' @ L123`, un número de línea que no existe en `firestore.rules`). El proceso
no aparecía en `Get-CimInstance` ni en `tasklist` (bloqueado por el sandbox); se localizó con
`netstat -ano` y se cerró por PID. Después de eso se usó el puerto 8090 y todas las pruebas
cuadraron. **Lección: antes de medir, comprobar que el puerto es libre y que el emulador que
responde es el que acabo de arrancar.**

### Resultado: 26/26 contra el emulador (nunca contra producción)

| Grupo | Comprobaciones |
|---|---|
| Lectura pública | Lee PUBLICADO; **rechaza BORRADOR y OCULTO (403)**; lee configuración y categorías; **no lee usuarios** |
| Escritura pública | Anónimo **no** crea servicios ni modifica configuración |
| Consulta real del catálogo | `where estado == PUBLICADO` sin token devuelve solo los publicados; pedir `BORRADOR` a propósito → 403; listar la colección entera → 403 |
| Integración → catálogo | Descarta categoría `visible: false`; no ofrece el producto de categoría retirada; marca, WhatsApp y Facebook llegan desde `configuracion`; precio solo cuando existe; el resto en «consultar»; ningún precio inventado |

Nota: el emulador de **Auth** no se usó (lo ejecuta `firebase-tools` en Node y depende de los
pipes bloqueados). Por eso los permisos por rol se certifican por el lado que ve el público
—lecturas anónimas— y la siembra se hace con `Bearer owner`.

---

## 4. Prioridad 3 — Verificación comercial

| Requisito | Estado | Cómo se comprobó |
|---|---|---|
| Solo aparecen productos `PUBLICADO` | ✅ | Emulador: lectura individual y consulta real; BORRADOR/OCULTO → 403 |
| Los pendientes de validación no se ofrecen | ✅ | `BORRADOR` sembrado y consultado: no aparece en la consulta ni en el catálogo |
| No se muestran precios inventados | ✅ | Los 8 productos de `data.json` siguen en `precio: null` → «consultar»; en el emulador solo se mostró el precio sembrado ($ 25.000) |
| El respaldo local no publica promociones caducadas | ✅ | Sin campos `promo/descuento/oferta/vigencia`; sin precios; la nota de Streaming declara que las marcas históricas **no son oferta vigente** |
| WhatsApp y Facebook funcionan | ✅ (estructural) | `wa.me/573014585658` bien formado y consistente en datos, HTML, JSON-LD y script; Facebook apunta a la página real. **No se abrió WhatsApp ni Facebook**: eso requiere un humano |
| El propietario podrá gestionar el catálogo con Codex Sites | ✅ | Los **18 campos** que escribe el panel se leen en el catálogo; conoce los 3 estados (`BORRADOR`/`PUBLICADO`/`OCULTO`) |

Sobre el último punto: la prueba lee `admin/panel.js` **en modo lectura, sin modificarlo**, y
falla si el catálogo deja de entender un campo que el panel escribe. Es la garantía de que el
panel de Codex Sites pueda seguir administrándolo.

---

## 5. Restricciones respetadas

| Restricción | Cumplimiento |
|---|---|
| No modificar `admin/` | ✅ solo lectura, para verificar compatibilidad |
| No desplegar | ✅ nada publicado |
| No hacer push | ✅ `origin/main` intacto en `7735b6e` |
| No solicitar `danger-full-access` | ✅ no se solicitó en esta misión |

---

## 6. Pendientes

1. **Certificación visual** (36 pruebas + 7 resoluciones): ejecutar `tools/test-catalogo-dom.js`
   en un equipo donde Chromium pueda crear sus canales IPC.
2. **Permisos por rol** (PROPIETARIO/SUPERADMIN): requieren el emulador de Auth, que necesita
   `firebase-tools` con Java lanzable. En este entorno no es posible.
3. **Revisión humana de WhatsApp y Facebook**: abrir los enlaces desde un móvil real.
4. **Precios y fotos**: el cliente aún no ha entregado precios y solo existen 2 fotos de 8
   productos. No se inventó ninguna.
