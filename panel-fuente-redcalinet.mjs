/**
 * RedCaliNet · consolidación del panel en el CÓDIGO FUENTE.
 *
 * El parche anterior se aplicó sobre el artefacto compilado (public/admin/), que
 * está ignorado por git: un `vite build` lo borraba. Esto lo lleva a la fuente:
 *
 *  1. `admin/public/assets/` con los iconos, para que Vite los copie a dist/assets/.
 *  2. `admin/index.html`: título correcto, descripción del PANEL (la que había era
 *     de la «tarjeta digital» y con mojibake), OG de administración e iconos con
 *     ruta absoluta `/admin/assets/…` (base de Vite = /admin/).
 *  3. El logo del sidebar ya se importa en `src/app.js` desde
 *     `assets/logo/logo-200.webp`, que es el archivo nuevo de 400×400: no hay que
 *     tocar el componente.
 *
 * Uso: node panel-fuente-redcalinet.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet";
const ADMIN = path.join(RAIZ, "admin");
const LOGO = path.join(RAIZ, "assets/logo");
const PUBLIC = path.join(ADMIN, "public", "assets");
const INDICE = path.join(ADMIN, "index.html");

/* 1 · iconos en public/ del fuente */
fs.mkdirSync(PUBLIC, { recursive: true });
for (const f of ["favicon-32.png", "favicon-32.webp", "favicon-64.webp", "apple-touch-icon.png"]) {
  fs.copyFileSync(path.join(LOGO, f), path.join(PUBLIC, f));
  console.log(`  copiado a admin/public/assets/: ${f}`);
}

/* 2 · head del fuente */
let html = fs.readFileSync(INDICE, "utf8");
const antes = html.length;

// Se retiran TODOS los metadatos sociales y descripciones previas (había una de
// «tarjeta digital» con mojibake, que no describe este panel).
html = html.replace(/<meta[^>]+name="description"[^>]*>/gi, "");
html = html.replace(/<meta[^>]+property="(og|twitter):[^"]*"[^>]*>/gi, "");
html = html.replace(/<link[^>]+rel="(icon|apple-touch-icon|shortcut icon)"[^>]*>/gi, "");
html = html.replace(/<title>[^<]*<\/title>/i, "");

const BLOQUE = `<title>Red CaliNet — Administración</title>
    <meta name="description" content="Panel de administración de Red CaliNet: catálogo, servicios y contenido del sitio.">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Red CaliNet">
    <meta property="og:locale" content="es_CO">
    <meta property="og:title" content="Red CaliNet — Administración">
    <meta property="og:description" content="Panel de administración de Red CaliNet: catálogo, servicios y contenido del sitio.">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Red CaliNet — Administración">
    <meta name="twitter:description" content="Panel de administración de Red CaliNet: catálogo, servicios y contenido del sitio.">
    <link rel="icon" type="image/png" sizes="32x32" href="/admin/assets/favicon-32.png">
    <link rel="icon" type="image/webp" sizes="32x32" href="/admin/assets/favicon-32.webp">
    <link rel="icon" type="image/webp" sizes="64x64" href="/admin/assets/favicon-64.webp">
    <link rel="apple-touch-icon" sizes="180x180" href="/admin/assets/apple-touch-icon.png">`;

html = html.replace(/<meta name="viewport"[^>]*>/i, (m) => m + "\n    " + BLOQUE);
if (!html.includes("Administración")) html = html.replace(/<head>/i, "<head>" + BLOQUE);
fs.writeFileSync(INDICE, html, "utf8");

console.log(`  admin/index.html: ${antes} B -> ${html.length} B`);
console.log(`  descripciones: ${(html.match(/name="description"/g) || []).length} · og: ${(html.match(/property="og:/g) || []).length} · iconos: ${(html.match(/rel="icon"|apple-touch-icon/g) || []).length}`);
console.log(`  título: ${(html.match(/<title>([^<]*)<\/title>/) || [])[1]}`);

/* 3 · el logo del sidebar, sin tocarlo: se comprueba que apunte al archivo nuevo */
const app = fs.readFileSync(path.join(ADMIN, "src", "app.js"), "utf8");
const linea = (app.match(/import logoUrl from '([^']+)'/) || [])[1] || "(no encontrado)";
const rutaLogo = path.resolve(ADMIN, "src", linea);
const kb = fs.existsSync(rutaLogo) ? Math.round(fs.statSync(rutaLogo).size / 1024) : null;
console.log(`  sidebar: importa ${linea} -> ${kb ? kb + " KB (logo nuevo, 400x400)" : "ARCHIVO NO ENCONTRADO"}`);
