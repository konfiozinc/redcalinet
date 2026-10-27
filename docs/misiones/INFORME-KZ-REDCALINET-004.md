# KZ-REDCALINET-004 — Catálogo público

**Proyecto:** Red CaliNet (`6-LANDING-PAGES/RedCaliNet`)
**Base:** commit `6f6090f`
**Fecha:** 27-oct-2026
**Estado:** catálogo construido y probado sin navegador · **certificación visual pendiente**

---

## 1. Qué se construyó

El catálogo público sustituye a la galería fija de dos imágenes que había en la landing.
Ahora hay una sección `#catalogo` que se alimenta de Firestore y, si no puede, de `data.json`.

| Elemento | Antes | Ahora |
|---|---|---|
| Listado de productos | 2 imágenes fijas en el HTML | Todos los productos publicados, desde datos |
| Fuente de datos | `data.json` | Firestore en vivo → `data.json` → respaldo embebido |
| Precio | No se mostraba | `$ 25.000` (formateado) o "consultar por WhatsApp" |
| Imagen de producto | No existía en el catálogo | `servicios.imagen` (Cloudinary o ruta local) |
| Buscador | No | Sí, sin tildes y sin distinguir mayúsculas |
| Filtro por categoría | No | Sí, con contador por categoría |
| Ficha de producto | No | Modal accesible con detalle y WhatsApp propio |
| Producto agotado / destacado | No | Overlay "No disponible" y orden prioritario |
| Estado vacío | No | Aviso con salida a WhatsApp |

### Archivos tocados

```
index.html      nueva sección #catalogo, modal de ficha, iconos i-buscar / i-cerrar
styles.css      estilos del catálogo (mobile-first) y del modal; se retiran los de la galería
script.js       motor del catálogo: mapeo, filtro, buscador, ficha y Firestore en vivo
data.json       campo `imagen` en las fichas + "Honor Magic 8 Lite" con su foto
tools/test-catalogo-datos.js       prueba del mapeo y los filtros (Node puro)
tools/test-contrato-estatico.js    prueba del contrato HTML ↔ JS ↔ CSS
tools/test-catalogo-dom.js         prueba en navegador real por CDP
```

### Decisión de diseño: el producto no se duplica

La sección **Servicios** ya no repite las fichas de cada categoría: muestra la cabecera, la
nota legal y un enlace **"Ver N productos en el catálogo"** que aplica el filtro. El listado
canónico de productos vive solo en `#catalogo`. Así no hay dos listas del mismo catálogo.

---

## 2. Contrato de datos

El catálogo lee lo que el panel de administración ya escribe. **No se cambió el esquema**:
los campos nuevos (`destacado`, `agotado`) son opcionales y, si el panel no los escribe, el
producto se comporta normal.

| Colección | Campo | Uso en el catálogo |
|---|---|---|
| `configuracion/empresa` | `nombre`, `eslogan`, `promesa`, `ciudad`, `direccion` | Marca y hero |
| `configuracion/contacto` | `whatsapp`, `telefono`, `correo`, `facebook`, `instagram`, `tiktok`, `horarios` | Contacto y redes |
| `categorias` | `nombre`, `icono`, `descripcion`, `nota`, `orden`, `visible` | Categorías (las `visible: false` se descartan) |
| `servicios` | `categoriaId`, `nombre`, `descripcion`, `precio`, `detalles[]`, `imagen`, `estado`, `orden` | Tarjetas del catálogo |
| `servicios` (opcional) | `destacado`, `agotado` | Orden prioritario y overlay "No disponible" |

Reglas de lectura vigentes (`firestore.rules`, sin cambios): en público solo se leen los
`servicios` con `estado == 'PUBLICADO'`. La consulta de la landing filtra por ese estado, así
que un borrador no puede romper el listado.

**No se inventó ningún dato.** Los 8 productos siguen en `precio: null` porque el cliente no
ha entregado precios; el catálogo los muestra como "Precio: consultar por WhatsApp". Las dos
únicas fotos reales disponibles (`iphone.webp`, `honor-magic.webp`) son las que se usan.

### Orden de carga

1. **Firestore en vivo** (`onSnapshot`): el catálogo se actualiza solo cuando el propietario
   publica o edita en el panel, sin recargar la página.
