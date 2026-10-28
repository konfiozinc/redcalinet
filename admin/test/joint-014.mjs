// KZ-REDCALINET-014 — PRUEBA CONJUNTA DE NEGOCIO
//
// Lo que ninguna de las dos partes había probado junta: el panel escribe por la
// API, el catálogo público lee por Firestore con las reglas v3, y un cliente
// autenticado no puede escribir directo. Cubre los nueve escenarios del encargo:
// crear, editar, publicar, ocultar, cambiar precio, desactivar usuario, denegar
// escrituras directas, registrar auditoría y comprobar visibilidad en catálogo.
//
// Requiere: emulador de Firestore en 8080 con firestore.rules cargadas,
// emulador de Auth en 9099 y la API del panel en 5176.
// Ejecutar: cd admin && node test/joint-014.mjs

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BASE = 'http://127.0.0.1:5176';
const PROJECT = 'demo-redcalinet-admin';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

let ok = 0, fail = 0;
const fallos = [];
async function chk(nombre, fn) {
  try { await fn(); ok++; console.log('  PASA   ' + nombre); }
  catch (e) { fail++; const d = (e && e.message) ? e.message : String(e); fallos.push(nombre + ' (' + d + ')'); console.log('  **FALLA** ' + nombre + '  ' + d); }
}

const login = async (email) => {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'RCL-Only-QA-2026!', returnSecureToken: true }) });
  assert.equal(r.status, 200, 'login ' + email);
  return (await r.json()).idToken;
};

async function api(path, { token = null, method = 'GET', body, origin = BASE, key = crypto.randomUUID() } = {}) {
  const r = await fetch(BASE + '/admin/api/' + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const texto = await r.text();
  let data = null; try { data = JSON.parse(texto); } catch { data = texto; }
  return { status: r.status, data };
}
const exige200 = (r) => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };

const all = async (c) => { let items = [], cursor = ''; do { const r = exige200(await api(c + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { token: superadmin })); items.push(...r.items); cursor = r.next; } while (cursor); return items; };
const record = async (c, id) => (await all(c)).find((r) => r.id === id);
const create = async (c, values, token = superadmin) => exige200(await api(c, { token, method: 'POST', body: { values } })).id;
const edit = async (c, id, values, token = superadmin) => api(c + '/' + id, { token, method: 'PATCH', body: { values, revision: (await record(c, id)).revision } });

const superadmin = await login('superadmin@rcl.example.test');
const owner = await login('admin@rcl.example.test');

/* Lectura pública por la API del panel (Admin SDK) */
const catalogo = async () => exige200(await api('public/catalogo', { token: null }));

/* Lectura pública DIRECTA a Firestore, sin token: la que hace el sitio con las
   reglas v3. Es distinta de la anterior y hay que probar las dos. */
async function firestorePublico() {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'servicios' }], where: { fieldFilter: { field: { fieldPath: 'estado' }, op: 'EQUAL', value: { stringValue: 'PUBLICADO' } } } } })
  });
  const texto = await r.text();
  assert.equal(r.status, 200, 'consulta pública HTTP ' + r.status + ' ' + texto.slice(0, 120));
  return (JSON.parse(texto) || []).filter((f) => f.document).map((f) => ({ id: f.document.name.split('/').pop(), ...Object.fromEntries(Object.entries(f.document.fields || {}).map(([k, v]) => [k, v.stringValue ?? v.integerValue ?? v.booleanValue ?? null])) }));
}

/* Escritura DIRECTA a Firestore con el token real de un PROPIETARIO */
async function escrituraDirecta(token, docId, campos) {
  return fetch(`${FS}/servicios/${docId}?updateMask.fieldPaths=nombre`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ fields: campos || { nombre: { stringValue: 'secuestrado' } } })
  });
}

const marca = Date.now();
const nombreProd = 'QA conjunto ' + marca;
const nombreOculto = 'QA conjunto oculto ' + marca;

/* ---------------------------------------------------------------- */
console.log('== 1-2. Crear y editar producto desde el panel ==');
/* ---------------------------------------------------------------- */
const cat = await create('categorias', { nombre: 'QA categoría ' + marca, descripcion: 'Solo QA', tipo: 'producto', icono: 'i-tech', orden: 9, visible: true });
const prod = await create('productos', { nombre: nombreProd, descripcion: 'Ficha ficticia de la prueba conjunta', categoriaId: cat, estado: 'BORRADOR', precio: null, stock: null, disponibilidad: 'DESCONOCIDA' }, owner);

