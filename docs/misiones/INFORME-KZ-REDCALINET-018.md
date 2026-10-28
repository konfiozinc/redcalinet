# INFORME KZ-REDCALINET-018 — Revisión visual y funcional del panel

**Fecha:** 28-oct-2026
**Rama:** `integracion/panel-codex` (local, sin push) · **commit revisado:** `13e5b00`
**Alcance:** revisión, no rediseño. No se modificó ninguna pantalla, ni la API,
ni Firebase, ni los roles, ni el catálogo público.
**Estado del diseño:** el acceso administrativo queda congelado tras KZ-016 y KZ-017.

---

## 1. Entorno y sesión

Los cuatro servicios locales estuvieron arriba durante toda la revisión: panel
(5176), web (5180), Firestore (8080) y Auth (9099). Sesión con `superadmin@rcl.example.test`
—SUPERADMIN, la única que ve Usuarios y Auditoría— y datos exclusivamente del emulador.

## 2. Inventario de módulos

El menú tiene **doce entradas** y **once están operativas**. Solo una está pendiente,
y lo dice ella misma en pantalla.

| # | Módulo | Estado | Evidencia observada |
|---|---|---|---|
| 1 | Dashboard | **Operativo** | 8 tarjetas de indicadores + 8 entradas de actividad reciente; botón «Actualizar» y «Administrar productos →» |
| 2 | Productos | **Operativo** | Tabla de 12 filas · columnas NOMBRE/REFERENCIA, ESTADO, PRECIO, ACCIONES · «+ Nuevo producto», buscador y filtro |
| 3 | Servicios | **Operativo** | 10 filas, mismas columnas · «+ Nuevo servicio» |
| 4 | Categorías | **Operativo** | 9 filas · columnas + TIPO · «+ Nueva categoría» |
| 5 | Inventario | **Operativo** | 12 filas · columna EXISTENCIAS (vista de stock sobre los mismos productos) |
| 6 | Promociones | **Operativo** | 5 filas · columna VIGENCIA · «+ Nueva promoción» |
| 7 | Biblioteca multimedia | **Operativo** | 19 tarjetas de medios · «+ Subir archivos», «Editar / uso», «Eliminar» |
| 8 | **Solicitudes y cotizaciones** | **PENDIENTE** | Estado vacío explícito: «CANAL NO HABILITADO — Las solicitudes necesitan un canal real de captura». No hay colección ni integración verificadas. Único botón: «Actualizar» |
| 9 | Configuración empresarial | **Operativo** | Tarjeta con «Editar configuración» (datos de empresa y hero) |
| 10 | Redes sociales | **Operativo** | Tarjeta con «Editar configuración» (WhatsApp, Facebook, Instagram, TikTok, horarios) |
| 11 | Usuarios y permisos | **Operativo** (solo SUPERADMIN) | 2 filas · columnas ROL y ACCESO · «+ Crear usuario» |
| 12 | Auditoría | **Operativo** (solo SUPERADMIN) | 100 entradas visibles y paginación por cursor con «Cargar siguientes 100» |

Los módulos 1-7 y 9-12 cubren las ocho pantallas que pedía la misión. Las dos
adicionales son **Inventario** (una vista de existencias sobre el mismo catálogo) y
**Redes sociales** (separada de Configuración empresarial).

## 3. Capturas

**40 imágenes** en `_respaldos/redcalinet/2026-10-28-kz-018/capturas/`, con índice en
`INDICE-CAPTURAS.md` de esa misma carpeta: los doce módulos en 1440×900, 768×1024 y
390×844, más cuatro del recorrido funcional y de los mensajes.

## 4. Verificación transversal

| Qué se revisó | Resultado en las tres resoluciones |
|---|---|
| Menú lateral y navegación | Las 12 entradas existen y navegan; en móvil el menú se abre con el botón ☰ y se cierra al elegir |
| Desbordamiento | **Ninguno** en 12 módulos × 3 resoluciones: la página nunca supera el ancho de la ventana |
| Titulares y jerarquía | Cada módulo tiene su `h1` propio; el Dashboard usa «Todo listo para avanzar.» |
| Formularios | Se abren en modal; campos con `min`/`max`/`step`, foco visible, cierre con Escape |
| Tablas | 640 px de ancho dentro de un contenedor de 356 px con `overflow-x:auto`: **desplazamiento interno**, la página no rompe |
| Botones | Presentes y etiquetados en cada vista; los de fila miden 35-54 px de alto |
| Tarjetas | 8 indicadores en el Dashboard y 19 tarjetas de medios, en rejilla que baja a 2 y 1 columna |
| Estados vacíos | Existen y explican el motivo (caso claro: Solicitudes) |
| Mensajes de error | «Publicar requiere validación comercial y su fuente.» en el propio formulario |
| Mensajes de confirmación | «Cambios guardados con auditoría.» tras guardar |
| Excepciones de JavaScript | **Ninguna** en todo el recorrido |

