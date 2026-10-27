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
| Tecnología | iPhone, Honor Magic 8 Lite y accesorios |

Cada categoría se organiza en **fichas** por servicio/producto. Los precios se muestran
como **"Precio: consultar por WhatsApp"** hasta que el cliente entregue los valores
reales (`precio: null` en `data.json`). No se publican precios inventados.

## Catálogo público

La sección `#catalogo` es el listado único de productos del sitio (la galería fija anterior
quedó retirada). Incluye buscador, filtro por categoría, contador, estado vacío y una ficha de
detalle en modal accesible con su propio botón de WhatsApp. La sección **Servicios** ya no
repite las fichas: muestra cada categoría con un enlace que aplica el filtro en el catálogo.

### De dónde salen los datos

1. **Firestore en vivo** (`onSnapshot` sobre `categorias` y `servicios` con
   `estado == 'PUBLICADO'`). Un cambio publicado en el panel se ve al instante, sin recargar.
2. **`data.json`** si Firestore no responde, no existe el proyecto o fallan las reglas.
3. **`FALLBACK` embebido en `script.js`** si tampoco se puede leer `data.json`.

El esquema es **el que el panel ya escribe**; el catálogo no lo cambia. Campos por servicio:
`categoriaId`, `nombre`, `descripcion`, `precio` (`null` = consultar), `detalles[]`, `imagen`,
`estado`, `orden`. Los opcionales `destacado` y `agotado` se respetan si existen (orden
prioritario y overlay "No disponible").

Configuración de la empresa y contacto se leen de `configuracion/empresa` y
`configuracion/contacto`.

## Pruebas

```bash
node tools/test-catalogo-datos.js      # mapeo Firestore→catálogo, precios, buscador, filtros
node tools/test-contrato-estatico.js   # ids, iconos, clases JS↔CSS, JSON-LD, compatibilidad con el panel
node tools/test-reglas-publico.js      # reglas + integración, contra el emulador (ver abajo)
node tools/test-catalogo-dom.js        # navegador real por CDP (ver nota más abajo)
```

Las dos primeras no necesitan navegador, ni emulador, ni dependencias npm (100 comprobaciones).

### Reglas e integración con el emulador

No hace falta instalar Java: el **JetBrains Runtime de Android Studio** sirve
(`C:\Program Files\Android\Android Studio\jbr`). Se arranca el emulador directamente, porque
`firebase emulators:exec` no puede lanzar `java` en todos los entornos:

```powershell
$java = "C:\Program Files\Android\Android Studio\jbr\bin\java.exe"
$jar  = "$env:USERPROFILE\.cache\firebase\emulators\cloud-firestore-emulator-v1.22.0.jar"

# -Duser.language=en es obligatorio: con locale español el compilador de reglas
# del emulador falla con "Can't find bundle ... locale es_CO" y devuelve HTTP 500.
Start-Process -FilePath $java -ArgumentList '-Duser.language=en','-Duser.country=US',
  '-jar', "`"$jar`"", '--host','127.0.0.1','--port','8090',
  '--rules', "`"$PWD\firestore.rules`"", '--project_id','red-calinet'

$env:KZ_FIRESTORE = "http://127.0.0.1:8090"
node tools/test-reglas-publico.js
```

Comprueba que el público solo lee lo `PUBLICADO`, que `BORRADOR`/`OCULTO` dan 403, que la
consulta real del catálogo no arrastra borradores y que el mapeo no publica precios inventados.
Nunca toca producción. Antes de medir, verifica que el puerto esté libre: un emulador viejo
responde igual y arruina la medición.

Las pruebas con emulador de **Auth** (`tools/test-reglas.js`, `tools/test-e2e.js`,
`tools/test-landing.js`) necesitan `firebase emulators:exec` completo, es decir, poder lanzar
`java` con su salida capturada.

### Prueba visual

`tools/test-catalogo-dom.js` ejecuta 36 comprobaciones de comportamiento y captura **siete
resoluciones** (320×568 … 1920×1080) verificando columna de rejilla y desbordamiento. Necesita
que el entorno permita los canales IPC de Chromium; si el lanzamiento directo falla, se arranca
el navegador aparte y se apunta con `KZ_CDP_URL`. Estado y detalle en
[`docs/misiones/INFORME-KZ-REDCALINET-005.md`](docs/misiones/INFORME-KZ-REDCALINET-005.md).

## Estructura

```
index.html      Página (estructura + SEO + JSON-LD)
styles.css      Estilos (mobile-first, sin frameworks)
script.js       Catálogo + formulario -> WhatsApp + respaldo embebido
data.json       Única fuente de datos editables
firebase-config.js   Configuración pública del SDK Web de Firebase
firestore.rules      Reglas de seguridad (lectura pública solo de PUBLICADO)
tools/          Scripts de siembra y pruebas
docs/misiones/  Informes de misión (KZ-REDCALINET-*)
assets/logo/    Logo procesado (WebP/PNG/JPG) + OG image
assets/img/galeria/  Fotos de producto (WebP)
```

## Cómo editar contenido

Edita `data.json` (marca, contacto, horarios, redes, `categorias` → `fichas`, y beneficios).
Cada ficha admite `nombre`, `descripcion`, `precio` (`null` = "consultar por WhatsApp"),
`detalles` (lista) e `imagen` (ruta local o URL de Cloudinary; vacío = icono de la categoría).
Si cambias los datos ahí, **replica el cambio en el objeto `FALLBACK`**
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
