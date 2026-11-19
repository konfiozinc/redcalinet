/* ══════════════════════════════════════════════════════════════════════════
   KZ-REDCALINET-024 · comprobar-panel.mjs

   Comprueba, SIN navegador, que el servidor del panel sigue sirviendo bien la
   página y que declara su API como debe:

     · /admin/ responde 200 con el HTML compilado.
     · El HTML lleva <meta name="redcalinet-api"> (lo que hace que el panel pida
       su API cuando de verdad está, y no cuando se abre como archivo estático).
     · La CSP sigue siendo estricta: sin 'unsafe-inline' ni comodines.
     · /admin/api/bootstrap responde 200 con el seed local.

   Usa el modo emulador, que es el único que la propia compuerta de seguridad
   permite sin el contrato de producción aprobado.

   Uso (desde redcalinet/admin):  node deploy/comprobar-panel.mjs
   ══════════════════════════════════════════════════════════════════════════ */

import { contractHash } from '../server/store.mjs';

/* Modo emulador: es el que la compuerta de `initFirebase` permite sin contrato
   de producción aprobado. Solo se sirve HTML y el arranque, así que NO hace
   falta que el emulador esté levantado: aquí no se toca Firestore. */
process.env.RCL_MODE = process.env.RCL_MODE || 'emulator';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-redcalinet-admin';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

void contractHash; // se importa para dejar claro que en modo emulador no se usa

const { handler } = await import('../server/index.mjs');

let pasos = 0;
let fallos = 0;
function comprobar(condicion, titulo, detalle) {
  pasos += 1;
  if (condicion) console.log('  OK    ' + titulo + (detalle ? '  · ' + detalle : ''));
  else { fallos += 1; console.log('  FALLA ' + titulo + (detalle ? '  → ' + detalle : '')); }
}

/* Petición falsa: solo necesitamos cabeceras y cuerpo. */
function pedir(ruta) {
  return new Promise((listo) => {
    const res = {
      cabeceras: {},
      codigo: 0,
      cuerpo: '',
      writeHead(codigo, cabeceras) { this.codigo = codigo; this.cabeceras = cabeceras || {}; return this; },
      end(datos) { this.cuerpo = datos === undefined ? '' : String(datos); listo(this); },
      setHeader() {},
      getHeader() { return undefined; }
    };
    const req = {
      url: ruta,
      method: 'GET',
      headers: {},
      readableEnded: true,
      destroyed: false,
      resume() {},
      on() {}
    };
    handler(req, res).catch(() => listo(res));
  });
}

console.log('KONFÍO ZINC · el panel de Red CaliNet y su API\n');

const pagina = await pedir('/admin/');
comprobar(pagina.codigo === 200, 'la página del panel responde 200', String(pagina.codigo));
comprobar(/name="redcalinet-api"/.test(pagina.cuerpo), 'el servidor declara su API en el HTML');
comprobar(
  /content="\/admin"/.test(pagina.cuerpo),
  'la declaración apunta a /admin',
  (pagina.cuerpo.match(/<meta name="redcalinet-api"[^>]*>/) || [''])[0]
);
comprobar(/<script[^>]+src="[^"]+\.js"/.test(pagina.cuerpo), 'el panel entra por un script externo (no en línea)');

const csp = String(pagina.cabeceras['Content-Security-Policy'] || '');
comprobar(csp.length > 0, 'la página se sirve con CSP');
comprobar(!/unsafe-inline/.test(csp), 'la CSP no permite estilos/scripts en línea (no se relajó)');
comprobar(/script-src 'self'/.test(csp), 'la CSP solo admite scripts del propio origen');

const bootstrap = await pedir('/admin/api/bootstrap');
comprobar(bootstrap.codigo === 200, 'la API del arranque responde 200', String(bootstrap.codigo));
let datos = null;
try { datos = JSON.parse(bootstrap.cuerpo); } catch { /* se informa abajo */ }
comprobar(datos !== null, 'el arranque devuelve JSON legible');
comprobar(datos && datos.firebase && datos.firebase.projectId, 'el arranque trae la configuración de Firebase', datos && datos.firebase && datos.firebase.projectId);

console.log('\n  ' + (pasos - fallos) + '/' + pasos + ' comprobaciones OK · ' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
