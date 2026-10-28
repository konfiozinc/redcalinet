// KZ-REDCALINET-026 — Verificación de la preparación para producción.
//
// Comprueba, SOLO LEYENDO, que la configuración de Red CaliNet está coherente y
// sin secretos antes de que el propietario toque ninguna cuenta real:
//   · las cuentas previstas y su rol coinciden con la configuración de Auth
//   · ningún archivo del repositorio contiene contraseñas ni secretos
//   · el Worker declara los secretos como secretos, no como variables
//   · los marcadores pendientes de completar quedan a la vista
//
// No modifica nada y no contacta con Firebase.
//
// Uso (desde admin/): node scripts/verificar-preparacion.mjs

import fs from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const leer = async (ruta) => JSON.parse(await fs.readFile(new URL(ruta, raiz), 'utf8'));
const texto = async (ruta) => fs.readFile(new URL(ruta, raiz), 'utf8').catch(() => '');

const cuentas = await leer('deploy/cuentas-previstas.json');
const auth = await leer('deploy/auth-candidato.json');
const wrangler = await texto('../redcalinet/admin-worker/wrangler.toml');
const envEjemplo = await texto('.env.example');

const comprobaciones = [];
const fallos = [];
const pendientes = [];
const chk = (nombre, ok, detalle = '') => {
  if (ok) { comprobaciones.push(nombre); console.log('  PASA   ' + nombre + (detalle ? '  · ' + detalle : '')); }
  else { fallos.push(nombre + (detalle ? '  · ' + detalle : '')); console.log('  **FALLA** ' + nombre + (detalle ? '  · ' + detalle : '')); }
};

console.log('== Cuentas previstas ==');
chk('se declaran exactamente dos cuentas', cuentas.cuentas.length === 2, cuentas.cuentas.map((c) => c.correo).join(', '));
const superadmin = cuentas.cuentas.find((c) => c.rol === 'SUPERADMIN');
const propietario = cuentas.cuentas.find((c) => c.rol === 'PROPIETARIO');
chk('hay un SUPERADMIN previsto', Boolean(superadmin), superadmin?.correo);
chk('hay un PROPIETARIO previsto', Boolean(propietario), propietario?.correo);
chk('los roles son los únicos admitidos', cuentas.cuentas.every((c) => ['SUPERADMIN', 'PROPIETARIO'].includes(c.rol)));

console.log('\n== Coherencia entre cuentas y configuración de Auth ==');
chk('la configuración de Auth declara las mismas cuentas', auth.cuentasPrevistas.length === cuentas.cuentas.length);
chk('correos y roles coinciden uno a uno', auth.cuentasPrevistas.every((a) => cuentas.cuentas.some((c) => c.correo === a.correo && c.rol === a.rol)));
chk('Auth no está marcado como activado', /PREVISTO|no activad/i.test(auth.estado), auth.estado);
chk('solo se prevé correo/contraseña', auth.proveedor.emailPassword === true && auth.proveedor.proveedoresOAuth.length === 0);
chk('no se define ninguna contraseña por defecto', !JSON.stringify(auth).includes('password') && !JSON.stringify(cuentas).includes('password'));

console.log('\n== Secretos fuera del repositorio ==');
const archivos = ['deploy/cuentas-previstas.json', 'deploy/auth-candidato.json'];
for (const ruta of archivos) {
  const contenido = await texto(ruta);
  const sospecha = /(api[_-]?secret|private[_-]?key|BEGIN PRIVATE KEY|client_secret)\s*[:=]\s*["'][^"'<]/i.test(contenido);
  chk(ruta + ' sin secretos', !sospecha);
}
chk('wartner.toml declara los secretos como comentario, no como variable',
  !/^\s*(FIREBASE_SA|CLOUDINARY_API_SECRET)\s*=/m.test(wrangler.replace(/#.*$/gm, '')) &&
  /wrangler secret put/.test(wrangler));
chk('.env.example no trae valores secretos reales', !/CLOUDINARY_API_SECRET=.+/.test(envEjemplo.replace(/#.*$/gm, '')));

console.log('\n== Marcadores pendientes de completar (acción del propietario) ==');
const marcadores = [...wrangler.matchAll(/<([A-Z_]+)>/g)].map((m) => m[1]);
for (const m of [...new Set(marcadores)]) pendientes.push('wrangler.toml · ' + m);
for (const d of auth.dominiosAutorizados.filter((x) => x.includes('<'))) pendientes.push('auth-candidato.json · dominio ' + d);
pendientes.push('Secreto FIREBASE_SA (cuenta de servicio de red-calinet)');
pendientes.push('Secreto CLOUDINARY_API_SECRET (solo al habilitar la subida real)');
pendientes.push('Promoción del contrato y RCL_CONTRACT_APPROVED_HASH si aplica');
for (const p of pendientes) console.log('  · ' + p);

console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
console.log('  marcadores externos pendientes: ' + pendientes.length);
for (const f of fallos) console.log('  · ' + f);
process.exit(fallos.length ? 1 : 0);