## 5. Recorrido funcional con datos QA: 16/16

Producto de prueba «QA revisión 018 …», creado desde la interfaz:

| Paso | Resultado |
|---|---|
| Crear producto | Aparece en la tabla; **no** aparece en el catálogo público |
| Editar precio | La tabla muestra `$ 94.900` |
| Publicar sin sello | El panel lo impide con mensaje propio |
| Publicar con sello | Queda PUBLICADO y **aparece en el catálogo del emulador** |
| Ocultar | Desaparece del catálogo y sigue en el panel como OCULTO |
| Auditoría | **4 entradas** con actor y campos: `CREAR`, `MODIFICAR_PRECIO`, `PUBLICAR`, `OCULTAR` |
| Precio fuera de rango | Lo frena la validación nativa del campo (`min=0`); el formulario no se cierra ni se guarda |
| Confirmación | «Cambios guardados con auditoría.» |

La auditoría guarda el **id** del registro, no su nombre: por eso se verificó contra el
API (`registro === id`) y no buscando el texto en pantalla.

## 6. Problemas visuales encontrados

Ordenados por impacto real, todos medidos:

| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| **P1** | **Encabezados de tabla a 9 px** en Productos, Servicios, Categorías, Inventario, Promociones y Usuarios (las celdas van a 12 px). En un teléfono es el texto más pequeño de la pantalla | `<th>` computado a 9 px en las tres resoluciones | Media (legibilidad) |
| **P2** | **Botones de fila de 35 px de alto** en móvil, cuando el resto de la interfaz usa 44-48 px (incluido el acceso corregido en KZ-016) | Medido en Productos a 390 px: mínimo 35, máximo 54 | Media (tacto) |
| **P3** | **Tablas de 640 px dentro de 356 px** en teléfono: hay que desplazar la tabla en horizontal. No rompe la página, pero la primera columna se corta | `overflow-x:auto` con 640 px de contenido | Media (uso en móvil) |
| **P4** | **Auditoría carga 100 entradas de golpe**: 8 340 px de alto. La paginación existe («Cargar siguientes 100»), pero el bloque es muy largo | Altura de página medida | Baja |
| **P5** | **Solicitudes sin canal**: no es un defecto de diseño, es una funcionalidad pendiente de negocio | Estado vacío propio | Informativa |

Nada de esto impide usar el panel ni rompe ninguna vista.

## 7. Falsos positivos que debo declarar

Mi primera pasada marcó dos fallos que **no eran del panel**:

1. «La auditoría no registra los cambios» → registra 4 entradas. Yo buscaba el nombre del
   producto en pantalla; la auditoría guarda el id. **Error mío.**
2. «Un precio inválido no muestra error» → el campo tiene `min=0` y el navegador bloquea
   el envío antes de llamar a la API, con su propio mensaje. **Error mío**: esperaba el
   mensaje estilizado de la aplicación, que sí aparece cuando el rechazo viene del servidor.

## 8. Recomendaciones priorizadas

1. **Subir los encabezados de tabla a 10-11 px** y los botones de fila a ≥44 px en móvil
   (P1 y P2). Es un cambio de CSS acotado, sin tocar estructura ni lógica.
2. **Revisar la tabla en teléfono** (P3): o primera columna fija, o convertir cada fila en
   tarjeta por debajo de 600 px. Decidir con capturas delante, no ahora.
3. **Bajar el bloque de auditoría a 25-50 entradas** por página (P4).
4. **Solicitudes** queda fuera del alcance de diseño: necesita una decisión de negocio
   sobre el canal de captura.
5. Congelar el resto: el acceso ya está aprobado y no conviene seguir moviéndolo.

## 9. Dictamen

**GO para la aprobación visual del panel.** Las doce pantallas existen, once están
operativas, la navegación funciona en las tres resoluciones, no hay desbordamientos ni
excepciones, y el ciclo completo de un producto (crear, editar, publicar, ocultar) se
refleja correctamente en el catálogo del emulador con su auditoría.

**Con tres reservas menores** —encabezados de tabla a 9 px, botones de fila a 35 px y
tablas que exigen desplazamiento en teléfono— que conviene corregir antes de dar el
diseño por definitivo, pero no antes de que el propietario vea las capturas.

**NO-GO para producción** por las razones ya conocidas y ajenas al diseño: las reglas v3
siguen sin desplegar, no hay alojamiento para la API y el contrato sigue en
`HARNESS_CONTRACT_RECEIVED_LOCAL_ONLY`.

---

*Revisión de solo lectura sobre la interfaz. Sin push, sin merge, sin despliegue, sin
datos reales, sin Blaze y sin Cloudinary. Los datos de prueba del recorrido quedan en el
emulador y desaparecen al reiniciarlo.*
