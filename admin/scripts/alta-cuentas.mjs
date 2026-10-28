#!/usr/bin/env node
// Alta de las cuentas administrativas de Red CaliNet.
//
// Lee admin/deploy/cuentas-previstas.json: solo esos correos y solo su rol.
// No hay contraseñas en el repositorio: cada cuenta se crea SIN contraseña, desactivada,
// y el responsable define la suya con el enlace de restablecimiento de Firebase.
//
// Acciones (siempre con --cuenta <correo> salvo --estado):
//   --revisar     no escribe nada; muestra qué existe de cada cuenta
//   --crear       crea la cuenta en Auth (sin contraseña, disabled) + usuarios/{uid}
//   --verificar   uid, disabled, emailVerified, rol, activo y si el acceso está habilitado
//   --activar     comprueba el rol y activa; vuelve a verificar y solo declara LISTO si cuadra
//   --desactivar  corta el acceso de inmediato (Auth disabled + usuarios.activo=false)
//   --restablecer genera un enlace de restablecimiento de un solo uso
//
// Barreras: en producción exige --entorno produccion, el proyecto correcto y credenciales
// de servicio por variable de entorno. Cualquier acción que modifique pide --confirmar <correo>.

import fs from 'node:fs/promises';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const plan = JSON.parse(await fs.readFile(new URL('../deploy/cuentas-previstas.json', import.meta.url), 'utf8'));
const ROLES = ['SUPERADMIN', 'PROPIETARIO'];
for (const c of plan.cuentas) {
  if (!ROLES.includes(c.rol)) { console.error('Rol no permitido en la configuración: ' + c.rol); process.exit(2); }
}

const arg = (nombre, defecto = null) => (process.argv.includes(nombre) ? process.argv[process.argv.indexOf(nombre) + 1] : defecto);
const accion = ['--revisar', '--crear', '--verificar', '--activar', '--desactivar', '--restablecer', '--estado']
  .find((a) => process.argv.includes(a)) || '--estado';
const entorno = arg('--entorno', 'emulador');
const produccion = entorno === 'produccion';
const modifica = ['--crear', '--activar', '--desactivar', '--restablecer'].includes(accion);
const correoPedido = String(arg('--cuenta', '')).toLowerCase();
const confirmar = String(arg('--confirmar', '')).toLowerCase();

const salir = (m, c = 1) => { console.error(m); process.exit(c); };
const objetivo = () => {
  const c = plan.cuentas.find((x) => x.correo.toLowerCase() === correoPedido);
  if (!c) salir('Correo no autorizado: "' + correoPedido + '". Solo están previstas: ' + plan.cuentas.map((x) => x.correo).join(', '));
  return c;
};

/* --estado y --revisar recorren las cuentas previstas y no escriben nada, así
   que no piden --cuenta. El resto de acciones actúa sobre una sola cuenta. */
if (!['--estado', '--revisar'].includes(accion) && !correoPedido) salir('Falta --cuenta <correo>.');
if (produccion) {
  if (process.env.RCL_MODE === 'emulator') salir('Contradicción: RCL_MODE=emulator con --entorno produccion.');
  if (process.env.GCLOUD_PROJECT !== plan.proyecto) salir('GCLOUD_PROJECT debe ser ' + plan.proyecto + '.');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) salir('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta fuera del repositorio).');
} else if (process.env.RCL_MODE !== 'emulator' || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  salir('Modo emulador: exporta RCL_MODE=emulator y los dos *_EMULATOR_HOST. Para producción añade --entorno produccion.');
}
if (modifica) {
  const c = objetivo();
  if (confirmar !== c.correo.toLowerCase()) salir('Confirmación requerida: --confirmar ' + c.correo);
}

const proyecto = produccion ? plan.proyecto : (process.env.GCLOUD_PROJECT || 'demo-redcalinet-admin');
const app = initializeApp({ projectId: proyecto, ...(produccion ? { credential: applicationDefault() } : {}) }, 'alta-cuentas');
const auth = getAuth(app);

