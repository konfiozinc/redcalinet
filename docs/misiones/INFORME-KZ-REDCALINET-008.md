# KZ-REDCALINET-008 — Corrección integral de la portada

**Proyecto:** Red CaliNet (`6-LANDING-PAGES/RedCaliNet`)
**Base:** commit `a5b90ed`
**Fecha:** 27-oct-2026
**Resultado:** portada equilibrada · WhatsApp flotante integrado · **274 comprobaciones en verde**

---

## 1. Resumen

Se corrigieron los tres ajustes pedidos y la composición del hero, sin tocar la arquitectura, la
identidad azul ni el catálogo. Todo lo que se afirma aquí está medido en navegador real sobre los
dos árboles (`a5b90ed` y el actual), no estimado.

| Prueba | Resultado |
|---|---|
| Datos y mapeo | 51/51 |
| Contrato estático | 49/49 |
| Reglas + integración (emulador) | 26/26 |
| Navegador real · 7 resoluciones | **148/148** |
| **Total** | **274/274** |

---

## 2. Comparativa antes/después (medida real)

### Portada

| Resolución | Alto del hero | Columnas | Logo | Composición | WhatsApp en hero | Flotante al inicio | Contador |
|---|---|---|---|---|---|---|---|
| 320×640 | 878 → **634 px** | 1 → 1 | 128 → **88 px** | no → no | 2 → **1** | visible → **oculto** | «8 productos disponibles» → **«8 resultados»** |
| 360×640 | 798 → **548 px** | 1 → 1 | 144 → **88 px** | no → no | 2 → **1** | visible → **oculto** | idem |
| 375×667 | 805 → **549 px** | 1 → 1 | 150 → **88 px** | no → no | 2 → **1** | visible → **oculto** | idem |
| 390×844 | 809 → **553 px** | 1 → 1 | 150 → **88 px** | no → no | 2 → **1** | visible → **oculto** | idem |
| 768×1024 | 788 → **567 px** | 1 → 1 | 165 → **88 px** | no → no | 2 → **1** | visible → **oculto** | idem |
| 1024×768 | 864 → **676 px** | 1 → **2** | 175 → **104 px** | no → **sí** | 2 → **1** | visible → **oculto** | idem |
| 1440×900 | 864 → **621 px** | 1 → **2** | 175 → **104 px** | no → **sí** | 2 → **1** | visible → **oculto** | idem |

Lectura: el hero **encoge entre 22 % y 32 %**, pasa a **dos columnas en escritorio**, el logo baja
de 128–175 px a **88–104 px**, se elimina el **WhatsApp redundante** (de 2 accesos a 1) y el botón
flotante deja de aparecer sobre el hero en las siete resoluciones.

A 375×667 el hero completo cabe en **549 px** de los 667 disponibles.

### Espaciado del catálogo en móvil (ajuste 1)

Distancia desde el borde superior de la pantalla hasta la primera tarjeta, entrando al catálogo:

| Resolución | Antes | Después | Δ |
|---|---|---|---|
| 320×640 | 664 px | **608 px** | **−56 px** |
| 360×640 | 638 px | **582 px** | **−56 px** |
| 375×667 | 638 px | **582 px** | **−56 px** |
| 390×844 | 638 px | **582 px** | **−56 px** |
| 768×1024 | 518 px | 518 px | 0 |
| 1024×768 | 538 px | 538 px | 0 |
| 1440×900 | 540 px | 540 px | 0 |

El ajuste se aplica **solo por debajo de 401 px**: tableta y escritorio quedan idénticos.

### Integridad del catálogo

Sin cambios en ninguna resolución: mismas columnas de rejilla, mismo ancho de tarjeta, mismos
tamaños de título y precio, mismas portadas y mismas 8 fichas.

| Resolución | Columnas | Tarjeta | Título | Portadas (foto/gráfica/icono) |
|---|---|---|---|---|
| 320×640 … 390×844 | 1 | 280–350 px | 18,24 px | 2/6/0 |
| 768×1024 | 2 | 338 px | 18,24 px | 2/6/0 |
| 1024×768 | 3 | 299 px | 18,88 px | 2/6/0 |
| 1440×900 | 3 | 336 px | 18,88 px | 2/6/0 |

---

## 3. Qué se cambió, punto por punto

### 1. WhatsApp flotante
- **Oculto sobre el hero** y fuera de la tabulación (`aria-hidden="true"`, `tabindex="-1"`,
  `pointer-events:none`) mientras no se ve.
- **Oculto también en el catálogo y en contacto**, donde ya hay acceso propio: en el catálogo cada
  ficha tiene su «Consultar» y en contacto está el bloque completo. Así no hay redundancia ni
  superposición.
- **Visible al desplazarse** por el resto de la página, pegado con margen fijo y respetando
  `env(safe-area-inset-*)`.
- Comprobado en las siete resoluciones: aparece sin solaparse con ningún control y respeta
  márgenes; se esconde sobre el catálogo en las siete.

