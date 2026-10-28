// KZ-REDCALINET-023 — Ensambla el directorio que Firebase Hosting publica.
//
// El panel se construye con `base: '/admin/'` y sus recursos quedan en
// dist/assets/*. Si Hosting sirviera `admin/dist` tal cual, el HTML pediría
// /admin/assets/... y el archivo no existiría. Copiarlo dentro de
// hosting-public/admin/ deja la MISMA ruta que en local (/admin/ y
// /admin/assets/), de modo que lo que se prueba en local es lo que se publica.
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
