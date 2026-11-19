// KZ-REDCALINET-023 — Ensambla el directorio que Firebase Hosting publica.
//
// El panel se construye con rutas RELATIVAS (KZ-REDCALINET-024: antes se
// compilaba con base '/admin/', y entonces las copias publicadas en otras rutas
// pedían /admin/assets/… y daban 404). Con rutas relativas, el mismo panel
// compilado funciona servido desde /admin/, desde /admin/dist/ o desde cualquier
// carpeta: cada copia resuelve sus recursos a su lado.
//
// Uso (desde admin/deploy): node preparar-hosting.mjs
// Es idempotente: borra el destino antes de copiar.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const origen = path.join(aqui, '..', 'dist');
const destino = path.join(aqui, '..', '..', 'hosting-public', 'admin');

await fs.access(path.join(origen, 'index.html')).catch(() => {
  throw new Error('Falta admin/dist/index.html: ejecuta `npm run build` en admin/ antes de empaquetar Hosting.');
});

await fs.rm(destino, { recursive: true, force: true });
await fs.mkdir(destino, { recursive: true });
await fs.cp(origen, destino, { recursive: true });

const recursos = await fs.readdir(path.join(destino, 'assets')).catch(() => []);
console.log('Hosting: admin/dist → hosting-public/admin (' + recursos.length + ' recursos, misma ruta que en local).');
