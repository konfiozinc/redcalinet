// KZ-REDCALINET-014 — Sirve el paquete empaquetado como Node plano.
//
// No es un servidor aparte de la API: sirve el MISMO handler que se subiría a
// Cloud Functions, con la misma firma (req,res). Sirve para comprobar, sin
// desplegar ni activar facturación, que el paquete generado por `preparar.mjs`
// funciona igual que `server/index.mjs`.
//
// Ejecutar: cd admin/deploy && node preparar.mjs && node servir-local.mjs

import http from 'node:http';
import { handler } from './server/index.mjs';

const puerto = Number(process.env.PORT || 5177);
http.createServer(handler).listen(puerto, '127.0.0.1', () => {
  console.log('Paquete de despliegue servido en http://127.0.0.1:' + puerto + '/admin/api/bootstrap');
});
