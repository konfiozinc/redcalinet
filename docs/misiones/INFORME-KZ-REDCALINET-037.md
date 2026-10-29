# INFORME KZ-REDCALINET-037 — Panel administrativo utilizable desde el teléfono

| Dato | Valor |
|---|---|
| Rama | `integracion/panel-codex` |
| Punto de partida | `1a296bc` (KZ-036, Fotografías y Videos separados) |
| Commits de esta misión | `334e2a1` (refactor + correcciones) y el commit de pulido y documentos que cierra KZ-037 |
| Fecha | 28-oct-2026 |
| Alcance | Local y emuladores. **Sin despliegue, sin push, sin tocar producción** |
| Respaldo | `_respaldos/redcalinet/2026-10-28-kz-037/integracion-panel-codex.bundle` (verificado) |

---

## 1. Qué se pidió y qué se entregó

| Pedido | Entregado |
|---|---|
| Formularios claros y organizados | Formulario de productos y servicios partido en 5 bloques con título; los campos de uso poco frecuente quedan en «Más detalles (opcional)», plegado |
| Edición sencilla de nombre, descripción, categoría, precio, disponibilidad y existencias | Todo eso vive en los dos primeros bloques, con ayuda en cada campo y `inputmode` numérico para el teclado del teléfono |
| Selección de fotografías y videos | Rejilla de miniaturas que se toca (antes: lista múltiple que exige mantener pulsado), con portada marcada, reordenación, y subida sin salir de la ficha |
| Acciones intuitivas para guardar, publicar y ocultar | Barra fija al pie de la ficha (siempre visible) + acciones inmediatas en cada fila del listado |
| Validaciones comerciales intactas | El payload y las reglas del Worker no cambian: publicar sigue exigiendo sello comercial y fuente; el servidor lo impone igual que antes |
| Fotografías y Videos independientes | Se conservan, y el archivo recién subido aparece primero en su sección |
| Todos los módulos administrativos | Los 13 siguen ahí, ahora agrupados en 5 bloques (Resumen, Catálogo, Contenido, Empresa, Sistema) |
| Uso desde celulares | Medido en 375×667: zonas táctiles ≥44 px, menú deslizable, barra de acciones siempre visible, sin desbordes en 8 secciones |
| Refactorización segura y limitada al editor | El editor pasa de un archivo de 43 KB a 17 módulos con una responsabilidad cada uno; comportamiento idéntico |

---

## 2. El problema del código y cómo se resolvió

El editor vivía en `admin/src/app.js`: **116 líneas** para toda la aplicación, pero con plantillas de hasta **3 181 caracteres en una sola línea** (promedio de 376 caracteres por línea). Cualquier cambio exigía sustituir cadenas larguísimas, y una sustitución fallida rompía la compilación.

Ahora:

| Módulo | Líneas | Responsabilidad |
|---|---|---|
| `nucleo/estado.js` | 104 | Estado compartido y utilidades de formato. No importa nada |
| `nucleo/api.js` | 99 | Única puerta al Worker: token, generación de sesión, idempotencia, subida firmada |
| `nucleo/pintar.js` | 91 | Acceso, armazón, menú agrupado y capa modal |
| `vistas/tabla.js` | 61 | Listados, filtros y acciones por fila |
| `vistas/multimedia.js` | 48 | Fotografías y Videos |
| `vistas/dashboard.js`, `configuracion.js`, `auditoria.js`, `index.js` | 20–48 | Tablero, configuración, auditoría y selector de vista |
| `editor/campos.js` | 20 | Primitivas de formulario |
| `editor/catalogo.js` | 76 | Formulario de productos y servicios + su payload |
| `editor/publicacion.js` | 48 | Bloque de publicación y lista de comprobación |
| `editor/medios.js` | 93 | Selector visual de fotografías y videos |
| `editor/otros.js` | 112 | Categorías, promociones, archivos, usuarios, configuración |
| `editor/index.js` | 329 | Ciclo de vida del editor: abrir, pintar, validar, guardar, subir |
| `acciones.js` | 220 | Cableado único de eventos |
| `app.js` | 37 | Arranque |

