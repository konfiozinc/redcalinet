// KZ-REDCALINET-023 — Diagnóstico: ¿qué ruleset está aplicando AHORA el emulador?
//
// El emulador de Firestore tiene un único ruleset por instancia y el último
// proceso que lo carga gana (ver la guía, §3). Esta sonda lo dice en una línea
// para que ninguna prueba de denegación se interprete mal.
//
// Discriminador: escritura directa a `usuarios` con un SUPERADMIN.
//   v3            → todo 403 (nadie escribe desde el cliente)
//   v2 / Harness  → configuracion, categorias y servicios 200; usuarios 200 solo a SUPERADMIN
//
// Uso (desde admin/, con el emulador en 8080 y Auth en 9099):
//   node test/sonda-ruleset-023.mjs

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROYECTO = process.env.GCLOUD_PROJECT || 'demo-redcalinet-admin';
const FS = `http://127.0.0.1:8080/v1/projects/${PROYECTO}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key';

const app = initializeApp({ projectId: PROYECTO }, 'sonda-ruleset-' + Date.now());
const db = getFirestore(app);

const token = async (email) => {
  const r = await fetch(AUTH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'RCL-Only-QA-2026!', returnSecureToken: true })
  });
  if (!r.ok) throw new Error('login ' + email + ' → ' + r.status);
  return (await r.json()).idToken;
};
const superadmin = await token('superadmin@rcl.example.test');
const propietario = await token('admin@rcl.example.test');

// Documentos de sondeo: se crean con Admin SDK (no pasa por las reglas).
for (const [col, id] of [['servicios', 'qa-sonda-ruleset'], ['usuarios', 'qa-sonda-ruleset']]) {
  await db.doc(`${col}/${id}`).set({ nombre: 'Sonda' }, { merge: true });
}

// Se escribe un valor distinto del almacenado: si el 200 es real, el dato cambia.
async function escribir(ruta, jwt, valor) {
  const r = await fetch(`${FS}/${ruta}?updateMask.fieldPaths=nombre`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt },
    body: JSON.stringify({ fields: { nombre: { stringValue: valor } } })
  });
  return r.status;
}

const marca = 'ESCRITO-' + Date.now();
const servicios = await escribir('servicios/qa-sonda-ruleset', propietario, marca);
const guardado = (await db.doc('servicios/qa-sonda-ruleset').get()).data()?.nombre;
const configuracion = await escribir('configuracion/empresa', propietario, 'sonda');
const usuariosSuper = await escribir('usuarios/qa-sonda-ruleset', superadmin, 'sonda');
const usuariosProp = await escribir('usuarios/qa-sonda-ruleset', propietario, 'sonda');

const esV3 = [servicios, configuracion, usuariosSuper, usuariosProp].every((c) => c === 403);
console.log(
  `RULESET: ${esV3 ? 'v3 (todo denegado)' : 'v2/Harness (escritura de cliente permitida)'}` +
  ` | servicios(PROPIETARIO)=${servicios} configuracion(PROPIETARIO)=${configuracion}` +
  ` usuarios(SUPERADMIN)=${usuariosSuper} usuarios(PROPIETARIO)=${usuariosProp}` +
  ` | escritura real aplicada: ${guardado === marca}`
);
await app.delete();
process.exit(esV3 ? 0 : 1);
