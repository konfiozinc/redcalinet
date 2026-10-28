// KZ-REDCALINET-023 — Certificación determinista de las reglas v3.
//
// Responde a una sola pregunta, con matriz completa y sin depender de qué
// ruleset tenga cargado el emulador: ¿alguna identidad administrativa puede
// escribir DIRECTAMENTE en Firestore con las reglas v3?
//
// Se carga el archivo firestore.rules en un entorno de pruebas controlado
// (`initializeTestEnvironment`), se siembran documentos con las reglas
// desactivadas (equivalente al Admin SDK) y se comprueba que create, update y
// delete fallan para todas las identidades y todas las colecciones.
//
// Al final se comprueba también que la lectura pública del contrato sigue
// funcionando: cerrar escrituras no puede romper el catálogo.
//
// Uso (desde admin/, con el emulador de Firestore en 8080):
//   node test/escrituras-v3-023.mjs

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';

const reglas = await fs.readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'demo-redcalinet-admin',
  firestore: { host: '127.0.0.1', port: 8080, rules: reglas }
});

const comprobaciones = [];
const fallos = [];
async function chk(nombre, fn) {
  try {
    await fn();
    comprobaciones.push(nombre);
    console.log('  PASA   ' + nombre);
  } catch (e) {
    fallos.push(nombre + ' (' + (e?.code || e?.message || e) + ')');
    console.log('  **FALLA** ' + nombre);
  }
}

/* ---------- siembra con reglas desactivadas (= Admin SDK del servidor) ---------- */
const PREFIJO = 'qa-v3-escritura';
const DOCS = [
  ['configuracion', 'empresa'], ['configuracion', 'contacto'], ['configuracion', PREFIJO],
  ['categorias', PREFIJO], ['servicios', PREFIJO], ['servicios', PREFIJO + '-publicado'],
  ['usuarios', PREFIJO], ['auditoria', PREFIJO], ['multimedia', PREFIJO],
  ['promociones', PREFIJO], ['_adminRegistros', PREFIJO]
];
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [col, id] of DOCS) {
    const datos = col === 'servicios'
      ? { nombre: 'QA v3', estado: id.endsWith('-publicado') ? 'PUBLICADO' : 'BORRADOR', categoriaId: 'qa-cat' }
      : { nombre: 'QA v3', estado: 'BORRADOR' };
    await setDoc(doc(db, col + '/' + id), datos);
  }
});

/* ---------- identidades ---------- */
// El rol y el estado no se leen en las reglas v3 (esa es justamente la mejora),
// así que se prueban varias para demostrar que ninguna abre una puerta.
const IDENTIDADES = [
  ['anónimo', (e) => e.unauthenticatedContext()],
  ['PROPIETARIO activo', (e) => e.authenticatedContext('qa-admin')],
  ['SUPERADMIN activo', (e) => e.authenticatedContext('qa-super')],
  ['cuenta desactivada', (e) => e.authenticatedContext('qa-desactivada')],
  ['cuenta sin rol', (e) => e.authenticatedContext('qa-sinrol')],
  ['uid sin documento', (e) => e.authenticatedContext('qa-fantasma')]
];
const COLECCIONES = [...new Set(DOCS.map(([c]) => c))];

console.log('== Escrituras directas: ninguna identidad, ninguna colección ==');
for (const [etiqueta, contexto] of IDENTIDADES) {
  for (const col of COLECCIONES) {
    await chk(`${etiqueta} NO puede escribir en ${col} (create, update, delete)`, async () => {
      const db = contexto(env).firestore();
      const nuevo = `${PREFIJO}-nuevo-${Date.now()}`;
      await assertFails(setDoc(doc(db, col + '/' + nuevo), { nombre: 'intruso' }));
      await assertFails(updateDoc(doc(db, col + '/' + PREFIJO), { nombre: 'intruso' }));
      await assertFails(deleteDoc(doc(db, col + '/' + PREFIJO)));
    });
  }
}

/* ---------- el documento no pudo modificarse ---------- */
await chk('ningún documento de sondeo cambió de nombre', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [col, id] of DOCS) {
      const d = await getDoc(doc(db, col + '/' + id));
      assert.equal(d.data()?.nombre, 'QA v3', col + '/' + id + ' cambió');
    }
  });
});

/* ---------- la lectura pública del contrato se conserva ---------- */
console.log('\n== Lectura pública del contrato (no se puede romper el catálogo) ==');
const publico = env.unauthenticatedContext().firestore();
await chk('anónimo lee configuracion/empresa', () => assertSucceeds(getDoc(doc(publico, 'configuracion/empresa'))));
await chk('anónimo lee configuracion/contacto', () => assertSucceeds(getDoc(doc(publico, 'configuracion/contacto'))));
await chk('anónimo NO lee otro documento de configuracion', () => assertFails(getDoc(doc(publico, 'configuracion/' + PREFIJO))));
await chk('anónimo lee categorias', () => assertSucceeds(getDocs(collection(publico, 'categorias'))));
await chk('anónimo lee servicios PUBLICADO', () => assertSucceeds(getDocs(query(collection(publico, 'servicios'), where('estado', '==', 'PUBLICADO')))));
await chk('anónimo NO lee un servicio en BORRADOR', () => assertFails(getDoc(doc(publico, 'servicios/' + PREFIJO))));
await chk('anónimo NO lee usuarios', () => assertFails(getDoc(doc(publico, 'usuarios/' + PREFIJO))));
await chk('anónimo NO lee auditoria', () => assertFails(getDoc(doc(publico, 'auditoria/' + PREFIJO))));
await chk('anónimo NO lee multimedia', () => assertFails(getDoc(doc(publico, 'multimedia/' + PREFIJO))));
await chk('un autenticado tampoco lee usuarios', () =>
  assertFails(getDoc(doc(env.authenticatedContext('qa-super').firestore(), 'usuarios/' + PREFIJO))));

/* ---------- resumen ---------- */
console.log('\n== Resumen ==');
console.log('  identidades probadas: ' + IDENTIDADES.length);
console.log('  colecciones probadas: ' + COLECCIONES.length + ' (' + COLECCIONES.join(', ') + ')');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);

const salida = new URL('../.runtime/escrituras-v3-023-results.json', import.meta.url);
await fs.writeFile(salida, JSON.stringify({
  reglas: 'firestore.rules',
  identidades: IDENTIDADES.map(([n]) => n),
  colecciones: COLECCIONES,
  operaciones: ['create', 'update', 'delete'],
  comprobaciones: comprobaciones.length,
  fallos,
  certificado: fallos.length === 0
}, null, 2));

await env.cleanup();
process.exit(fallos.length ? 1 : 0);
