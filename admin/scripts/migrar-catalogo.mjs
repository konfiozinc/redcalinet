#!/usr/bin/env node
// KZ-REDCALINET-022 — Migración controlada del catálogo aprobado a Firestore.
//
// Toma `data.json` (el catálogo aprobado de la web) y siembra Firestore:
//   configuracion/empresa, configuracion/contacto, categorias y servicios.
//
// Reglas de la herramienta:
//   · SOLO emuladores. Se niega a correr contra producción.
//   · Idempotente: cada registro lleva una clave de operación derivada de su
//     contenido; repetir la migración con los mismos datos no escribe nada.
//   · Valida con el MISMO esquema que usa el API (admin/server/schema.mjs).
//   · Vista previa por defecto: no escribe hasta que se pide --aplicar.
//   · Detecta duplicados (mismo id o mismo nombre con otro id).
//   · Conserva precio null: nunca inventa precios.
//   · Nunca publica: todo entra como BORRADOR y sin sello de validación.
//   · Respaldo antes de escribir y reversión desde ese respaldo.
//
// Uso (desde admin/):
//   node scripts/migrar-catalogo.mjs                     # vista previa
//   node scripts/migrar-catalogo.mjs --aplicar           # escribe
//   node scripts/migrar-catalogo.mjs --revertir <archivo.json>

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initFirebase, Store } from '../server/store.mjs';
import { validate, defaults, Fault, PUBLIC_FIELDS } from '../server/schema.mjs';

const aqui = fileURLToPath(new URL('.', import.meta.url));
const aplicar = process.argv.includes('--aplicar');
const iRevertir = process.argv.indexOf('--revertir');
const revertirCon = iRevertir > 0 ? process.argv[iRevertir + 1] : null;

const ACTOR = { uid: 'migracion-catalogo', nombre: 'Migración KZ-022', rol: 'SUPERADMIN', activo: true };
const lote = [];
const errores = [];
const avisos = [];
const suma = (valores) => crypto.createHash('sha256').update(JSON.stringify(valores)).digest('hex').slice(0, 16);
const clave = (coleccion, id, valores) => 'migracion-' + coleccion + '-' + id + '-' + suma(valores);
/* El API guarda productos y servicios en la MISMA colección física. */
const fisica = (c) => (c === 'productos' ? 'servicios' : c);

const runtime = initFirebase();
if (!runtime.local) {
  console.error('ABORTADO: esta herramienta solo funciona con emuladores (RCL_MODE=emulator).');
  process.exit(2);
}
const db = runtime.db;
const store = new Store(runtime);

/* ---------------------------------------------------------------- */
/* Reversión                                                         */
/* ---------------------------------------------------------------- */
if (revertirCon) {
  const respaldo = JSON.parse(await fs.readFile(revertirCon, 'utf8'));
  console.log('Revirtiendo desde ' + revertirCon);
  const batch = db.batch();
  for (const [ruta, datos] of Object.entries(respaldo.documentos || {})) {
    batch.set(db.doc(ruta), datos || {});
  }
  for (const ruta of respaldo.creados || []) {
    if (!(respaldo.documentos || {})[ruta]) batch.delete(db.doc(ruta));
  }
  await batch.commit();
  console.log('  restaurados ' + Object.keys(respaldo.documentos || {}).length + ' documentos y borrados ' + (respaldo.creados || []).length + ' creados.');
  process.exit(0);
}

/* ---------------------------------------------------------------- */
/* Lectura del catálogo aprobado                                     */
/* ---------------------------------------------------------------- */
const data = JSON.parse(await fs.readFile(new URL('../../data.json', import.meta.url), 'utf8'));
const slug = (texto) => String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const redes = Object.fromEntries((data.redes || []).map((r) => [r.id, r.url]));

const empresa = {
  nombre: data.marca.nombre,
  eslogan: data.marca.eslogan,
  esloganHistorico: data.marca.esloganHistorico || '',
  promesa: data.marca.promesa || '',
  ciudad: data.marca.ciudad || '',
  direccion: data.contacto.direccion || '',
  direccionNota: data.contacto.direccionNota || '',
  descripcion: data.marca.descripcion || ''
};
const contacto = {
  whatsapp: String(data.contacto.whatsapp || '').replace(/\D/g, ''),
  telefono: String(data.contacto.telefono || '').replace(/\D/g, ''),
  correo: data.contacto.correo || '',
  facebook: redes.facebook || '',
  instagram: redes.instagram || '',
  tiktok: redes.tiktok || '',
  horarios: (data.horarios || []).map((h) => ({ dia: h.dia || '', hora: h.hora || '' }))
};

lote.push({ coleccion: 'configuracion', id: 'empresa', valores: empresa });
lote.push({ coleccion: 'configuracion', id: 'contacto', valores: contacto });