/* KZ-029 — Credenciales SEPARADAS por servicio.
   Firestore sigue usando la cuenta de servicio (ADC), que solo tiene
   roles/datastore.user. Firebase Authentication se administra con la sesión ya
   autenticada del propietario en el CLI, que llega por la variable de entorno
   RCL_ACCESS_TOKEN: nunca por argumento, archivo, log ni repositorio.
   Así la cuenta de servicio del Worker conserva sus permisos actuales. */
const tokenCli = process.env.RCL_ACCESS_TOKEN || '';
const authRest = tokenCli ? (() => {
  const base = 'https://identitytoolkit.googleapis.com/v1/projects/' + proyecto + '/accounts';
  const pedir = async (ruta, cuerpo) => {
    const r = await fetch(base + ruta, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tokenCli, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {})
    });
    const datos = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, datos };
  };
  const fallo = (datos, status) => {
    const mensaje = (datos && datos.error && datos.error.message) || ('HTTP ' + status);
    const e = new Error(mensaje);
    e.code = mensaje === 'EMAIL_NOT_FOUND' ? 'auth/user-not-found' : 'auth/' + mensaje;
    return e;
  };
  return {
    async getUserByEmail(email) {
      const r = await pedir(':lookup', { email: [email] });
      const u = (r.datos.users || [])[0];
      if (!u) throw fallo({ error: { message: 'EMAIL_NOT_FOUND' } }, r.status);
      return { uid: u.localId, email: u.email || '', disabled: Boolean(u.disabled), emailVerified: Boolean(u.emailVerified) };
    },
    async createUser({ email, disabled }) {
      const r = await pedir('', { email, emailVerified: false, disabled: disabled === true });
      if (!r.ok) throw fallo(r.datos, r.status);
      return { uid: r.datos.localId };
    },
    async updateUser(uid, campos) {
      const cuerpo = { localId: uid };
      if (typeof campos.disabled === 'boolean') cuerpo.disableUser = campos.disabled;
      const r = await pedir(':update', cuerpo);
      if (!r.ok) throw fallo(r.datos, r.status);
      return { uid };
    },
    async generatePasswordResetLink(email) {
      const r = await pedir(':sendOobCode', { requestType: 'PASSWORD_RESET', email, returnOobLink: true });
      if (!r.ok) throw fallo(r.datos, r.status);
      return r.datos.oobLink || '(el enlace se envia al correo)';
    }
  };
})() : auth;

/* Administración de Auth: sesión del CLI si está, cuenta de servicio si no. */
const dirAuth = authRest;

console.log('  credenciales: Firestore=cuenta de servicio · Auth=' + (tokenCli ? 'sesión del propietario (CLI)' : 'cuenta de servicio'));
const db = getFirestore(app);

const leer = async (correo) => {
  const usuario = await dirAuth.getUserByEmail(correo).catch(() => null);
  const doc = usuario ? ((await db.doc('usuarios/' + usuario.uid).get()).data() || null) : null;
  const accesible = !!usuario && usuario.disabled === false && !!doc && doc.activo === true && ROLES.includes(doc.rol);
  return { usuario, doc, accesible };
};
const pintar = (correo, esperado, e) => {
  console.log('  ' + correo + '  [' + esperado + ']');
  console.log('    cuenta Auth : ' + (e.usuario ? 'sí · uid=' + e.usuario.uid + ' · disabled=' + e.usuario.disabled : 'NO'));
  console.log('    usuarios/doc: ' + (e.doc ? 'rol=' + e.doc.rol + ' · activo=' + e.doc.activo : 'NO'));
  console.log('    acceso      : ' + (e.accesible ? 'HABILITADO' : 'bloqueado') +
    (e.doc && e.doc.rol !== esperado ? '  ← ¡el rol no coincide con el previsto!' : ''));
  return { correo, esperado, ...e };
};