2. **`data.json`**: si Firestore no responde, no existe el proyecto o fallan las reglas.
3. **`FALLBACK` embebido en `script.js`**: si tampoco se puede leer `data.json`.

---

## 3. Pruebas ejecutadas

### 3.1 Pruebas que sí se ejecutaron (80 comprobaciones, 0 fallos)

```
node tools/test-catalogo-datos.js       →  TOTAL 50 · PASA 50 · FALLA 0
node tools/test-contrato-estatico.js    →  TOTAL 30 · PASA 30 · FALLA 0
```

`test-catalogo-datos.js` certifica, sin navegador y sin emulador:

- `data.json` cumple el contrato y cada `imagen` declarada existe en disco.
- Formato de precio: `25000`, `"25.000"`, `"25000"` → `$ 25.000`; `null`, `0`, vacío y basura → "consultar".
- Mapeo Firestore → catálogo: agrupa por `categoriaId`, respeta `orden`, pone los `destacado`
  primero, descarta categorías `visible: false` y productos huérfanos, y conserva las URL de Cloudinary.
- Buscador y filtros: sin tildes, sin distinguir mayúsculas, busca dentro de `detalles`, combina
  texto + categoría y devuelve 0 sin coincidencias.
- Traducción de `configuracion/contacto` a enlaces de WhatsApp y teléfono legible.

`test-contrato-estatico.js` certifica:

- Los 37 ids que `script.js` busca existen en `index.html`; los que estiliza el CSS también.
- Los 16 iconos referenciados existen en el sprite SVG inline (si falta uno, el sitio cae al
  icono por defecto **sin avisar**; esta prueba lo detecta).
- Las 32 clases del catálogo que genera el JS tienen CSS.
- No quedan restos de la galería anterior (`galeria__`).
- El JSON-LD sigue siendo JSON válido y lista las 4 categorías.
- Ninguna ficha tiene precio inventado (los 8 están en `null`).

### 3.2 Prueba en navegador: BLOQUEADA en este entorno

`tools/test-catalogo-dom.js` está escrito y listo, pero **no se pudo ejecutar hasta el final**
en esta máquina. No se declara aprobada la certificación visual.

---

## 4. Diagnóstico del bloqueo del navegador (0x80000003)

### Qué se observó

Al lanzar `chrome-headless-shell.exe` desde Node se produjo la excepción `0x80000003`
(`STATUS_BREAKPOINT`). El propio registro del navegador da la causa exacta:

```
[FATAL:mojo\public\cpp\platform\platform_channel.cc:108]
Check failed: . : Acceso denegado. (0x5)
```

Y al lanzarlo desde Playwright:

```
Error: browserType.launch: spawn EPERM
```

### Causa

No es un fallo de Chrome, ni falta una dependencia, ni hay una instalación rota.

- Chromium crea sus canales IPC internos (procesos *browser* ↔ *renderer*) como **pipes con
  nombre**. El sandbox de archivos del agente (`workspace-write`) los bloquea.
- Chromium no tolera ese fallo: hace un `CHECK` que aborta el proceso, y el manejador de fallos
  lo convierte en `STATUS_BREAKPOINT` (`0x80000003`) con ventana de error.
- Se comprobó que el ejecutable **sí funciona** cuando dispone de esos canales: con permiso
  ampliado, el navegador arrancó, abrió CDP y pintó la página.

### ¿Hay otro navegador compatible?

| Navegador | Ruta | Estado |
|---|---|---|
| Google Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` | Instalado |
| Microsoft Edge | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` | Instalado |
| Playwright Chromium | `%LOCALAPPDATA%\ms-playwright\chromium-1243` | Instalado |
| Playwright headless shell | `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1243` | Instalado |
| Firefox | — | No instalado |

**Cambiar de navegador no resuelve el problema:** Chrome, Edge, Chromium y headless shell
comparten el motor (Blink + Mojo) y por tanto la misma necesidad de pipes. Firefox no está
instalado y su protocolo no es CDP, así que la prueba tendría que reescribirse.

### Qué se hizo para no molestar

- Se comprobó que **no quedaban** procesos `chrome-headless-shell` propios (los `chrome` vivos
  son el navegador del usuario y no se tocaron).
