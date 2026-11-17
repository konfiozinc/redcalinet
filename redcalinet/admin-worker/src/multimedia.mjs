// KZ-REDCALINET-025 — Multimedia con firma de Cloudinary adaptada a WebCrypto.
//
// Misma semántica que la subida directa firmada ya certificada en KZ-023:
// el navegador pide la firma, sube el archivo al proveedor y aquí solo se
// registran metadatos. El api_secret vive en el entorno del Worker.
//
// Adaptaciones de plataforma respecto a la versión Node:
//   · SHA-1 de la firma con crypto.subtle.digest (WebCrypto), no node:crypto
//   · comparación en tiempo constante manual (no hay timingSafeEqual sin Node)
//   · el adaptador QA guarda en memoria del isolate: en Workers no hay disco
//
// El adaptador QA SOLO existe con MODO_EMULADOR=1. Nunca está activo en producción.

import { Fault } from './auth.mjs';

export const CARPETA_POR_DEFECTO = 'redcalinet/admin';
export const FORMATOS = { image: ['jpg', 'jpeg', 'png', 'webp'], video: ['mp4', 'webm'] };
export const LIMITES = { image: 10 * 1024 * 1024, video: 25 * 1024 * 1024 };
export const VIGENCIA_SEGUNDOS = 900;

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();

/* Firma oficial de Cloudinary: SHA-1 de los parámetros ordenados + el secreto. */
export async function firma(params, apiSecret) {
  const base = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => k + '=' + params[k])
    .join('&');
  return hex(await crypto.subtle.digest('SHA-1', enc.encode(base + apiSecret)));
}

/* Comparación en tiempo constante: no hay crypto.timingSafeEqual en Workers. */
const iguales = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diferente = 0;
  for (let i = 0; i < a.length; i++) diferente |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferente === 0;
};

export const carpeta = (env) => env.CARPETA_MEDIA || CARPETA_POR_DEFECTO;
export const parametrosFirmados = (env, tipo, publicId) => ({
  allowed_formats: FORMATOS[tipo].join(','),
  folder: carpeta(env),
  ...(publicId ? { public_id: publicId } : {})
});

const dentroDeCarpeta = (env, publicId) => {
  const folder = carpeta(env);
  if (typeof publicId !== 'string' || !publicId.startsWith(folder + '/')) return null;
  const resto = publicId.slice(folder.length + 1);
  return resto.length > 0 && resto.length <= 120 && !resto.includes('/') && /^[A-Za-z0-9_-]+$/.test(resto) ? resto : null;
};

export async function emitirFirma(env, tipo) {
  if (!FORMATOS[tipo]) throw new Fault(400, 'Tipo de archivo no admitido.');
  const fixtures = String(env.MODO_EMULADOR || '0') === '1';
  /* KZ-035 — El nombre se firma SIN la carpeta. Cloudinary compone `folder` +
     `public_id`: si se firmara la ruta completa la antepondría otra vez y el
     archivo acabaría en redcalinet/admin/redcalinet/admin/…, que el registro
     rechaza por no estar en la carpeta autorizada. */
  const nombre = crypto.randomUUID();
  const rutaPublica = carpeta(env) + '/' + nombre;
  const timestamp = Math.floor(Date.now() / 1000);
  const firmados = { timestamp, ...parametrosFirmados(env, tipo, nombre) };

  if (!fixtures && !env.CLOUDINARY_API_SECRET) {
    throw new Fault(503, 'La subida de multimedia no está habilitada: falta el secreto de Cloudinary.');
  }

  return {
    proveedor: fixtures ? 'QA_DIRECT_FIXTURE' : 'CLOUDINARY',
    fixture: fixtures,
    tipo,
    timestamp,
    publicId: nombre,
    signature: await firma(firmados, fixtures ? 'qa-local-worker' : env.CLOUDINARY_API_SECRET),
    apiKey: fixtures ? 'qa-directo' : env.CLOUDINARY_API_KEY,
    cloudName: fixtures ? 'qa-directo' : env.CLOUDINARY_CLOUD_NAME,
    uploadUrl: fixtures
      ? '/admin/api/multimedia/qa-upload'
      : 'https://api.cloudinary.com/v1_1/' + env.CLOUDINARY_CLOUD_NAME + '/auto/upload',
    rutaPublica,
    carpeta: carpeta(env),
    formatos: FORMATOS[tipo],
    maxBytes: LIMITES[tipo],
    vigenciaSegundos: VIGENCIA_SEGUNDOS
  };
}

