# KZ-REDCALINET-009 — Cierre de revisión visual

**Proyecto:** Red CaliNet (`6-LANDING-PAGES/RedCaliNet`)
**Base:** commit `5eafbad`
**Fecha:** 27-oct-2026
**Resultado:** los tres detalles cerrados · diseño aprobado congelado · **282 comprobaciones en verde**

---

## 1. Resumen

Se aplicaron **solo** los tres ajustes pedidos. No se tocó la distribución de columnas, la paleta
azul, el buscador, las tarjetas, los filtros, la navegación ni las reglas del botón flotante.

| Prueba | Resultado |
|---|---|
| Datos y mapeo | 51/51 |
| Contrato estático | 49/49 |
| Reglas + integración (emulador) | 26/26 |
| Navegador real · 7 resoluciones | **156/156** |
| **Total** | **282/282** |

---

## 2. Los tres ajustes

### A. Redacción comercial del hero

| | Antes | Ahora |
|---|---|---|
| Título | Tu conexión con servicios y soluciones digitales | **sin cambios** (era correcto) |
| Descripción | «Streaming, trámites, tv por app, tecnología. Servicio garantizado, lo primordial para nosotros es el cliente.» | «Tecnología, entretenimiento digital y asesoría en trámites, con atención cercana y personalizada desde Bello, Antioquia.» |
| Beneficios | Servicio garantizado · Punto físico en Bello · Atención por WhatsApp | **Punto físico en Bello · Atención por WhatsApp · Atendemos lunes a sábado** |

- La frase ya no se compone automáticamente con los nombres de categoría: se lee de
  `marca.descripcion`, un campo nuevo y opcional en `data.json` (y en `configuracion/empresa`
  cuando el panel lo tenga). Si falta, el sitio usa el texto aprobado como respaldo.
- **Se retira la promesa de garantía del hero.** Los tres beneficios ahora son datos
  comprobables de la ficha del negocio: la dirección, el WhatsApp y el horario reales
  («Atendemos lunes a sábado», tomado de `data.json`).

> **Pendiente de tu decisión (no lo toqué):** la frase «Servicio garantizado» sigue apareciendo en
> la sección **Nosotros** (su titular) y en `marca.promesa`. La orden limitaba el cambio al hero y
> preferí no salirme del alcance. Si quieres que también salga de ahí, es un cambio de dos líneas.

### B. Sello bajo las fotografías: eliminado

Se quitó el sello «Streaming · Trámites · TV por app» y su CSS. La composición queda con las dos
fotografías auténticas del catálogo, que es lo que pediste. Verificado: **0 sellos** en las siete
resoluciones.

### C. CTA accesibles en 320×640

Había un problema real y tu lectura fue correcta: **el grupo de CTA terminaba en 665 px sobre un
viewport de 640 px**, así que «Consultar por WhatsApp» quedaba cortado.

| Resolución | CTA↓ antes | CTA↓ ahora | Alto del hero |
|---|---|---|---|
| **320×640** | **665 px** ❌ (> 640) | **625 px** ✅ | 634 → **586 px** |
| 360×640 | 579 px | **591 px** ✅ | 548 → 552 px |
| 375×667 | 580 px | 580 px ✅ | 549 px |
| 390×844 | 584 px | 584 px ✅ | 553 px |
| 768×1024 | 580 px | 580 px ✅ | 567 px |
| 1024×768 | 685 px | **711 px** ✅ (viewport 768) | 676 → 702 px |
| 1440×900 | 630 px | 630 px ✅ | 621 px |

Cómo se resolvió, **sin tocar la tipografía** (como pediste): solo por debajo de 361 px se ajusta
el espaciado — padding del hero, margen del logotipo, separación de la lista de beneficios y del
grupo de CTA — y el logotipo baja a 76 px en esa franja. En 320×640 el botón de WhatsApp queda con
**15 px de aire** y **88 px de separación** respecto al mensaje.

