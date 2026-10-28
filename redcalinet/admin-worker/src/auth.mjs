// KZ-REDCALINET-025 — Autenticación administrativa en el Worker.
//
// Verifica el ID token de Firebase con Identity Toolkit (verificación en el
// servicio, no criptografía local: así el CPU por petición se mantiene bajo,
// que es la restricción real del plan gratuito) y después resuelve rol y estado
// contra `usuarios/{uid}` en Firestore.
//
// Nada de esto confía en cabeceras del cliente: el rol se lee del documento real
// y `activo` debe ser exactamente true.

export const ROLES = ['PROPIETARIO', 'SUPERADMIN'];

/* Se reutiliza la MISMA clase Fault que schema.mjs: el router decide el estado
   HTTP con una sola comprobación y no hay dos tipos de error distintos. */
import { Fault } from './schema.mjs';
export { Fault };

/* Devuelve {uid, email} o null. Un token caducado, revocado o de una cuenta
   deshabilitada en Auth no pasa. */
export async function usuarioDelToken(env, idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const emulador = String(env.MODO_EMULADOR || '0') === '1';
  const base = emulador
    ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
    : 'https://identitytoolkit.googleapis.com/v1';
  const url = base + '/accounts:lookup?key=' + encodeURIComponent(env.FIREBASE_API_KEY || '');

  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
  } catch {
    throw new Fault(503, 'No se pudo verificar la sesión con Firebase.');
  }
  if (!respuesta.ok) return null;

  const datos = await respuesta.json();
  const cuenta = (datos.users || [])[0];
  if (!cuenta || !cuenta.localId) return null;
  if (cuenta.disabled === true) return null;
  return { uid: cuenta.localId, email: cuenta.email || '' };
}

/* Sesión administrativa completa: identidad verificada + rol válido + activo. */
export async function actor(env, db, cabeceraAutorizacion) {
  const token = typeof cabeceraAutorizacion === 'string' && cabeceraAutorizacion.startsWith('Bearer ')
    ? cabeceraAutorizacion.slice(7).trim()
    : null;
  if (!token) throw new Fault(401, 'Inicia sesión.');

  const identidad = await usuarioDelToken(env, token);
  if (!identidad) throw new Fault(401, 'Sesión inválida o vencida.');

  const registro = await db.leerDoc('usuarios/' + identidad.uid);
  const usuario = registro && registro.activo === true && ROLES.includes(registro.rol) ? registro : null;
  if (!usuario) throw new Fault(403, 'Cuenta sin permisos administrativos activos.');

  return {
    uid: identidad.uid,
    email: identidad.email,
    rol: usuario.rol,
    nombre: usuario.nombre || ''
  };
}

export const requireSuper = (quien) => {
  if (!quien || quien.rol !== 'SUPERADMIN') throw new Fault(403, 'Esta operación requiere SUPERADMIN.');
  return true;
};
