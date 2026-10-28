#!/usr/bin/env node
// Alta del primer SUPERADMIN real de Red CaliNet.
//
// PREPARADO PARA EJECUTARSE EN LA PUESTA EN PRODUCCIÓN. No se ejecuta solo, no
// crea nada por sí mismo y no contiene contraseñas.
//
// El correo autorizado vive en admin/deploy/superadmin-previsto.json. Cualquier
// otro correo hace que el script aborte: no se puede dar SUPERADMIN a otro.
//
// Secuencia prevista (cada paso se ejecuta a mano, en la ventana de despliegue):
//   1. node scripts/alta-superadmin.mjs --revisar      (no escribe nada)
//   2. node scripts/alta-superadmin.mjs --crear        (cuenta SIN contraseña, desactivada)
//   3. El propietario abre el enlace de restablecimiento y define su contraseña.
//   4. node scripts/alta-superadmin.mjs --verificar    (comprueba uid, rol y activo)
//   5. node scripts/alta-superadmin.mjs --activar      (habilita el acceso)
//
// Desactivación y recuperación: --desactivar  ·  --restablecer (reenvía el correo)
//
// Reglas de seguridad que aplica:
//   · Nunca escribe una contraseña: usa createUser sin password + enlace de
//     restablecimiento enviado por Firebase.
//   · La cuenta nace DESACTIVADA (disabled) y con usuarios.activo=false, así que
//     el API la rechaza hasta el paso 5.
//   · En producción exige --entorno produccion, el proyecto correcto y
//     credenciales de servicio en el entorno (nunca en el repositorio).
//   · Requiere escribir el correo autorizado con --confirmar para cualquier acción
//     que modifique algo.

import fs from 'node:fs/promises';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const previsto = JSON.parse(await fs.readFile(new URL('../deploy/superadmin-previsto.json', import.meta.url), 'utf8'));
const CORREO = String(previsto.correoAutorizado).toLowerCase();
const ROL = previsto.rol;

const accion = ['--revisar', '--crear', '--verificar', '--activar', '--desactivar', '--restablecer']
  .find((a) => process.argv.includes(a)) || '--revisar';
const entorno = process.argv.includes('--entorno') ? process.argv[process.argv.indexOf('--entorno') + 1] : 'emulador';
const confirmar = process.argv.includes('--confirmar') ? String(process.argv[process.argv.indexOf('--confirmar') + 1]).toLowerCase() : '';
const produccion = entorno === 'produccion';
const modifica = ['--crear', '--activar', '--desactivar', '--restablecer'].includes(accion);

const salir = (mensaje, codigo = 1) => { console.error(mensaje); process.exit(codigo); };

/* ---------------- barreras ---------------- */
if (produccion) {
  if (process.env.RCL_MODE === 'emulator') salir('Contradicción: RCL_MODE=emulator con --entorno produccion.');
  if (process.env.GCLOUD_PROJECT !== previsto.proyecto) salir('GCLOUD_PROJECT debe ser ' + previsto.proyecto + ' (es ' + (process.env.GCLOUD_PROJECT || 'sin definir') + ').');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) salir('Falta GOOGLE_APPLICATION_CREDENTIALS con una cuenta de servicio (ruta fuera del repositorio).');
} else {
  if (process.env.RCL_MODE !== 'emulator' || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    salir('Modo emulador: exporta RCL_MODE=emulator, FIREBASE_AUTH_EMULATOR_HOST y FIRESTORE_EMULATOR_HOST.\n' +
      'Para producción usa además --entorno produccion (y las credenciales de servicio).');
  }
}
if (modifica && confirmar !== CORREO) {
  salir('Confirmación requerida. Añade --confirmar ' + CORREO + ' (el correo autorizado) para ejecutar ' + accion + '.');
}

const proyecto = produccion ? previsto.proyecto : (process.env.GCLOUD_PROJECT || 'demo-redcalinet-admin');
const app = initializeApp({ projectId: proyecto, ...(produccion ? { credential: applicationDefault() } : {}) }, 'alta-superadmin');
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- estado actual ---------------- */
const buscar = async () => {
  const usuario = await auth.getUserByEmail(CORREO).catch(() => null);
  if (!usuario) return { usuario: null, doc: null, permiso: null };
  const doc = (await db.doc('usuarios/' + usuario.uid).get()).data() || null;
  const permiso = await db.doc('permisos/' + usuario.uid).get().catch(() => ({ exists: false }));
  return { usuario, doc, otroDoc: permiso.exists ? permiso.data() : null };
};