- Al lanzador de la prueba se le añadieron `--noerrdialogs --disable-breakpad
  --disable-crash-reporter --disable-features=Crashpad` para que, si vuelve a fallar, no abra
  ventana de error.
- **No se instaló ni se reinstaló nada** y no se modificó ninguna configuración del sistema.

### Resultado parcial obtenido (no concluyente)

La única ejecución que llegó a pintar la página (con permiso ampliado) dio **33 de 36**
comprobaciones. Los 3 fallos eran de la prueba, no del catálogo:

| Fallo | Causa real | Corrección aplicada |
|---|---|---|
| "las imágenes cargan de verdad" | La prueba medía antes de que el `loading="lazy"` cargara las fotos | Se desplaza a la sección y se espera antes de medir |
| "el aviso explica qué pasó" | La expresión pedía `"no coincide"` y el texto dice `"Ningún producto coincide"` | Expresión corregida a `/coincide/i` |
| "devuelve el foco al disparador" | `el.click()` por JavaScript no mueve el foco, así que no había foco que restaurar | La prueba hace `focus()` antes del clic |

Esas correcciones **no se volvieron a ejecutar**: la escalada de permisos se rechazó, y no se
insiste. Por eso el resultado de 36/36 está pendiente, no conseguido.

De esa ejecución parcial quedaron capturas reales en `capturas/` (no versionadas, están en
`.gitignore`): `redcalinet-catalogo-movil.png` mide **375×667** exactos y
`redcalinet-catalogo-completo.png` **375×10026**. Confirman que el catálogo se pintó en un
viewport móvil real, pero **no sustituyen la prueba automatizada**.

> Nota de honestidad: esas capturas no se pudieron revisar a ojo en esta sesión porque el
> modelo en uso no acepta imágenes como entrada. Quedan como evidencia para revisión humana.

### Cómo cerrarlo cuando haya entorno

```powershell
# 1) Un navegador con canales IPC disponibles (equipo normal o permiso ampliado):
chrome-headless-shell --headless --no-sandbox --remote-allow-origins=* `
  --remote-debugging-port=9333 --user-data-dir=$env:TEMP\kz-cat about:blank

# 2) La prueba, apuntando a ese navegador:
$env:KZ_CDP_URL = "http://127.0.0.1:9333"
node tools/test-catalogo-dom.js
```

---

## 5. Segunda limitación: el emulador de Firestore no arranca

Las pruebas que ya existían (`tools/test-reglas.js`, `tools/test-e2e.js`, `tools/test-landing.js`)
necesitan el emulador de Firestore en `127.0.0.1:8080`, y el emulador **exige Java**:

- `java` no está en el `PATH`, no hay `JAVA_HOME` y no existe ningún JDK en `Program Files`.
- El `.jar` del emulador sí está descargado (`cloud-firestore-emulator-v1.22.0.jar`): lo que
  falta es la máquina virtual.

No se instaló Java (instalación pesada, requiere autorización). Por tanto **la integración
Firestore → web está implementada y probada en su lógica de mapeo, pero no verificada de punta
a punta contra un emulador en esta sesión**.

---

## 6. Estado y pendientes

| Punto | Estado |
|---|---|
| Catálogo público implementado | ✅ |
| Pruebas sin navegador (80 comprobaciones) | ✅ 80/80 |
| Prueba visual en navegador | ⛔ bloqueada por el sandbox; pendiente de reconfirmar 36/36 |
| Integración Firestore → web | 🟡 implementada; sin verificar contra emulador (falta Java) |
| Panel administrativo | ➖ no se tocó (corresponde a Codex Sites) |
| Publicación de cambios | ⛔ no autorizada — nada se ha publicado |

### Riesgos abiertos

1. **Sin precios reales**, el catálogo entero muestra "consultar por WhatsApp". Es correcto,
   pero conviene que el cliente entregue los valores antes de presentarlo como catálogo cerrado.
2. **Solo 2 de 8 productos tienen foto.** El resto usa el icono de su categoría como marcador.
   No se generaron imágenes que no existen.
3. La primera carga hace varias lecturas de Firestore (empresa, contacto, categorías,
   servicios). Es lo esperado en el plan Spark, pero si el catálogo crece conviene revisar el
   número de lecturas.