**Promedio de 60 caracteres por línea** (antes 376) y **ningún archivo por encima de 329 líneas**. La compilación con Vite pasa de 16 a 32 módulos sin errores ni advertencias.

Riesgo controlado: no se reescribió lógica. Cada función conserva su comportamiento, sus rutas y su payload; lo que cambió es dónde vive.

---

## 3. Cambios de experiencia

### Productos y servicios
- **Bloque 1 · Lo esencial:** nombre, categoría y descripción.
- **Bloque 2 · Precio y existencias / Precio y disponibilidad:** precio en COP («vacío = Consultar por WhatsApp, no cero»), disponibilidad, existencias («vacío = no confirmado, no cero»), agotado y destacado.
- **Bloques 3 y 4 · Fotografías y Videos:** selector visual.
- **Más detalles (opcional):** especificaciones, variantes, características, orden y portada por URL, plegado.
- **Bloque 5 · Publicación:** estado, sello comercial, fuente y lista de comprobación en vivo.

Al pulsar «Publicar ficha» sin el sello, el panel **no publica nada**: lleva a la sección de publicación y explica exactamente qué falta. La regla del servidor no se relajó.

### Publicar u ocultar sin abrir el formulario
Cada fila del listado tiene ahora su acción inmediata:
- Productos, servicios y promociones: **Publicar** u **Ocultar** (según su estado).
- Categorías: **Mostrar** u **Ocultar**.

### Fotografías y Videos
- Siguen siendo dos secciones independientes.
- Lo recién subido aparece **primero** en su sección (orden por fecha de creación descendente).
- Cada tarjeta avisa si a una imagen le falta el texto alternativo, porque sin él no puede publicarse.
- Publicar u ocultar el archivo se hace desde la tarjeta, y también desde la propia ficha que lo usa.

### Navegación
- Menú agrupado en cinco bloques con título; los 13 módulos intactos.
- En el teléfono el menú se desliza, cierra al elegir un módulo y deja libre el resto de la pantalla.

---

## 4. Lo que NO se tocó

| Elemento | Estado |
|---|---|
| Reglas v3 de Firestore | Sin cambios (`firestore.rules` intacto) |
| Roles y permisos | Sin cambios: `PROPIETARIO` / `SUPERADMIN`, y el Worker sigue siendo la única puerta de escritura |
| Auditoría | Sin cambios y verificada: cada guardado de la prueba dejó su entrada (`CREAR`, `MODIFICAR_PRECIO`) con actor y precio anterior/nuevo |
| Integración con Cloudinary | Sin cambios en la firma ni en el registro. El formulario que viaja al proveedor es exactamente el mismo |
| Infraestructura de producción | Sin despliegue; el Worker de producción sigue sirviendo la versión anterior |
| Datos existentes | Sin tocar: producción no se consultó ni se escribió |

El único cambio fuera del panel es una corrección en el **adaptador local de carga** (`src/multimedia.mjs`, función `guardarQA`, que solo existe con `MODO_EMULADOR=1`). Ver §5.

---

## 5. Errores encontrados y corregidos

1. **Los videos no se podían subir en local.** El formulario que va al proveedor no lleva el campo `tipo` —añadirlo alteraría los parámetros firmados de Cloudinary—, así que el adaptador local asumía siempre `image` y rechazaba cualquier `.mp4` con «Extensión de archivo no permitida». Ahora deduce el tipo de la extensión ya validada. **La ruta de producción (Cloudinary) no se modificó.**
2. **Comprobación obsoleta en `test/worker-025.mjs`.** Desde KZ-035 la firma se emite sobre el nombre, no sobre la ruta, así que la prueba de «firma falsificada» recibía `400` (ruta no autorizada) en lugar de `403` (firma inválida) — y llevaba desde entonces en rojo. Se separaron las dos garantías, que ahora se comprueban por separado y las dos pasan:
   - archivo fuera de la carpeta autorizada → `400`;
   - firma falsificada sobre la ruta correcta → `403`.