const documento = async (uid, c) => {
  const ahora = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.doc('usuarios/' + uid), { nombre: c.nombre, email: c.correo, rol: c.rol, activo: false, revision: 1, createdAt: ahora, updatedAt: ahora });
  batch.set(db.doc('auditoria/alta-cuenta-' + uid), {
    actor: 'alta-cuentas', rol: 'SISTEMA', accion: 'CREAR_CUENTA', coleccion: 'usuarios',
    registro: uid, fecha: ahora, campos: ['email', 'rol', 'activo'], detalle: c.rol
  });
  await batch.commit();
};

console.log('== Cuentas administrativas · proyecto ' + proyecto + (produccion ? ' (PRODUCCIÓN)' : ' (emulador)') + ' ==');
console.log('  acción: ' + accion + '\n');

const resultados = [];
if (accion === '--estado' || accion === '--revisar') {
  for (const c of plan.cuentas) resultados.push(pintar(c.correo, c.rol, await leer(c.correo)));
} else {
  const c = objetivo();
  let e = await leer(c.correo);

  if (accion === '--crear') {
    if (e.usuario && e.doc) salir('La cuenta ' + c.correo + ' ya existe completa. Usa --verificar o --restablecer.');
    if (e.usuario) {
      /* La identidad existe en Auth pero falta su documento en Firestore: pasa
         tras restaurar Firestore sin restaurar Auth. Se reconstruye solo el
         documento y Auth no se toca, así que el acceso sigue cerrado. */
      await documento(e.usuario.uid, c);
      console.log('  la identidad ya existía en Auth (uid=' + e.usuario.uid + '); Auth NO se modificó');
      console.log('  documento usuarios/' + e.usuario.uid + ' creado con rol ' + c.rol + ' y activo=false');
      console.log('  sigue sin acceso hasta --activar. Enlace de restablecimiento:');
      console.log('  ' + await dirAuth.generatePasswordResetLink(c.correo));
    } else {
      const uid = (await dirAuth.createUser({ email: c.correo, emailVerified: false, disabled: true })).uid;
      await documento(uid, c);
      console.log('  creada SIN contraseña, desactivada · usuarios/' + uid + ' con rol ' + c.rol + ' y activo=false');
      console.log('  enlace de restablecimiento (un solo uso, no se guarda):');
      console.log('  ' + await dirAuth.generatePasswordResetLink(c.correo));
    }
  } else if (accion === '--restablecer') {
    if (!e.usuario) salir('La cuenta no existe.');
    console.log('  enlace de restablecimiento (un solo uso, no se guarda):\n  ' + await dirAuth.generatePasswordResetLink(c.correo));
  } else if (accion === '--activar') {
    if (!e.usuario) salir('Primero crea la cuenta con --crear.');
    if (!e.doc || e.doc.rol !== c.rol) salir('El documento no tiene el rol previsto (' + c.rol + '). No se activa.');
    await dirAuth.updateUser(e.usuario.uid, { disabled: false });
    await db.doc('usuarios/' + e.usuario.uid).update({ activo: true, activadoEn: new Date().toISOString() });
    e = await leer(c.correo);
    pintar(c.correo, c.rol, e);
    if (!e.accesible) salir('La verificación posterior falló: NO se declara habilitado.');
    console.log('\n  LISTO: ' + c.correo + ' (' + c.rol + ') puede iniciar sesión.');
  } else if (accion === '--desactivar') {
    if (!e.usuario) salir('La cuenta no existe.');
    await dirAuth.updateUser(e.usuario.uid, { disabled: true });
    await db.doc('usuarios/' + e.usuario.uid).update({ activo: false, desactivadoEn: new Date().toISOString() });
    console.log('  ' + c.correo + ': disabled=true y activo=false. El API la rechaza de inmediato.');
  } else if (accion === '--verificar') {
    e = await leer(c.correo);
    pintar(c.correo, c.rol, e);
    console.log('\n  ' + (e.accesible ? 'acceso listo' : 'acceso NO habilitado todavía'));
  }
}

await app.delete();
