# KZ-REDCALINET-007 — Refinamiento visual y comercial

**Proyecto:** Red CaliNet (`6-LANDING-PAGES/RedCaliNet`)
**Base:** commit `01fe213`
**Fecha:** 27-oct-2026
**Resultado:** refinamiento aplicado · **229 comprobaciones en verde** · comparativa antes/después con capturas reales

---

## 1. Resumen

Se elevó la calidad visual y comercial **sin reconstruir el catálogo**: misma arquitectura, mismos
datos, mismos filtros y las mismas restricciones de publicación. El entorno pasó a permitir
Chromium durante esta misión, así que además se **cerró la certificación visual** que quedó
pendiente en la misión 006.

| Prueba | Antes de esta misión | Ahora |
|---|---|---|
| Datos y mapeo | 51/51 | 51/51 |
| Contrato estático | 49/49 | 49/49 |
| Reglas + integración (emulador) | 26/26 | 26/26 |
| **Navegador real · 7 resoluciones** | ⛔ bloqueada | ✅ **103/103** |
| **Total** | 126 | **229** |

---

## 2. Las diez mejoras

### 1. Hero con propuesta comercial
Se añadieron dos bloques que antes no existían, ambos derivados de datos reales (nada inventado):

- **Tres razones** — «Servicio garantizado · Punto físico en Bello · Atención por WhatsApp».
  Salen de `marca.promesa`, `marca.ciudad` y del WhatsApp configurado.
- **Fila de contacto directo** — WhatsApp y Facebook como pastillas pulsables en el propio hero.
- El CTA secundario pasa de «Ver servicios» a **«Ver catálogo»**: apunta a la sección que vende.

### 2. Presentación de productos y servicios
Cada tarjeta tiene ahora una línea de metadatos (categoría + tipo) y un cuerpo con jerarquía
clara: título → descripción acotada a 3 líneas → precio destacado → detalles → acciones.

### 3. Portadas de servicios
**No se inventó ninguna fotografía.** Lo que no tiene foto real recibe una **portada gráfica de
marca**: fondo azul profundo, halo y trama de puntos, con el icono de su categoría en un disco.
Es un recurso declarado, no una simulación de producto.

| | Antes | Ahora |
|---|---|---|
| Con foto real | 2 | 2 |
| Con portada gráfica | 0 | **6** |
| Con un icono suelto («portada vacía») | 6 | **0** |

### 4. Tipografía, jerarquía y legibilidad
El precio de la tarjeta estaba siendo pisado por la regla genérica `.ficha > p`, que lo dejaba en
gris y a 14,72 px. Ahora tiene regla propia y gana la cascada.

| Elemento | Antes | Ahora |
|---|---|---|
| Título | 1,06 rem · sin interlineado declarado | **1,14 rem** (1,18 rem ≥900px) · interlineado 1,25 |
| Descripción | heredaba `.92rem` sin interlineado | **.9 rem · interlineado 1,55** · recorte a 3 líneas |
| Precio | 14,72 px en gris de texto secundario | **15,2 px · peso 800** · azul de marca |
| Precio «consultar» | gris heredado | gris propio, peso 700, contraste 7,58 |
| Categoría | — | .72 rem, mayúsculas, contraste 4,58 |
| Detalles | .86 rem | .84 rem con interlineado 1,45 |

### 5. Productos físicos vs servicios
Se añadió `tipo` (`producto` / `servicio`) **de forma aditiva**: si falta (Firestore antiguo o el
respaldo embebido) se infiere del icono de la categoría, así que ningún documento existente deja
de funcionar. La diferencia se ve en tres sitios:

- **Pastilla en la tarjeta**: «Producto» en azul sólido, «Servicio» en azul claro con borde.
- **Portada**: el servicio usa la portada de marca; el producto con foto usa su foto.
- **Ficha de producto**: muestra el tipo junto a la categoría.

### 6. WhatsApp y Facebook destacados
WhatsApp mantiene tres accesos (cabecera, hero, flotante) y ahora tiene un cuarto en la fila de
contacto del hero. Facebook pasa de estar solo en el pie y en contacto a tener **presencia en el
hero**, con enlace tomado de `configuracion/contacto`.

### 7. Espacios y proporciones
El ajuste se hizo **con medidas, no a ojo**. La primera versión del hero creció hasta 970 px en
375×667 (el botón de WhatsApp quedaba fuera de pantalla); se corrigió reduciendo logo y márgenes
hasta dejarlo en **805 px**, prácticamente el mismo alto que tenía antes (803 px) pero con dos
bloques nuevos dentro. Ver §3.

### 8. Identidad azul intacta
No se tocó la paleta: se reutilizan `--azul-900/800/700/500` y `--cian-400/500/600` ya definidos.
Las portadas usan esos mismos azules.

### 9. Estructura de datos, filtros y publicación
Intactos. El contrato de `servicios` no cambió; los filtros, el buscador y la consulta
`where estado == PUBLICADO` siguen igual, y las reglas de Firestore no se tocaron
(`firestore.rules` sin cambios en el diff).

### 10. Pruebas y evidencias
229 comprobaciones ejecutadas (ver §4) y comparativa con capturas reales de los dos árboles (ver §3).

---

## 3. Comparativa antes/después (medida en navegador real)

Medición por CDP sobre el árbol de `01fe213` y sobre el árbol actual, con el mismo navegador, el
mismo servidor y las siete resoluciones oficiales.

