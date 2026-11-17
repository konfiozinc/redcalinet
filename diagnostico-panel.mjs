/**
 * Diagnóstico del panel de administración de RedCaliNet.
 * 1) Lee el HTML local que publica el Worker: <head>, iconos y el logo del sidebar.
 * 2) Abre la URL publicada en Chromium y captura las peticiones que fallan,
 *    con su URL exacta: eso identifica el «recurso 404 compartido» de la deuda.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/RedCaliNet";
const PLAYWRIGHT = "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web/herramientas/node_modules/playwright";
const CHROME = "C:/Users/usuario29/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
const URL_PANEL = "https://redcalinet-admin.konfiozinc.workers.dev/admin/";

/* ── 1 · el HTML local ─────────────────────────────────────────────────── */
const candidatos = [
  "redcalinet/admin-worker/public/admin/index.html",
  "admin/dist/index.html",
  "admin/index.html",
  "hosting-public/admin/index.html"
];
for (const rel of candidatos) {
  const ruta = path.join(RAIZ, rel);
  if (!fs.existsSync(ruta)) { console.log(`  (no existe) ${rel}`); continue; }
  const html = fs.readFileSync(ruta, "utf8");
  const head = html.split(/<\/head>/i)[0];
  const titulo = (head.match(/<title>([^<]*)<\/title>/i) || [])[1] || "(sin título)";
  const iconos = [...head.matchAll(/<link[^>]+rel="(icon|apple-touch-icon|manifest)"[^>]*>/gi)].map((m) => m[0].trim());
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  console.log(`\n── ${rel}  (${Math.round(html.length / 1024)} KB)`);
  console.log(`   título: ${titulo}`);
  console.log(`   iconos declarados: ${iconos.length}`);
  iconos.forEach((i) => console.log("     " + i));
  console.log(`   imágenes: ${imgs.length ? imgs.join(", ") : "ninguna"}`);
  const og = [...head.matchAll(/<meta[^>]+(og:|twitter:)[^>]*>/gi)].length;
  console.log(`   etiquetas sociales: ${og}`);
}

/* ── 2 · la URL publicada, en Chromium ────────────────────────────────── */
const mod = await import(pathToFileURL(PLAYWRIGHT + "/index.js").href);
const { chromium } = mod.default || mod;
const navegador = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
try {
  const pagina = await navegador.newPage({ viewport: { width: 1366, height: 900 } });
  const fallos = [];
  pagina.on("response", (r) => { if (r.status() >= 400) fallos.push(`${r.status()} ${r.url()}`); });
  pagina.on("requestfailed", (r) => fallos.push(`FALLÓ ${r.url()} (${r.failure()?.errorText || "?"})`));
  console.log(`\n── Abriendo ${URL_PANEL}`);
  const resp = await pagina.goto(URL_PANEL, { waitUntil: "load", timeout: 45000 }).catch((e) => { console.log("   error de carga: " + e.message); return null; });
  await pagina.waitForTimeout(4000);
  console.log(`   HTTP ${resp ? resp.status() : "?"} · URL final: ${pagina.url()}`);
  console.log(`   título: ${await pagina.title()}`);
  const imgs = await pagina.evaluate(() => [...document.querySelectorAll("img")].map((i) => ({ src: i.getAttribute("src"), w: i.naturalWidth, h: i.naturalHeight })));
  console.log(`   imágenes en pantalla: ${imgs.length ? JSON.stringify(imgs.slice(0, 5)) : "ninguna"}`);
  const icono = await pagina.evaluate(() => {
    const l = document.querySelector('link[rel~="icon"]');
    return l ? l.getAttribute("href") : null;
  });
  console.log(`   icono efectivo que declara la página: ${icono || "(ninguno)"}`);
  console.log(`\n   peticiones fallidas: ${fallos.length}`);
  [...new Set(fallos)].slice(0, 10).forEach((f) => console.log("     " + f));
} finally {
  await navegador.close();
}