await chk('CREAR: el producto nace en BORRADOR', async () => assert.equal((await record('productos', prod)).estado, 'BORRADOR'));
await chk('CREAR: un BORRADOR no aparece en el catálogo público', async () => assert.ok(!(await catalogo()).productos.some((p) => p.id === prod)));
await chk('CREAR: tampoco aparece en la consulta pública directa a Firestore', async () => assert.ok(!(await firestorePublico()).some((p) => p.id === prod)));

await chk('EDITAR: el nombre editado persiste', async () => {
  exige200(await edit('productos', prod, { nombre: nombreProd + ' (editado)' }, owner));
  assert.equal((await record('productos', prod)).nombre, nombreProd + ' (editado)');
});

/* ---------------------------------------------------------------- */
console.log('\n== 3-5. Publicar, cambiar precio y ocultar ==');
/* ---------------------------------------------------------------- */
await chk('PUBLICAR: sin sello de validación el API lo rechaza', async () => assert.equal((await edit('productos', prod, { estado: 'PUBLICADO' }, owner)).status, 400));

await chk('PUBLICAR: con validado + fuenteValidacion el API publica', async () => {
  exige200(await edit('productos', prod, { estado: 'PUBLICADO', validado: true, fuenteValidacion: 'Prueba conjunta KZ-REDCALINET-014' }, owner));
  assert.equal((await record('productos', prod)).estado, 'PUBLICADO');
});

await chk('VISIBILIDAD: aparece en el catálogo público de la API', async () => assert.ok((await catalogo()).productos.some((p) => p.id === prod)));
await chk('VISIBILIDAD: el sitio lo ve por la consulta pública directa (reglas v3)', async () => {
  const filas = await firestorePublico();
  const fila = filas.find((p) => p.id === prod);
  assert.ok(fila, 'no apareció en la consulta pública');
  assert.equal(fila.estado, 'PUBLICADO');
});
await chk('VISIBILIDAD: el documento público solo expone los campos del contrato', async () => {
  const fila = (await firestorePublico()).find((p) => p.id === prod);
  const permitidos = ['categoriaId', 'nombre', 'descripcion', 'precio', 'detalles', 'imagen', 'estado', 'orden', 'destacado', 'agotado', 'tipo'];
  const intrusos = Object.keys(fila).filter((k) => k !== 'id' && !permitidos.includes(k));
  assert.deepEqual(intrusos, [], 'campos fuera del contrato: ' + intrusos.join(', '));
  assert.ok(!('fuenteValidacion' in fila), 'la evidencia de validación no debe ser pública');
});

await chk('PRECIO: el cambio de precio llega al catálogo público', async () => {
  exige200(await edit('productos', prod, { precio: 123400 }, owner));
  const fila = (await firestorePublico()).find((p) => p.id === prod);
  assert.equal(Number(fila.precio), 123400);
});

await chk('OCULTAR: al pasar a OCULTO desaparece del catálogo público', async () => {
  exige200(await edit('productos', prod, { estado: 'OCULTO' }, owner));
  assert.ok(!(await catalogo()).productos.some((p) => p.id === prod), 'seguía en el catálogo de la API');
  assert.ok(!(await firestorePublico()).some((p) => p.id === prod), 'seguía en la consulta pública directa');
});
await chk('OCULTAR: el panel sigue viendo la ficha oculta', async () => assert.equal((await record('productos', prod)).estado, 'OCULTO'));

/* ---------------------------------------------------------------- */
console.log('\n== 6. Desactivar usuario ==');
/* ---------------------------------------------------------------- */
const emailNuevo = 'qa-conjunto-' + marca + '@rcl.example.test';
/* Las cuentas se administran por POST /admin/api/usuarios con el cuerpo plano
   (no van envueltas en `values` como los recursos del catálogo). */
const uidNuevo = exige200(await api('usuarios', { token: superadmin, method: 'POST', body: { nombre: 'Cuenta conjunta QA', email: emailNuevo, password: 'RCL-Only-QA-2026!', rol: 'PROPIETARIO', activo: true } })).id;
const tokenNuevo = await login(emailNuevo);

