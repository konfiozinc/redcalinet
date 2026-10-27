# KZ-REDCALINET-006 — Certificación visual final

**Proyecto:** Red CaliNet (`6-LANDING-PAGES/RedCaliNet`)
**Base:** commit `a1c3f94`
**Fecha:** 27-oct-2026
**Dictamen:** **GO** en catálogo, datos, contrato e integración · **NO GO** en certificación visual (pendiente de ejecución en navegador)

---

## 1. Resultado en una línea

No se ejecutó la certificación visual porque este entorno sigue sin poder arrancar Chromium, y la
orden prohíbe repetir intentos. En su lugar se dejó el instrumento de certificación **alineado a
las siete resoluciones oficiales** y se amplió de 36 a unas **104 comprobaciones objetivas**, de
modo que la ejecución pendiente sea un solo comando y no requiera criterio improvisado.

No se declara aprobada la certificación visual.

---

## 2. Por qué no se ejecutó (sin repetir el diagnóstico)

La causa ya está documentada en `INFORME-KZ-REDCALINET-005.md` §2: Chromium necesita crear
canales IPC con nombre y el sandbox los deniega, de modo que aborta con `STATUS_BREAKPOINT`
(`0x80000003`). Nada de eso puede cambiar sin permisos que esta orden excluye.

**No se hizo un quinto lanzamiento del navegador.** La instrucción es explícita —«si el entorno
continúa bloqueando Chromium, detener los intentos repetidos»— y la condición no ha variado.

---

## 3. Qué se hizo en su lugar

### 3.1 Resoluciones oficiales (antes distintas)

| Antes (misión 004) | Ahora (orden 006) |
|---|---|
| 320×568 | **320×640** |
| 360×640 | 360×640 |
| 375×667 | 375×667 |
| 390×844 | 390×844 |
| 768×1024 | 768×1024 |
| 1366×768 | **1024×768** |
| 1920×1080 | **1440×900** |

Columnas de rejilla esperadas por resolución: **1 / 1 / 1 / 1 / 2 / 3 / 3**
(la rejilla pasa a 2 columnas desde 620px y a 3 desde 900px).

### 3.2 Comprobaciones por área (las siete que pidió la orden)

| Área | Qué se mide | Comprobaciones |
|---|---|---|
| Catálogo | Fichas pintadas, categorías, filtros creados, contador, estado vacío, enlace del menú | 6 |
| Imágenes | Cargan de verdad (`naturalWidth > 0`), ninguna rota, `alt` presente, marcador cuando no hay foto | 4 |
| Precios | Sin precio → «consultar por WhatsApp»; ningún precio inventado | 1 |
| WhatsApp | Enlace por producto, número correcto, `target=_blank` + `noopener`, mensaje con el nombre | 3 |
| Filtros | Acota, marca activo, `aria-pressed` único, contador, volver a «Todos» | 5 |
| Búsqueda | Por nombre, sin tildes, en mayúsculas dentro de `detalles`, sin coincidencias, limpiar | 7 |
| Fichas | Abre, nombre, categoría, `role=dialog` + `aria-modal` + `aria-labelledby`, cabe en el móvil, foco al cerrar, bloqueo de scroll, WhatsApp propio | 9 |
| **Teclado** | Tab no escapa del modal, Shift+Tab tampoco, Escape cierra, foco devuelto al disparador, scroll liberado, enlace «saltar al contenido» | 6 |
| **Desplazamiento** | El ancla `#catalogo` deja el título fuera de la cabecera, la página se desplaza, se alcanza el final | 3 |
| **Contraste WCAG AA** | Ratio real calculado sobre el color computado en 7 textos clave (fondo con degradado se reporta como no medible) | 7 |
| **Responsive** | Por cada una de las 7 resoluciones: desbordamiento, columnas, catálogo completo, tarjetas solapadas, ancho útil de tarjeta, título bajo la cabecera, captura | 7 × 7 = 49 |
| Consola | Sin excepciones de JavaScript | 1 |

Total: **∼104 comprobaciones** más 7 capturas y un informe legible por máquina
(`capturas/informe-visual.json`).

El contraste y el solapamiento de tarjetas se añadieron precisamente porque son juicios
visuales que **se pueden medir**: así la revisión no depende solo del ojo humano para lo
objetivable, y el ojo queda para lo que de verdad lo necesita.

---

## 4. Auditoría estática realizada hoy (no sustituye a la visual)

Antes de dar nada por bueno, revisé a mano en el código lo que un fallo de diseño suele dejar
roto. **Resultado: sin defectos.**