3. **La rejilla de miniaturas crecía con la biblioteca.** Con 12 archivos medía 740 px y empujaba las acciones fuera de la vista. Ahora se limita a dos filas con desplazamiento propio (212 px) y muestra un resumen plegado cuando la ficha ya tiene archivos.

---

## 6. Verificación

### Suites (todas en verde)

| Suite | Comprobaciones | Resultado |
|---|---|---|
| `test/worker-025.mjs` — API, permisos, auditoría, idempotencia, multimedia | 29 | **29/29** |
| `test/interfaz-025.mjs` — panel servido por el Worker, escritorio y móvil | 7 | **7/7** |
| `test/concurrencia-026.mjs` — testigos de concurrencia | 4 | **4/4** |
| `test/recorrido-037.mjs` — recorrido completo de 10 pasos (nueva) | 31 | **31/31** |
| `test/diseno-037.mjs` — medidas de diseño táctil y contraste (nueva) | 12 | **12/12** |
| **Total** | **83** | **83/83** |

Cada paso del recorrido se comprueba dos veces: en la pantalla y en la API. Una interfaz que «parece» funcionar no puede dar por buena una escritura que no ocurrió.

### Los diez pasos obligatorios

| # | Paso | Cómo se comprobó | Estado |
|---|---|---|---|
| 1 | Crear y editar productos | Alta desde el formulario → aparece en la API en `BORRADOR`; edición reabriendo la ficha | ✅ |
| 2 | Modificar precios y existencias | Cambio a 49 900 / 7 desde la ficha; la API lo refleja y el inventario los muestra | ✅ |
| 3 | Administrar categorías | Alta de categoría y ocultar/mostrar desde la fila, con la API como testigo | ✅ |
| 4 | Subir fotografías y videos | PNG y MP4 reales por el adaptador local; cada uno aparece **solo** en su sección | ✅ |
| 5 | Asociarlos a productos y servicios | Selección en la ficha → `imagenes`/`videos` guardados; la ficha informa dónde se usa el archivo | ✅ |
| 6 | Guardar borradores | El borrador **no** aparece en `public/catalogo` | ✅ |
| 7 | Publicar solo fichas de prueba autorizadas | Se publican los archivos y después la ficha de prueba; aparece en el catálogo público. Publicar sin sello se rechaza con aviso | ✅ |
| 8 | Ocultar las fichas de prueba | Ocultar desde la fila → sale del catálogo público y sigue administrable en el panel | ✅ |
| 9 | Comprobar permisos | El `PROPIETARIO` no ve Usuarios ni Auditoría y la API le responde `403`; sigue editando catálogo | ✅ |
| 10 | Interfaz en móvil y escritorio | 375×667 y 1440×900, 8 secciones sin desbordes, capturas guardadas | ✅ |

Las fichas creadas son datos ficticios del emulador (`demo-redcalinet-admin`). **No se publicó nada en producción.**

### Medidas de diseño (antes → después)

| Medida | Antes (`1a296bc`) | Después |
|---|---|---|
| Alto de la ficha (escritorio 1440×900) | 2 204 px | 2 303 px (+4,5 %) |
| Alto de la ficha (móvil 375×667) | 2 624 px | 2 800 px (+6,7 %) |
| Acciones de guardar visibles sin desplazar | **no** | **sí** (barra fija) |
| Bloques con título en el formulario | 0 | 5 |
| Selector de medios | lista múltiple | rejilla táctil de miniaturas |
| Crecimiento del formulario con la biblioteca | sin límite | acotado (rejilla de 2 filas) |

El formulario es algo más alto porque muestra miniaturas, ayudas por campo y la lista de comprobación; la contrapartida es que las acciones ya no se pierden al final y que los campos de uso poco frecuente están plegados.

### Medidas táctiles y de contraste

- Todas las entradas del menú miden **≥44 px** de alto.
- Todos los campos del formulario miden **≥44 px** (ninguno por debajo de 40).
- La barra de acciones permanece a la vista al desplazar la ficha y no se sale del ancho de pantalla.
- La lista de comprobación se lee con **≥11 px** y contraste **≥4,5:1**.

