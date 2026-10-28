// KZ-REDCALINET-014 — Prueba conjunta de las reglas v3 (firestore.rules).
//
// Esta suite la escribió el Harness, no Codex Sites. Comprueba exactamente lo
// que la fase 2 de la misión exige y que ninguna de las dos partes había
// probado: que un usuario AUTENTICADO con rol válido tampoco pueda escribir
// Firestore directamente, solo la API Node con Admin SDK.
//
// Requiere el emulador de Firestore en 127.0.0.1:8080. Las reglas se suben
// desde el archivo del repositorio, así que este test es la certificación de
// ESE archivo y no de una copia.
//
// Ejecutar: cd admin && node test/rules-v3.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';

const reglas = await fs.readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');

const env = await initializeTestEnvironment({
  projectId: 'demo-redcalinet-admin',
  firestore: { host: '127.0.0.1', port: 8080, rules: reglas }
});

let ok = 0, fail = 0;
const fallos = [];
/* assertSucceeds lanza si el acceso se deniega; assertFails lanza si el
   acceso se PERMITE. En ambos casos la expectativa ya va dentro del helper,
   así que "la promesa resolvió" significa siempre que se cumplió lo esperado. */
async function chk(nombre, fn) {
  try {
    await fn();
    ok++;
    console.log('  PASA   ' + nombre);
  } catch (e) {
    fail++;
    const detalle = e && e.code ? e.code : (e && e.message ? e.message : String(e));
    fallos.push(nombre + ' (' + detalle + ')');
    console.log('  **FALLA** ' + nombre + '  ' + detalle);
  }
}

/* ---------------------------------------------------------------- */
/* Siembra: se escribe con las reglas desactivadas, que es el papel    */
/* del Admin SDK. Es lo mismo que hace un servidor de confianza.      */
/* ---------------------------------------------------------------- */
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'configuracion/empresa'), {
    nombre: 'Red CaliNet', eslogan: 'Tu conexión', descripcion: 'Portada institucional',
    esloganHistorico: '', promesa: '', ciudad: 'Bello', direccion: '', direccionNota: ''
  });
  await setDoc(doc(db, 'configuracion/contacto'), {
    whatsapp: '573014585658', telefono: '573014585658', correo: 'redcalinetmono@gmail.com',
    facebook: 'https://www.facebook.com/share/1DfEomgbbL/?mibextid=wwXIfr',
    instagram: 'https://www.instagram.com/red_calinet', tiktok: '', horarios: []
  });
  // Documento trampa: no está en el contrato, la v2 lo dejaba leer.
  await setDoc(doc(db, 'configuracion/interna'), { nota: 'no debe ser pública' });

  await setDoc(doc(db, 'categorias/cat1'), { nombre: 'Tecnología', icono: 'i-tech', descripcion: 'Equipos', nota: '', orden: 0, visible: true, tipo: 'producto' });
  await setDoc(doc(db, 'categorias/cat2'), { nombre: 'Retirada', icono: 'i-check', descripcion: 'Ya no', nota: '', orden: 1, visible: false, tipo: 'servicio' });

  const base = { categoriaId: 'cat1', nombre: 'Equipo', descripcion: 'Descripción', precio: null, detalles: [], imagen: null, orden: 0, destacado: false, agotado: false, tipo: 'producto' };
  await setDoc(doc(db, 'servicios/pub1'), { ...base, nombre: 'Publicado', estado: 'PUBLICADO' });
  await setDoc(doc(db, 'servicios/bor1'), { ...base, nombre: 'Borrador', estado: 'BORRADOR' });
  await setDoc(doc(db, 'servicios/ocu1'), { ...base, nombre: 'Oculto', estado: 'OCULTO' });

  await setDoc(doc(db, 'usuarios/qa-admin'), { nombre: 'Admin', email: 'admin@rcl.example.test', rol: 'PROPIETARIO', activo: true });
  await setDoc(doc(db, 'usuarios/qa-super'), { nombre: 'Super', email: 'superadmin@rcl.example.test', rol: 'SUPERADMIN', activo: true });
  await setDoc(doc(db, 'usuarios/qa-off'), { nombre: 'Cesado', email: 'off@rcl.example.test', rol: 'PROPIETARIO', activo: false });

  await setDoc(doc(db, '_adminRegistros/servicios--pub1'), { validado: true, fuenteValidacion: 'QA', notas: 'privado' });
  await setDoc(doc(db, 'auditoria/a1'), { accion: 'CREAR', registro: 'pub1' });
  await setDoc(doc(db, 'multimedia/m1'), { titulo: 'foto', estado: 'PUBLICADO' });
  await setDoc(doc(db, 'promociones/p1'), { nombre: 'Promo', estado: 'PUBLICADO' });
});

