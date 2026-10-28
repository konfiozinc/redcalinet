// KZ-REDCALINET-025 — Interfaz del panel servida por el Worker.
//
// Comprueba que el mismo panel que servía el servidor Node funciona igual cuando
// lo sirve Cloudflare Workers (mismo código de `dist`, mismo origen que la API),
// en escritorio y en móvil, y que puede iniciar sesión contra el Worker.
//
// Uso (desde redcalinet/admin-worker, con `wrangler dev` y los emuladores):
//   node test/interfaz-025.mjs

import { createRequire } from 'node:module';
// El Worker no duplica playwright: se reutiliza el que ya tiene el proyecto admin.
const require = createRequire(new URL('../../../admin/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const WORKER = 'http://127.0.0.1:8787';
const salida = fileURLToPath(new URL('../.runtime/', import.meta.url));
await fs.mkdir(salida, { recursive: true });

const comprobaciones = [];
const fallos = [];
const chk = async (nombre, fn) => {
  try { await fn(); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); }
  catch (e) { fallos.push(nombre + ' (' + (e?.message || e) + ')'); console.log('  **FALLA** ' + nombre + '  ' + (e?.message || e)); }
};

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

await chk('el panel carga desde el Worker', async () => {
  await pagina.goto(WORKER + '/admin/', { waitUntil: 'load', timeout: 30000 });
  await pagina.locator('#login-form').waitFor({ timeout: 20000 });
});

await chk('inicia sesión contra el Worker', async () => {
  await pagina.locator('#login-form input[name=email]').fill('superadmin@rcl.example.test');
  await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
  await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await pagina.locator('.stats').waitFor({ timeout: 25000 });
  const rol = (await pagina.locator('.sidebar .badge').innerText()).trim();
  if (rol !== 'SUPERADMIN') throw new Error('rol inesperado: ' + rol);
});

await chk('el dashboard muestra datos reales del Worker', async () => {
  const texto = await pagina.locator('.content').innerText();
  if (!/Productos|Publicados/i.test(texto)) throw new Error('no hay métricas');
  if (/No se pudo|error/i.test(texto) && /0\b/.test(texto) === false) throw new Error('posible error en pantalla');
});

await chk('escritorio 1440x900 sin desbordes', async () => {
  await pagina.setViewportSize({ width: 1440, height: 900 });
  await pagina.waitForTimeout(400);
  if (await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde horizontal');
  await pagina.screenshot({ path: salida + 'worker025-escritorio.png' });
});

await chk('la biblioteca de multimedia abre sin error', async () => {
  await pagina.locator('.sidebar nav').getByRole('button', { name: 'Biblioteca multimedia', exact: true }).click();
  await pagina.locator('.loading').waitFor({ state: 'hidden' }).catch(() => {});
  await pagina.waitForTimeout(800);
  const texto = await pagina.locator('.content').innerText();
  if (/Cloudinary y su cuota no están/i.test(texto)) throw new Error('el panel cree que la multimedia está apagada');
});

await chk('móvil 375x667 sin desbordes', async () => {
  await pagina.setViewportSize({ width: 375, height: 667 });
  await pagina.waitForTimeout(500);
  if (await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde horizontal en móvil');
  await pagina.screenshot({ path: salida + 'worker025-movil.png' });
});

await chk('sin excepciones de JavaScript', async () => {
  if (errores.length) throw new Error(errores.slice(0, 2).join(' | '));
});

await navegador.close();
console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
process.exit(fallos.length ? 1 : 0);
