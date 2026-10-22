# Red CaliNet — Landing Page

Sitio web de **Red CaliNet** (REDCALINET) · Bello, Antioquia, Colombia.

> **Tu conexión con servicios y soluciones digitales** — Servicio garantizado, lo primordial para nosotros es el cliente.

- **En vivo:** https://konfiozinc.github.io/redcalinet/
- **WhatsApp:** [+57 301 458 5658](https://wa.me/573014585658)
- **Correo:** [redcalinetmono@gmail.com](mailto:redcalinetmono@gmail.com)
- **Instagram:** [@red_calinet](https://www.instagram.com/red_calinet)

## Categorías

| Categoría | Fichas |
|---|---|
| Streaming | Plataformas y planes (sujeto a autorización del proveedor) |
| Trámites | Pasaportes, citas RUNT, trámites de salud (asesoría/acompañamiento) |
| TV por App | Planes de televisión por aplicación |
| Tecnología | iPhone, Honor y accesorios |

Cada categoría se organiza en **fichas** por servicio/producto. Los precios se muestran
como **"Precio: consultar por WhatsApp"** hasta que el cliente entregue los valores
reales (`precio: null` en `data.json`). No se publican precios inventados.

## Estructura

```
index.html      Página (estructura + SEO + JSON-LD)
styles.css      Estilos (mobile-first, sin frameworks)
script.js       Render + formulario -> WhatsApp + fallback embebido
data.json       Única fuente de datos editables
assets/logo/    Logo procesado (WebP/PNG/JPG) + OG image
tools/originales/redcalinet.jpg   Logo original tal como lo entregó el cliente
```

## Cómo editar contenido

Edita `data.json` (marca, contacto, horarios, redes, `categorias` → `fichas`, y beneficios).
Cada ficha admite `nombre`, `descripcion`, `precio` (`null` = "consultar por WhatsApp"),
`detalles` (lista). Si cambias los datos ahí, **replica el cambio en el objeto `FALLBACK`**
de `script.js`, que es el respaldo que se usa cuando `data.json` no se puede leer
(p. ej. abriendo el HTML con `file://`).

El formulario de contacto **no guarda datos en ningún servidor**: al enviarlo se abre WhatsApp con un mensaje pre-armado. Solo se conserva nombre y correo en `localStorage` (el dispositivo del visitante) para prellenar la próxima visita.

## Publicación

GitHub Pages sirve la rama `main` desde la raíz del repo. Un `git push origin main` publica los cambios (sin `--force`; el historial se conserva).

## Notas

- El archivo original `redcalinet.png` era en realidad un **JPEG** (magic bytes `FF D8 FF E0 … JFIF`); se guardó como `tools/originales/redcalinet.jpg` con su extensión real.
- El contenido anterior de este repo (tarjeta de Nicole Montalvo, `plan-de-trabajo-musical-nicole.md`, etc.) quedó respaldado en el mirror `12-BACKUPS-ANTIGUOS/redcalinet-ANTES-DE-REDCALINET-2026-10-13.git` del workspace local, fuera de este repo público.
- Iconos: SVG inline (sin CDN, sin Font Awesome). Tipografía: Inter vía Google Fonts (preconnect + carga no bloqueante, con fallback a fuentes del sistema).

---

Sitio desarrollado por [KONFÍO ZINC](https://konfiozinc.github.io/card/).