const idsCategoria = new Map();
(data.categorias || []).forEach((cat, i) => {
  const id = 'cat-' + slug(cat.id || cat.nombre);
  if (idsCategoria.has(id)) errores.push('Categoría duplicada en data.json: ' + cat.nombre);
  idsCategoria.set(id, cat.nombre);
  lote.push({
    coleccion: 'categorias', id,
    valores: {
      nombre: cat.nombre, icono: cat.icono || 'i-check', descripcion: cat.descripcion || '',
      nota: cat.nota || '', orden: i, visible: true, tipo: cat.tipo || 'producto'
    }
  });
  (cat.fichas || []).forEach((ficha, j) => {
    const idProducto = 'pro-' + slug(ficha.nombre);
    lote.push({
      coleccion: ficha.tipo === 'servicio' || cat.tipo === 'servicio' ? 'servicios' : 'productos',
      id: idProducto,
      categoriaId: id,
      valores: {
        categoriaId: id,
        nombre: ficha.nombre,
        descripcion: ficha.descripcion || '',
        // Se conserva el precio tal cual: null significa «consultar».
        precio: ficha.precio === undefined ? null : ficha.precio,
        detalles: Array.isArray(ficha.detalles) ? ficha.detalles : [],
        imagen: ficha.imagen || null,
        estado: 'BORRADOR',          // nunca se publica automáticamente
        orden: j,
        destacado: false,
        agotado: false,
        tipo: cat.tipo === 'servicio' ? 'servicio' : 'producto'
      }
    });
  });
});

/* ---------------------------------------------------------------- */
/* Validación con el esquema real del API                            */
/* ---------------------------------------------------------------- */
for (const registro of lote) {
  try {
    validate(registro.coleccion, { ...defaults(registro.coleccion), ...registro.valores });
  } catch (e) {
    errores.push(e instanceof Fault ? registro.coleccion + '/' + registro.id + ': ' + e.message : registro.id + ': ' + e.message);
  }
  if (registro.coleccion !== 'configuracion' && registro.valores.precio !== null && registro.valores.precio !== undefined) {
    avisos.push('OJO: ' + registro.id + ' trae precio ' + registro.valores.precio + ' en data.json; se migra tal cual.');
  }
}

/* Duplicados: mismo nombre con otro id en Firestore */
const existentes = {
  categorias: (await db.collection('categorias').get()).docs.map((d) => ({ id: d.id, ...d.data() })),
  productos: (await db.collection('servicios').get()).docs.map((d) => ({ id: d.id, ...d.data() })),
  configuracion: []
};
for (const reg of lote.filter((r) => r.coleccion !== 'configuracion')) {
  const col = reg.coleccion === 'categorias' ? existentes.categorias : existentes.productos;
  const choque = col.find((d) => d.id !== reg.id && String(d.nombre || '').toLowerCase() === String(reg.valores.nombre).toLowerCase());
  if (choque) avisos.push('duplicado por nombre: "' + reg.valores.nombre + '" ya existe como ' + choque.id + ' (se migraría como ' + reg.id + ')');
}

/* ---------------------------------------------------------------- */
/* Vista previa                                                      */
/* ---------------------------------------------------------------- */
const plan = [];
for (const reg of lote) {
  const ruta = fisica(reg.coleccion) + '/' + reg.id;
  const claveOperacion = clave(reg.coleccion, reg.id, reg.valores);
  const actual = await db.doc(ruta).get();
  /* Idempotente solo si la operación ya se aplicó Y el documento sigue ahí:
     así, después de una reversión (que borra lo creado), volver a migrar
     reconstruye lo que falta en vez de saltárselo. */
  const yaAplicada = (await db.doc('auditoria/' + claveOperacion).get()).exists && actual.exists;
  let accion = 'crear';
  const previo = actual.exists ? actual.data() : null;
  if (yaAplicada) accion = 'sin cambios';
  else if (previo) {
    const dif = Object.keys(reg.valores).filter((k) => JSON.stringify(previo[k] ?? null) !== JSON.stringify(reg.valores[k] ?? null));
    accion = dif.length ? 'actualizar' : 'sin cambios';
    plan.push({ ...reg, accion, dif, claveOperacion, revision: previo.revision || 0 });
    continue;
  }
  plan.push({ ...reg, accion, dif: [], claveOperacion, revision: previo ? (previo.revision || 0) : 0 });
}

