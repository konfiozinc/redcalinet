'use strict';
/* ============================================================
 * Contrato estático del catálogo público (sin navegador).
 * ------------------------------------------------------------
 * Atrapa errores que ni el CSS ni los datos detectan solos:
 *   - ids que script.js busca y no existen en index.html,
 *   - iconos del sprite referenciados y no definidos,
 *   - clases que el JS genera y que el CSS no estiliza,
 *   - restos de la galería anterior,
 *   - JSON-LD mal formado.
 *
 * Ejecutar: node tools/test-contrato-estatico.js
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const html = leer('index.html');
const js = leer('script.js');
const css = leer('styles.css');
const data = JSON.parse(leer('data.json'));

let ok = 0, fail = 0;
const chk = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  PASA   ' + nombre.padEnd(58) + (detalle === undefined ? '' : detalle)); }
  else { fail++; console.log('  **FALLA** ' + nombre.padEnd(56) + (detalle === undefined ? '' : detalle)); }
};

const unicos = (lista) => Array.from(new Set(lista));

/* ---------- 1. Ids del DOM que pide el script ---------- */
console.log('== Ids del DOM ==');
const idsHtml = new Set(unicos(Array.from(html.matchAll(/\bid="([^"]+)"/g), (m) => m[1])));
const idsPedidos = unicos(Array.from(js.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g), (m) => m[1]));

chk('el script pide ids (detecta referencias)', idsPedidos.length >= 10, idsPedidos.length + ' ids');
const faltantes = idsPedidos.filter((id) => !idsHtml.has(id));
chk('todo id que el script usa existe en el HTML', faltantes.length === 0,
  faltantes.length ? 'faltan: ' + faltantes.join(', ') : 'ninguno');

const idsCss = unicos(Array.from(css.matchAll(/#([A-Za-z][A-Za-z0-9_-]*)/g), (m) => m[1]))
  .filter((id) => !/^[0-9a-f]{3,8}$/i.test(id));
const idsCssFaltantes = idsCss.filter((id) => !idsHtml.has(id));
chk('todo id que el CSS estiliza existe en el HTML', idsCssFaltantes.length === 0,
  idsCssFaltantes.length ? 'faltan: ' + idsCssFaltantes.join(', ') : 'ninguno');

/* ---------- 2. Iconos del sprite ---------- */
console.log('\n== Iconos del sprite SVG ==');
const simbolos = new Set(unicos(Array.from(html.matchAll(/<symbol id="(i-[a-z]+)"/g), (m) => m[1])));
chk('el sprite define iconos', simbolos.size >= 10, simbolos.size + ' símbolos');

/* Referencias: etiquetas <use href="#i-x"> del HTML, svg("i-x") del JS e
   icono de data.json. Si falta uno, el sitio cae al icono por defecto sin avisar. */
const refHtml = Array.from(html.matchAll(/href="#(i-[a-z]+)"/g), (m) => m[1]);
const refJs = Array.from(js.matchAll(/svg\("(i-[a-z]+)"/g), (m) => m[1]);
const refDatos = [];
data.categorias.forEach((c) => { if (c.icono) refDatos.push(c.icono); });
data.beneficios.forEach((b) => { if (b.icono) refDatos.push(b.icono); });

const refIconos = unicos(refHtml.concat(refJs, refDatos));
const iconosRotoss = refIconos.filter((i) => !simbolos.has(i));
chk('todo icono referenciado está en el sprite', iconosRotoss.length === 0,
  iconosRotoss.length ? 'faltan: ' + iconosRotoss.join(', ') : refIconos.length + ' referencias');
chk('existe el icono del buscador', simbolos.has('i-buscar'));
chk('existe el icono de cerrar', simbolos.has('i-cerrar'));
chk('los iconos de data.json son válidos',
  refDatos.every((i) => /^i-[a-z]+$/.test(i)), unicos(refDatos).join(', '));

/* ---------- 3. Clases que el JS genera ---------- */
console.log('\n== Clases del catálogo (JS ↔ CSS) ==');
const clasesCss = new Set(unicos(Array.from(css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g), (m) => m[1])));

const REQUERIDAS = [
  'catalogo__barra', 'catalogo__buscador', 'catalogo__limpiar', 'catalogo__filtros',
  'catalogo__cuenta', 'catalogo__grid', 'catalogo__vacio', 'filtro', 'filtro__n',
  'ficha--producto', 'ficha__media', 'ficha__cat', 'ficha__precio', 'ficha__lista',
  'ficha__acciones', 'ficha__ver', 'ficha__cta', 'ficha__etiqueta', 'ficha__sinfoto',
  'ficha-modal', 'ficha-modal__fondo', 'ficha-modal__caja', 'ficha-modal__cerrar',
  'ficha-modal__in', 'ficha-modal__media', 'ficha-modal__txt', 'ficha-modal__estado',
  'categoria__pie', 'categoria__nota', 'sin-scroll', 'sr-only', 'revelar',
  /* KZ-REDCALINET-007: se arman en variables, el escáner no las ve literales. */
  'ficha__meta', 'ficha__tipo', 'ficha__tipo--servicio', 'ficha__tipo--producto',
  'ficha__portada', 'ficha--fisico', 'ficha--servicio', 'hero__valores', 'hero__contacto'
];

const sinEstilo = REQUERIDAS.filter((c) => !clasesCss.has(c));
chk('toda clase del catálogo está estilizada', sinEstilo.length === 0,
  sinEstilo.length ? 'sin CSS: ' + sinEstilo.join(', ') : REQUERIDAS.length + ' clases');

/* Cada lista de clases escrita literalmente en el JS debe existir en el CSS.
   Las que se arman concatenando se cubren con REQUERIDAS. */
const clasesEnJs = unicos(Array.from(js.matchAll(/class="([^"]*)"/g))
  .map((m) => m[1])
  .filter((v) => v && !/[+'"`]/.test(v))
  .flatMap((v) => v.split(/\s+/))
  .filter((c) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(c))
  .filter((c) => !/^i-/.test(c)));
const clasesJsSinCss = clasesEnJs.filter((c) => !clasesCss.has(c) && c !== 'ico');
chk('las clases generadas por el JS tienen CSS', clasesJsSinCss.length === 0,
  clasesJsSinCss.length ? 'sin CSS: ' + clasesJsSinCss.join(', ') : clasesEnJs.length + ' clases');

/* ---------- 4. Restos de la galería anterior ---------- */
console.log('\n== Limpieza de la versión anterior ==');
chk('el HTML no menciona la galería retirada', html.indexOf('galeria__') === -1);
chk('el CSS no conserva estilos de la galería', css.indexOf('.galeria__') === -1);
chk('las imágenes de producto siguen en su sitio',
  fs.existsSync(path.join(ROOT, 'assets/img/galeria/iphone.webp')) &&
  fs.existsSync(path.join(ROOT, 'assets/img/galeria/honor-magic.webp')));

/* ---------- 5. Estructura del catálogo ---------- */
console.log('\n== Estructura de la página ==');
chk('existe la sección #catalogo', /id="catalogo"/.test(html));
chk('el menú enlaza al catálogo', /<a href="#catalogo">/.test(html));
chk('existe el buscador', /id="catBuscar"/.test(html));
chk('existe la rejilla de productos', /id="catGrid"/.test(html));
chk('existe el modal de ficha', /id="fichaModal"/.test(html));
chk('el modal es un diálogo modal accesible',
  /role="dialog"[^>]*aria-modal="true"/.test(html.replace(/\s+/g, ' ')) ||
  /aria-modal="true"[^>]*role="dialog"/.test(html.replace(/\s+/g, ' ')));
chk('el buscador tiene etiqueta accesible', /<label class="sr-only" for="catBuscar">/.test(html));
chk('las imágenes del catálogo son lazy', /loading="lazy"/.test(js));
chk('el sprite sigue siendo inline (sin CDN externo)', html.indexOf('<svg class="sprite"') !== -1);

/* ---------- 6. JSON-LD ---------- */
console.log('\n== Datos estructurados ==');
const bloqueLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
chk('existe el bloque JSON-LD', Boolean(bloqueLd));
if (bloqueLd) {
  let ld = null;
  try { ld = JSON.parse(bloqueLd[1]); } catch (e) { /* inválido */ }
  chk('el JSON-LD es JSON válido', ld !== null);
  chk('el JSON-LD declara el negocio', Boolean(ld && ld['@type'] === 'LocalBusiness' && ld.name));
  chk('el JSON-LD lista las 4 categorías',
    Boolean(ld && ld.hasOfferCatalog && ld.hasOfferCatalog.itemListElement.length === 4));
}

/* ---------- 7. Coherencia de datos ---------- */
console.log('\n== Coherencia entre data.json y la página ==');
const totalFichas = data.categorias.reduce((n, c) => n + (c.fichas || []).length, 0);
chk('data.json tiene productos', totalFichas > 0, totalFichas + ' productos');
chk('ninguna ficha tiene precio inventado',
  data.categorias.every((c) => (c.fichas || []).every((f) => f.precio === null)),
  'todos los precios quedan en "consultar"');
const nombresFichas = data.categorias.flatMap((c) => (c.fichas || []).map((f) => f.nombre));
chk('los nombres de producto no se repiten', new Set(nombresFichas).size === nombresFichas.length);

const respaldo = js.match(/const FALLBACK = (\{[\s\S]*?\n\});/);
chk('el script trae el respaldo embebido', Boolean(respaldo));

/* ---------- 8. Compatibilidad con el panel administrativo ---------- */
console.log('\n== Compatibilidad con el panel (Codex Sites) ==');

const rutaPanel = path.join(ROOT, 'admin/panel.js');
if (!fs.existsSync(rutaPanel)) {
  chk('panel administrativo localizado', false, 'no existe admin/panel.js: se omite la comprobación');
} else {
  const panel = leer('admin/panel.js');
  /* Campos que el panel escribe en `servicios` y en `categorias`. */
  const camposServicio = unicos(Array.from(panel.matchAll(/fd\.get\("([A-Za-z]+)"\)/g), (m) => m[1]));
  const camposCategoria = unicos(Array.from(panel.matchAll(/name="([A-Za-z]+)"/g), (m) => m[1]));

  chk('el panel escribe campos', camposServicio.length >= 5, camposServicio.join(', '));

  /* El catálogo accede a los documentos con punto (doc.nombre, cat.icono…),
     así que el campo cuenta como leído si aparece como `<algo>.<campo>`. */
  const leido = (campo) => new RegExp('\\.' + campo + '\\b').test(js) || js.indexOf('"' + campo + '"') !== -1;
  const todos = unicos(camposServicio.concat(camposCategoria));
  const ignorados = todos.filter((c) => !leido(c));
  chk('el catálogo lee todos los campos que el panel escribe',
    ignorados.length === 0, ignorados.length ? 'ignora: ' + ignorados.join(', ') : todos.length + ' campos');

  /* Si el catálogo ignora un campo del panel, el propietario editaría algo
     que no se ve. Es la garantía de que Codex Sites pueda gestionarlo después. */
  const estadosPanel = unicos(Array.from(panel.matchAll(/"(BORRADOR|PUBLICADO|OCULTO)"/g), (m) => m[1]));
  chk('el catálogo conoce los tres estados del panel', estadosPanel.length === 3, estadosPanel.join(', '));
  chk('el estado PUBLICADO aparece en el catálogo', js.indexOf('"PUBLICADO"') !== -1);
}

/* ---------- 9. Enlaces comerciales ---------- */
console.log('\n== WhatsApp, Facebook y teléfono ==');
const wa = data.contacto.whatsapp;
chk('el WhatsApp es un número válido de Colombia', /^57\d{10}$/.test(wa), wa);
const redWa = data.redes.find((r) => r.id === 'whatsapp');
chk('el enlace de WhatsApp apunta al número correcto',
  Boolean(redWa) && redWa.url === 'https://wa.me/' + wa, redWa ? redWa.url : 'falta');
const redFb = data.redes.find((r) => r.id === 'facebook');
chk('hay enlace de Facebook', Boolean(redFb && /^https:\/\/www\.facebook\.com\//.test(redFb.url)),
  redFb ? redFb.url : 'falta');
chk('el sitio genera enlaces de WhatsApp', js.indexOf('https://wa.me/') !== -1);
chk('el JSON-LD publica el teléfono', html.indexOf('"+' + wa + '"') !== -1 || html.indexOf(wa) !== -1);
chk('el formulario abre WhatsApp (no guarda en servidor)', js.indexOf('window.open(waLink') !== -1);

/* ---------- 10. El respaldo local no publica ofertas caducadas ---------- */
console.log('\n== Respaldo local: sin precios ni promociones ==');
const clavesProhibidas = [];
(function recorrer(nodo, ruta) {
  if (nodo === null || typeof nodo !== 'object') return;
  Object.keys(nodo).forEach((k) => {
    if (/promo|descuento|oferta|cupon|cupón|vigencia|vigente/i.test(k)) clavesProhibidas.push(ruta + '.' + k);
    recorrer(nodo[k], ruta + '.' + k);
  });
})(data, 'data');
chk('el respaldo no trae campos de promoción', clavesProhibidas.length === 0, clavesProhibidas.join(', '));

const preciosReales = [];
(function buscarPrecios(nodo, ruta) {
  if (nodo === null || typeof nodo !== 'object') return;
  Object.keys(nodo).forEach((k) => {
    const v = nodo[k];
    if (k === 'precio' && v !== null && v !== undefined) preciosReales.push(ruta);
    buscarPrecios(v, ruta + '.' + k);
  });
})(data, 'data');
chk('el respaldo no publica ningún precio', preciosReales.length === 0, preciosReales.join(', ') || 'todos en null');

const notaStreaming = (data.categorias.find((c) => c.id === 'streaming') || {}).nota || '';
chk('la categoría con antecedentes aclara que no es oferta vigente',
  /no se publican como oferta vigente/i.test(notaStreaming), notaStreaming.slice(0, 60) + '…');
chk('las categorías con antecedentes llevan nota',
  data.categorias.filter((c) => ['streaming', 'tecnologia'].indexOf(c.id) !== -1).every((c) => c.nota && c.nota.length > 20));

/* ---------- 11. Comportamiento responsive del catálogo ---------- */
console.log('\n== Rejilla responsive ==');
const bloque = (desde) => {
  const m = css.match(new RegExp('@media \\(min-width: ' + desde + 'px\\) \\{([\\s\\S]*?)\\n\\}', ''));
  return m ? m[1] : '';
};
const base = css.slice(css.indexOf('.catalogo__grid {'), css.indexOf('.catalogo__grid {') + 320);
chk('la rejilla base es de una columna', /grid-template-columns: 1fr/.test(base));
chk('a 620px pasa a dos columnas',
  /catalogo__grid[^}]*repeat\(2, 1fr\)/.test(css), 'regla de 620px');
chk('a 900px pasa a tres columnas',
  /@media \(min-width: 900px\) \{[^@]*catalogo__grid[^}]*repeat\(3, 1fr\)/.test(css), 'regla de 900px');
chk('el modal pasa a dos paneles en pantalla ancha',
  /ficha-modal__in \{ grid-template-columns/.test(css));
chk('respeta prefers-reduced-motion',
  /@media \(prefers-reduced-motion: reduce\)/.test(css) && /\.ficha--producto:hover/.test(css));

console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
process.exit(fail ? 1 : 0);
