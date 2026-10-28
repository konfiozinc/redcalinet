// KZ-REDCALINET-020 — Recuperación real de Auth después de reiniciar el emulador.
//
// Fase «antes»:   crea una cuenta ficticia, la desactiva, fotografía el estado
//                 (identidades, rol, activo/disabled, hash de los usuarios) y
//                 guarda un token válido.
// Fase «despues»: con el emulador de Auth reiniciado desde la exportación,
//                 comprueba que identidad, roles, acceso, desactivación y
//                 aislamiento de sesión sobreviven.
//
// Uso (desde admin/): node test/auth-recuperacion-020.mjs antes | despues

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const BASE = 'http://127.0.0.1:5176';
const PROYECTO = 'demo-redcalinet-admin';
const PA = 'RCL-Only-QA-2026!';
const EMAIL_CESADA = 'qa-recuperacion-020@rcl.example.test';
const checkFile = new URL('../.runtime/auth-checkpoint-020.json', import.meta.url);
const fase = process.argv[2] || 'antes';

let ok = 0, fail = 0;
const fallos = [];
const chk = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  PASA   ' + nombre + (detalle ? '  ' + detalle : '')); }
  else { fail++; fallos.push(nombre); console.log('  **FALLA** ' + nombre + '  ' + detalle); }
};

const app = initializeApp({ projectId: PROYECTO }, 'auth-020-' + fase);
const db = getFirestore(app);
const auth = getAuth(app);