const informe = async (estado) => {
  const u = estado.usuario, d = estado.doc;
  const accesible = !!u && u.disabled === false && !!d && d.activo === true && ['PROPIETARIO', 'SUPERADMIN'].includes(d.rol);
  console.log('  proyecto            : ' + proyecto + (produccion ? ' (PRODUCCIÓN)' : ' (emulador)'));
  console.log('  correo autorizado   : ' + CORREO);
  console.log('  cuenta en Auth      : ' + (u ? 'sí' : 'NO') + (u ? ' · uid=' + u.uid + ' · disabled=' + u.disabled + ' · emailVerified=' + u.emailVerified : ''));
  console.log('  documento usuarios  : ' + (d ? 'sí' : 'NO') + (d ? ' · rol=' + d.rol + ' · activo=' + d.activo : ''));
  console.log('  acceso al panel     : ' + (accesible ? 'HABILITADO' : 'bloqueado'));
  return { accesible };
};

console.log('== Alta del primer SUPERADMIN ==');
console.log('  acción: ' + accion + '\n');

let estado = await buscar();
await informe(estado);

/* ---------------- acciones ---------------- */
if (accion === '--crear') {
  if (estado.usuario) salir('La cuenta ya existe. Usa --verificar o --restablecer.');
  const uid = (await auth.createUser({ email: CORREO, emailVerified: false, disabled: true })).uid;
  const ahora = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.doc('usuarios/' + uid), { nombre: 'Red CaliNet', email: CORREO, rol: ROL, activo: false, createdAt: ahora });
  batch.set(db.doc('auditoria/alta-superadmin-' + uid), {
    actor: 'alta-superadmin', rol: 'SISTEMA', accion: 'CREAR_SUPERADMIN', coleccion: 'usuarios',
    registro: uid, fecha: ahora, campos: ['email', 'rol', 'activo'], origen: 'scripts/alta-superadmin.mjs'
  });
  await batch.commit();
  const enlace = await auth.generatePasswordResetLink(CORREO);
  console.log('\n  cuenta creada SIN contraseña, desactivada, y documento usuarios/' + uid + ' con rol ' + ROL + ' y activo=false');
  console.log('\n  PASO SIGUIENTE (lo hace el propietario, no el script):');
  console.log('  abre este enlace una sola vez y define la contraseña. Caduca y no se guarda en el repositorio:');
  console.log('  ' + enlace);
} else if (accion === '--restablecer') {
  if (!estado.usuario) salir('La cuenta no existe todavía.');
  const enlace = await auth.generatePasswordResetLink(CORREO);
  console.log('\n  enlace de restablecimiento generado (no se guarda):\n  ' + enlace);
} else if (accion === '--activar') {
  if (!estado.usuario) salir('Primero crea la cuenta con --crear.');
  if (!estado.doc || estado.doc.rol !== ROL) salir('El documento usuarios no tiene rol ' + ROL + '. No se activa nada.');
  const ahora = new Date().toISOString();
  const batch = db.batch();
  batch.update(db.doc('usuarios/' + estado.usuario.uid), { activo: true, activadoEn: ahora });
  batch.set(db.doc('auditoria/activar-superadmin-' + estado.usuario.uid), {
    actor: 'alta-superadmin', rol: 'SISTEMA', accion: 'ACTIVAR_SUPERADMIN', coleccion: 'usuarios',
    registro: estado.usuario.uid, fecha: ahora, campos: ['activo']
  });
  await batch.commit();
  await auth.updateUser(estado.usuario.uid, { disabled: false });
  estado = await buscar();
  console.log('\n  tras activar:');
  const r = await informe(estado);
  if (!r.accesible) salir('La verificación posterior falló: NO se declara el acceso habilitado.');
  console.log('\n  LISTO: el propietario ya puede iniciar sesión en el panel.');
} else if (accion === '--desactivar') {
  if (!estado.usuario) salir('La cuenta no existe.');
  await auth.updateUser(estado.usuario.uid, { disabled: true });
  await db.doc('usuarios/' + estado.usuario.uid).update({ activo: false, desactivadoEn: new Date().toISOString() });
  console.log('\n  cuenta desactivada: Auth disabled=true y usuarios.activo=false. El API la rechaza de inmediato.');
} else if (accion === '--verificar') {
  const r = await informe(estado);
  console.log('\n  ' + (r.accesible ? 'acceso listo' : 'acceso NO habilitado todavía'));
}

await app.delete();
