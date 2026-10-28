# Informe de aceptación — KZ-REDCALINET-019

**Fecha:** 28-oct-2026
**Rama:** `integracion/panel-codex` (local, sin push)
**Base:** `0961546` · **Fuente:** INFORME-KZ-REDCALINET-018
**Alcance:** corregir los cuatro problemas de usabilidad detectados. Sin rediseño general.

---

## 1. Qué se corrigió

### 1.1 Legibilidad de los encabezados de tabla

| | Antes | Después |
|---|---|---|
| Tamaño | 9 px | **11 px** |
| Color | `#7b8ba1` | `#55677f` |
| Contraste medido | **3.35:1** (no cumple AA) | **5.58:1** (cumple AA) |
| Interletraje / peso | 1 px / 600 | 0.6 px / 700 |

El tamaño queda alineado con el resto del sistema tipográfico (10-12 px) y el contraste se
midió en el navegador, no se estimó a ojo.

### 1.2 Área táctil de las acciones de fila

| Vista | Antes | Después |
|---|---|---|
| Teléfono (390) | 35×59 px | **44×120 px** |
| Escritorio (1440) | 35×60 px | **44×60 px** |

Crece la superficie, no el texto: el rótulo «Editar» mantiene su tamaño. Se compensó el
relleno de celda (de 16/20 a 12/16 px) para que las filas no se estiren.

### 1.3 Tablas en teléfono, como tarjetas

- **Escritorio y tableta: la tabla se conserva** exactamente como estaba (cabecera visible,
  4 columnas, mismo orden).
- **Por debajo de 760 px** cada fila se lee como tarjeta: nombre en grande, y cada dato con
  su etiqueta tomada del propio `data-label` de la celda (`ESTADO`, `PRECIO`,
  `EXISTENCIAS`, `VIGENCIA`, `ROL`, `ACCESO`, `TIPO`). Las cuatro celdas siguen presentes:
  **no se oculta ningún dato**.
- La tabla ya no necesita desplazamiento horizontal: se anula su `min-width` y el
  contenedor deja de recortar.

### 1.4 Auditoría en bloques de 25

| | Antes | Después |
|---|---|---|
| Entradas en pantalla | 100 | **25** |
| Paginador | ausente | **«Registros 1–25 de 100 cargados · página 1 de 4»** |
| Orden cronológico | **no** (el API pagina por id de documento) | **sí, más reciente primero** |
| Página siguiente | — | cambia el contenido y mantiene 25 |
| Alcanzable con Tab | no | **sí, 15 Tabs, con foco visible** |

Se conservan los cinco datos pedidos en cada entrada —operación, identificador del
registro, fecha, actor y campos— y el botón «Cargar 100 registros más» para traer los
siguientes bloques. La consulta es de solo lectura: **no se borra ni se modifica ninguna
entrada de auditoría**.

## 2. Verificación en las seis resoluciones

36 combinaciones medidas (6 módulos con tabla × 320×640, 375×667, 390×844, 768×1024,
1024×768, 1440×900):

| Comprobación | Resultado |
|---|---|
| Encabezado a 11 px | 36/36 |
| Acciones de fila ≥44 px de alto y de ancho | 36/36 |
| Tarjeta en teléfono y tabla desde tableta | 18/18 y 18/18 |
| Desbordamiento de página | **ninguno**, 36/36 |
| Excepciones de JavaScript | ninguna |

## 3. Regresión

| Suite | Resultado |
|---|---|
| `test/integration.mjs` | 45/45 |
| `test/browser.mjs` | 80/80 |
| `test/ui-failures.mjs` | 10/10 |
| `test/session-isolation.mjs` | 7/7 |
| `test/contract-ui.mjs` | 8/8 |
| `test/revision-015.mjs` | 16/16 |
| `test/revision-018.mjs` | **16/16 pasos y 0 problemas** (antes: 18 problemas) |

La revisión 018 cerrando en cero es la comprobación más directa del arreglo: los 18
problemas que había contado eran exactamente los encabezados de 9 px en seis módulos y
tres resoluciones.

**Roles y permisos intactos:** con la cuenta PROPIETARIO el menú sigue mostrando 10
entradas, sin «Usuarios y permisos» ni «Auditoría»; esas dos vistas siguen siendo de
SUPERADMIN, antes y después del cambio.

## 4. Límite que debo declarar

El API devuelve la auditoría ordenada por **id de documento**, no por fecha, y no se tocó
(restricción de la misión). Por eso:

- El orden cronológico se aplica **en el panel, sobre los registros ya cargados**. Con los
  100 iniciales, paginar en bloques de 25 es correcto y verificable.
- Los bloques que se traigan con «Cargar 100 registros más» se reordenan con el resto al
  llegar, así que la vista sigue siendo cronológica sobre lo cargado. Lo que no puede
  garantizar el cliente es la posición relativa frente a registros **que aún no se han
  pedido**: para eso habría que paginar por fecha en el servidor, y eso es un cambio de
  API que esta misión no autoriza.

## 5. Archivos modificados

| Archivo | Cambio |
|---|---|
| `admin/src/app.js` | Etiquetas de celda (`data-label`), paginación de auditoría (25), acción `audit-page`, reinicio de página al entrar en Auditoría |
| `admin/src/style.css` | Encabezado 11 px y contraste AA, relleno de celda, `td button` 44×44, tarjetas en teléfono, estilos del paginador |
| `admin/test/revision-019.mjs` | Nuevo: mide los cuatro arreglos en 6 resoluciones y sirve para antes/después |

No se tocó el acceso (KZ-016/017), el Dashboard, la API, Firebase, las reglas ni el
catálogo público. Solicitudes sigue sin implementarse, como estaba.

## 6. Capturas

40 imágenes en `_respaldos/redcalinet/2026-10-28-kz-019/capturas/` — **20 del antes y 20
del después** de los seis módulos con tabla en 320, 375 y 390 px, más la auditoría en
1440 y 390. Índice en `INDICE-CAPTURAS.md` de esa carpeta.

## 7. Dictamen

**Aceptado.** Los cuatro problemas están corregidos y medidos: encabezados legibles con
contraste AA, acciones de 44×44, tarjetas en teléfono sin perder ningún dato, y auditoría
en bloques de 25 con orden cronológico y navegación por teclado. Sin regresiones en las
siete suites y sin excepciones de JavaScript.

**Riesgo residual aceptado:** el orden cronológico completo de la auditoría depende de la
API, que pagina por id. Se resuelve el día que se autorice paginar por fecha en el
servidor.

---

*Sin push, sin merge, sin despliegue, sin datos reales, sin Blaze, sin Cloudinary.
Los datos de prueba viven en el emulador y desaparecen al reiniciarlo.*
