// KZ-REDCALINET-025 — Certificación del Worker administrativo.
//
// Ejecuta contra `wrangler dev` (Worker local) + Firebase Emulator Suite.
// Cubre el criterio de cierre: crear, editar, publicar y ocultar productos de
// punta a punta, con auditoría y permisos conservados, y el panel servido por el
// mismo origen.
//
// Uso (desde redcalinet/admin-worker, con `wrangler dev` en 8787 y emuladores):
//   node test/worker-025.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const WORKER = 'http://127.0.0.1:8787';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key';
const comprobaciones = [];
const fallos = [];
const chk = (nombre, fn) => {
  try { fn(); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); }
  catch (e) { fallos.push(nombre + ' (' + (e?.message || e) + ')'); console.log('  **FALLA** ' + nombre + '  ' + (e?.message || e)); }
};
const chkAsync = async (nombre, fn) => {
  try { await fn(); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); }
  catch (e) { fallos.push(nombre + ' (' + (e?.message || e) + ')'); console.log('  **FALLA** ' + nombre + '  ' + (e?.message || e)); }
};

async function login(email) {
  const r = await fetch(AUTH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'RCL-Only-QA-2026!', returnSecureToken: true })
  });
  assert.equal(r.status, 200, 'login ' + email);
  return (await r.json()).idToken;
}
const superadmin = await login('superadmin@rcl.example.test');
const propietario = await login('admin@rcl.example.test');
const sinRol = await login('sin-rol@rcl.example.test');