const entrar = async (email) => {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PA, returnSecureToken: true })
  });
  return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
};
const api = async (ruta, token, opciones = {}) => {
  const r = await fetch(BASE + '/admin/api/' + ruta, {
    method: opciones.method || 'GET',
    headers: {
      Origin: BASE, // las escrituras exigen origen permitido
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opciones.body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {})
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  return { status: r.status, datos: await r.json().catch(() => ({})) };
};
const foto = async () => {
  const cuentas = (await auth.listUsers(1000)).users
    .map((u) => ({ uid: u.uid, email: u.email, disabled: u.disabled === true }))
    .sort((a, b) => a.uid.localeCompare(b.uid));
  const usuarios = await db.collection('usuarios').orderBy('__name__').get();
  const docs = usuarios.docs.map((d) => [d.id, JSON.stringify(d.data())]);
  return { cuentas, usuariosHash: crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex'), usuarios: usuarios.size };
};

if (fase === 'antes') {
  const sesion = await entrar('superadmin@rcl.example.test');
  assert.equal(sesion.status, 200, 'el SUPERADMIN debe poder entrar');
  const token = sesion.cuerpo.idToken;

  /* cuenta ficticia que se desactiva antes de la exportación */
  const yaExiste = (await auth.getUserByEmail(EMAIL_CESADA).catch(() => null)) !== null;
  let uid = yaExiste ? (await auth.getUserByEmail(EMAIL_CESADA)).uid : '';
  if (!yaExiste) {
    const creada = await api('usuarios', token, { method: 'POST', body: { nombre: 'Cuenta cesada 020', email: EMAIL_CESADA, password: PA, rol: 'PROPIETARIO', activo: true } });
    assert.equal(creada.status, 200, 'crear la cuenta de prueba: ' + JSON.stringify(creada.datos));
    uid = creada.datos.id;
  }
  const fila = ((await api('usuarios', token)).datos.items || []).find((u) => u.id === uid);
  const cesada = await api('usuarios', token, { method: 'POST', body: { uid, nombre: 'Cuenta cesada 020', rol: 'PROPIETARIO', activo: false, revision: fila.revision } });
  chk('cuenta ficticia desactivada antes de exportar', cesada.status === 200, 'HTTP ' + cesada.status);

  const estado = await foto();
  const cesadaCuenta = estado.cuentas.find((c) => c.uid === uid);
  chk('la desactivación llega a Auth (disabled=true)', !!cesadaCuenta && cesadaCuenta.disabled === true, JSON.stringify(cesadaCuenta));
  chk('una cuenta desactivada no puede iniciar sesión', (await entrar(EMAIL_CESADA)).status !== 200);
  chk('el SUPERADMIN sí inicia sesión', (await entrar('superadmin@rcl.example.test')).status === 200);
  chk('el PROPIETARIO sí inicia sesión', (await entrar('admin@rcl.example.test')).status === 200);

  await fs.writeFile(checkFile, JSON.stringify({ estado, token, uidCesado: uid }, null, 2));
  console.log('\n  estado guardado: ' + estado.cuentas.length + ' cuentas, ' + estado.usuarios + ' usuarios en Firestore');
} else {
  const previo = JSON.parse(await fs.readFile(checkFile, 'utf8'));
  const ahora = await foto();

  console.log('== Identidad y roles ==');
  chk('mismas cuentas después del reinicio', ahora.cuentas.length === previo.estado.cuentas.length, previo.estado.cuentas.length + ' → ' + ahora.cuentas.length);
  chk('mismos uid y correo', JSON.stringify(ahora.cuentas.map((c) => c.uid + c.email)) === JSON.stringify(previo.estado.cuentas.map((c) => c.uid + c.email)));
  chk('el estado disabled sobrevive', JSON.stringify(ahora.cuentas) === JSON.stringify(previo.estado.cuentas), ahora.cuentas.filter((c) => c.disabled).map((c) => c.email).join(', ') || 'ninguna desactivada');
  chk('los documentos de usuarios no cambian', ahora.usuariosHash === previo.estado.usuariosHash && ahora.usuarios === previo.estado.usuarios, 'hash ' + ahora.usuariosHash.slice(0, 12) + '… · ' + ahora.usuarios + ' usuarios');

  console.log('\n== Acceso ==');
  const sup = await entrar('superadmin@rcl.example.test');
  chk('el SUPERADMIN vuelve a entrar con su contraseña', sup.status === 200);
  chk('su rol sigue siendo SUPERADMIN', (await api('me', sup.cuerpo.idToken)).datos.user?.rol === 'SUPERADMIN');
  const adm = await entrar('admin@rcl.example.test');
  chk('el PROPIETARIO vuelve a entrar', adm.status === 200);
  chk('su rol sigue siendo PROPIETARIO', (await api('me', adm.cuerpo.idToken)).datos.user?.rol === 'PROPIETARIO');
  chk('el PROPIETARIO no puede leer usuarios', (await api('usuarios', adm.cuerpo.idToken)).status === 403);
  chk('el PROPIETARIO no puede leer auditoría', (await api('auditoria', adm.cuerpo.idToken)).status === 403);
  chk('el SUPERADMIN sigue pudiendo leer auditoría', (await api('auditoria', sup.cuerpo.idToken)).status === 200);

  console.log('\n== Desactivación ==');
  chk('la cuenta cesada sigue desactivada en Auth', (await auth.getUser(previo.uidCesado).catch(() => ({ disabled: null }))).disabled === true);
  chk('la cuenta cesada sigue sin poder entrar', (await entrar(EMAIL_CESADA)).status !== 200);
  const filaCesada = ((await api('usuarios', sup.cuerpo.idToken)).datos.items || []).find((u) => u.id === previo.uidCesado);
  chk('sigue marcada como inactiva en Firestore', !!filaCesada && filaCesada.activo === false, JSON.stringify(filaCesada && { activo: filaCesada.activo, rol: filaCesada.rol }));

  console.log('\n== Aislamiento de sesión ==');
  const viejo = await api('me', previo.token);
  chk('un token emitido antes del reinicio queda rechazado', [401, 403].includes(viejo.status), 'HTTP ' + viejo.status + ' (tras reiniciar el emulador de Auth las claves cambian)');
  const a = await entrar('admin@rcl.example.test');
  const b = await entrar('superadmin@rcl.example.test');
  const perfilA = (await api('me', a.cuerpo.idToken)).datos.user;
  const perfilB = (await api('me', b.cuerpo.idToken)).datos.user;
  chk('dos sesiones simultáneas conservan su propio rol', perfilA.rol === 'PROPIETARIO' && perfilB.rol === 'SUPERADMIN', perfilA.rol + ' / ' + perfilB.rol);
  chk('el token del PROPIETARIO no hereda nada del SUPERADMIN', (await api('usuarios', a.cuerpo.idToken)).status === 403);
}

console.log(`\n  FASE ${fase}: TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
if (fail) console.log('  Fallos: ' + fallos.join(' | '));
await app.delete();
process.exit(fail ? 1 : 0);