Nota sobre 1024×768: el hero crece 26 px porque la descripción nueva ocupa una línea más en la
columna izquierda. Sigue cabiendo completo (CTA en 711 de 768 px).

---

## 3. Lo que NO se tocó (verificado)

| Elemento | Estado |
|---|---|
| Distribución de columnas | 1 columna en móvil/tableta, **2 en 1024 y 1440** — igual |
| Paleta azul | sin cambios |
| Buscador, filtros, tarjetas | sin cambios: mismas columnas de rejilla, mismos anchos, mismos tamaños |
| Navegación | sin cambios |
| Reglas del botón flotante | sin cambios: oculto sobre hero, catálogo y contacto; visible fuera — **oculto al inicio en las siete resoluciones** |
| Catálogo | intacto: 8 fichas, 2 fotos + 6 portadas gráficas, contador «8 resultados» |

Posiciones del catálogo idénticas antes y después (primera tarjeta a 608 / 582 / 582 / 582 / 518 /
538 / 540 px).

---

## 4. Un defecto de la propia medición, corregido

La primera pasada de la comparativa dio una cifra imposible (la primera tarjeta a 320 px saltaba de
608 a 679 px) que no existía: la página tiene `scroll-behavior: smooth` y la medición se tomaba con
el desplazamiento todavía en curso. Ahora el comparador espera a que el scroll se detenga antes de
medir; dos pasadas consecutivas del mismo árbol dan valores idénticos. Se comprobó también con el
desglose por partes (`gridTop` = 608 en ambos árboles), así que **no había regresión**, solo ruido.

Una evidencia que cambia entre pasadas no sirve para decidir: por eso se corrigió el instrumento.

---

## 5. Evidencia

```
docs/misiones/EVIDENCIA-VISUAL-009.txt
capturas/comparativa-009/antes/hero-*.png          7 capturas de portada (antes)
capturas/comparativa-009/antes/catalogo-*.png      7 capturas de catálogo (antes)
capturas/comparativa-009/despues/hero-*.png        7 capturas de portada (después)
capturas/comparativa-009/despues/catalogo-*.png    7 capturas de catálogo (después)
capturas/responsive/*.png                          7 capturas de la prueba oficial
capturas/informe-visual.json                       resultado de las 156 comprobaciones
```

`capturas/` no se versiona (`.gitignore`), por convención del repo. Las imágenes quedan en disco.

**No puedo revisar las capturas:** este modelo no acepta imágenes como entrada. Las cifras de este
informe son medición programática en navegador real; el visto bueno visual sigue siendo tuyo.

---

## 6. Restricciones respetadas

| Restricción | Cumplimiento |
|---|---|
| No modificar `admin/` | ✅ sin cambios |
| No modificar Firestore ni sus reglas | ✅ `firestore.rules`, `firestore.indexes.json` y `firebase.json` intactos |
| No inventar información comercial | ✅ la garantía se retira del hero en lugar de reforzarse; los beneficios son dirección, WhatsApp y horario reales |
| No reconstruir la página | ✅ cambios acotados a texto del hero, sello y espaciado en pantallas ≤360 px |
| No modificar otros proyectos | ✅ todo dentro de `6-LANDING-PAGES/RedCaliNet` |
| No desplegar ni hacer push | ✅ `origin/main` sigue en `7735b6e` |

---

## 7. Siguiente paso acordado

Con esto el **diseño visual queda congelado**. Lo que sigue ya no es apariencia sino la conexión
con el panel de **Codex Sites**, para que el propietario suba fotos, videos, productos, precios y
promociones y se reflejen en la web.

Lo que la web ya espera del panel, verificado contra el emulador: colecciones `configuracion`,
`categorias` y `servicios`; solo se publica `estado = PUBLICADO`; los 18 campos que escribe el panel
se leen en el catálogo; las fotos llegan por URL (Cloudinary o ruta local). El campo nuevo
`empresa.descripcion` es opcional: si el panel no lo escribe, se usa el texto aprobado.
