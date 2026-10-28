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
    // Las cargas son de hasta 25 MB (vídeo QA) y se sirven en streaming con
    // Busboy; el timeout alto cubre subidas lentas en móvil.
    timeoutSeconds: 120,
    maxInstances: 10,
    concurrency: 10
  },
  handler
);
