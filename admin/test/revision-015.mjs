// KZ-REDCALINET-015 — Prueba de humo de la revisión local.
//
// Comprueba que las dos superficies están listas para que el propietario las
// revise en el navegador y deja capturas. No modifica nada.
//
// Requisitos: API del panel en 5176, emuladores en 8080/9099 y el sitio servido
// en 5180 (node tools/servir-sitio.js). Ejecutar desde admin/:
//   node test/revision-015.mjs

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const PANEL = 'http://127.0.0.1:5176/admin/';
const SITIO = 'http://127.0.0.1:5180/';
const capturas = fileURLToPath(new URL('../.runtime/screenshots/', import.meta.url));
await fs.mkdir(capturas, { recursive: true });

const comprobaciones = [];
const ok = (nombre, valor = true) => { assert.ok(valor, nombre); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); };
const apunta = (nombre, detalle) => { comprobaciones.push(nombre); console.log('  NOTA   ' + nombre + '  ' + detalle); };

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

/* ---------------------------------------------------------------- */
console.log('== Panel administrativo ==');
/* ---------------------------------------------------------------- */
await pagina.goto(PANEL, { waitUntil: 'load', timeout: 30000 });
await pagina.locator('#login-form input[name=email]').waitFor();
ok('el panel carga la pantalla de acceso', true);
await pagina.screenshot({ path: capturas + 'revision-015-panel-acceso.png' });

await pagina.locator('#login-form input[name=email]').fill('admin@rcl.example.test');
await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
await pagina.locator('.stats').waitFor({ timeout: 20000 });
ok('la cuenta de emulador entra al panel', true);
ok('el panel carga los indicadores', (await pagina.locator('.stat').count()) >= 6, (await pagina.locator('.stat').count()) + ' indicadores');
await pagina.screenshot({ path: capturas + 'revision-015-panel-escritorio.png' });

const secciones = await pagina.locator('.sidebar nav button').allInnerTexts();
ok('el panel ofrece las secciones del panel', secciones.length >= 5, secciones.join(' · '));

/* Navegación por las secciones principales, sin tocar datos. Cada sección
   pinta una marca distinta (tabla, tarjetas o estado vacío), así que se
   comprueba que el área de contenido queda visible y que no hubo excepciones. */
for (const [seccion, archivo] of [['Productos', 'productos'], ['Categorías', 'categorias'], ['Biblioteca multimedia', 'biblioteca']]) {
  const antes = errores.length;
  await pagina.locator('.sidebar nav').getByRole('button', { name: seccion, exact: true }).click();
  await pagina.locator('.content').waitFor({ state: 'visible', timeout: 15000 });
  await pagina.waitForTimeout(1200);
  await pagina.screenshot({ path: capturas + 'revision-015-panel-' + archivo + '.png' });
  const contenido = (await pagina.locator('.content').innerText()).trim();
  ok('la sección «' + seccion + '» abre sin errores', contenido.length > 0 && errores.length === antes, contenido.split('\n').length + ' líneas');
}

await pagina.setViewportSize({ width: 390, height: 844 });
await pagina.waitForTimeout(300);
ok('el panel no desborda en móvil (390 px)', await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await pagina.screenshot({ path: capturas + 'revision-015-panel-movil.png' });
await pagina.setViewportSize({ width: 1440, height: 900 });

/* ---------------------------------------------------------------- */
console.log('\n== Web pública aprobada ==');
/* ---------------------------------------------------------------- */
const datos = JSON.parse(await fs.readFile(new URL('../../data.json', import.meta.url), 'utf8'));
const primerProducto = datos.categorias.flatMap((c) => c.fichas || [])[0];

await pagina.goto(SITIO, { waitUntil: 'load', timeout: 30000 });
await pagina.waitForTimeout(1200);
const cuerpoEstatico = await pagina.locator('body').innerText();
ok('la portada institucional KZ-011 está presente', /Tu conexión con servicios y soluciones digitales/i.test(cuerpoEstatico));
ok('el hero es institucional: solo el logo, sin fotos de producto', (await pagina.locator('.hero img').count()) === 1 && (await pagina.locator('.hero img.hero__logo').count()) === 1);
ok('el catálogo muestra los productos de data.json', primerProducto && cuerpoEstatico.includes(primerProducto.nombre), primerProducto ? primerProducto.nombre : 'sin productos');
await pagina.screenshot({ path: capturas + 'revision-015-sitio-escritorio.png', fullPage: false });

const seccionesSitio = await pagina.locator('header a[href^="#"], nav a[href^="#"]').count();
ok('la navegación del sitio responde', seccionesSitio >= 4, seccionesSitio + ' enlaces internos');

await pagina.goto(SITIO + '?emulador=1', { waitUntil: 'load', timeout: 30000 });
await pagina.waitForTimeout(2500);
const cuerpoEmulador = await pagina.locator('body').innerText();
/* «Plan Streaming» solo existe en los fixtures QA del emulador; no está en
   data.json. Si aparece, el catálogo vino de Firestore. */
const usaNube = /Plan Streaming/.test(cuerpoEmulador);
if (usaNube) {
  ok('con ?emulador=1 el catálogo sale de Firestore (fixtures QA, no el real)', true);
} else {
  apunta('con ?emulador=1 el catálogo cayó a data.json', '(el respaldo previsto: el sitio sigue funcionando)');
  ok('el sitio funciona igual sin Firestore (respaldo a data.json)', /Pasaportes|Citas RUNT|streaming/i.test(cuerpoEmulador));
}
await pagina.screenshot({ path: capturas + 'revision-015-sitio-emulador.png' });

await pagina.setViewportSize({ width: 375, height: 667 });
await pagina.goto(SITIO, { waitUntil: 'load', timeout: 30000 });
await pagina.waitForTimeout(800);
ok('el sitio no desborda en móvil (375 px)', await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await pagina.screenshot({ path: capturas + 'revision-015-sitio-movil.png' });

ok('sin excepciones de JavaScript en ninguna de las dos superficies', errores.length === 0, errores.join(' | '));

await navegador.close();
console.log('\n  ' + comprobaciones.length + ' comprobaciones · capturas en admin/.runtime/screenshots/revision-015-*.png');
process.exit(0);