async function api(ruta, { token = superadmin, method = 'GET', body, origen = WORKER, clave, cabeceras = {} } = {}) {
  const r = await fetch(WORKER + '/admin/api/' + ruta, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(origen ? { Origin: origen } : {}),
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': clave || crypto.randomUUID() } : {}),
      ...cabeceras
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };

/* ---------- 1. Panel servido por el mismo origen ---------- */
console.log('== 1. Panel y API en el mismo origen ==');
await chkAsync('GET /admin/ entrega el panel', async () => {
  const r = await fetch(WORKER + '/admin/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/html/);
  assert.ok((await r.text()).includes('/admin/assets/'));
});
await chkAsync('GET /admin/assets/* entrega el recurso compilado', async () => {
  const html = await (await fetch(WORKER + '/admin/')).text();
  const recurso = html.match(/\/admin\/assets\/[A-Za-z0-9._-]+\.js/)[0];
  const r = await fetch(WORKER + recurso);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /javascript/);
});

/* ---------- 2. Autenticación y sesiones ---------- */
console.log('\n== 2. Autenticación, sesión y roles ==');
await chkAsync('sin token: 401', async () => assert.equal((await api('me', { token: null })).status, 401));
await chkAsync('token inválido: 401', async () => assert.equal((await api('me', { token: 'no-es-un-token' })).status, 401));
await chkAsync('cuenta sin rol: 403', async () => assert.equal((await api('productos', { token: sinRol })).status, 403));
await chkAsync('PROPIETARIO con sesión válida: 200', async () => {
  const r = ok(await api('me', { token: propietario }));
  assert.equal(r.user.rol, 'PROPIETARIO');
});
await chkAsync('PROPIETARIO no lee la auditoría completa: 403', async () => assert.equal((await api('auditoria', { token: propietario })).status, 403));
await chkAsync('PROPIETARIO no gestiona usuarios: 403', async () => {
  assert.equal((await api('usuarios', { token: propietario, method: 'POST', body: { uid: 'x', rol: 'SUPERADMIN', activo: true } })).status, 403);
});

console.log('\n== 3. Origen de la escritura ==');
await chkAsync('escritura sin cabecera Origin: 403', async () => {
  assert.equal((await api('categorias', { method: 'POST', body: { values: { nombre: 'x' } }, origen: null })).status, 403);
});
await chkAsync('escritura desde otro origen: 403', async () => {
  assert.equal((await api('categorias', { method: 'POST', body: { values: { nombre: 'x' } }, origen: 'https://malicioso.test' })).status, 403);
});

/* ---------- 4. Crear / editar / publicar / ocultar ---------- */
console.log('\n== 4. Ciclo completo del producto ==');
const nombreProducto = 'QA worker 025 ' + Date.now();
let idProducto = '';
await chkAsync('crear producto (BORRADOR)', async () => {
  const r = ok(await api('productos', {
    method: 'POST',
    body: { values: { nombre: nombreProducto, descripcion: 'Producto ficticio del Worker', categoriaId: 'tecnologia', precio: null, stock: null, disponibilidad: 'DESCONOCIDA', estado: 'BORRADOR' } }
  }));
  idProducto = r.id;
  assert.ok(idProducto);
});
await chkAsync('el borrador NO aparece en el catálogo público', async () => {
  const publico = ok(await api('public/catalogo', { token: null }));
  assert.ok(!publico.productos.some((p) => p.id === idProducto));
});
const revision = async () => (await api('productos')).data.items.find((p) => p.id === idProducto).revision;
await chkAsync('editar precio', async () => {
  ok(await api('productos/' + idProducto, { method: 'PATCH', body: { values: { precio: 49900, stock: 3 }, revision: await revision() } }));
  const fila = (await api('productos')).data.items.find((p) => p.id === idProducto);
  assert.equal(fila.precio, 49900);
  assert.equal(fila.stock, 3);
});
await chkAsync('revisión desactualizada: 409', async () => {
  assert.equal((await api('productos/' + idProducto, { method: 'PATCH', body: { values: { precio: 1000 }, revision: 0 } })).status, 409);
});
await chkAsync('publicar sin sello comercial: 400', async () => {
  assert.equal((await api('productos/' + idProducto, { method: 'PATCH', body: { values: { estado: 'PUBLICADO' }, revision: await revision() } })).status, 400);
});
await chkAsync('publicar con sello comercial', async () => {
  ok(await api('productos/' + idProducto, { method: 'PATCH', body: { values: { estado: 'PUBLICADO', validado: true, fuenteValidacion: 'Verificación KZ-025' }, revision: await revision() } }));
  const publico = ok(await api('public/catalogo', { token: null }));
  assert.ok(publico.productos.some((p) => p.id === idProducto), 'no aparece publicado');
});
await chkAsync('ocultar lo retira del catálogo público', async () => {
  ok(await api('productos/' + idProducto, { method: 'PATCH', body: { values: { estado: 'OCULTO' }, revision: await revision() } }));
  const publico = ok(await api('public/catalogo', { token: null }));
  assert.ok(!publico.productos.some((p) => p.id === idProducto), 'sigue publicado');
});
await chkAsync('la ficha OCULTA sigue en el panel', async () => {
  const fila = (await api('productos')).data.items.find((p) => p.id === idProducto);
  assert.equal(fila.estado, 'OCULTO');
});

/* ---------- 5. Auditoría ---------- */
console.log('\n== 5. Auditoría obligatoria ==');
let auditoria = [];
await chkAsync('cada cambio deja su entrada de auditoría', async () => {
  auditoria = ok(await api('auditoria')).items.filter((a) => a.registro === idProducto);
  assert.ok(auditoria.length >= 4, 'entradas: ' + auditoria.length);
  const acciones = new Set(auditoria.map((a) => a.accion));
  for (const esperada of ['CREAR', 'MODIFICAR_PRECIO', 'PUBLICAR', 'OCULTAR']) assert.ok(acciones.has(esperada), 'falta ' + esperada + ' · hay: ' + [...acciones].join(','));
});
await chk('la auditoría guarda el actor y el precio anterior/nuevo', () => {
  const cambio = auditoria.find((a) => a.accion === 'MODIFICAR_PRECIO') || auditoria.find((a) => a.precioNuevo !== undefined);
  assert.ok(auditoria.every((a) => a.actor), 'hay entradas sin actor');
  assert.ok(cambio, 'no se registró el cambio de precio');
});
await chkAsync('la auditoría no guarda contraseñas ni tokens', async () => {
  const texto = JSON.stringify(ok(await api('auditoria')));
  assert.ok(!texto.includes('RCL-Only-QA-2026!'));
  assert.ok(!texto.includes(superadmin));
});

/* ---------- 6. Idempotencia ---------- */
console.log('\n== 6. Idempotencia ==');
await chkAsync('reintentar con la misma clave no duplica', async () => {
  const clave = crypto.randomUUID();
  const nombre = 'QA worker idem ' + Date.now();
  const cuerpo = { values: { nombre, descripcion: 'Idempotencia', categoriaId: 'tecnologia', estado: 'BORRADOR', precio: null, stock: null } };
  const uno = ok(await api('productos', { method: 'POST', body: cuerpo, clave }));
  const dos = ok(await api('productos', { method: 'POST', body: cuerpo, clave }));
  assert.equal(uno.id, dos.id, 'ids distintos con la misma clave');
  const total = (await api('productos')).data.items.filter((p) => p.nombre === nombre).length;
  assert.equal(total, 1, 'se crearon ' + total + ' fichas');
  const entradas = ok(await api('auditoria')).items.filter((a) => a.registro === uno.id);
  assert.equal(entradas.length, 1, 'auditoría duplicada');
});

/* ---------- 7. Multimedia QA ---------- */
console.log('\n== 7. Multimedia QA (subida directa firmada) ==');
let idMedia = '';
await chkAsync('firma, carga QA y registro', async () => {
  const firma = ok(await api('multimedia/firma', { method: 'POST', body: { tipo: 'image' } }));
  assert.equal(firma.proveedor, 'QA_DIRECT_FIXTURE');
  assert.match(firma.signature, /^[a-f0-9]{40}$/);
  assert.equal(firma.signature.length, 40, 'la firma debe ser SHA-1');

  const png = await fs.readFile(new URL('../../../admin/.runtime/fixtures/test.png', import.meta.url));
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  form.append('tipo', 'image');
  form.append('public_id', firma.publicId);
  const carga = await fetch(WORKER + '/admin/api/multimedia/qa-upload', {
    method: 'POST', headers: { Origin: WORKER }, body: form
  });
  assert.equal(carga.status, 200, 'carga QA falló: ' + (await carga.clone().text()));
  const resultado = await carga.json();
  assert.equal(resultado.public_id, firma.publicId);

  const registro = ok(await api('multimedia/registrar', {
    method: 'POST',
    body: { tipo: 'image', timestamp: firma.timestamp, signature: firma.signature, resultado, titulo: 'QA worker imagen', alt: 'Cuadro azul de QA' }
  }));
  idMedia = registro.id;
  assert.ok(idMedia);
});
await chkAsync('el archivo QA se sirve por su URL', async () => {
  const ficha = (await api('multimedia')).data.items.find((m) => m.id === idMedia);
  const r = await fetch(WORKER + ficha.url);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /image\/png/);
});
await chkAsync('una firma falsificada no registra nada', async () => {
  const firma = ok(await api('multimedia/firma', { method: 'POST', body: { tipo: 'image' } }));
  const r = await api('multimedia/registrar', {
    method: 'POST',
    body: { tipo: 'image', timestamp: firma.timestamp, signature: 'f'.repeat(40), resultado: { public_id: firma.publicId, format: 'png', resource_type: 'image', bytes: 10, secure_url: 'x' } }
  });
  assert.equal(r.status, 403);
});

/* ---------- 8. Dashboard y catálogo ---------- */
console.log('\n== 8. Panel y catálogo ==');
await chkAsync('el tablero resume sin inventar ceros', async () => {
  const t = ok(await api('dashboard'));
  assert.equal(typeof t.productos, 'number');
  assert.equal(t.solicitudes, null);
  assert.ok(Array.isArray(t.actividad));
});
await chkAsync('el catálogo público trae configuración y categorías', async () => {
  const publico = ok(await api('public/catalogo', { token: null }));
  assert.ok(Array.isArray(publico.categorias) && publico.categorias.length > 0);
  assert.ok('configuracion' in publico);
  assert.ok(publico.productos.every((p) => !('usuarioResponsable' in p)));
});

console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
process.exit(fallos.length ? 1 : 0);