await chk('DESACTIVAR: la cuenta nueva funciona mientras está activa', async () => assert.equal((await api('me', { token: tokenNuevo })).status, 200));
await chk('DESACTIVAR: el SUPERADMIN la desactiva', async () => {
  const actual = await record('usuarios', uidNuevo);
  exige200(await api('usuarios', { token: superadmin, method: 'POST', body: { uid: uidNuevo, nombre: 'Cuenta conjunta QA', rol: 'PROPIETARIO', activo: false, revision: actual.revision } }));
  assert.equal((await record('usuarios', uidNuevo)).activo, false);
});
await chk('DESACTIVAR: su token deja de servir en la API', async () => assert.ok([401, 403].includes((await api('me', { token: tokenNuevo })).status), 'debería rechazarse con 401/403'));
await chk('DESACTIVAR: no puede escribir por la API', async () => assert.ok([401, 403].includes((await api('productos', { token: tokenNuevo, method: 'POST', origin: BASE, body: { values: { nombre: 'x' } } })).status), 'la escritura no fue rechazada'));

/* ---------------------------------------------------------------- */
console.log('\n== 7. Denegar escrituras directas (token REAL contra reglas v3) ==');
/* ---------------------------------------------------------------- */
const respDirecta = await escrituraDirecta(owner, prod);
await chk('DENEGAR: un PROPIETARIO autenticado NO puede escribir servicios directo', async () => assert.equal(respDirecta.status, 403, 'la escritura directa devolvió ' + respDirecta.status));
await chk('DENEGAR: el intento no modificó el documento', async () => {
  const fila = (await firestorePublico()).find((p) => p.id === prod);
  assert.ok(!fila || fila.nombre !== 'secuestrado', 'el documento cambió por la puerta del cliente');
});
await chk('DENEGAR: tampoco puede escribir la portada (configuracion/empresa)', async () => {
  const r = await fetch(`${FS}/configuracion/empresa?updateMask.fieldPaths=descripcion`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + owner }, body: JSON.stringify({ fields: { descripcion: { stringValue: 'secuestrada' } } }) });
  assert.equal(r.status, 403);
});

/* ---------------------------------------------------------------- */
console.log('\n== 8-9. Auditoría y visibilidad final del catálogo ==');
/* ---------------------------------------------------------------- */
await chk('AUDITORÍA: el PROPIETARIO no puede leerla', async () => assert.equal((await api('auditoria', { token: owner })).status, 403));
await chk('AUDITORÍA: cada cambio quedó registrado con su actor', async () => {
  const items = await all('auditoria');
  const delProducto = items.filter((a) => a.registro === prod);
  assert.ok(delProducto.length >= 2, 'entradas del producto: ' + delProducto.length);
  assert.ok(delProducto.every((a) => a.usuario || a.actor), 'sin actor en alguna entrada');
  const delUsuario = items.filter((a) => a.registro === uidNuevo);
  assert.ok(delUsuario.length >= 1, 'no se registró el cambio de la cuenta');
});
await chk('AUDITORÍA: no guarda contraseñas', async () => assert.ok(!JSON.stringify(await all('auditoria')).includes('RCL-Only-QA-2026!')));

await chk('VISIBILIDAD FINAL: republicar lo devuelve al catálogo y el oculto sigue fuera', async () => {
  exige200(await edit('productos', prod, { estado: 'PUBLICADO' }, owner));
  const oculto = await create('productos', { nombre: nombreOculto, descripcion: 'Nunca publicado', categoriaId: cat, estado: 'BORRADOR', precio: null }, owner);
  const filas = await firestorePublico();
  assert.ok(filas.some((p) => p.id === prod), 'no volvió al catálogo');
  assert.ok(!filas.some((p) => p.id === oculto), 'un BORRADOR se coló en el catálogo');
  const api2 = await catalogo();
  assert.ok(api2.productos.some((p) => p.id === prod));
  assert.ok(!api2.productos.some((p) => p.id === oculto));
});

console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
if (fail) console.log('  Fallos: ' + fallos.join(' | '));
process.exit(fail ? 1 : 0);