| Resolución | Columnas | Ancho tarjeta | Título | Portadas (foto/graf/icono) | Alto del hero | Pastillas de tipo |
|---|---|---|---|---|---|---|
| 320×640 | 1 → 1 | 280 → 280 px | 16,96 → **18,24 px** | 2/0/6 → **2/6/0** | 849 → **878 px** | 0 → **8** |
| 360×640 | 1 → 1 | 320 → 320 px | 16,96 → **18,24 px** | 2/0/6 → **2/6/0** | 800 → **798 px** | 0 → **8** |
| 375×667 | 1 → 1 | 335 → 335 px | 16,96 → **18,24 px** | 2/0/6 → **2/6/0** | 803 → **805 px** | 0 → **8** |
| 390×844 | 1 → 1 | 350 → 350 px | 16,96 → **18,24 px** | 2/0/6 → **2/6/0** | 807 → **809 px** | 0 → **8** |
| 768×1024 | 2 → 2 | 338 → 338 px | 16,96 → **18,24 px** | 2/0/6 → **2/6/0** | 778 → **788 px** | 0 → **8** |
| 1024×768 | 3 → 3 | 300 → 299 px | 16,96 → **18,88 px** | 2/0/6 → **2/6/0** | 860 → **864 px** | 0 → **8** |
| 1440×900 | 3 → 3 | 337 → 336 px | 16,96 → **18,88 px** | 2/0/6 → **2/6/0** | 860 → **864 px** | 0 → **8** |

Lo que dicen los números:

- La **rejilla no se movió**: mismas columnas y anchos de tarjeta en las siete resoluciones. La
  estructura aprobada por el propietario se conserva.
- El **título crece 7,5 %** en móvil y 11 % en escritorio, que es de donde venía la sensación de
  tarjeta apretada.
- Las seis **portadas vacías desaparecen**: 6 portadas gráficas, 2 fotos reales, 0 iconos sueltos.
- El **hero queda igual de alto** (805 vs 803 px en 375) **con dos bloques más dentro**.
- A 320 px el hero crece 29 px: es la resolución más estrecha y ahí los bloques nuevos ocupan una
  fila extra. Se documenta como coste consciente, no como descuido.

### Capturas (14 PNG reales)

```
capturas/comparativa/antes/320x640.png … 1440x900.png     (7)
capturas/comparativa/despues/320x640.png … 1440x900.png   (7)
capturas/comparativa/{antes,despues}/medidas.json
capturas/responsive/*.png                                  (7, de la prueba oficial)
capturas/informe-visual.json                               (resultado de 103 comprobaciones)
```

`capturas/` está en `.gitignore` por convención del repo (no se publica con el sitio). Las capturas
viven en disco, en esa ruta.

**Aviso honesto:** no he podido *mirar* las capturas. El modelo en uso no acepta imágenes como
entrada. La comparativa anterior es medición programática (geometría, tipografía, contraste,
inventario de portadas), que es verificable pero **no sustituye a un ojo humano**. Para el visto
bueno visual final hace falta que alguien las abra — están a un clic en esa carpeta.

---

## 4. Pruebas ejecutadas

```
node tools/test-catalogo-datos.js      →  51 · PASA 51 · FALLA 0
node tools/test-contrato-estatico.js   →  49 · PASA 49 · FALLA 0
node tools/test-reglas-publico.js      →  26 · PASA 26 · FALLA 0    (emulador, puerto 8090)
node tools/test-catalogo-dom.js        → 103 · PASA 103 · FALLA 0   (navegador real)
```

Las 103 del navegador incluyen las siete resoluciones oficiales con captura, la verificación de
columnas de rejilla, solapamiento, desbordamiento, contraste WCAG AA, teclado (Tab y Shift+Tab
atrapados en el modal, Escape, foco devuelto) y desplazamiento (ancla sin quedar bajo la cabecera).

### Dos defectos encontrados y corregidos

1. **El precio de la tarjeta no tenía estilo propio.** La regla genérica `.ficha > p` lo pisaba:
   se veía en gris de texto secundario a 14,72 px. Corregido con regla específica (peso 800,
   15,2 px, azul de marca). Lo detectó el auditor estático, no una impresión.
2. **El hero crecía 167 px en móvil.** El botón de WhatsApp quedaba por debajo de la pantalla.
   Lo detectó la medición en navegador (970 px → 805 px tras el ajuste). Es el tipo de defecto que
   una captura a ojo en un monitor grande no habría mostrado.

### Dos defectos de la propia prueba, también corregidos

- Medía las fotos `lazy` sin llevarlas a la vista (informaba 1/2 cargadas; ahora 2/2).
- Su escáner de clases leía una concatenación de JavaScript como si fuera una clase CSS.

---

## 5. Restricciones respetadas

| Restricción | Cumplimiento |
|---|---|
| No modificar `admin/` | ✅ `git status admin` vacío |
| No alterar las reglas de Firestore | ✅ `firestore.rules` sin cambios |
| No inventar precios, existencias ni fotos | ✅ los 8 productos siguen en `precio: null` → «consultar»; 2 fotos reales, 6 portadas gráficas declaradas |
| No publicar ni hacer push | ✅ `origin/main` sigue en `7735b6e` |
| No reconstruir la arquitectura | ✅ mismo HTML/JS/CSS, mismo esquema, mismos filtros |

Nota de proceso: el entorno pasó a modo de acceso completo por decisión externa durante la misión.
No se solicitó escalación en ningún momento; las pruebas de navegador se ejecutaron porque el
entorno ya lo permitía.

---

## 6. Pendiente para el visto bueno

1. **Abrir las 14 capturas** de `capturas/comparativa/` y confirmar el aspecto.
2. **Móvil real**: abrir ficha, comprobar el modal y que el botón de WhatsApp abra la app.
3. **Precios y fotos**: siguen pendientes del cliente. Cuando lleguen, entran por Firestore y por
   `data.json` sin tocar código.
