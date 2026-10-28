// KZ-REDCALINET-025 — Capa de datos sobre Firestore REST.
//
// Sustituye al Admin SDK de Node (que no corre en Workers) manteniendo los
// MISMOS contratos: lectura de documentos, listados paginados, consultas y, sobre
// todo, escrituras ATÓMICAS en un solo commit con precondiciones.
//
// Dos credenciales posibles:
//   · emulador  → Authorization: Bearer owner (credencial administrativa del
//                 emulador de Firestore). Sin OAuth, sin cuentas de servicio.
//   · producción → JWT RS256 de la cuenta de servicio firmado con WebCrypto,
//                 canjeado por access_token y cacheado para no firmar en cada
//                 petición (el plan gratuito da 10 ms de CPU por petición).

const ESQUEMA = 'https://firestore.googleapis.com/v1';
const OAUTH = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

/* ---------- conversión entre JavaScript y el formato de Firestore REST ---------- */

const aValor = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  if (typeof v === 'object') return { mapValue: { fields: aCampos(v) } };
  throw new Error('Tipo no admitido por Firestore REST: ' + typeof v);
};

export const aCampos = (objeto) =>
  Object.fromEntries(
    Object.entries(objeto)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, aValor(v)])
  );

const aJS = (v) => {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(aJS);
  if ('mapValue' in v) return deDoc(v.mapValue);
  return null;
};

export const deDoc = (documento) => {
  const campos = (documento && documento.fields) || {};
  return Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, aJS(v)]));
};

/* `projects/p/databases/(default)/documents/servicios/abc` → `abc` */
export const idDeNombre = (nombre) => String(nombre || '').split('/documents/').pop().split('/').pop();

/* ---------- credenciales ---------- */

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const PEM_A_DER = (pem) => {
  const limpio = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
};

/* Caché del token en el propio isolate: la firma RS256 y el canje OAuth cuestan
   CPU y red, así que se hace una vez por hora y no en cada petición. */
let cacheToken = { valor: null, caduca: 0 };

async function tokenDeServicio(cuenta) {
  const ahora = Math.floor(Date.now() / 1000);
  if (cacheToken.valor && cacheToken.caduca > ahora + 60) return cacheToken.valor;

  const cabecera = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const cuerpo = b64url(new TextEncoder().encode(JSON.stringify({
    iss: cuenta.client_email,
    scope: SCOPE,
    aud: OAUTH,
    iat: ahora,
    exp: ahora + 3600
  })));
  const sinFirma = cabecera + '.' + cuerpo;

  const clave = await crypto.subtle.importKey(
    'pkcs8', PEM_A_DER(cuenta.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(sinFirma));

  const respuesta = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: sinFirma + '.' + b64url(firma)
    })
  });
  if (!respuesta.ok) throw new Error('No se pudo obtener el token de la cuenta de servicio (' + respuesta.status + ').');
  const datos = await respuesta.json();
  cacheToken = { valor: datos.access_token, caduca: ahora + 3600 };
  return cacheToken.valor;
}

/* ---------- cliente ---------- */

