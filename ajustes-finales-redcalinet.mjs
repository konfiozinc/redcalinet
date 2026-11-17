/**
 * RedCaliNet · micro-ajustes finales aprobados por Dirección.
 *
 *  1. favicon.svg ligero: embebe el PNG de 32 px (antes embebía el de 180, 62 KB).
 *  2. Tildes en la meta descripción: «tramites» -> «trámites», «aplicacion» -> «aplicación».
 *
 * Los reemplazos usan límite de palabra para no tocar «aplicaciones».
 * Uso: node ajustes-finales-redcalinet.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet";

/* ── 1 · favicon ligero ───────────────────────────────────────────────── */
const png32 = fs.readFileSync(path.join(RAIZ, "assets/logo/favicon-32.png")).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Red CaliNet">
  <image href="data:image/png;base64,${png32}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
const rutaSvg = path.join(RAIZ, "favicon.svg");
const antes = fs.statSync(rutaSvg).size;
fs.writeFileSync(rutaSvg, svg, "utf8");
console.log(`favicon.svg: ${antes} B -> ${fs.statSync(rutaSvg).size} B`);

/* ── 2 · tildes ───────────────────────────────────────────────────────── */
const indice = path.join(RAIZ, "index.html");
let html = fs.readFileSync(indice, "utf8");

const cambios = [
  { de: /\btramites\b/gi, a: "trámites" },
  { de: /\baplicacion\b/gi, a: "aplicación" },
  { de: /\btecnologia\b/gi, a: "tecnología" },
  { de: /\bcatalogo\b/gi, a: "catálogo" },
  { de: /\bconexion\b/gi, a: "conexión" },
  { de: /\basesoria\b/gi, a: "asesoría" }
];

let total = 0;
for (const c of cambios) {
  const n = (html.match(c.de) || []).length;
  if (n) { html = html.replace(c.de, c.a); total += n; console.log(`  «${c.de.source}» -> «${c.a}»: ${n}`); }
}
fs.writeFileSync(indice, html, "utf8");
console.log(`  palabras con tilde restauradas: ${total}`);

const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
console.log(`  description (${desc.length} car.): ${desc}`);
