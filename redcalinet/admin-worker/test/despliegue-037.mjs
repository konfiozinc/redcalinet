// KZ-REDCALINET-037 — Comprobación posterior al despliegue (sin sesión).
//
// Todo lo que se puede verificar contra PRODUCCIÓN sin credenciales: que el panel
// cargue desde el Worker público, que sirva el bundle nuevo, que la pantalla de
// acceso se vea correctamente en teléfono y escritorio, que no haya excepciones
// de JavaScript y que no se filtre ningún dato privado antes de iniciar sesión.
//
// Uso: node test/despliegue-037.mjs
// No escribe nada: solo GET y lectura del DOM.

import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../admin/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const W = process.env.RCL_WORKER || 'https://redcalinet-admin.konfiozinc.workers.dev';
const salida = fileURLToPath(new URL('../.runtime/despliegue-037/', import.meta.url));
await fs.mkdir(salida, { recursive: true });

const comprobaciones = [];
const fallos = [];
const chk = async (nombre, fn) => {
  try { await fn(); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); }
  catch (e) { fallos.push(nombre + ' (' + (e?.message || e) + ')'); console.log('  **FALLA** ' + nombre + '  →  ' + (e?.message || e)); }
};

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});

/* ---------- escritorio ---------- */
const escritorio = await (await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
const erroresEscritorio = [];
const respuestasFallidas = [];
escritorio.on('pageerror', (e) => erroresEscritorio.push(e.message));
escritorio.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erroresEscritorio.push('console: ' + m.text()); });
escritorio.on('response', (r) => { if (r.status() >= 400) respuestasFallidas.push(r.status() + ' ' + r.url()); });

console.log('== Escritorio 1440×900 ==');
await chk('el panel carga desde el Worker público', async () => {
  const r = await escritorio.goto(W + '/admin/', { waitUntil: 'load', timeout: 45000 });
  if (r.status() !== 200) throw new Error('HTTP ' + r.status());
  await escritorio.locator('#login-form').waitFor({ timeout: 25000 });
});
await chk('sirve el bundle nuevo y no el anterior', async () => {
  const html = await escritorio.content();
  if (!/index-DV-19PSi\.js/.test(html)) throw new Error('no referencia el bundle KZ-037');
  if (/index-BcYQ88ef\.js/.test(html)) throw new Error('sigue referenciando el bundle anterior');
  if (!/index-DUV4TGfv\.css/.test(html)) throw new Error('no referencia la hoja de estilos KZ-037');
});
await chk('la pantalla de acceso está completa', async () => {
  const email = escritorio.locator('#login-form input[name=email]');
  const clave = escritorio.locator('#login-form input[name=password]');
  if (!(await email.isVisible()) || !(await clave.isVisible())) throw new Error('faltan los campos de acceso');
  if (!(await escritorio.getByRole('button', { name: 'Entrar al panel', exact: true }).isVisible())) throw new Error('falta el botón de entrar');
  if (!(await escritorio.getByRole('button', { name: 'Olvidé mi contraseña' }).isVisible())) throw new Error('falta la recuperación de contraseña');
});
await chk('no se filtra ningún dato privado antes de iniciar sesión', async () => {
  if (await escritorio.locator('.stats').count()) throw new Error('aparecen métricas sin sesión');
  if (await escritorio.locator('.sidebar').count()) throw new Error('aparece el menú sin sesión');
  const texto = await escritorio.locator('body').innerText();
  if (/Producto QA|Ficha m|5 7 3|whastapp/i.test(texto)) throw new Error('aparece contenido privado');
});
await chk('la página no se indexa y no desborda', async () => {
  const robots = await escritorio.locator('meta[name=robots]').getAttribute('content');
  if (!/noindex/.test(robots || '')) throw new Error('falta noindex');
  if (await escritorio.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde horizontal');
});
await chk('sin excepciones de JavaScript en escritorio', async () => {
  await escritorio.waitForTimeout(1200);
  if (erroresEscritorio.length) throw new Error(erroresEscritorio.slice(0, 2).join(' | '));
});
await chk('ningún recurso roto salvo el favicon que nunca existió', async () => {
  // El panel no declara favicon (ni antes ni ahora): el navegador pide
  // /favicon.ico y el Worker responde 404. Es cosmético y preexistente; se deja
  // anotado, pero cualquier otro 4xx/5xx sí es una regresión.
  const otros = respuestasFallidas.filter((r) => !/\/favicon\.ico$/.test(r));
  if (otros.length) throw new Error(otros.slice(0, 3).join(' | '));
  if (respuestasFallidas.length) console.log('         (conocido: ' + respuestasFallidas[0] + ' — sin favicon declarado, igual que la versión anterior)');
});
await escritorio.screenshot({ path: salida + 'escritorio-acceso.png' });

/* ---------- móvil ---------- */
const movil = await (await navegador.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' })).newPage();
const erroresMovil = [];
movil.on('pageerror', (e) => erroresMovil.push(e.message));

console.log('\n== Móvil 375×667 ==');
await chk('el acceso se ve completo en el teléfono sin desbordes', async () => {
  await movil.goto(W + '/admin/', { waitUntil: 'load', timeout: 45000 });
  await movil.locator('#login-form').waitFor({ timeout: 25000 });
  if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde horizontal');
  const campos = await movil.evaluate(() => [...document.querySelectorAll('#login-form input,#login-form button')]
    .map((c) => Math.round(c.getBoundingClientRect().height)));
  const bajos = campos.filter((h) => h < 40);
  if (bajos.length) throw new Error('controles por debajo de 40 px: ' + bajos.join(', '));
});
await chk('los campos del acceso caben sin desplazamiento horizontal', async () => {
  const caja = await movil.locator('.login-form').boundingBox();
  if (caja.width > 375) throw new Error('el formulario mide ' + Math.round(caja.width) + ' px');
  const anchoCampo = await movil.evaluate(() => Math.round(document.querySelector('#login-form input[name=email]').getBoundingClientRect().width));
  if (anchoCampo < 200) throw new Error('el campo de correo mide ' + anchoCampo + ' px');
});
await chk('sin excepciones de JavaScript en móvil', async () => {
  await movil.waitForTimeout(700);
  if (erroresMovil.length) throw new Error(erroresMovil.slice(0, 2).join(' | '));
});
await movil.screenshot({ path: salida + 'movil-acceso.png' });

await navegador.close();
console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
console.log('  evidencias: ' + salida);
process.exit(fallos.length ? 1 : 0);
