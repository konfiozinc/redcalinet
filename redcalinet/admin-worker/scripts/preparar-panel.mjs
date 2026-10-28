// KZ-REDCALINET-025 — Copia el panel compilado al directorio que sirve el Worker.
//
// El panel se construye con `base: '/admin/'`, así que sus recursos se piden bajo
// /admin/assets/. Copiarlo a public/admin/ deja exactamente la misma ruta que en
// local y que en el Worker: lo que se prueba es lo que se publica.
//
// Uso (desde redcalinet/admin-worker): node scripts/preparar-panel.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const origen = path.join(aqui, '..', '..', '..', 'admin', 'dist');
const destino = path.join(aqui, '..', 'public', 'admin');

await fs.access(path.join(origen, 'index.html')).catch(() => {
  throw new Error('Falta admin/dist/index.html: ejecuta `npm run build` en admin/ antes de preparar el panel.');
});

await fs.rm(destino, { recursive: true, force: true });
await fs.mkdir(destino, { recursive: true });
await fs.cp(origen, destino, { recursive: true });

const recursos = await fs.readdir(path.join(destino, 'assets')).catch(() => []);
console.log('Panel: admin/dist → public/admin (' + recursos.length + ' recursos, ruta /admin/ conservada).');
