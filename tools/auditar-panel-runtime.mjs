#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   RedCaliNet · auditar el PANEL contra su servidor (API en tiempo de ejecución)

   POR QUÉ EXISTE
     `herramientas/verificar-calidad-html.js --raiz ..\RedCaliNet` sirve los
     archivos como estáticos y revisa la consola. Con eso, las cuatro variantes
     del panel salen en rojo por un único error: la petición a
     `GET /admin/api/bootstrap`. Ese endpoint no es un archivo, lo sirve
     `admin/server/index.mjs`, así que un servidor de archivos no puede servirlo.

     La deuda de RedCaliNet decía que era «un recurso compartido que falta
     (script, hoja o icono)». No era eso. Para certificar el panel hay que
     auditarlo contra SU servidor, que es lo que hace este instrumento.

   QUÉ COMPRUEBA
     · el panel carga desde el servidor (HTTP 200),
     · la consola queda SIN errores y sin excepciones sin capturar,
     · ninguna petición hija responde 4xx/5xx (se listan con su URL),
     · `/admin/api/bootstrap` responde 200 y en modo local.

   REQUISITOS
     El servidor del panel levantado en modo emulador, por ejemplo:
       cd admin
       $env:RCL_MODE="emulator"; $env:GCLOUD_PROJECT="demo-redcalinet-admin"
       $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
       $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
       node server/index.mjs        # http://127.0.0.1:5176/admin/

   USO
     node tools/auditar-panel-runtime.mjs
     node tools/auditar-panel-runtime.mjs --url http://127.0.0.1:5176
   ══════════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

function argumento(nombre, porDefecto) {
  const i = process.argv.indexOf(nombre);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const BASE = argumento("--url", process.env.RCL_PANEL_URL || "http://127.0.0.1:5176").replace(/\/+$/, "");
const PAGINAS = ["/admin/", "/admin/index.html"];

async function cargarPlaywright() {
  const candidatos = [
    process.env.KZ_PLAYWRIGHT,
    path.join(RAIZ, "admin", "node_modules", "@playwright", "test", "index.js"),
    path.join(RAIZ, "admin", "node_modules", "playwright", "index.js"),
    "C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web/herramientas/node_modules/playwright/index.js"
  ].filter(Boolean);
  for (const c of candidatos) {
    if (!fs.existsSync(c)) continue;
    try {
      const mod = await import(pathToFileURL(c).href);
      const chromium = (mod.default || mod).chromium;
      if (chromium) return { chromium, desde: c };
    } catch { /* siguiente candidato */ }
  }
  throw new Error("no hay Playwright instalado en ninguno de los candidatos conocidos");
}

const { chromium, desde } = await cargarPlaywright();
console.log("═══ RedCaliNet · panel contra su servidor ═══");
console.log("  servidor : " + BASE);
console.log("  motor    : " + desde.replace(/^.*node_modules[\\/]/, "node_modules/"));

/* El Playwright del panel puede pedir un Chromium que no está descargado (aquí
   pide el 1248 y en el equipo está el 1243). Regla de la casa: se reutiliza lo
   instalado en vez de bajar otra copia. Se usa la carpeta chromium-* más alta. */
function rutaChromium() {
  if (process.env.KZ_CHROME && fs.existsSync(process.env.KZ_CHROME)) return process.env.KZ_CHROME;
  const base = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright");
  if (!base || !fs.existsSync(base)) return null;
  const versiones = fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse();
  for (const v of versiones) {
    const exe = path.join(base, v, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}
const chrome = rutaChromium();
console.log("  chromium : " + (chrome || "(el que registre Playwright)"));

const navegador = await chromium.launch(chrome ? { executablePath: chrome, args: ["--no-sandbox"] } : {});
let fallos = 0;

for (const ruta of PAGINAS) {
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 }, locale: "es-CO" });
  const pagina = await contexto.newPage();
  const erroresConsola = [];
  const excepciones = [];
  const respuestasMalas = [];

  pagina.on("console", (m) => { if (m.type() === "error") erroresConsola.push(m.text().slice(0, 160)); });
  pagina.on("pageerror", (e) => excepciones.push(String(e.message).slice(0, 160)));
  pagina.on("response", (r) => { if (r.status() >= 400) respuestasMalas.push(r.status() + " " + r.url().replace(BASE, "")); });

  let estado = 0;
  try {
    const r = await pagina.goto(BASE + ruta, { waitUntil: "networkidle", timeout: 30000 });
    estado = r ? r.status() : 0;
    await pagina.waitForTimeout(1200);
  } catch (e) {
    excepciones.push("no se pudo abrir: " + e.message.slice(0, 140));
  }

  const bien = estado === 200 && erroresConsola.length === 0 && excepciones.length === 0 && respuestasMalas.length === 0;
  if (!bien) fallos += 1;
  console.log("\n  " + (bien ? "OK   " : "FALLA") + "  " + ruta + " · HTTP " + estado);
  if (erroresConsola.length) erroresConsola.forEach((e) => console.log("        consola: " + e));
  if (excepciones.length) excepciones.forEach((e) => console.log("        excepción: " + e));
  if (respuestasMalas.length) respuestasMalas.forEach((e) => console.log("        petición: " + e));
  await contexto.close();
}

/* El endpoint que la revisión estática no podía servir */
try {
  const r = await fetch(BASE + "/admin/api/bootstrap");
  const cuerpo = await r.json().catch(() => ({}));
  const bien = r.status === 200 && cuerpo && typeof cuerpo === "object";
  if (!bien) fallos += 1;
  console.log("\n  " + (bien ? "OK   " : "FALLA") + "  /admin/api/bootstrap · HTTP " + r.status +
    " · local=" + cuerpo.local + " · contrato=" + (cuerpo.contractStatus || "—"));
} catch (e) {
  fallos += 1;
  console.log("\n  FALLA  /admin/api/bootstrap · " + e.message);
}

await navegador.close();

console.log("\nRESULTADO: " + (fallos ? "FALLA — " + fallos + " comprobación(es) en rojo" : "OK — el panel carga sin errores contra su servidor"));
process.exitCode = fallos ? 1 : 0;