export function clienteFirestore(env) {
  const emulador = String(env.MODO_EMULADOR || '0') === '1';
  const proyecto = env.PROYECTO_FIREBASE;
  const raiz = emulador
    ? 'http://127.0.0.1:8080/v1'
    : ESQUEMA;
  const base = raiz + '/projects/' + encodeURIComponent(proyecto) + '/databases/(default)/documents';

  const autorizacion = async () => {
    if (emulador) return 'Bearer owner';
    const cuenta = JSON.parse(env.FIREBASE_SA || '{}');
    if (!cuenta.client_email || !cuenta.private_key) throw new Error('Falta el secreto FIREBASE_SA.');
    return 'Bearer ' + (await tokenDeServicio(cuenta));
  };

  const pedir = async (url, opciones = {}) => {
    const cabeceras = { Authorization: await autorizacion(), ...(opciones.headers || {}) };
    const r = await fetch(url, { ...opciones, headers: cabeceras });
    const texto = await r.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
    return { ok: r.ok, status: r.status, datos };
  };

  const nombre = (ruta) => base + '/' + ruta;
  /* Ruta del RECURSO (sin host ni /v1): es lo que exige el campo 
ame de cada
     escritura del commit. Usar la URL completa da INVALID_ARGUMENT. */
  const recurso = (ruta) => 'projects/' + proyecto + '/databases/(default)/documents/' + ruta;

  /* Lectura de varios documentos. El `:batchGet` del emulador no acepta el
     cuerpo JSON como espera el transcoding REST, así que se leen en paralelo
     con deduplicación: mismo número de lecturas facturables y menos sorpresas. */
  const leer = async (rutas) => {
    const lista = [...new Set(rutas)];
    const pares = await Promise.all(lista.map(async (ruta) => [idDeNombre(ruta), await leerDoc(ruta)]));
    return Object.fromEntries(pares);
  };

  const leerDoc = async (ruta) => {
    const r = await pedir(nombre(ruta));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Lectura falló (' + r.status + ').');
    return { ...deDoc(r.datos), _updateTime: r.datos.updateTime };
  };

  const listar = async (coleccion, { limite = 100, desde = '', orden = '' } = {}) => {
    const parametros = new URLSearchParams({ pageSize: String(limite) });
    if (desde) parametros.set('pageToken', desde);
    if (orden) parametros.set('orderBy', orden);
    const r = await pedir(nombre(coleccion) + '?' + parametros.toString());
    if (r.status === 404) return { items: [], siguiente: null };
    if (!r.ok) throw new Error('Listado falló (' + r.status + ').');
    const items = (r.datos.documents || []).map((d) => ({ id: idDeNombre(d.name), ...deDoc(d) }));
    return { items, siguiente: r.datos.nextPageToken || null };
  };

  /* Consulta estructurada: filtros de igualdad y orden. */
  const consultar = async (coleccion, { igualdades = {}, orden = null, direccion = 'ASCENDING', limite = 100, saltar = 0 } = {}) => {
    const filtros = Object.entries(igualdades).map(([campo, valor]) => ({
      fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: aValor(valor) }
    }));
    const consulta = {
      from: [{ collectionId: coleccion }],
      limit: limite
    };
    if (saltar > 0) consulta.offset = saltar;
    if (filtros.length === 1) consulta.where = filtros[0];
    else if (filtros.length > 1) consulta.where = { compositeFilter: { op: 'AND', filters: filtros } };
    if (orden) consulta.orderBy = [{ field: { fieldPath: orden }, direction: direccion }];
    const r = await pedir(base + ':runQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: consulta })
    });
    if (!r.ok) throw new Error('Consulta falló (' + r.status + ').');
    return (r.datos || [])
      .filter((x) => x.document)
      .map((x) => ({ id: idDeNombre(x.document.name), ...deDoc(x.document) }));
  };

  /* ---------- escrituras atómicas ---------- */

  /* Cada escritura es una de:
       { crear: 'col/id', datos }
       { actualizar: 'col/id', datos, mascara?, tiempo? }   (tiempo = updateTime leído)
       { borrar: 'col/id' }
     Todo el lote se confirma en UN commit: o entra completo o no entra nada.
     `currentDocument` da la precondición: create exige que no exista, update
     exige el updateTime exacto que se leyó (control optimista real). */
  const escrituraREST = (w) => {
    if (w.crear) return { update: { name: recurso(w.crear), fields: aCampos(w.datos) }, currentDocument: { exists: false } };
    if (w.borrar) return { delete: recurso(w.borrar) };
    const update = { name: recurso(w.actualizar), fields: aCampos(w.datos) };
    const msg = { update };
    if (w.mascara) msg.updateMask = { fieldPaths: w.mascara };
    if (w.tiempo) msg.currentDocument = { updateTime: w.tiempo };
    return msg;
  };

  const confirmar = async (escrituras) => {
    if (!escrituras.length) return { ok: true, status: 200, datos: {} };
    const r = await pedir(base + ':commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: escrituras.map(escrituraREST) })
    });
    return r;
  };

  return { emulador, proyecto, leer, leerDoc, listar, consultar, confirmar, nombre, recurso, base };
}