console.log('== Catálogo aprobado (data.json) ==');
console.log('  categorías: ' + (data.categorias || []).length + ' · fichas: ' + (data.categorias || []).reduce((n, c) => n + (c.fichas || []).length, 0));
console.log('\n== Plan de migración ==');
for (const p of plan) {
  const ruta = (p.coleccion + '/' + p.id).padEnd(34);
  console.log('  ' + ruta + p.accion.padEnd(13) + (p.dif.length ? 'campos: ' + p.dif.join(', ') : ''));
}
const cuenta = (a) => plan.filter((p) => p.accion === a).length;
console.log('\n  crear ' + cuenta('crear') + ' · actualizar ' + cuenta('actualizar') + ' · sin cambios ' + cuenta('sin cambios'));
console.log('  precios nulos conservados: ' + plan.filter((p) => p.coleccion !== 'configuracion' && p.valores.precio === null).length + ' fichas');
console.log('  ninguna ficha se publica: todas entran en BORRADOR sin validado');
if (avisos.length) { console.log('\n== Avisos =='); avisos.forEach((a) => console.log('  · ' + a)); }
if (errores.length) {
  console.log('\n== ERRORES DE CONTRATO (no se escribe nada) ==');
  errores.forEach((e) => console.log('  · ' + e));
  process.exit(1);
}

if (!aplicar) {
  console.log('\nVista previa. Nada escrito. Para aplicar: --aplicar');
  process.exit(0);
}

/* ---------------------------------------------------------------- */
/* Respaldo y aplicación                                             */
/* ---------------------------------------------------------------- */
const marca = new Date().toISOString().replace(/[:.]/g, '-');
const archivoRespaldo = aqui + '../.runtime/respaldo-catalogo-' + marca + '.json';
const documentos = {}, creados = [];
for (const p of plan) {
  const ruta = fisica(p.coleccion) + '/' + p.id;
  const actual = await db.doc(ruta).get();
  if (actual.exists) documentos[ruta] = actual.data();
  else creados.push(ruta);
  const metaRuta = '_adminRegistros/' + fisica(p.coleccion) + '--' + p.id;
  const meta = await db.doc(metaRuta).get();
  if (meta.exists) documentos[metaRuta] = meta.data();
}
await fs.mkdir(aqui + '../.runtime', { recursive: true });
await fs.writeFile(archivoRespaldo, JSON.stringify({ fecha: new Date().toISOString(), documentos, creados }, null, 2));
console.log('\n  respaldo: ' + archivoRespaldo.replace(/\\/g, '/').split('/').slice(-1)[0] + ' (' + Object.keys(documentos).length + ' documentos previos, ' + creados.length + ' por crear)');

let escritos = 0, saltados = 0;
for (const p of plan) {
  if (p.accion === 'sin cambios') { saltados++; continue; }
  try {
    const ahora = new Date().toISOString();
    const camposPublicos = PUBLIC_FIELDS[p.coleccion === 'configuracion' ? p.id : (['productos', 'servicios'].includes(p.coleccion) ? 'catalogo' : p.coleccion)] || [];
    const publico = {}, privado = {};
    for (const [k, v] of Object.entries(p.valores)) {
      if (camposPublicos.includes(k)) publico[k] = v; else privado[k] = v;
    }
    const batch = db.batch();
    batch.set(db.doc(fisica(p.coleccion) + '/' + p.id), {
      ...publico, revision: (p.revision || 0) + 1, createdAt: p.revision ? undefined : ahora, updatedAt: ahora,
      usuarioResponsable: ACTOR.uid
    });
    batch.set(db.doc('_adminRegistros/' + fisica(p.coleccion) + '--' + p.id), {
      ...privado, ...(p.coleccion === 'configuracion' ? {} : { validado: false, fuenteValidacion: '' }),
      revision: (p.revision || 0) + 1, updatedAt: ahora
    });
    /* El id del documento de auditoría ES la clave de idempotencia: si existe,
       esta migración ya se aplicó y la vista previa la marca «sin cambios». */
    batch.set(db.doc('auditoria/' + p.claveOperacion), {
      actor: ACTOR.uid, rol: ACTOR.rol, accion: 'MIGRAR_CATALOGO', coleccion: p.coleccion,
      registro: p.id, fecha: ahora, campos: Object.keys(p.valores).sort(), origen: 'data.json'
    });
    await batch.commit();
    escritos++;
    console.log('  ' + (p.accion === 'crear' ? 'creado    ' : 'actualizado') + ' ' + p.coleccion + '/' + p.id);
  } catch (e) {
    errores.push(p.coleccion + '/' + p.id + ': ' + (e.message || e));
    console.log('  ERROR     ' + p.coleccion + '/' + p.id + ': ' + e.message);
  }
}
console.log('\n  escritos ' + escritos + ' · sin cambios ' + saltados + ' · errores ' + errores.length);
console.log('  reversión: node scripts/migrar-catalogo.mjs --revertir "' + archivoRespaldo + '"');
process.exit(errores.length ? 1 : 0);
