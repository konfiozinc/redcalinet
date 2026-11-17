/**
 * HOTFIX favicon de RedCaliNet.
 *
 * Hallazgo: los 5 iconos declarados devuelven 200, así que no hay 404. El
 * problema es `favicon.svg`: no es un dibujo vectorial, es un PNG embebido en
 * base64 (997 B) — casi seguro el logo VIEJO — y al ir declarado el último,
 * Chrome tiende a preferirlo. Resultado: pestaña con el icono viejo o el globo
 * genérico aunque los PNG nuevos estén perfectos.
 *
 * Qué hace:
 *  1. Regenera `favicon.svg` embebiendo el logo NUEVO (apple-touch 180 px).
 *  2. Reordena el <head>: PNG primero (el que más navegadores entienden), luego
 *     webp, apple-touch y el SVG al final.
 *
 * Uso: node hotfix-favicon.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet";
const INDICE = path.join(RAIZ, "index.html");
const FUENTE_PNG = path.join(RAIZ, "assets/logo/apple-touch-icon.png");

/* ── 1 · favicon.svg con el logo nuevo dentro ─────────────────────────── */
const png = fs.readFileSync(FUENTE_PNG).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Red CaliNet">
  <image href="data:image/png;base64,${png}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
const rutaSvg = path.join(RAIZ, "favicon.svg");
const antesSvg = fs.statSync(rutaSvg).size;
fs.writeFileSync(rutaSvg, svg, "utf8");
console.log(`favicon.svg regenerado: ${antesSvg} B -> ${fs.statSync(rutaSvg).size} B (logo nuevo embebido)`);

/* ── 2 · reordenar las declaraciones de icono ─────────────────────────── */
let html = fs.readFileSync(INDICE, "utf8");
const lineas = html.split(/\r?\n/);
const esIcono = (l) => /<link[^>]+rel="(icon|apple-touch-icon)"/i.test(l);
const quitadas = lineas.filter(esIcono);
const sinIconos = lineas.filter((l) => !esIcono(l));

const bloque = [
  '  <link rel="icon" type="image/png" sizes="32x32" href="assets/logo/favicon-32.png">',
  '  <link rel="icon" type="image/webp" sizes="32x32" href="assets/logo/favicon-32.webp">',
  '  <link rel="icon" type="image/webp" sizes="64x64" href="assets/logo/favicon-64.webp">',
  '  <link rel="apple-touch-icon" sizes="180x180" href="assets/logo/apple-touch-icon.png">',
  '  <link rel="icon" type="image/svg+xml" href="favicon.svg">'
];
const pos = sinIconos.findIndex((l) => /<\/head>/i.test(l));
sinIconos.splice(pos === -1 ? sinIconos.length : pos, 0, ...bloque);
html = sinIconos.join("\n");
fs.writeFileSync(INDICE, html, "utf8");

console.log(`declaraciones de icono: ${quitadas.length} reemplazadas por ${bloque.length}, en este orden:`);
bloque.forEach((b) => console.log("   " + b.trim()));
