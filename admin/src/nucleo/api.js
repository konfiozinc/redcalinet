// KZ-REDCALINET-037 — Puerta única al Worker.
//
// Mismas rutas, mismos códigos y las mismas guardas que el archivo único anterior:
// token de la sesión, generación de sesión para descartar respuestas tardías y
// `Idempotency-Key` en toda escritura. El navegador nunca escribe en Firestore.

import { estado, clearPrivateState } from './estado.js';
import { pintar, pintarLogin } from './pintar.js';

export async function request(path, options = {}) {
  const generacion = estado.sesion;
  const token = estado.user ? await estado.user.getIdToken() : null;
  const r = await fetch('/admin/api/' + path, {
    ...options,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}),
      ...options.headers
    }
  });
  const d = await r.json();
  if (!r.ok) {
    if ([401, 403].includes(r.status) && estado.actor && generacion === estado.sesion) {
      clearPrivateState();
      estado.error = 'Tu sesión expiró. Inicia sesión de nuevo.';
      pintarLogin();
    }
    throw Error(d.error || 'No se pudo completar la operación.');
  }
  return d;
}

/* KZ-REDCALINET-023 — Subida directa firmada. El archivo va del navegador al
   proveedor con la firma que emitió el servidor; la API nunca recibe los bytes
   ni devuelve credenciales. */
let uploadXHR = null;

export async function huellaSha256(file) {
  try {
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

export function subidaDirecta(firma, file, generacion) {
  const progreso = (value) => {
    if (generacion !== estado.sesion) return;
    const barra = document.querySelector('#upload-progress');
    const estadoTexto = document.querySelector('#upload-status');
    if (barra) barra.style.width = value + '%';
    if (estadoTexto) estadoTexto.textContent = value === 100 ? 'Archivo cargado. Registrando metadatos…' : 'Subiendo ' + value + '%';
  };
  const payload = new FormData();
  payload.append('file', file);
  payload.append('api_key', firma.apiKey);
  payload.append('timestamp', String(firma.timestamp));
  payload.append('signature', firma.signature);
  payload.append('folder', firma.carpeta);
  payload.append('public_id', firma.publicId);
  payload.append('allowed_formats', firma.formatos.join(','));
  return new Promise((resolve, reject) => {
    const xhr = uploadXHR = new XMLHttpRequest();
    xhr.open('POST', firma.uploadUrl);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) progreso(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = async () => {
      let d;
      try { d = JSON.parse(xhr.responseText); } catch { return reject(Error('Respuesta inválida del proveedor.')); }
      if (xhr.status !== 200) return reject(Error(d.error || 'El proveedor rechazó la carga.'));
      progreso(100);
      resolve({ resultado: d, sha256: await huellaSha256(file) });
    };
    xhr.onerror = () => reject(Error('La conexión falló. Revisa la biblioteca antes de reintentar.'));
    xhr.onabort = () => reject(Error('Carga interrumpida. Revisa la biblioteca.'));
    xhr.send(payload);
  });
}

export async function loadKind(c, more = false) {
  const generacion = estado.sesion;
  const r = await request(c + (more && estado.cursors[c] ? '?cursor=' + encodeURIComponent(estado.cursors[c]) : ''));
  if (generacion !== estado.sesion || !estado.actor) return;
  estado.data[c] = more ? [...(estado.data[c] || []), ...r.items] : r.items;
  estado.cursors[c] = r.next;
}

export async function refresh() {
  const generacion = estado.sesion;
  estado.loading = true;
  estado.error = '';
  pintar();
  try {
    const targets = ['productos', 'servicios', 'categorias', 'promociones', 'multimedia', 'configuracion'];
    await Promise.all(targets.map((c) => loadKind(c)));
    const next = await request('dashboard');
    if (generacion !== estado.sesion || !estado.actor) return;
    estado.dashboard = next;
    if (estado.actor.rol === 'SUPERADMIN' && ['usuarios', 'auditoria'].includes(estado.view)) await loadKind(estado.view);
  } catch (e) {
    if (generacion === estado.sesion) estado.error = e.message;
  } finally {
    if (generacion === estado.sesion) {
      estado.loading = false;
      pintar();
    }
  }
}