/* Valida lo que el navegador declara del proveedor. Devuelve los metadatos
   listos para guardar; nunca toca disco ni confía en el cliente. */
export async function verificarRegistro(env, { tipo, timestamp, signature, resultado }) {
  if (!FORMATOS[tipo]) throw new Fault(400, 'Tipo de archivo no admitido.');
  if (!Number.isSafeInteger(timestamp) || typeof signature !== 'string') throw new Fault(400, 'Firma de subida inválida.');
  if (!resultado || typeof resultado !== 'object') throw new Fault(400, 'El proveedor no devolvió el resultado de la carga.');

  const resto = dentroDeCarpeta(env, resultado.public_id);
  if (!resto) throw new Fault(400, 'El archivo subido no está en la carpeta autorizada.');

  const fixtures = String(env.MODO_EMULADOR || '0') === '1';
  const esperada = await firma({ timestamp, ...parametrosFirmados(env, tipo, resto) },
    fixtures ? 'qa-local-worker' : env.CLOUDINARY_API_SECRET);
  if (!iguales(signature, esperada)) throw new Fault(403, 'La firma no corresponde a una subida autorizada por este servidor.');

  const edad = Math.floor(Date.now() / 1000) - timestamp;
  if (edad > VIGENCIA_SEGUNDOS) throw new Fault(403, 'La firma expiró: solicita una nueva antes de volver a subir.');
  if (edad < -60) throw new Fault(403, 'Marca de tiempo de la firma fuera de rango.');

  const format = String(resultado.format || '').toLowerCase();
  if (!FORMATOS[tipo].includes(format)) throw new Fault(400, 'El formato del archivo no está permitido para el tipo firmado.');
  if (resultado.resource_type !== tipo) throw new Fault(400, 'El tipo del archivo no coincide con la firma.');
  const bytes = resultado.bytes;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Fault(400, 'Tamaño del archivo inválido.');
  if (bytes > LIMITES[tipo]) throw new Fault(413, 'El archivo supera el límite permitido para su tipo.');

  const extension = format === 'jpeg' ? 'jpg' : format;
  const url = String(resultado.secure_url || '');
  const urlOk = fixtures
    ? url === '/admin/api/multimedia/qa-archivo/' + resto + '.' + extension
    : Boolean(env.CLOUDINARY_CLOUD_NAME) && url.startsWith('https://res.cloudinary.com/' + env.CLOUDINARY_CLOUD_NAME + '/');
  if (!urlOk) throw new Fault(400, 'La URL del archivo no corresponde al proveedor autorizado.');

  const asset = {
    tipo, provider: fixtures ? 'QA_DIRECT_FIXTURE' : 'CLOUDINARY',
    publicId: resultado.public_id, extension, url, bytes,
    procesamiento: 'LISTO', origen: 'SUBIDA_DIRECTA'
  };
  asset.optimizedUrl = fixtures || tipo === 'video' ? url : url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
  for (const [k, v] of [['width', resultado.width], ['height', resultado.height], ['duration', resultado.duration]]) {
    if (Number.isSafeInteger(v) && v > 0) asset[k] = v;
  }
  if (Number.isSafeInteger(resultado.version) && resultado.version > 0) asset.version = resultado.version;
  return asset;
}

/* ---------- adaptador QA (solo MODO_EMULADOR=1) ----------
   En Workers no hay sistema de ficheros, así que los bytes viven en memoria del
   isolate. Suficiente para certificar el recorrido completo en local; en
   producción el proveedor es Cloudinary. */
const archivosQA = new Map();