const anon = env.unauthenticatedContext().firestore();
const owner = env.authenticatedContext('qa-admin').firestore();
const superDb = env.authenticatedContext('qa-super').firestore();
const cesado = env.authenticatedContext('qa-off').firestore();

/* ---------------------------------------------------------------- */
console.log('== Lectura pública: lo que el catálogo necesita sigue abierto ==');
/* ---------------------------------------------------------------- */
await chk('anónimo lee un servicio PUBLICADO', () => assertSucceeds(getDoc(doc(anon, 'servicios/pub1'))));
await chk('anónimo NO lee un BORRADOR', () => assertFails(getDoc(doc(anon, 'servicios/bor1'))));
await chk('anónimo NO lee un servicio OCULTO', () => assertFails(getDoc(doc(anon, 'servicios/ocu1'))));
await chk('anónimo NO lista la colección entera sin filtro', () => assertFails(getDocs(collection(anon, 'servicios'))));
await chk('la consulta oficial estado==PUBLICADO devuelve solo lo publicado', async () => {
  const snap = await assertSucceeds(getDocs(query(collection(anon, 'servicios'), where('estado', '==', 'PUBLICADO'))));
  const ids = snap.docs.map((d) => d.id);
  assert.ok(ids.includes('pub1'), 'el servicio publicado de la siembra debe aparecer');
  assert.ok(!ids.includes('bor1') && !ids.includes('ocu1'), 'no deben colarse el borrador ni el oculto');
  assert.ok(snap.docs.every((d) => d.data().estado === 'PUBLICADO'), 'todo lo devuelto debe estar PUBLICADO');
});
await chk('anónimo lee configuracion/empresa (portada)', () => assertSucceeds(getDoc(doc(anon, 'configuracion/empresa'))));
await chk('anónimo lee configuracion/contacto', () => assertSucceeds(getDoc(doc(anon, 'configuracion/contacto'))));
await chk('anónimo NO lee un configuracion fuera del contrato', () => assertFails(getDoc(doc(anon, 'configuracion/interna'))));
await chk('anónimo lista categorias', async () => {
  const snap = await assertSucceeds(getDocs(collection(anon, 'categorias')));
  const ids = snap.docs.map((d) => d.id);
  assert.ok(ids.includes('cat1') && ids.includes('cat2'), 'las categorías de la siembra deben poder listarse');
});

/* ---------------------------------------------------------------- */
console.log('\n== Lo que antes era legible por rol y ya no ==');
/* ---------------------------------------------------------------- */
await chk('anónimo NO lee usuarios', () => assertFails(getDoc(doc(anon, 'usuarios/qa-admin'))));
await chk('PROPIETARIO NO lee usuarios (ni su propio rol)', () => assertFails(getDoc(doc(owner, 'usuarios/qa-admin'))));
await chk('PROPIETARIO NO lee el registro privado _adminRegistros', () => assertFails(getDoc(doc(owner, '_adminRegistros/servicios--pub1'))));
await chk('PROPIETARIO NO lee auditoria', () => assertFails(getDoc(doc(owner, 'auditoria/a1'))));
await chk('PROPIETARIO NO lee multimedia privada', () => assertFails(getDoc(doc(owner, 'multimedia/m1'))));
await chk('PROPIETARIO NO lee promociones privadas', () => assertFails(getDoc(doc(owner, 'promociones/p1'))));
await chk('PROPIETARIO NO lee un BORRADOR', () => assertFails(getDoc(doc(owner, 'servicios/bor1'))));

