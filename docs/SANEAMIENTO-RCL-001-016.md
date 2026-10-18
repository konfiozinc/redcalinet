# Saneamiento local RCL-001 a RCL-016

Base: `7735b6e6391b2b3c51f536947235bb09113f671a`.
Rama: `fix/redcalinet-saneamiento-integral`. Sin publicación autorizada.

«CORREGIDO» significa implementado y validado localmente, no confirmado en producción.

| ID | Estado local | Implementación y límite |
|---|---|---|
| RCL-001 | CORREGIDO | Campos sin name, deshabilitados hasta registrar el manejador y CSP form-action none. Enter, submit nativo y ausencia de JS cubiertos. |
| RCL-002 | CORREGIDO | HTML completo, enlaces estáticos y menú sin espera de configuración; alternativa sin JS visible. |
| RCL-003 | CORREGIDO | Validación previa; configuración inválida conserva HTML anterior. Eliminado fetch runtime. |
| RCL-004 | CORREGIDO | Sin escritura/lectura de borradores; retirada mínima de clave antigua. No se pueden borrar remotamente borradores de navegadores que no visiten esta versión. |
| RCL-005 | CORREGIDO | hidden retira el flotante de Tab; si ya tiene foco se preserva hasta abandonarlo. |
| RCL-006 | CORREGIDO | Flex/grid, controles y horarios adaptables; raíz 32 px en móvil/escritorio. Zoom visual CDP y reflow equivalente cubiertos; interfaz de zoom y dispositivos físicos pendientes. |
| RCL-007 | CORREGIDO | Continuación recuperable; no afirma envío; tolera ventana nula, excepción y API ausente. Entrega real no verificada. |
| RCL-008 | CORREGIDO | Configuración y plantillas generan HTML, contactos, OG, Twitter y JSON-LD. --check detecta desincronización. Es obligatorio generar antes de publicar. |
| RCL-009 | CORREGIDO | Contenido visible y print sin scroll; PDF contiene servicios y beneficios. |
| RCL-010 | MITIGADO | Documentada limitación y vía de webmaster. Descubrimiento real pendiente del propietario; no se modifica raíz compartida. |
| RCL-011 | CORREGIDO | Fuente del sistema, recursos locales y política actualizada. |
| RCL-012 | MITIGADO | HTTPS validado, CSP meta restrictiva y referrer no-referrer probadas. Cabeceras HTTP/frame-ancestors requieren decisión separada. |
| RCL-013 | CORREGIDO | aria-invalid, error por campo, asociación y foco; limpieza al editar. Lector de pantalla real pendiente. |
| RCL-014 | CORREGIDO | Iconos WhatsApp oscuros sobre verde existente, contraste mayor de 3:1; logotipos preservados. |
| RCL-015 | CORREGIDO | Documentación exacta de galería, generación, privacidad y respaldos externos no verificados. |
| RCL-016 | MITIGADO | Retirados render/fallback duplicados y cálculos/atributos/reglas sin uso; regresiones incorporadas. Tres archivos públicos conservados por consumidores externos desconocidos. |

## Arquitectura y compatibilidad

Node solo genera artefactos y ejecuta QA; no se añade backend ni framework.
El navegador carga HTML/CSS/JS locales, sin datos remotos, fuentes externas,
analítica ni almacenamiento de consultas. Contenido comercial, contactos, precios
por consulta y horarios se conservan. No se envían mensajes reales.

Actualizar data.json requiere ejecutar `node herramientas/generar-sitio.cjs` y
versionar sus salidas. Se añaden campos estructurados sin retirar los anteriores.
El esquema rechaza configuraciones incompatibles antes de escribir. No se probó
un consumidor externo desconocido de data.json; el sitio ya no lo consulta.
No se cambian nombres ni contenidos de imágenes públicas.

La privacidad pasa a CSS externo por CSP. Se conservan marca, paleta, galería y
tarjetas; el flotante móvil se coloca más abajo para reducir interferencia. El
formulario añade preparación, continuación y errores asociados. No se presume
un panel privado: esta landing no tiene administración o autenticación.

## Seguridad y pruebas

Las pruebas usan fixtures y copias temporales, sin Firebase, servicios de pago,
correos o WhatsApp real. El servidor sirve una lista de archivos públicos en
loopback y cierra al terminar. CSP niega fetch y envíos nativos; conserva SVG,
JSON-LD, CSS y JS de mismo origen. Sin unsafe-inline ni unsafe-eval.

Al abrir WhatsApp su proveedor recibe el texto en la URL aunque todavía no se
haya enviado al negocio. La política lo explica. El sitio no puede garantizar
entrega. El origen Pages sigue compartido: self se delimita por origen, no por
carpeta. No guardar datos nuevos en localStorage reduce esa superficie, pero no
crea aislamiento entre proyectos.

## Pendientes antes de publicar

1. Revisar diff y resultados reales de regresión; ejecutar generación y --check.
2. Aceptar el procedimiento de generación; no publicar data.json aislado.
3. Comprobar Safari/iOS, Firefox, zoom de interfaz y lector real según disponibilidad.
   Reflow/DPR no equivale a probar todos los controles de zoom del navegador.
4. Propietario: acreditar sitemap en webmaster/origen sin tocar otros repositorios.
5. Propietario: decidir si necesita cabeceras de framing y origen propio.
   No añadir frame-ancestors a meta: no resulta eficaz ahí.
6. Conservar variantes antiguas hasta conocer sus consumidores externos:
   apple-touch-180.webp, favicon-64.png y og-image.webp.
7. Autorizar integración/publicación por separado y revisar automatismos de Pages.
8. Validar el empaquetado Jekyll de `_config.yml`: las exclusiones se revisan
   estáticamente; no se ejecutó Ruby/Jekyll ni el pipeline remoto de publicación.

## Reversión

No se cambió producción. Para descartar el lote conservar la rama y usar otra
copia en el commit base; no modificar main ni forzar historial. Una reversión
posterior a publicación requiere commit revisado y autorización: la base contiene
RCL-001. No hay migraciones de servidor ni reglas. El borrado de la clave local
antigua es intencional y no recupera su contenido.

El generador valida y prepara ambas páginas antes de escribir, pero sus dos
renames no son una transacción global. Tras interrupción ejecutar de nuevo y
verificar --check antes de publicar. Windows/NTFS no se verificó.

## Resultado ejecutado

Suite conjunta en Node 24 y Chromium: **65 pruebas aprobadas, 0 fallidas,
0 canceladas y 0 omitidas** (31 de configuración/generación y 34 de navegador).
Incluye siete anchos, raíz 32 px en 320/375/1024, zoom visual 2× por CDP,
reflow equivalente, Tab/Escape, errores ARIA, PDF sin scroll, fixtures de apertura
fallida, datos incompatibles, HTML inocuo y ensayos negativos de CSP.

Navegaciones normales: cero excepciones e intentos externos. No hubo GET con
campos ni POST al alojamiento de prueba. Contraste de iconos: 8,78:1. En 320 px
con raíz 32 px el documento mide 320 px y el formulario termina en 300 px.
Sintaxis, --check y diff sin errores. Negocio original, sprite e imágenes se
conservan. Primera pasada: cinco fallos de harness (espera de lazy loading y
extracción de PDF en columnas); se corrigió la sincronización/lectura antes de
contar la validación como aprobada. No se rebajaron a omitidas.

Evidencias: ../validacion-saneamiento/pruebas.tap, navegador.json, capturas y PDF
fuera del repositorio. La configuración Jekyll solo se verificó estáticamente;
Ruby/Jekyll no están disponibles. No se validó producción con las correcciones.