---

## 7. Evidencia visual

Capturas generadas por las pruebas (no versionadas por la política del repositorio, `capturas/` y `.runtime/` están en `.gitignore`):

```
redcalinet/admin-worker/.runtime/recorrido-037/
  movil-fotografias.png   movil-videos.png      movil-productos.png
  movil-editor.png        escritorio-dashboard.png
  escritorio-productos.png escritorio-editor.png

redcalinet/admin-worker/.runtime/comparativa-037/
  antes-movil-ficha.png        despues-movil-ficha.png
  antes-movil-listado.png      despues-movil-listado.png
  antes-escritorio-ficha.png   despues-escritorio-ficha.png
  antes-escritorio-productos.png despues-escritorio-productos.png
```

Copia fuera del repositorio: `docs/evidencias/kz-redcalinet-037/`.

Las capturas «antes» se tomaron compilando temporalmente el `admin/src` del commit `1a296bc` y se restauró el código nuevo inmediatamente después (verificado con `git status` limpio y con la suite `interfaz-025` en verde).

---

## 8. Cómo ejecutar la verificación

```powershell
# 1. Emuladores (Java: se usó el que trae Android Studio, sin instalar nada)
cd admin
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"
node node_modules\firebase-tools\lib\bin\firebase.js emulators:start --only auth,firestore `
  --project demo-redcalinet-admin --config emulators\firebase.json
# 2. Datos ficticios de QA (una vez)
$env:RCL_MODE="emulator"; $env:GCLOUD_PROJECT="demo-redcalinet-admin"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
node scripts\bootstrap-emulator.mjs
# 3. Panel compilado + Worker
npm run build; cd ..\redcalinet\admin-worker; node scripts\preparar-panel.mjs
node node_modules\wrangler\bin\wrangler.js dev --port 8787 --ip 127.0.0.1
# 4. Pruebas
$env:RCL_CHROMIUM="$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe"
node test\worker-025.mjs; node test\interfaz-025.mjs; node test\concurrencia-026.mjs
node test\recorrido-037.mjs; node test\diseno-037.mjs
```

Cuentas de QA: `superadmin@rcl.example.test` y `admin@rcl.example.test`, contraseña `RCL-Only-QA-2026!`.

---

## 9. Respaldo recuperable

```
_respaldos/redcalinet/2026-10-28-kz-037/integracion-panel-codex.bundle   3 291 952 bytes
```

`git bundle verify` → *«The bundle records a complete history»*, con `refs/heads/integracion/panel-codex` en `334e2a1`.

Para recuperar en cualquier otro equipo:

```powershell
git clone _respaldos/redcalinet/2026-10-28-kz-037/integracion-panel-codex.bundle redcalinet-recuperado
cd redcalinet-recuperado
git checkout integracion/panel-codex
```

Volver al estado anterior del panel, si hiciera falta:

```powershell
git checkout 1a296bc -- admin/src/app.js admin/src/style.css
cd admin; npm run build; cd ..\redcalinet\admin-worker; node scripts\preparar-panel.mjs
```

---

## 10. Estado final

- Rama `integracion/panel-codex` con los commits de KZ-037 encima de `1a296bc`.
- Árbol de trabajo limpio.
- **Sin push**: el repositorio remoto no se tocó (el panel publicado sigue siendo la versión anterior).
- **Sin despliegue**: no se ejecutó `wrangler deploy` ni se modificó ningún recurso de producción.
- Panel compilado en `redcalinet/admin-worker/public/admin/` (artefacto local, no versionado).

## 11. Bloqueos

Ninguno técnico. Para publicar cuando el propietario lo autorice:

1. `node scripts/preparar-panel.mjs` (ya hecho) y `wrangler deploy --env produccion`.
2. Verificar `GET /admin/api/bootstrap` (`local:false`).
3. Revisar el panel publicado en un teléfono real antes de avisar al propietario.

No se despliega ahora porque la instrucción fue explícita: **no desplegar todavía**.
