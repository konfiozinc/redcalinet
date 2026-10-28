# Red CaliNet

Landing estática de Red CaliNet en Bello, Antioquia. HTML, CSS y JavaScript nativo;
sin backend, paquetes de aplicación, fuentes remotas ni analítica incorporada.
La galería contiene dos fotografías. Los precios y disponibilidad se consultan
por WhatsApp; la web no procesa compras ni pagos.

> **Tu conexión con servicios y soluciones digitales** — Servicio garantizado, lo primordial para nosotros es el cliente.

`data.json` es la fuente de configuración. `plantillas/index.html` y
`plantillas/privacidad.html` contienen estructura y textos editoriales.
**No editar a mano `index.html` ni `privacidad.html`: son salidas generadas.**

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

`tools/test-catalogo-dom.js` ejecuta ~104 comprobaciones (catálogo, imágenes, precios, WhatsApp,
filtros, búsqueda, fichas, teclado, desplazamiento, contraste WCAG AA y consola) y captura las
**siete resoluciones oficiales** —320×640, 360×640, 375×667, 390×844, 768×1024, 1024×768 y
1440×900— verificando en cada una desbordamiento, columnas de rejilla, solapamiento, ancho de
tarjeta y posición del título respecto a la cabecera. Deja las capturas en `capturas/responsive/`
y un informe legible por máquina en `capturas/informe-visual.json`.

Necesita que el entorno permita los canales IPC de Chromium; si el lanzamiento directo falla, se
arranca el navegador aparte y se apunta con `KZ_CDP_URL`. Estado y dictamen en
[`docs/misiones/INFORME-KZ-REDCALINET-006.md`](docs/misiones/INFORME-KZ-REDCALINET-006.md).

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

Se validan marca, contacto, HTTPS sin credenciales, teléfono numérico, dirección
postal, servicios, detalles, iconos, redes y horarios antes de escribir. Una entrada
inválida, un JSON ausente/incompatible o una plantilla ausente impide generar y
conserva los archivos anteriores. `--check` detecta salidas obsoletas. No se consulta
`data.json` desde el navegador: fallos o demoras de esa ruta no bloquean el sitio
ni activan un segundo juego de datos.

Edita `data.json` (marca, contacto, horarios, redes, `categorias` → `fichas`, y beneficios).
Cada ficha admite `nombre`, `descripcion`, `precio` (`null` = "consultar por WhatsApp"),
`detalles` (lista) e `imagen` (ruta local o URL de Cloudinary; vacío = icono de la categoría).
Si cambias los datos ahí, **replica el cambio en el objeto `FALLBACK`**
de `script.js`, que es el respaldo que se usa cuando `data.json` no se puede leer
(p. ej. abriendo el HTML con `file://`).

Redes con URL vacía no producen botones. No se aceptan HTTP, esquemas de datos,
credenciales en URL ni puertos alternativos. La configuración sigue siendo pública:
no introducir claves ni datos de clientes.

## Formulario y privacidad

El HTML contiene servicios, contactos y enlaces operativos sin JavaScript.
Sin JavaScript el formulario permanece deshabilitado y ofrece contacto directo.
Con JavaScript prepara un enlace; no puede confirmar envío, recepción ni
disponibilidad de WhatsApp. La continuación queda visible incluso si falla la
apertura automática. Los campos no tienen `name` y CSP deniega envío nativo.

No se escriben ni restauran nombre/correo mediante localStorage. Se intenta borrar
solo la clave antigua `redcalinet-contacto`, sin leerla ni tocar otras aplicaciones.
Un navegador que no vuelva a cargar esta versión o impida el borrado puede conservar
el borrador anterior; puede eliminarse desde sus ajustes.

Al abrir WhatsApp su proveedor recibe el texto en la URL antes de que el visitante
decida enviar el mensaje. La política describe ese paso. El formulario limita el
nombre a 120, el correo a 254 y el mensaje a 2000 caracteres. No hay Google Fonts.

## Regresiones de navegador

Requieren herramientas QA **ya disponibles**: Node, Playwright, Chromium y
`pdftotext`. No son dependencias de la aplicación publicada ni se solicita
instalarlas en el computador del propietario.

```sh
node --test --test-isolation=none pruebas/contenido.test.cjs pruebas/navegador.test.cjs
```

El harness sirve solo `127.0.0.1` bajo `/redcalinet/`, bloquea conexiones externas y
service workers y sustituye la apertura de WhatsApp. Usa identidades ficticias.
Guarda evidencias fuera del checkout en `../validacion-saneamiento/`;
`RCL_EVIDENCIAS` permite otra carpeta y `RCL_CHROMIUM` otro binario ya disponible.
Los ensayos negativos de CSP generan violaciones **esperadas**; las navegaciones
normales deben quedar sin violaciones, excepciones ni intentos de red externos.

## Publicación, robots y recuperación

El sitio existente utiliza GitHub Pages, main y la raíz del repositorio, bajo
`https://konfiozinc.github.io/redcalinet/`. Pages no ejecuta el generador: antes de
una publicación autorizada deben estar versionadas las dos salidas actualizadas
y pasar `--check`. Un push a main puede publicar: **este lote no autoriza push,
merge ni despliegue**.

`_config.yml` excluye plantillas, herramientas, pruebas y documentación de la
publicación Jekyll para evitar páginas con variables sin resolver. Se comprueba
la configuración estáticamente; el build real de Pages debe validarse antes de
publicar porque Ruby/Jekyll no están disponibles en este entorno.

CSP y Referrer-Policy se proporcionan mediante meta compatible con Pages.
No equivale a configurar cabeceras HTTP. `frame-ancestors` no funciona en CSP meta;
el control de framing por cabecera requiere una decisión de alojamiento.

`/redcalinet/robots.txt` no sustituye a `/robots.txt` del origen compartido. Su
directiva Sitemap no acredita descubrimiento. El propietario deberá comprobar
Search Console o una configuración autorizada en la raíz. No se cambia otro
repositorio ni la raíz compartida para resolverlo.

Para recuperar una versión usar una copia limpia del commit aprobado, generar,
verificar y revisar el diff antes de integrar con autorización. No usar reset ni
force push sobre main. El generador reemplaza cada archivo por rename desde un
temporal local; no es una transacción de dos archivos ante fallo del sistema.
Si se interrumpe, repetir generación y `--check` antes de versionar. No hay
respaldos externos verificados ni un original `tools/originales/` incluido.

Los tres recursos sin referencias actuales se conservan por compatibilidad con
URLs públicas históricas: no se acreditó ausencia de consumidores externos.
No se cambian logotipos ni fotografías. Detalle: `docs/SANEAMIENTO-RCL-001-016.md`.

El agente IA de Konfío Zinc mantiene auditoría específica pendiente; estas pruebas
validan exclusivamente el alcance local de Red CaliNet.