### 2. Composición del hero
- **Escritorio (≥900 px)**: dos columnas. Izquierda con el mensaje, la descripción, tres beneficios
  reales, «Explorar catálogo» y «Consultar por WhatsApp». Derecha con una composición de **las dos
  fotografías auténticas del catálogo** (`iphone.webp`, `honor-magic.webp`) y un sello con
  «Streaming · Trámites · TV por app».
- **Ninguna foto inventada**: son los mismos archivos que ya publica el catálogo.
- **Sin ofertas, precios ni inventario**: el sello solo nombra categorías.
- La mitad derecha ya no queda vacía: ocupa más del 35 % del ancho del hero (verificado).

### 3. Logotipo
De 128–175 px a **88 px en móvil y 104 px en escritorio**, con el mismo archivo y la misma
identidad. Queda integrado en una fila junto al «Bello, Antioquia».

### 4. Controles simplificados
- Fuera los accesos redundantes a WhatsApp del hero (quedaban dos, además del flotante).
- **Facebook se conserva en contacto y en el pie.**
- **Los accesos a categorías viven en el catálogo** (las pastillas de filtro `#catFiltros`), que
  ya existían; se retiraron las del hero por duplicadas.
- La navegación superior no se tocó.

### 5. Altura y espaciado
Hero 22–32 % más bajo en todas las resoluciones, y el espaciado del catálogo recortado solo en
móvil estrecho. La página no se alarga en ningún caso.

### 6. Contador
«8 productos disponibles» → **«8 resultados»**; «Mostrando 3 de 8 productos» → **«Mostrando 3 de 8
resultados»**. Se actualiza al filtrar y al buscar, y no afirma disponibilidad comercial. Los
textos de categoría dicen «resultados» y «Sin resultados por ahora».

### 7. Pruebas y entrega
274 comprobaciones y 28 capturas reales (14 por árbol).

---

## 4. Defectos encontrados y corregidos en esta misión

1. **El botón flotante nunca aparecía.** El `IntersectionObserver` usado para detectar el
   catálogo tenía un umbral del 15 %; como el catálogo es mucho más alto que la pantalla, ese
   porcentaje nunca se alcanzaba y el botón se quedaba oculto para siempre. Sustituido por un
   cálculo directo de la porción visible con `requestAnimationFrame`.
2. **El hero contaba como visible con 11 px asomando tras la cabecera fija.** Por eso el botón no
   aparecía al entrar en Servicios. Ahora se descuenta la altura de la cabecera y se exigen 80 px
   realmente visibles.
3. **Fallo de proceso (reconocido):** al intentar editar el CSS con `Set-Content` de esta consola
   (PowerShell 5.1) el archivo quedó doblemente codificado y se perdieron los acentos. Se restauró
   desde git y los cambios se rehicieron con el editor del harness. Los archivos actuales están
   verificados: acentos correctos y llaves balanceadas (342/342).

---

## 5. Evidencia

```
docs/misiones/EVIDENCIA-VISUAL-008.txt          medidas de los dos árboles
capturas/comparativa-008/antes/hero-*.png       7 capturas de portada (antes)
capturas/comparativa-008/antes/catalogo-*.png   7 capturas de catálogo (antes)
capturas/comparativa-008/despues/hero-*.png     7 capturas de portada (después)
capturas/comparativa-008/despues/catalogo-*.png 7 capturas de catálogo (después)
capturas/responsive/*.png                       7 capturas de la prueba oficial
capturas/informe-visual.json                    resultado de las 148 comprobaciones
```

`capturas/` no se versiona (está en `.gitignore` por convención del repo). Las imágenes quedan en
disco, en esas rutas.

---

## 6. Restricciones respetadas

| Restricción | Cumplimiento |
|---|---|
| No modificar `admin/` | ✅ `git status admin` vacío |
| No modificar Firestore ni sus reglas | ✅ `firestore.rules`, `firestore.indexes.json` y `firebase.json` sin cambios |
| No inventar información comercial | ✅ sin precios, ofertas ni inventario; las 8 fichas siguen en «consultar»; las fotos del hero son las reales del catálogo |
| No reconstruir la página | ✅ mismo HTML/JS/CSS y mismos componentes; se reordenó el hero |
| No modificar otros proyectos | ✅ todo dentro de `6-LANDING-PAGES/RedCaliNet` |
| No desplegar ni hacer push | ✅ `origin/main` sigue en `7735b6e` |

---

## 7. Pendiente

1. **Revisión humana de las 28 capturas.** Este modelo no acepta imágenes como entrada, así que la
   aprobación visual final requiere que alguien las abra. Están en `capturas/comparativa-008/`.
2. **Móvil real**: comprobar que el botón flotante no interfiere con los gestos del sistema y que
   el modal responde al toque.
3. **Precios y fotos de producto**: siguen pendientes del cliente.
