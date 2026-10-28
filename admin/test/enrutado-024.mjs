// KZ-024 — Enrutado del panel y la API bajo un mismo origen.
//
// Es la comprobación que sostiene la decisión de alojar panel + API en el mismo
// servicio Node (Render Free): no se añade CORS y `sameOrigin()` sigue intacto.
// Se ejecuta contra el servidor local, que es exactamente el que se desplegaría.
//
// Uso (desde admin/, con el API levantado):
//   node test/enrutado-024.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:5176';
const comprobaciones = [];
const fallos = [];
async function chk(nombre, fn) {
  try {
    await fn();
    comprobaciones.push(nombre);
    console.log('  PASA   ' + nombre);
  } catch (e) {
    fallos.push(nombre + ' (' + (e?.message || e) + ')');
    console.log('  **FALLA** ' + nombre + '  ' + (e?.message || e));
  }
}

const dist = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const recursos = await fs.readdir(dist);
const recursoJs = recursos.find((n) => n.endsWith('.js'));
const recursoCss = recursos.find((n) => n.endsWith('.css'));

console.log('== Un mismo origen sirve el panel y la API ==');

await chk('GET /admin/ entrega el panel como HTML en la ruta correcta', async () => {
  const r = await fetch(BASE + '/admin/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/html/);
  const html = await r.text();
  assert.ok(html.includes('id="app"'), 'no parece el HTML del panel');
  // base '/admin/' respetada: los recursos se piden bajo /admin/assets/ y son
  // los mismos que sirve el propio servidor en ese prefijo.
  assert.ok(html.includes('/admin/assets/'), 'el HTML no apunta a /admin/assets/');
  assert.ok(!/src="\/assets\//.test(html), 'el HTML apunta a /assets/ y rompería el despliegue');
});

await chk('GET /admin/assets/*.js entrega el recurso real', async () => {
  const r = await fetch(BASE + '/admin/assets/' + recursoJs);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /javascript/);
  assert.ok((await r.text()).length > 1000);
});

await chk('GET /admin/assets/*.css entrega el recurso real', async () => {
  const r = await fetch(BASE + '/admin/assets/' + recursoCss);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/css/);
});

await chk('GET /admin/api/bootstrap responde JSON en el mismo origen', async () => {
  const r = await fetch(BASE + '/admin/api/bootstrap');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /application\/json/);
  const b = await r.json();
  assert.equal(typeof b.local, 'boolean');
  assert.equal(b.media.subidaDirecta, true);
  const texto = JSON.stringify(b).toLowerCase();
  for (const prohibido of ['apisecret', 'api_secret', 'private_key', 'client_secret']) {
    assert.ok(!texto.includes(prohibido), 'el bootstrap expone ' + prohibido);
  }
});

await chk('el panel no expone el código del servidor', async () => {
  for (const ruta of ['/admin/server/store.mjs', '/admin/server/directa.mjs', '/admin/deploy/index.mjs']) {
    const r = await fetch(BASE + ruta);
    assert.equal(r.status, 404, ruta + ' devolvió ' + r.status);
  }
});

await chk('GET / redirige al panel', async () => {
  const r = await fetch(BASE + '/', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/admin/');
});

await chk('las respuestas del panel llevan cabeceras de seguridad', async () => {
  const r = await fetch(BASE + '/admin/');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
});

await chk('una escritura sin cabecera Origin se rechaza (mismo origen obligatorio)', async () => {
  const r = await fetch(BASE + '/admin/api/categorias', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: { nombre: 'QA enrutado' } })
  });
  assert.equal(r.status, 401, 'sin sesión debe rechazar antes que por origen');
});

await chk('con sesión, una escritura sin Origin se rechaza por origen', async () => {
  const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@rcl.example.test', password: 'RCL-Only-QA-2026!', returnSecureToken: true })
  });
  const token = (await login.json()).idToken;
  const r = await fetch(BASE + '/admin/api/categorias', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ values: { nombre: 'QA enrutado' } })
  });
  assert.equal(r.status, 403);
});

console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
process.exit(fallos.length ? 1 : 0);
