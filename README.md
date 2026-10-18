# Red CaliNet

Landing estática de Red CaliNet en Bello, Antioquia. HTML, CSS y JavaScript nativo;
sin backend, paquetes de aplicación, fuentes remotas ni analítica incorporada.
La galería contiene dos fotografías. Los precios y disponibilidad se consultan
por WhatsApp; la web no procesa compras ni pagos.

## Contenido y generación local

`data.json` es la fuente de configuración. `plantillas/index.html` y
`plantillas/privacidad.html` contienen estructura y textos editoriales.
**No editar a mano `index.html` ni `privacidad.html`: son salidas generadas.**

Con Node ya disponible en el entorno de trabajo, sin instalar paquetes:

```sh
node herramientas/generar-sitio.cjs
node herramientas/generar-sitio.cjs --check
node --test --test-isolation=none pruebas/contenido.test.cjs
```

Se validan marca, contacto, HTTPS sin credenciales, teléfono numérico, dirección
postal, servicios, detalles, iconos, redes y horarios antes de escribir. Una entrada
inválida, un JSON ausente/incompatible o una plantilla ausente impide generar y
conserva los archivos anteriores. `--check` detecta salidas obsoletas. No se consulta
`data.json` desde el navegador: fallos o demoras de esa ruta no bloquean el sitio
ni activan un segundo juego de datos.

El contrato conserva los campos anteriores y añade `sitio.url`,
`sitio.areaServida`, `contacto.direccionPostal` y `horarios[].dias` para canonical y JSON-LD. La URL debe
ser HTTPS y terminar en `/`. La dirección visible debe contener calle, localidad
y región de su representación postal. Las horas usan `HH:MM – HH:MM`; `dias`
utiliza nombres Schema.org en inglés y debe coincidir con la etiqueta española
`dia`. Este lote conserva los horarios y condiciones comerciales anteriores.

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
