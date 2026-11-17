/**
 * RedCaliNet · identidad visual del panel de administración (Worker).
 *
 * El panel es un build de Vite que se sirve desde `public/admin/`. Por eso los
 * iconos NO pueden vivir en la raíz del repo: tienen que viajar dentro del
 * Worker y declararse con ruta ABSOLUTA `${'/admin/assets/…'}`, porque la ruta relativa
 * `../../../../favicon.svg` se sale del Worker y produce el 404 compartido.
 *
 * Qué hace:
 *  1. Copia los iconos del logo nuevo a `public/admin/assets/`.
 *  2. Sustituye el logo del sidebar (`logo-200-CE6pxme8.webp`) por el mismo
 *     nombre de archivo pero con el logo nuevo a 400 px: misma URL, doble
 *     resolución, sin tocar el JavaScript compilado.
 *  3. Inserta en el <head> título, descripción, Open Graph e iconos absolutos.
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet";
const LOGO = path.join(RAIZ, "assets/logo");
const ADMIN = path.join(RAIZ, "redcalinet/admin-worker/public/admin");
const ASSETS = path.join(ADMIN, "assets");
const INDICE = path.join(ADMIN, "index.html");

/* 1 · copiar iconos */
for (const f of ["favicon-32.png", "favicon-32.webp", "favicon-64.webp", "apple-touch-icon.png"]) {
  fs.copyFileSync(path.join(LOGO, f), path.join(ASSETS, f));
}
console.log("iconos copiados al Worker: favicon-32.png, favicon-32.webp, favicon-64.webp, apple-touch-icon.png");

/* 2 · logo del sidebar a 400 px, mismo nombre de archivo */
const logoSidebar = path.join(LOGO, "logo-200.webp"); // 400x400, logo nuevo
const destinoSidebar = path.join(ASSETS, "logo-200-CE6pxme8.webp");
const antesSidebar = fs.statSync(destinoSidebar).size;
fs.copyFileSync(logoSidebar, destinoSidebar);
console.log(`logo del sidebar: ${antesSidebar} B -> ${fs.statSync(destinoSidebar).size} B (logo nuevo, 400x400)`);
for (const f of ["apple-touch-icon.png", "logo-200.webp"]) {
  if (fs.existsSync(path.join(LOGO, f))) console.log(`  fuente disponible: ${f}`);
}

/* 3 · head */
let html = fs.readFileSync(INDICE, "utf8");
const BLOQUE = [
  '<meta name="description" content="Panel de administración de Red CaliNet: catálogo, servicios y contenido del sitio.">',
  '<meta name="theme-color" content="#0b2a4a">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/admin/assets/favicon-32.png">',
  '<link rel="icon" type="image/webp" sizes="32x32" href="/admin/assets/favicon-32.webp">',
  '<link rel="icon" type="image/webp" sizes="64x64" href="/admin/assets/favicon-64.webp">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/admin/assets/apple-touch-icon.png">',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="Red CaliNet">',
  '<meta property="og:locale" content="es_CO">',
  '<meta property="og:title" content="Red CaliNet — Administración">',
  '<meta property="og:description" content="Panel de administración de Red CaliNet: catálogo, servicios y contenido del sitio.">',
  '<meta property="og:image" content="https://redcalinet-admin.konfiozinc.workers.dev/admin/assets/apple-touch-icon.png">',
  '<meta name="twitter:card" content="summary">',
  '<meta name="twitter:title" content="Red CaliNet — Administración">',
  '<meta name="twitter:description" content="Panel de administración de Red CaliNet: catálogo, servicios y contenido del sitio.">'
];

// Se quitan los iconos viejos (relativos y fuera del Worker) y se reinserta el bloque.
const antesIconos = (html.match(/<link[^>]+rel="(icon|apple-touch-icon)"[^>]*>/gi) || []).length;
html = html.replace(/<link[^>]+rel="(icon|apple-touch-icon)"[^>]*>/gi, "");

/* El panel ya traía una <meta name="description"> de OTRA cosa («tarjeta digital»)
   y con mojibake. Se retiran todas las descripciones y etiquetas sociales
   previas para que no queden duplicadas ni con texto corrupto. */
const antesMetas = (html.match(/<meta[^>]+(name="description"|property="(og|twitter):[^"]*")[^>]*>/gi) || []).length;
html = html.replace(/<meta[^>]+name="description"[^>]*>/gi, "");
html = html.replace(/<meta[^>]+property="(og|twitter):[^"]*"[^>]*>/gi, "");
console.log(`metadatos previos retirados: ${antesMetas}`);

/* Reparación de mojibake por capas de Windows-1252, igual que en la página pública. */
const CP = new Map(Object.entries({ "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8A, "‹": 0x8B, "Œ": 0x8C, "Ž": 0x8E, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9A, "›": 0x9B, "œ": 0x9C, "ž": 0x9E, "Ÿ": 0x9F }));
const marcas = (s) => (s.match(/Ã|Â[\u0080-\u00BF]|â€|Æ’/g) || []).length;
for (let i = 0; i < 6; i++) {
  if (!marcas(html)) break;
  const bytes = Buffer.allocUnsafe(html.length);
  let roto = false;
  for (let k = 0; k < html.length; k++) {
    const cp = html.codePointAt(k);
    if (cp > 0xFFFF) { roto = true; break; }
    if (cp <= 0xFF) bytes[k] = cp;
    else if (CP.has(html[k])) bytes[k] = CP.get(html[k]);
    else { roto = true; break; }
  }
  if (roto) break;
  const cand = bytes.toString("utf8");
  if (cand.includes("\uFFFD") || marcas(cand) >= marcas(html)) break;
  html = cand;
}
console.log(`mojibake restante en el HTML del panel: ${marcas(html)}`);
const yaTiene = html.includes("Red CaliNet — Administración");
if (!yaTiene) html = html.replace(/<title>[^<]*<\/title>/i, '<title>Red CaliNet — Administración</title>');
if (!/<title>/i.test(html)) html = html.replace(/<head>/i, "<head><title>Red CaliNet — Administración</title>");

const cierre = html.search(/<\/head>/i);
html = cierre === -1
  ? html.replace(/<title>/i, BLOQUE.join("") + "<title>")
  : html.slice(0, cierre) + BLOQUE.join("") + html.slice(cierre);

fs.writeFileSync(INDICE, html, "utf8");
console.log(`head: ${antesIconos} icono(s) viejo(s) retirados, ${BLOQUE.length} etiquetas nuevas insertadas`);
console.log("  título: " + ((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "?"));