| Comprobación | Resultado |
|---|---|
| `scroll-padding-top` para que las anclas no queden bajo la cabecera | ✅ `76px` en `html` (cabecera: 64px móvil / 76px escritorio) |
| Estilos de foco visibles | ✅ `:focus-visible { outline: 3px solid var(--azul-700); outline-offset: 3px }` |
| Los dos `outline: none` están compensados | ✅ buscador con `:focus-within` + halo; campos con borde `--cian-500` |
| Ids duplicados en el HTML | ✅ 62 ids, ninguno repetido |
| Imágenes sin `alt` | ✅ las 3 del HTML y las 2 generadas por JS lo llevan |
| Controles del catálogo activables por teclado | ✅ `<button type="button">` para `filtro` y `ficha__ver`; `<a>` solo para navegación |
| Modal con semántica correcta | ✅ `role="dialog"`, `aria-modal="true"`, `aria-labelledby="fichaTitulo"` |
| Imágenes con `width`/`height` y `aspect-ratio` | ✅ el CSS fuerza `width/height: 100%` + `object-fit: cover`, sin el conflicto que anula `aspect-ratio` |
| `prefers-reduced-motion` | ✅ cubierto, incluidas las tarjetas de producto |
| Rejilla responsive declarada | ✅ 1 columna base, 2 a 620px, 3 a 900px |

**No se corrigió nada porque no había nada que corregir.** Inventar un defecto para «cumplir»
el punto 5 habría sido peor que declarar el resultado real.

---

## 5. Limitación de la revisión visual (punto 4 de la orden)

No puedo revisar las capturas. Dos motivos, ambos concretos:

1. **No hay capturas nuevas**: sin navegador no hay render, y sin render no hay imágenes.
2. **Aunque las hubiera, no las puedo ver**: el modelo que estoy usando (`deepseek-v4-flash`) no
   acepta imágenes como entrada. Lo comprobé al intentar abrir
   `capturas/redcalinet-catalogo-movil.png` y el sistema respondió
   *«model does not declare image input»*.

Quedan dos caminos, y ninguno depende de una excusa:

- **Cambiar de modelo a uno con entrada de imagen** y dejarme revisar los PNG de las siete
  resoluciones. Eso cierra el punto 4 de verdad.
- **Revisión humana con checklist** (abajo), ejecutando el script en un equipo autorizado.

### Checklist de revisión humana por captura

Para cada `capturas/responsive/<resolución>.png`, confirmar a ojo:

1. **320×640** — ¿la tarjeta se lee sin apretar? ¿«Ver detalle» y «Consultar» caben en una fila
   sin cortarse? ¿el texto no se superpone?
2. **360×640** — igual que 320, con un poco más de aire.
3. **375×667** — resolución oficial de móvil. ¿Primera pantalla útil? ¿se ve el buscador completo?
4. **390×844** — ¿la cabecera ocupa una franja razonable y no tapa el título?
5. **768×1024** — ¿dos columnas equilibradas? ¿las alturas quedan parejas?
6. **1024×768** — ¿tres columnas sin que la tarjeta quede demasiado estrecha?
7. **1440×900** — ¿el contenido queda centrado y no estirado de borde a borde?

Y en móvil real, además: abrir la ficha con el dedo, comprobar que el fondo no se desplaza
detrás del modal y que el botón de WhatsApp abre la app.

---

## 6. Las 126 pruebas aprobadas: conservadas y re-ejecutadas

No se perdió ni se relajó nada. Repetidas hoy sobre `a1c3f94` + los cambios de esta misión:

```
node tools/test-catalogo-datos.js        →  TOTAL 51 · PASA 51 · FALLA 0
node tools/test-contrato-estatico.js     →  TOTAL 49 · PASA 49 · FALLA 0
node tools/test-reglas-publico.js        →  TOTAL 26 · PASA 26 · FALLA 0   (emulador, puerto 8090)
```

`FALLA 0` en las tres. Puertos 8080/8090/5185 verificados libres al terminar y sin procesos java
huérfanos.

Ninguna de las 126 pruebas toca el archivo modificado hoy (`tools/test-catalogo-dom.js`), así que
no había nada que re-validar por efecto dominó; aun así se repitieron por completo.

---

## 7. Dictamen

### GO — catálogo, datos, contrato e integración

- Catálogo público implementado y conectado a Firestore (con el respaldo `data.json` y el
  embebido por detrás).
- Solo se publica lo `PUBLICADO`; `BORRADOR` y `OCULTO` dan 403 al público.
- Ningún precio inventado: los 8 productos siguen en «consultar por WhatsApp».
- El respaldo local no contiene promociones ni vigencias.
- Los 18 campos que escribe el panel se leen en el catálogo: Codex Sites podrá gestionarlo.
- 126 comprobaciones en verde.

### NO GO — certificación visual

Falta exactamente esto:

1. **Ejecutar** `node tools/test-catalogo-dom.js` en un entorno autorizado (≈104 comprobaciones
   + 7 capturas + `informe-visual.json`).
2. **Revisar a ojo** las siete capturas (checklist del §5).
3. **Probar en móvil real** ficha, teclado del sistema y apertura de WhatsApp.

Hasta que eso ocurra, el catálogo **no está visualmente certificado**.

---

## 8. Restricciones respetadas

| Restricción | Cumplimiento |
|---|---|
| No modificar `admin/` | ✅ solo lectura |
| No hacer push | ✅ `origin/main` sigue en `7735b6e` |
| No desplegar | ✅ nada publicado |
| No modificar producción | ✅ ni Firestore real ni el sitio en vivo |
| No solicitar `danger-full-access` | ✅ no se solicitó |
| No repetir diagnósticos resueltos | ✅ no se relanzó Chromium; la causa ya estaba documentada |
