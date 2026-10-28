// KZ-REDCALINET-014 — Empaqueta el código del servidor dentro del despliegue.
//
// Firebase solo sube el directorio declarado como `source`, así que la API
// necesita su copia de server/*.mjs dentro de deploy/. En vez de mantener dos
// copias en Git, se generan aquí y se firman con SHA-256 en un manifiesto, para
// que el paquete desplegado se pueda verificar contra el código del repositorio.
//
// Ejecutar: cd admin/deploy && node preparar.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const origen = path.join(aqui, '..', 'server');
const destino = path.join(aqui, 'server');

const modulos = (await fs.readdir(origen)).filter((n) => n.endsWith('.mjs'));
if (!modulos.length) throw new Error('No hay módulos en ' + origen);

await fs.rm(destino, { recursive: true, force: true });
await fs.mkdir(destino, { recursive: true });

const manifiesto = {};
for (const nombre of modulos.sort()) {
  const bytes = await fs.readFile(path.join(origen, nombre));
  await fs.writeFile(path.join(destino, nombre), bytes);
  manifiesto[nombre] = {
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

/* server/store.mjs lee ../contract.json para decidir si permite el arranque
   productivo (si el contrato no está certificado, falla cerrado). El paquete
   desplegado necesita ese archivo o no arranca: se copia y se firma igual. */
const contrato = await fs.readFile(path.join(aqui, '..', 'contract.json'));
await fs.writeFile(path.join(aqui, 'contract.json'), contrato);
manifiesto['contract.json'] = {
  bytes: contrato.length,
  sha256: crypto.createHash('sha256').update(contrato).digest('hex')
};

const salida = {
  empaquetadoEn: new Date().toISOString(),
  origen: 'admin/server',
  moduloEntrada: 'server/index.mjs',
  envoltorio: 'index.mjs',
  modulos: manifiesto
};
await fs.writeFile(path.join(aqui, 'MANIFIESTO-EMPAQUETADO.json'), JSON.stringify(salida, null, 2));
console.log('Empaquetados ' + modulos.length + ' módulos en deploy/server/ — manifiesto escrito.');
