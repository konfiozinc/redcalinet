// KZ-REDCALINET-026 — Concurrencia entre validación de relaciones y commit.
//
// Certifica el mecanismo de TESTIGOS: cada escritura incluye un update sin
// cambios sobre la categoría y sobre cada archivo referenciado, con el
// `updateTime` que se leyó al validar. Si cualquiera de ellos cambió o se borró
// entre la validación y el commit, la precondición falla y no se escribe NADA:
// no puede quedar un producto publicado apuntando a una categoría o a un archivo
// que ya no existe.
//
// Se prueba la capa de datos directamente (misma que usa el Worker), sin Worker
// de por medio, para poder forzar la carrera.
//
// Uso (desde redcalinet/admin-worker, con el emulador de Firestore en 8080):
//   node test/concurrencia-026.mjs

import assert from 'node:assert/strict';
import { clienteFirestore } from '../src/firestore.mjs';

const env = { MODO_EMULADOR: '1', PROYECTO_FIREBASE: 'demo-redcalinet-admin' };
const db = clienteFirestore(env);
const marca = Date.now();
const CAT = 'qa-conc-' + marca;
const PROD = 'qa-conc-prod-' + marca;
const AUD = 'qa-conc-aud-' + marca;

const comprobaciones = [];
const fallos = [];
const chk = async (nombre, fn) => {
  try { await fn(); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); }
  catch (e) { fallos.push(nombre + ' (' + (e?.message || e) + ')'); console.log('  **FALLA** ' + nombre + '  ' + (e?.message || e)); }
};

/* ---------- preparación ---------- */
await db.confirmar([{ crear: 'categorias/' + CAT, datos: { nombre: 'QA conc', visible: true, tipo: 'producto', orden: 0 } }]);
const categoria = await db.leerDoc('categorias/' + CAT);
assert.ok(categoria && categoria._updateTime, 'la categoría de prueba no se creó');

const testigoValido = { actualizar: 'categorias/' + CAT, datos: { nombre: categoria.nombre }, mascara: ['nombre'], tiempo: categoria._updateTime };
const escrituraProducto = { crear: 'servicios/' + PROD, datos: { nombre: 'QA conc producto', categoriaId: CAT, estado: 'PUBLICADO' } };
const escrituraAuditoria = { crear: 'auditoria/' + AUD, datos: { actor: 'qa', accion: 'CREAR' } };

console.log('== Concurrencia entre validación y commit ==');

await chk('con la categoría intacta, el commit con testigo pasa', async () => {
  const r = await db.confirmar([escrituraProducto, testigoValido, escrituraAuditoria]);
  assert.ok(r.ok, 'el commit debía pasar: ' + JSON.stringify(r.datos || {}));
  assert.ok(await db.leerDoc('servicios/' + PROD), 'el producto no se creó');
});

await chk('si la categoría cambia después de validar, el commit se rechaza y no escribe', async () => {
  const PROD2 = PROD + '-cambio';
  const AUD2 = AUD + '-cambio';
  // Otra petición modifica la categoría (esto es la carrera real).
  const actual = await db.leerDoc('categorias/' + CAT);
  await db.confirmar([{ actualizar: 'categorias/' + CAT, datos: { nombre: 'QA conc modificada' }, mascara: ['nombre'], tiempo: actual._updateTime }]);

  // El commit llega con el testigo OBSOLETO (updateTime anterior).
  const r = await db.confirmar([
    { crear: 'servicios/' + PROD2, datos: { nombre: 'QA conc producto 2', categoriaId: CAT, estado: 'PUBLICADO' } },
    testigoValido,
    { crear: 'auditoria/' + AUD2, datos: { actor: 'qa', accion: 'CREAR' } }
  ]);
  assert.equal(r.ok, false, 'el commit debía rechazarse por precondición');
  assert.ok(!(await db.leerDoc('servicios/' + PROD2)), 'el producto se escribió a pesar del conflicto');
  assert.ok(!(await db.leerDoc('auditoria/' + AUD2)), 'la auditoría se escribió a pesar del conflicto');
});

await chk('si la categoría se elimina, el commit se rechaza y no deja producto huérfano', async () => {
  const PROD3 = PROD + '-borrada';
  const actual = await db.leerDoc('categorias/' + CAT);
  await db.confirmar([{ borrar: 'categorias/' + CAT }]);

  const r = await db.confirmar([
    { crear: 'servicios/' + PROD3, datos: { nombre: 'QA conc producto 3', categoriaId: CAT, estado: 'PUBLICADO' } },
    { actualizar: 'categorias/' + CAT, datos: { nombre: actual.nombre }, mascara: ['nombre'], tiempo: actual._updateTime },
    { crear: 'auditoria/' + AUD + '-borrada', datos: { actor: 'qa', accion: 'CREAR' } }
  ]);
  assert.equal(r.ok, false, 'el commit debía rechazarse: la categoría ya no existe');
  assert.ok(!(await db.leerDoc('servicios/' + PROD3)), 'quedó un producto apuntando a una categoría borrada');
});

await chk('el archivo multimedia también actúa como testigo', async () => {
  const cat2 = 'categorias/qa-conc2-' + marca;
  await db.confirmar([{ crear: cat2, datos: { nombre: 'QA conc 2', visible: true, tipo: 'producto', orden: 0 } }]);
  const C2 = await db.leerDoc(cat2);
  const ARCH = 'multimedia/' + 'qa-arch-' + marca;
  await db.confirmar([{ crear: ARCH, datos: { tipo: 'image', estado: 'PUBLICADO', procesamiento: 'LISTO', alt: 'QA', url: '/x.png' } }]);
  const archivo = await db.leerDoc(ARCH);

  // El archivo se archiva después de la validación.
  await db.confirmar([{ actualizar: ARCH, datos: { estado: 'ARCHIVADO' }, mascara: ['estado'], tiempo: archivo._updateTime }]);

  const r = await db.confirmar([
    { crear: 'servicios/' + PROD + '-media', datos: { nombre: 'QA conc media', categoriaId: C2.id ?? cat2.split('/')[1], estado: 'PUBLICADO' } },
    { actualizar: cat2, datos: { nombre: C2.nombre }, mascara: ['nombre'], tiempo: C2._updateTime },
    { actualizar: ARCH, datos: { tipo: archivo.tipo }, mascara: ['tipo'], tiempo: archivo._updateTime },
    { crear: 'auditoria/' + AUD + '-media', datos: { actor: 'qa', accion: 'CREAR' } }
  ]);
  assert.equal(r.ok, false, 'el commit debía rechazarse: el archivo cambió de estado');
  assert.ok(!(await db.leerDoc('servicios/' + PROD + '-media')), 'quedó un producto con un archivo inválido');
  await db.confirmar([{ borrar: ARCH }, { borrar: cat2 }]).catch(() => {});
});

/* ---------- limpieza ---------- */
await db.confirmar([
  { borrar: 'servicios/' + PROD },
  { borrar: 'auditoria/' + AUD }
]).catch(() => {});

console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
process.exit(fallos.length ? 1 : 0);
