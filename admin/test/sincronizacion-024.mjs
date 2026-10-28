// KZ-024 — Sincronización del catálogo público con las publicaciones del panel.
//
// Verifica dos cosas que el propietario pidió por separado:
//   4. el catálogo público consulta Firestore y refleja lo publicado desde Admin
//   5. data.json sigue siendo respaldo, pero NO oculta el error de sincronización
//
// Nota de entorno: en QA el panel trabaja contra el proyecto `demo-redcalinet-admin`
// y el sitio público lee el proyecto `red-calinet` del mismo emulador (así está
// configurado en firebase-config.js). Por eso se verifican los dos planos:
//   · el contrato público del API, que es el que ve el panel;
//   · el sitio, contra el proyecto que él mismo lee.
// En producción ambos son el mismo proyecto: no hay discrepancia posible.
//
// No toca el proyecto real: el fallo de Firestore se provoca interceptando la
// configuración del navegador y apuntándola a un proyecto inexistente local.
//
// Uso (desde admin/, con emuladores, API y sitio local levantados):
//   node test/sincronizacion-024.mjs

import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SITIO = 'http://127.0.0.1:5180';
const API = 'http://127.0.0.1:5176';
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

const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@rcl.example.test', password: 'RCL-Only-QA-2026!', returnSecureToken: true })
});
const token = (await login.json()).idToken;
async function api(ruta, { method = 'GET', body } = {}) {
  const r = await fetch(API + '/admin/api/' + ruta, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Origin: API,
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

/* ---------- 1. Publicación hecha desde el panel (proyecto del panel) ---------- */
const nombrePanel = 'QA 024 panel ' + Date.now();
const creado = await api('productos', {
  method: 'POST',
  body: {
    values: {
      nombre: nombrePanel,
      descripcion: 'Producto ficticio publicado desde el panel para verificar el catálogo público',
      categoriaId: 'tecnologia', precio: null, stock: null,
      estado: 'PUBLICADO', validado: true, fuenteValidacion: 'Verificación KZ-024'
    }
  }
});
assert.equal(creado.status, 200, 'no se pudo publicar: ' + JSON.stringify(creado.data));
const idPanel = creado.data.id;

console.log('== 4a. El catálogo público del API refleja la publicación del panel ==');
await chk('el producto publicado desde el panel aparece en el catálogo público', async () => {
  const publico = await api('public/catalogo');
  assert.equal(publico.status, 200);
  assert.ok(publico.data.productos.some((p) => p.id === idPanel), 'no aparece en el catálogo público');
});

await chk('al ocultarlo desde el panel desaparece del catálogo público', async () => {
  const actual = (await api('productos')).data.items.find((p) => p.id === idPanel);
  const r = await api('productos/' + idPanel, { method: 'PATCH', body: { values: { estado: 'OCULTO' }, revision: actual.revision } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const publico = await api('public/catalogo');
  assert.ok(!publico.data.productos.some((p) => p.id === idPanel), 'sigue en el catálogo público tras ocultarlo');
});

/* ---------- 2. El sitio lee Firestore (proyecto que el sitio lee) ---------- */
const appSitio = initializeApp({ projectId: 'red-calinet' }, 'sitio-024');
const dbSitio = getFirestore(appSitio);
const nombreSitio = 'QA 024 sitio ' + Date.now();
await dbSitio.doc('categorias/qa-024').set({ nombre: 'QA 024', tipo: 'producto', icono: 'i-tech', orden: 999, visible: true });

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const pagina = await contexto.newPage();

console.log('\n== 4b. El sitio público consulta Firestore ==');
await chk('una publicación de Firestore aparece en el sitio público', async () => {
  await dbSitio.doc('servicios/qa-024').set({
    nombre: nombreSitio, categoriaId: 'qa-024', estado: 'PUBLICADO', tipo: 'producto',
    descripcion: 'Verificación de sincronización KZ-024', precio: null, orden: 0, destacado: false, agotado: false
  });
  await pagina.goto(SITIO + '/?emulador=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pagina.waitForFunction((n) => document.body.innerText.includes(n), nombreSitio, { timeout: 25000 });
});

await chk('con Firestore respondiendo no se muestra el aviso de respaldo', async () => {
  await pagina.waitForTimeout(4000);
  assert.equal(await pagina.locator('#aviso-origen-datos').count(), 0, 'apareció el aviso aunque Firestore responde');
});

await chk('al retirarla de Firestore el sitio deja de mostrarla', async () => {
  await dbSitio.doc('servicios/qa-024').delete();
  await pagina.waitForTimeout(4000);
  assert.ok(!(await pagina.locator('body').innerText()).includes(nombreSitio), 'el sitio sigue mostrando la ficha retirada');
});

/* ---------- 3. La caída al respaldo NO es silenciosa ---------- */
console.log('\n== 5. data.json como respaldo visible ==');
const CONTEXTO_FALLO = 'window.firebaseConfig={apiKey:"demo-key",authDomain:"qa-inexistente.firebaseapp.com",projectId:"qa-sincronizacion-inexistente"};';

await chk('si Firestore no responde, el aviso de respaldo aparece y es accesible', async () => {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.route('**/firebase-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: CONTEXTO_FALLO }));
  await p.goto(SITIO + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const aviso = p.locator('#aviso-origen-datos');
  await aviso.waitFor({ timeout: 20000 });
  const texto = await aviso.innerText();
  assert.match(texto, /respaldo|data\.json/i, 'el aviso no explica que se usa el respaldo: ' + texto);
  assert.equal(await aviso.getAttribute('role'), 'status', 'el aviso no es accesible');
  console.log('       aviso: "' + texto.slice(0, 95) + '…"');
  await ctx.close();
});

await chk('el catálogo sigue visible aunque Firestore no responda', async () => {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.route('**/firebase-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: CONTEXTO_FALLO }));
  await p.goto(SITIO + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(5000);
  assert.ok((await p.locator('body').innerText()).trim().length > 200, 'la página quedó vacía sin Firestore');
  await ctx.close();
});

/* ---------- limpieza ---------- */
await dbSitio.doc('categorias/qa-024').delete().catch(() => {});
await api('productos/' + idPanel, {
  method: 'PATCH',
  body: { values: { estado: 'ARCHIVADO' }, revision: (await api('productos')).data.items.find((p) => p.id === idPanel).revision }
});
await appSitio.delete();
await navegador.close();

console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
process.exit(fallos.length ? 1 : 0);
