# KZ-REDCALINET-011 — Portada institucional sin fotografías de producto

**Proyecto:** Red CaliNet (`6-LANDING-PAGES/RedCaliNet`)
**Base:** commit `5cd3d33` (main)
**Rama:** `fix/kz-redcalinet-011-hero-institucional`
**Fecha:** 27-oct-2026
**Resultado:** hero institucional de una columna · catálogo intacto · **283 comprobaciones en verde**

---

## 1. Qué se retiró

De `index.html`, el bloque completo de la composición visual del hero:

```html
<div class="hero__visual" aria-hidden="true">
  <figure class="hero__foto hero__foto--a"><img src="assets/img/galeria/iphone.webp" …></figure>
  <figure class="hero__foto hero__foto--b"><img src="assets/img/galeria/honor-magic.webp" …></figure>
</div>
```

De `styles.css`, todas las reglas que quedaron sin uso: `.hero__visual`, `.hero__foto`,
`.hero__foto img`, `.hero__foto--a`, `.hero__foto--b` y la rejilla de dos columnas del hero
(`grid-template-columns: 1.02fr .98fr`). Verificado: **no queda ninguna referencia** a esas clases
en el proyecto (`index.html`, `styles.css`, `script.js`).

**No se borró ningún archivo.** `assets/img/galeria/iphone.webp` y `honor-magic.webp` siguen en su
sitio, y `data.json` mantiene sus dos referencias: el catálogo las usa en las fichas de Tecnología.

---

## 2. Cómo quedó la portada

| Elemento | Estado |
|---|---|
| Fondo azul corporativo | Intacto |
| Logotipo oficial | Intacto (88 px móvil · 104 px escritorio · 76 px a ≤360 px) |
| Título «Tu conexión con servicios y soluciones digitales» | Intacto |
| Descripción profesional | Intacta |
| Ubicación («Bello, Antioquia») | Intacta |
| Tres beneficios (punto físico, WhatsApp, horario) | Intactos |
| Botones «Explorar catálogo» y «Consultar por WhatsApp» | Intactos, mismo orden y estilo |
| Fotografías de producto | **Retiradas** |
| Elementos decorativos nuevos | **Ninguno** |

Reorganización: el hero pasa a **una sola columna centrada** en todas las resoluciones, con el
bloque de texto limitado a `44rem` de ancho. Así no queda una segunda columna vacía ni un hueco
desproporcionado en pantallas anchas.

A partir de 900 px el título usa `max-width: 22ch` (antes 16ch). Con una sola columna, 16ch dejaba
el titular como una tira estrecha en el centro; a 22ch ocupa dos líneas y respira a los lados.
Es el único ajuste tipográfico, y solo aplica de 900 px en adelante.

---

## 3. Comparativa medida (navegador real, siete resoluciones)

| Resolución | Alto del hero | Columnas | Imágenes de producto | Posición del CTA |
|---|---|---|---|---|
| 320×640 | 586 → **586 px** | 1 → 1 | **2 → 0** | 625 → 625 px |
| 360×640 | 552 → **552 px** | 1 → 1 | **2 → 0** | 591 → 591 px |
| 375×667 | 549 → **549 px** | 1 → 1 | **2 → 0** | 580 → 580 px |
| 390×844 | 553 → **553 px** | 1 → 1 | **2 → 0** | 584 → 584 px |
| 768×1024 | 567 → **567 px** | 1 → 1 | **2 → 0** | 580 → 580 px |
| 1024×768 | 702 → **566 px** | **2 → 1** | **2 → 0** | 711 → **575 px** |
| 1440×900 | 621 → **566 px** | **2 → 1** | **2 → 0** | 630 → **575 px** |

Lectura: en móvil y tableta **nada cambia** (las fotos ya estaban ocultas por CSS ahí, así que la
posición de los botones es idéntica). En escritorio el hero baja 136 px a 1024 y 55 px a 1440, y
pasa a una columna centrada.