/* ---------------------------------------------------------------- */
console.log('\n== Escritura administrativa directa: DENEGADA (el núcleo de la fase 2) ==');
/* ---------------------------------------------------------------- */
const nuevoServicio = { categoriaId: 'cat1', nombre: 'Nuevo', descripcion: '', precio: null, detalles: [], imagen: null, estado: 'PUBLICADO', orden: 0, destacado: false, agotado: false, tipo: 'producto' };

await chk('PROPIETARIO NO crea servicios', () => assertFails(setDoc(doc(owner, 'servicios/hack1'), nuevoServicio)));
await chk('PROPIETARIO NO modifica un servicio', () => assertFails(updateDoc(doc(owner, 'servicios/pub1'), { nombre: 'cambiado' })));
await chk('PROPIETARIO NO cambia el precio de un servicio', () => assertFails(updateDoc(doc(owner, 'servicios/pub1'), { precio: 1000 })));
await chk('PROPIETARIO NO publica un borrador', () => assertFails(updateDoc(doc(owner, 'servicios/bor1'), { estado: 'PUBLICADO' })));
await chk('PROPIETARIO NO borra un servicio', () => assertFails(deleteDoc(doc(owner, 'servicios/ocu1'))));
await chk('PROPIETARIO NO modifica la portada (configuracion/empresa)', () => assertFails(updateDoc(doc(owner, 'configuracion/empresa'), { descripcion: 'secuestrada' })));
await chk('PROPIETARIO NO crea categorias', () => assertFails(setDoc(doc(owner, 'categorias/cat9'), { nombre: 'X' })));
await chk('PROPIETARIO NO crea usuarios', () => assertFails(setDoc(doc(owner, 'usuarios/qa-nuevo'), { rol: 'PROPIETARIO', activo: true })));
await chk('PROPIETARIO NO se autoeleva a SUPERADMIN', () => assertFails(updateDoc(doc(owner, 'usuarios/qa-admin'), { rol: 'SUPERADMIN' })));
await chk('PROPIETARIO NO reactiva una cuenta desactivada', () => assertFails(updateDoc(doc(owner, 'usuarios/qa-off'), { activo: true })));

await chk('SUPERADMIN tampoco escribe servicios', () => assertFails(updateDoc(doc(superDb, 'servicios/pub1'), { nombre: 'super' })));
await chk('SUPERADMIN tampoco escribe usuarios', () => assertFails(updateDoc(doc(superDb, 'usuarios/qa-off'), { activo: true })));
await chk('una cuenta DESACTIVADA no gana nada por su rol', () => assertFails(updateDoc(doc(cesado, 'servicios/pub1'), { nombre: 'cesado' })));
await chk('la escritura anónima sigue denegada', () => assertFails(setDoc(doc(anon, 'servicios/hack2'), nuevoServicio)));

/* ---------------------------------------------------------------- */
console.log('\n== Los datos no se movieron: nada de lo anterior surtió efecto ==');
/* ---------------------------------------------------------------- */
let final = null;
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  final = {
    pub: (await getDoc(doc(db, 'servicios/pub1'))).data(),
    bor: (await getDoc(doc(db, 'servicios/bor1'))).data(),
    emp: (await getDoc(doc(db, 'configuracion/empresa'))).data(),
    rol: (await getDoc(doc(db, 'usuarios/qa-admin'))).data(),
    off: (await getDoc(doc(db, 'usuarios/qa-off'))).data()
  };
});
await chk('el servicio quedó intacto (' + final.pub.nombre + ', precio ' + final.pub.precio + ')', async () => {
  assert.equal(final.pub.nombre, 'Publicado');
  assert.equal(final.pub.precio, null);
});
await chk('el borrador sigue en BORRADOR', async () => assert.equal(final.bor.estado, 'BORRADOR'));
await chk('la portada conserva su texto', async () => assert.equal(final.emp.descripcion, 'Portada institucional'));
await chk('nadie cambió de rol por la puerta del cliente', async () => assert.equal(final.rol.rol, 'PROPIETARIO'));
await chk('la cuenta desactivada sigue desactivada', async () => assert.equal(final.off.activo, false));

console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
if (fail) { console.log('  Fallos: ' + fallos.join(' | ')); }
await env.cleanup();
process.exit(fail ? 1 : 0);