export const esEmulador = (env) => String(env.MODO_EMULADOR || '0') === '1';

export async function guardarQA(env, { filename, tipo, publicId, bytes, mimeType }) {
  /* El navegador envia solo el nombre (igual que a Cloudinary); aqui se compone
     la ruta con la carpeta autorizada antes de validar. */
  const nombre = String(publicId || '').replace(/^.*\//, '');
  const rutaPublica = carpeta(env) + '/' + nombre;
  const resto = dentroDeCarpeta(env, rutaPublica);
  if (!resto) throw new Fault(403, 'Identificador de archivo no autorizado.');
  const extension = String(filename || '').split('.').pop().toLowerCase();
  const ext = extension === 'jpeg' ? 'jpg' : extension;
  /* KZ-037 — El formulario que va al proveedor NO lleva el campo `tipo`: enviarlo
     alteraria los parámetros firmados de Cloudinary. Este adaptador local, que
     solo existe con MODO_EMULADOR=1, deduce el tipo de la extensión ya validada.
     Sin esto, cualquier video fallaba en local con «Extensión no permitida». */
  const tipoReal = FORMATOS[tipo]?.includes(extension) ? tipo
    : FORMATOS.video.includes(ext) ? 'video'
      : FORMATOS.image.includes(ext) ? 'image'
        : (FORMATOS[tipo] ? tipo : 'image');
  if (!FORMATOS[tipoReal].includes(extension)) throw new Fault(415, 'Extensión de archivo no permitida.');
  if (!bytes || bytes.byteLength === 0) throw new Fault(400, 'Archivo vacío.');
  if (bytes.byteLength > LIMITES[tipoReal]) throw new Fault(413, 'Archivo superior al límite permitido.');

  // Los primeros bytes del archivo, en hexadecimal (no un hash: son los bytes).
  const cabecera = [...bytes.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const compatible = (tipoReal === 'image')
    ? { png: '89504e470d0a1a0a', jpg: 'ffd8ff', webp: '52494646' }
    : { mp4: '66747970', webm: '1a45dfa3' };
  const esperado = compatible[ext];
  // MP4 lleva `ftyp` en el byte 4, no al principio.
  const real = ext === 'mp4' ? cabecera.slice(8) : cabecera;
  if (!esperado || !real.startsWith(esperado)) throw new Fault(415, 'El contenido del archivo no corresponde a su extensión (' + mimeType + ').');

  archivosQA.set(resto + '.' + ext, { bytes: new Uint8Array(bytes), mimeType });
  return {
    public_id: rutaPublica,
    version: Math.floor(Date.now() / 1000),
    format: ext,
    resource_type: tipoReal,
    bytes: bytes.byteLength,
    url: '/admin/api/multimedia/qa-archivo/' + resto + '.' + ext,
    secure_url: '/admin/api/multimedia/qa-archivo/' + resto + '.' + ext,
    original_filename: String(filename || 'archivo')
  };
}

export function archivoQA(nombre) {
  return archivosQA.get(String(nombre || '')) || null;
}

export async function eliminar(env, asset) {
  if (asset.provider === 'QA_DIRECT_FIXTURE') {
    for (const clave of [...archivosQA.keys()]) if (clave.startsWith(String(asset.publicId).split('/').pop() + '.')) archivosQA.delete(clave);
    return;
  }
  if (asset.provider !== 'CLOUDINARY') throw new Fault(409, 'Proveedor incompatible.');
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: asset.publicId, timestamp };
  const cuerpo = new URLSearchParams({
    ...params,
    api_key: env.CLOUDINARY_API_KEY,
    signature: await firma(params, env.CLOUDINARY_API_SECRET)
  });
  const r = await fetch('https://api.cloudinary.com/v1_1/' + env.CLOUDINARY_CLOUD_NAME + '/' +
    (asset.tipo === 'video' ? 'video' : 'image') + '/destroy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !['ok', 'not found'].includes(datos.result)) throw new Fault(502, 'Cloudinary no confirmó la eliminación del archivo.');
}