Medidas de equilibrio a 1440: bloque de texto de **704 px** dentro de un contenedor de **1120 px**
(63 %), centrado con desviación ≤2 px respecto al eje, título en **2 líneas** de 704 px de ancho.

---

## 4. Catálogo: sin regresión

Idéntico en las siete resoluciones, antes y después:

| Comprobación | Antes | Después |
|---|---|---|
| Columnas por resolución | 1 / 1 / 1 / 1 / 2 / 3 / 3 | **igual** |
| Ancho de la primera tarjeta | 280–350 px | **igual** |
| Título de tarjeta | 18,24 / 18,88 px | **igual** |
| Primera tarjeta (posición) | 608 / 582 / 518 / 538 / 540 px | **igual** |
| Portadas (foto/gráfica/icono) | 2/6/0 | **2/6/0** |
| Pastillas de tipo | 8 | **8** |

---

## 5. Pruebas ejecutadas

```
node tools/test-catalogo-datos.js      →  51 · PASA 51 · FALLA 0
node tools/test-contrato-estatico.js   →  49 · PASA 49 · FALLA 0
node tools/test-catalogo-dom.js        → 157 · PASA 157 · FALLA 0   (navegador real)
node tools/test-reglas-publico.js      →  26 · PASA 26 · FALLA 0    (emulador Firestore)
```

Total: **283 comprobaciones en verde.**

Las pruebas se adaptaron al hero institucional (antes exigían dos columnas y dos fotografías en el
hero, que es justo lo que se retira):

- Se retiraron de `test-contrato-estatico.js` las clases `hero__visual`, `hero__foto`,
  `hero__foto--a` y `hero__foto--b`, que ya no existen en el CSS.
- En `test-catalogo-dom.js` se sustituyeron las aserciones de la composición por: una sola columna,
  contenido centrado, **cero imágenes de producto en el hero**, ancho de lectura razonable del
  bloque de texto, título de 2 a 4 líneas y todo dentro del contenedor.
- `comparar-visual.js` mide ahora «imágenes de producto» (debe ser 0) en lugar de la visibilidad de
  la composición.

---

## 6. Capturas

```
capturas/comparativa-011/antes/hero-*.png        7 capturas de portada, antes
capturas/comparativa-011/despues/hero-*.png      7 capturas de portada, después
capturas/comparativa-011/antes/catalogo-*.png    7 capturas de catálogo, antes
capturas/comparativa-011/despues/catalogo-*.png  7 capturas de catálogo, después
capturas/responsive/*.png                        7 capturas de la prueba oficial
capturas/informe-visual.json                     resultado de las 157 comprobaciones
```

`capturas/` no se versiona (está en `.gitignore`); las imágenes quedan en disco, en esas rutas.

**No puedo revisar las capturas:** el modelo en uso no acepta imágenes. La decisión visual es del
propietario.

---

## 7. Archivos modificados

| Archivo | Cambio |
|---|---|
| `index.html` | Se retira el bloque `.hero__visual` (dos figuras con las fotos) |
| `styles.css` | Se eliminan las reglas del hero en dos columnas y las de `.hero__visual` / `.hero__foto*`; el hero queda en una columna centrada con `max-width: 44rem` y título a 22ch desde 900 px |
| `tools/test-contrato-estatico.js` | Se quitan de la lista de clases requeridas las cuatro que ya no existen |
| `tools/test-catalogo-dom.js` | Aserciones del hero adaptadas al institucional |
| `tools/comparar-visual.js` | Mide imágenes de producto en el hero en lugar de la composición |

---

## 8. Lo que NO se tocó

Catálogo, fichas, categorías, fotografías de producto, precios, buscador, filtros, tarjetas, menú de
navegación, reglas del botón flotante de WhatsApp, enlaces de contacto, `firebase-config.js`,
`firestore.rules`, `firebase.json`, `firestore.indexes.json`, `data.json` y todo el directorio
`admin/`.

Sin push, sin fusión y sin despliegue: producción sigue en `7735b6e` y la rama existe solo en local.
