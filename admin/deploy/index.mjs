// KZ-REDCALINET-014 — Envoltorio de Cloud Functions gen 2 para la API del panel.
//
// No duplica rutas: importa el mismo `handler(req,res)` que usa el servidor
// local (server/index.mjs). Por eso lo que se prueba en local es exactamente
// lo que se despliega.
//
// El código del servidor se copia aquí con `npm run preparar` (genera ./server/).
// Sin ese paso este archivo no resuelve la importación.

import { onRequest } from 'firebase-functions/v2/https';
import { handler } from './server/index.mjs';

export const api = onRequest(
  {
    region: process.env.RCL_FUNCTIONS_REGION || 'us-central1',
    memory: '512MiB',
    // Desde KZ-023 el archivo multimedia NO atraviesa la función: el navegador
    // lo envía directo al proveedor con una firma de vida corta. La función solo
    // recibe JSON pequeño (firma, registro, catálogo), así que 60 s sobran; el
    // límite de tamaño lo pone el proveedor y no Cloud Functions.
    timeoutSeconds: 60,
    maxInstances: 10,
    concurrency: 10
  },
  handler
);
