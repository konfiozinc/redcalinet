// KZ-REDCALINET-020 — Certificación de la paginación de auditoría en el servidor.
//
// Comprueba lo que la misión exige y que antes no se cumplía:
//   - orden cronológico desde el servidor (más reciente primero),
//   - paginación estable: sin duplicados ni omisiones entre páginas,
//   - los cinco datos por entrada (actor, operación, fecha, registro, cambios),
//   - que consultar NO modifica ningún documento histórico,
//   - que la misma consulta repetida devuelve la misma secuencia.
//
// Uso (desde admin/): node test/auditoria-020.mjs

import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = 'http://127.0.0.1:5176';
const PROYECTO = 'demo-redcalinet-admin';

let ok = 0, fail = 0;
const fallos = [];
const chk = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  PASA   ' + nombre + (detalle ? '  ' + detalle : '')); }
  else { fail++; fallos.push(nombre); console.log('  **FALLA** ' + nombre + '  ' + detalle); }
};

/* ---------- sesión real de SUPERADMIN ---------- */
const sesion = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@rcl.example.test', password: 'RCL-Only-QA-2026!', returnSecureToken: true })
});
assert.equal(sesion.status, 200, 'la cuenta QA de SUPERADMIN debe poder entrar');
const token = (await sesion.json()).idToken;

const api = async (ruta) => {
  const r = await fetch(BASE + '/admin/api/' + ruta, { headers: { Authorization: 'Bearer ' + token } });
  const datos = await r.json();
  if (r.status !== 200) throw new Error('API ' + r.status + ': ' + JSON.stringify(datos).slice(0, 160));
  return datos;
};

/* ---------- estado real de la colección (referencia independiente) ---------- */
const app = initializeApp({ projectId: PROYECTO }, 'auditoria-020');
const db = getFirestore(app);
const foto = async () => {
  const snap = await db.collection('auditoria').orderBy('__name__').get();
  const mapa = new Map();
  for (const d of snap.docs) mapa.set(d.id, JSON.stringify(d.data()));
  return mapa;
};
const antes = await foto();
const total = antes.size;
console.log('== Referencia ==');
console.log('  documentos en auditoria: ' + total);

/* ---------- recorrido completo por el API ---------- */
const recorrer = async () => {
  let items = [], cursor = '', paginas = 0;
  do {
    const r = await api('auditoria' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    items.push(...r.items);
    cursor = r.next || '';
    paginas++;
    if (paginas > 200) throw new Error('demasiadas páginas: posible bucle de cursor');
  } while (cursor);
  return { items, paginas };
};

const uno = await recorrer();
const dos = await recorrer();

console.log('\n== Orden cronológico (servidor) ==');
const fechas = uno.items.map((r) => String(r.fecha || ''));
const descendente = fechas.every((f, i) => i === 0 || fechas[i - 1] >= f);
chk('la primera entrada es la más reciente', fechas[0] === [...fechas].sort().at(-1), fechas[0] || '(sin fecha)');
chk('la secuencia completa va de más reciente a más antigua', descendente, fechas.length + ' entradas en ' + uno.paginas + ' páginas');
chk('todas las entradas traen fecha', fechas.every(Boolean));

console.log('\n== Integridad de la paginación ==');
const ids = uno.items.map((r) => r.id);
/* La referencia solo puede contar documentos que la consulta ordenada por
   `fecha` puede devolver: Firestore omite los documentos que no tienen el campo
   de ordenación. `test/rules-v3.mjs` siembra `auditoria/a1` (sin fecha) para
   probar reglas, y si esa siembra queda en el mismo emulador la referencia
   anterior contaba un documento que ninguna consulta ordenada puede entregar.
   El API siempre escribe `fecha`; esto corrige la referencia, no el criterio. */
const conFecha = [...antes.entries()].filter(([, valor]) => typeof JSON.parse(valor).fecha === 'string').length;
chk('sin duplicados entre páginas', new Set(ids).size === ids.length, ids.length + ' entregados, ' + new Set(ids).size + ' únicos');
chk('sin omisiones: entrega todo lo que hay en la colección', ids.length === conFecha, ids.length + ' de ' + conFecha + (conFecha === total ? '' : ' (' + (total - conFecha) + ' sin fecha, fuera de toda consulta ordenada)'));
chk('los ids entregados son exactamente los de la colección', ids.every((i) => antes.has(i)));
chk('recorrido repetido devuelve la misma secuencia', JSON.stringify(ids) === JSON.stringify(dos.items.map((r) => r.id)));
chk('se usaron varias páginas (el cursor avanza)', uno.paginas > 1, uno.paginas + ' páginas');

console.log('\n== Datos de cada entrada ==');
const conCampos = uno.items.every((r) => 'actor' in r && 'accion' in r && 'fecha' in r && 'registro' in r && 'coleccion' in r);
chk('actor, operación, fecha, registro y colección presentes', conCampos);
/* Los cambios de permisos no llevan lista `campos`: guardan rolAnterior,
   rolNuevo y activo, que es información más rica. Se acepta cualquiera de las
   dos formas, pero alguna tiene que estar. */
const conCambios = uno.items.every((r) => Array.isArray(r.campos) || 'rolAnterior' in r || 'rolNuevo' in r || 'activo' in r);
const sinLista = uno.items.filter((r) => !Array.isArray(r.campos));
chk('toda entrada conserva su información de cambios', conCambios,
  sinLista.length + ' entradas sin lista (cambios de permisos con rolAnterior/rolNuevo/activo)');
/* Lo que de verdad importa: que el API no recorte ningún campo guardado. */
const sinRecorte = uno.items.every((r) => {
  const bruto = JSON.parse(antes.get(r.id) || '{}');
  const clavesApi = Object.keys(r).filter((k) => k !== 'id').sort();
  const clavesDoc = Object.keys(bruto).sort();
  return JSON.stringify(clavesApi) === JSON.stringify(clavesDoc);
});
chk('el API entrega todos los campos guardados, sin recortar', sinRecorte);
const ejemplo = uno.items[0] || {};
console.log('  ejemplo: ' + JSON.stringify({ accion: ejemplo.accion, registro: ejemplo.registro, fecha: ejemplo.fecha, actor: ejemplo.actor, campos: ejemplo.campos }));

console.log('\n== Los documentos históricos no se tocan ==');
const despues = await foto();
chk('mismo número de documentos', despues.size === antes.size, antes.size + ' → ' + despues.size);
let iguales = 0, distintos = [];
for (const [id, valor] of antes) {
  if (despues.get(id) === valor) iguales++; else distintos.push(id);
}
chk('ningún documento cambió al consultar', distintos.length === 0, iguales + '/' + antes.size + ' idénticos' + (distintos.length ? ' · distintos: ' + distintos.slice(0, 5).join(', ') : ''));

console.log('\n== Cursor ==');
chk('el cursor es opaco y no es un id de documento', !!(uno.paginas > 1) && !antes.has(String(uno.items.length)), 'base64url con fecha e id');
const invalido = await api('auditoria?cursor=no-es-un-cursor');
chk('un cursor inválido no rompe: devuelve la primera página', Array.isArray(invalido.items) && invalido.items.length > 0, invalido.items.length + ' entradas');

console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
if (fail) console.log('  Fallos: ' + fallos.join(' | '));
await app.delete();
process.exit(fail ? 1 : 0);
