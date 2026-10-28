// KZ-REDCALINET-025 — API administrativa de Red CaliNet en Cloudflare Workers.
//
// Es el puerto de `admin/server/index.mjs` + `admin/server/store.mjs` sobre
// Firestore REST, conservando los contratos: mismas rutas, mismos códigos, misma
// validación (se reutiliza `schema.mjs` tal cual), misma auditoría obligatoria.
//
// Garantías que se mantienen:
//   · el navegador nunca escribe en Firestore: la única puerta es este Worker
//   · toda escritura exige sesión válida, rol, `activo === true` y origen correcto
//   · cada escritura va en UN commit atómico con precondición de versión y con su
//     entrada de auditoría; la idempotencia se apoya en crear la auditoría con
//     `exists:false`, así un reintento no duplica nada
//
// Desviación declarada frente a la versión Node: la validación de relaciones
// (categoría visible, archivo existente) se hace antes del commit, no dentro de
// una transacción. El documento que se escribe sigue protegido por la
// precondición `updateTime`, así que una edición concurrente se rechaza igual.

import { actor, requireSuper, Fault } from './auth.mjs';
import { clienteFirestore, aCampos } from './firestore.mjs';
import { validate, defaults, id, CATALOG, PUBLIC_FIELDS, catalogType, activePromotion, text } from './schema.mjs';
import * as media from './multimedia.mjs';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff'
};
const json = (status, valor) => new Response(JSON.stringify(valor), { status, headers: JSON_HEADERS });

const CATALOGO = ['productos', 'servicios', 'categorias', 'promociones', 'multimedia'];
const fisica = (c) => (c === 'productos' ? 'servicios' : c);
const META = '_adminRegistros';

function mismoOrigen(request, env) {
  const origen = request.headers.get('Origin');
  const permitidos = new Set(
    [...String(env.RCL_PUBLIC_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean), new URL(request.url).origin]
  );
  if (!permitidos.size || !origen || !permitidos.has(origen)) throw new Fault(403, 'Origen no permitido.');
}

const cuerpo = async (request) => {
  const tipo = request.headers.get('content-type') || '';
  if (!tipo.startsWith('application/json')) throw new Fault(415, 'Se requiere JSON.');
  const texto = await request.text();
  if (texto.length > 100000) throw new Fault(413, 'Solicitud demasiado grande.');
  try { return JSON.parse(texto || '{}'); } catch { throw new Fault(400, 'JSON inválido.'); }
};

/* ---------- hidratación de fichas (público + metadatos privados) ---------- */

const metaRuta = (c, rid) => META + '/' + fisica(c) + '--' + rid;

async function hidratar(db, c, publico) {
  const extra = c === 'configuracion' ? {} : (await db.leerDoc(metaRuta(c, publico.id))) || {};
  const limpio = {};
  for (const [k, v] of Object.entries(extra)) if (!k.startsWith('_')) limpio[k] = v;
  return { ...defaults(c), ...(c === 'categorias' ? { tipo: catalogType({}, publico) } : {}), ...publico, ...limpio, id: publico.id };
}

/* ---------- validación de relaciones (antes del commit, ver cabecera) ---------- */

async function validarRelaciones(db, c, row) {
  const lecturas = [];
  if (row.categoriaId) lecturas.push('categorias/' + id(row.categoriaId));
  for (const campo of ['imagenes', 'videos']) for (const mid of row[campo] || []) lecturas.push('multimedia/' + id(mid));
  if (c === 'promociones') for (const campo of ['productos', 'servicios']) for (const rid of row[campo] || []) lecturas.push('servicios/' + id(rid));
  if (!lecturas.length) return {};
  const docs = await db.leer(lecturas);

  if (row.categoriaId) {
    const categoria = docs[id(row.categoriaId)];
    if (!categoria || (row.estado === 'PUBLICADO' && categoria.visible !== true)) {
      throw new Fault(400, 'Categoría inexistente o inactiva.');
    }
  }
  for (const [campo, tipo] of [['imagenes', 'image'], ['videos', 'video']]) {
    for (const mid of row[campo] || []) {
      const archivo = docs[id(mid)];
      if (!archivo || archivo.tipo !== tipo || archivo.estado === 'ARCHIVADO' || archivo.eliminado) {
        throw new Fault(400, 'Archivo inexistente, archivado o de tipo incorrecto.');
      }
      if (row.estado === 'PUBLICADO' &&
          (archivo.estado !== 'PUBLICADO' || archivo.procesamiento !== 'LISTO' || (tipo === 'image' && !archivo.alt))) {
        throw new Fault(400, 'Publica primero los archivos con texto alternativo y procesamiento completo.');
      }
    }
  }
  if (c === 'promociones') {
    for (const campo of ['productos', 'servicios']) {
      for (const rid of row[campo] || []) {
        const oferta = docs[id(rid)];
        if (!oferta || oferta.estado !== 'PUBLICADO') throw new Fault(400, 'La promoción solo puede asociarse a ofertas publicadas y validadas.');
      }
    }
  }
  return docs;
}

/* ---------- guardar (crear / editar) con auditoría en el mismo commit ---------- */

async function guardar(env, db, quien, { coleccion: c, rid, valores: entrada, revision, requestId }) {
  if (![...CATALOGO, 'configuracion'].includes(c)) throw new Fault(404, 'Módulo no editable.');
  if (c === 'multimedia' && !rid) throw new Fault(400, 'Usa la carga de archivos para crear multimedia.');
  if (c === 'configuracion' && !['empresa', 'contacto'].includes(rid)) throw new Fault(400, 'Usa configuracion/empresa o configuracion/contacto.');
  if (c === 'configuracion' && Object.keys(entrada || {}).some((k) => !PUBLIC_FIELDS[rid].includes(k))) {
    throw new Fault(400, 'Campos de configuración en documento incorrecto.');
  }
  if (!requestId) throw new Fault(400, 'Identificador de operación requerido.');

  const uid = rid ? id(rid) : crypto.randomUUID();
  const rutaPublica = fisica(c) + '/' + uid;
  const conMeta = [...CATALOGO].includes(c);
  const rutaMeta = conMeta ? metaRuta(c, uid) : null;
  const rutaAuditoria = 'auditoria/' + id(requestId);

  // Una sola llamada para saber el estado real (menos lecturas facturables).
  const estado = await db.leer([rutaPublica, ...(rutaMeta ? [rutaMeta] : []), rutaAuditoria]);

  const repetida = estado[id(requestId)];
  if (repetida) {
    if (repetida.actor !== quien.uid || repetida.coleccion !== c || (rid && repetida.registro !== uid)) {
      throw new Fault(409, 'Identificador de operación ya utilizado.');
    }
    return repetida.registro;
  }

  const existente = estado[uid] || null;
  const extra = rutaMeta ? (estado[rutaMeta.split('/')[1]] || null) : null;
  if (existente && ((extra && extra.revision) || existente.revision || 0) !== (revision ?? 0)) {
    throw new Fault(409, 'El registro cambió. Recarga antes de guardar.');
  }
  if (rid && !existente && !(c === 'configuracion' && ['empresa', 'contacto'].includes(rid))) {
    throw new Fault(404, 'Registro inexistente.');
  }

  const anterior = { ...(existente || {}), ...(extra || {}) };
  const row = validate(c, entrada, anterior);
  if (['productos', 'servicios'].includes(c) && !row.categoriaId) throw new Fault(400, 'Selecciona una categoría existente.');
  await validarRelaciones(db, c, row);
  if (c === 'multimedia' && row.estado === 'PUBLICADO' && (row.procesamiento !== 'LISTO' || (row.tipo === 'image' && !row.alt))) {
    throw new Fault(400, 'Completa el texto alternativo y espera el procesamiento.');
  }

  const ahora = new Date().toISOString();
  row.createdAt = anterior.createdAt || ahora;
  row.updatedAt = ahora;
  row.usuarioResponsable = quien.uid;
  row.revision = (anterior.revision || 0) + 1;

  const cambios = Object.keys(entrada).filter((k) => JSON.stringify(anterior[k]) !== JSON.stringify(row[k]));
  const accion = !existente ? 'CREAR'
    : anterior.precio !== row.precio ? 'MODIFICAR_PRECIO'
      : anterior.disponibilidad !== row.disponibilidad ? 'CAMBIAR_DISPONIBILIDAD'
        : anterior.estado !== row.estado ? (row.estado === 'PUBLICADO' ? 'PUBLICAR' : row.estado === 'OCULTO' ? 'OCULTAR' : row.estado === 'ARCHIVADO' ? 'ARCHIVAR' : 'CAMBIAR_ESTADO')
          : 'EDITAR';

  const escrituras = [];
  const clavesPublicas = ['productos', 'servicios'].includes(c) ? PUBLIC_FIELDS.catalogo
    : c === 'categorias' ? PUBLIC_FIELDS.categorias
      : c === 'configuracion' ? PUBLIC_FIELDS[uid]
        : null;

  if (clavesPublicas) {
    const publico = Object.fromEntries(clavesPublicas.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));
    const privado = Object.fromEntries(Object.entries(row).filter(([k]) => !clavesPublicas.includes(k)));
    escrituras.push(existente
      ? { actualizar: rutaPublica, datos: publico, mascara: Object.keys(publico), tiempo: existente._updateTime }
      : { crear: rutaPublica, datos: publico });
    escrituras.push(extra
      ? { actualizar: rutaMeta, datos: privado, tiempo: extra._updateTime }
      : { crear: rutaMeta, datos: privado });
  } else {
    escrituras.push(existente
      ? { actualizar: rutaPublica, datos: row, tiempo: existente._updateTime }
      : { crear: rutaPublica, datos: row });
  }

  escrituras.push({
    crear: rutaAuditoria,
    datos: {
      actor: quien.uid, rol: quien.rol, accion, coleccion: c, registro: uid, fecha: ahora, campos: cambios,
      ...(anterior.precio !== row.precio ? { precioAnterior: anterior.precio ?? null, precioNuevo: row.precio ?? null } : {})
    }
  });

  const resultado = await db.confirmar(escrituras);
  if (!resultado.ok) {
    const detalle = JSON.stringify(resultado.datos || {});
    if (resultado.status === 409 || /ALREADY_EXISTS|FAILED_PRECONDITION|aborted/i.test(detalle)) {
      throw new Fault(409, 'El registro cambió o la operación ya se aplicó. Recarga antes de guardar.');
    }
    const detalleCommit = JSON.stringify(resultado.datos || {}).slice(0, 300);
    throw new Fault(502, 'No se pudo guardar en Firestore.' + (media.esEmulador(env) ? ' [' + resultado.status + '] ' + detalleCommit : ''));
  }
  return uid;
}

/* ---------- listados ---------- */

async function listar(db, quien, c, cursor) {
  if (c === 'auditoria' || c === 'usuarios') requireSuper(quien);
  if (![...CATALOGO, 'configuracion', 'usuarios', 'auditoria'].includes(c)) throw new Fault(404, 'Colección no disponible.');

  if (c === 'auditoria') {
    // Paginación por desplazamiento: el `list` REST no admite orden descendente
    // por campo, y `runQuery` sí. El cursor es el número de entradas saltadas.
    const desde = Number(cursor) || 0;
    const filas = await db.consultar('auditoria', { orden: 'fecha', direccion: 'DESCENDING', limite: 101, saltar: desde });
    return { items: filas.slice(0, 100), next: filas.length > 100 ? String(desde + 100) : null };
  }

  const { items, siguiente } = await db.listar(fisica(c), { desde: cursor || '' });
  /* Los metadatos privados (`_adminRegistros`) llevan `revision`, el precio y las
     galerías. Sin hidratarlos el panel recibiría revisiones indefinidas y no
     podría editar: es el equivalente del `hydrate()` de la versión Node. */
  const conMeta = ['productos', 'servicios', 'categorias', 'promociones'].includes(c);
  let filas = conMeta
    ? await Promise.all(items.map((r) => hidratar(db, c, r)))
    : items.map((r) => ({ ...defaults(c), ...r }));

  if (['productos', 'servicios'].includes(c)) {
    const categorias = await db.listar('categorias', { limite: 100 });
    const porId = new Map(categorias.items.map((k) => [k.id, k]));
    const tipo = c === 'productos' ? 'producto' : 'servicio';
    filas = filas.filter((r) => catalogType(r, porId.get(r.categoriaId)) === tipo);
  }
  return { items: filas, next: siguiente };
}

/* ---------- panel ---------- */

async function tablero(db) {
  const categorias = await db.listar('categorias', { limite: 100 });
  const porId = new Map(categorias.items.map((k) => [k.id, k]));
  const filas = (await db.listar('servicios', { limite: 500 })).items;
  const productos = filas.filter((r) => catalogType(r, porId.get(r.categoriaId)) === 'producto');
  const promociones = (await db.listar('promociones', { limite: 100 })).items;
  const actividad = await db.consultar('auditoria', { limite: 8, orden: 'fecha', direccion: 'DESCENDING' });
  return {
    productos: productos.length,
    servicios: filas.length - productos.length,
    publicados: productos.filter((r) => r.estado === 'PUBLICADO').length,
    pendientes: productos.filter((r) => r.estado === 'BORRADOR').length,
    ocultos: productos.filter((r) => r.estado === 'OCULTO').length,
    promocionesActivas: promociones.filter((r) => activePromotion(r)).length,
    promocionesVencidas: promociones.filter((r) => Date.parse(r.fin) <= Date.now()).length,
    solicitudes: null,
    actividad: actividad.map((r) => ({ id: r.id, ...r }))
  };
}

async function catalogoPublico(db) {
  const categorias = await db.listar('categorias', { limite: 100 });
  const visibles = categorias.items.filter((c) => c.visible === true);
  const porId = new Map(visibles.map((c) => [c.id, c]));
  const salida = { categorias: visibles.map((c) => ({ ...c })), productos: [], servicios: [], promociones: [], multimedia: [] };

  const publicados = await db.consultar('servicios', { igualdades: { estado: 'PUBLICADO' }, limite: 500 });
  for (const fila of publicados) {
    const categoria = porId.get(fila.categoriaId);
    if (!categoria) continue;
    const coleccion = catalogType(fila, categoria) === 'producto' ? 'productos' : 'servicios';
    const extra = (await db.leerDoc(metaRuta(coleccion, fila.id))) || {};
    salida[coleccion].push({
      ...Object.fromEntries(PUBLIC_FIELDS.catalogo.filter((k) => fila[k] !== undefined).map((k) => [k, fila[k]])),
      id: fila.id,
      imagenes: extra.imagenes || [],
      videos: extra.videos || []
    });
  }
  for (const c of ['productos', 'servicios']) {
    salida[c].sort((a, b) => Number(!!b.destacado) - Number(!!a.destacado) || (a.orden || 0) - (b.orden || 0));
  }

  const ids = new Set([...salida.productos, ...salida.servicios].map((r) => r.id));
  const promociones = (await db.listar('promociones', { limite: 100 })).items;
  salida.promociones = promociones
    .filter((r) => activePromotion(r) && [...(r.productos || []), ...(r.servicios || [])].every((i) => ids.has(i)))
    .map((r) => Object.fromEntries(
      ['id', 'nombre', 'descripcion', 'productos', 'servicios', 'descuentoPorcentaje', 'inicio', 'fin', 'imagenes']
        .filter((k) => r[k] !== undefined).map((k) => [k, r[k]])
    ));

  const empresa = await db.leerDoc('configuracion/empresa');
  const contacto = await db.leerDoc('configuracion/contacto');
  salida.configuracion = { empresa: empresa || null, contacto: contacto || null };

  const idsMedia = new Set([...salida.productos, ...salida.servicios, ...salida.promociones]
    .flatMap((r) => [...(r.imagenes || []), ...(r.videos || [])]));
  if (idsMedia.size) {
    const archivos = await db.leer([...idsMedia].map((m) => 'multimedia/' + id(m)));
    for (const mid of idsMedia) {
      const m = archivos[id(mid)];
      if (m && m.estado === 'PUBLICADO' && m.procesamiento === 'LISTO' && !m.eliminado) {
        salida.multimedia.push({ id: mid, tipo: m.tipo, url: m.url, optimizedUrl: m.optimizedUrl, alt: m.alt, titulo: m.titulo });
      }
    }
  }
  return salida;
}

/* ---------- multimedia ---------- */

async function usoDeMedia(db, mid) {
  const usos = [];
  const registros = await db.consultar(`${META}`, {});
  for (const meta of registros) {
    if (!String(meta.id).startsWith('servicios--')) continue;
    const rid = String(meta.id).slice('servicios--'.length);
    for (const campo of ['imagenes', 'videos']) {
      if (Array.isArray(meta[campo]) && meta[campo].includes(id(mid))) {
        const ficha = await db.leerDoc('servicios/' + rid);
        usos.push({ coleccion: 'servicios', id: rid, nombre: ficha?.nombre || rid });
      }
    }
  }
  const archivo = await db.leerDoc('multimedia/' + id(mid));
  if (archivo?.url) {
    const portada = await db.consultar('servicios', { igualdades: { imagen: archivo.url } });
    for (const ficha of portada) if (!usos.some((u) => u.id === ficha.id)) {
      usos.push({ coleccion: 'servicios', id: ficha.id, nombre: ficha.nombre });
    }
  }
  return usos;
}

async function registrarMedia(env, db, quien, datos) {
  const asset = await media.verificarRegistro(env, {
    tipo: datos.tipo, timestamp: datos.timestamp, signature: datos.signature, resultado: datos.resultado
  });

  const repetido = await db.consultar('multimedia', { igualdades: { publicId: asset.publicId }, limite: 1 });
  if (repetido.length) throw new Fault(409, 'Ese archivo ya está registrado en la biblioteca.');

  if (typeof datos.sha256Cliente === 'string' && /^[a-f0-9]{64}$/.test(datos.sha256Cliente)) {
    asset.sha256 = datos.sha256Cliente;
    asset.sha256Origen = 'CLIENTE';
  }

  const mid = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const resultado = await db.confirmar([
    {
      crear: 'multimedia/' + mid,
      datos: {
        ...defaults('multimedia'), ...asset,
        titulo: text(datos.titulo || '', 200) || 'Archivo sin título',
        alt: text(datos.alt || '', 200),
        descripcion: text(datos.descripcion || '', 3000),
        createdAt: ahora, updatedAt: ahora, usuarioResponsable: quien.uid, revision: 1
      }
    },
    {
      crear: 'auditoria/' + crypto.randomUUID(),
      datos: {
        actor: quien.uid, rol: quien.rol, accion: 'SUBIR_MULTIMEDIA', coleccion: 'multimedia',
        registro: mid, fecha: ahora, campos: ['tipo', 'bytes', 'procesamiento'], via: 'SUBIDA_DIRECTA'
      }
    }
  ]);
  if (!resultado.ok) throw new Fault(502, 'No se registró el archivo.');
  return mid;
}

/* ---------- usuarios (permisos) ---------- */

async function guardarUsuario(db, quien, entrada) {
  requireSuper(quien);
  const uid = entrada.uid ? id(entrada.uid) : null;
  if (!uid) throw new Fault(503, 'El alta de una cuenta nueva requiere la Admin API de Identity Toolkit. Usa admin/scripts/alta-cuentas.mjs (tarea batch autorizada).');
  if (!['PROPIETARIO', 'SUPERADMIN'].includes(entrada.rol) || typeof entrada.activo !== 'boolean') {
    throw new Fault(400, 'Rol o estado inválido.');
  }
  if (quien.uid === uid && entrada.rol === 'SUPERADMIN') throw new Fault(400, 'No puedes asignarte SUPERADMIN.');

  const anterior = await db.leerDoc('usuarios/' + uid);
  if (!anterior) throw new Fault(404, 'Usuario no registrado.');
  if (entrada.revision !== anterior.revision) throw new Fault(409, 'El usuario cambió. Recarga antes de guardar.');

  if (anterior.rol === 'SUPERADMIN' && (entrada.rol !== 'SUPERADMIN' || !entrada.activo)) {
    const activos = await db.consultar('usuarios', { igualdades: { rol: 'SUPERADMIN', activo: true } });
    if (activos.length <= 1) throw new Fault(409, 'No puedes desactivar o degradar al último SUPERADMIN.');
  }

  const ahora = new Date().toISOString();
  const resultado = await db.confirmar([
    {
      actualizar: 'usuarios/' + uid,
      datos: {
        ...anterior,
        rol: entrada.rol,
        activo: entrada.activo,
        nombre: typeof entrada.nombre === 'string' ? entrada.nombre.slice(0, 100) : (anterior.nombre || ''),
        revision: (anterior.revision || 0) + 1,
        updatedAt: ahora
      },
      tiempo: anterior._updateTime
    },
    {
      crear: 'auditoria/' + crypto.randomUUID(),
      datos: {
        actor: quien.uid, rol: quien.rol, accion: 'CAMBIAR_PERMISOS', coleccion: 'usuarios', registro: uid,
        fecha: ahora, rolAnterior: anterior.rol, rolNuevo: entrada.rol, activo: entrada.activo
      }
    }
  ]);
  if (!resultado.ok) throw new Fault(409, 'El usuario cambió. Recarga antes de guardar.');
  return uid;
}

/* ---------- router ---------- */

async function api(request, env, url) {
  const db = clienteFirestore(env);
  const ruta = url.pathname.slice('/admin/api/'.length);
  const partes = ruta.split('/');
  const [recurso, rid, accion] = partes;

  if (recurso === 'bootstrap' && request.method === 'GET') {
    return json(200, {
      local: media.esEmulador(env),
      entorno: media.esEmulador(env) ? 'WORKER_EMULADOR' : 'WORKER_CLOUDFLARE',
      contractStatus: 'WORKER_ADMIN_025',
      media: {
        enabled: media.esEmulador(env) || Boolean(env.CLOUDINARY_API_SECRET),
        mode: media.esEmulador(env) ? 'QA_DIRECT_FIXTURE' : (env.CLOUDINARY_API_SECRET ? 'CLOUDINARY_DIRECT' : 'REAL_UPLOADS_DISABLED'),
        fixture: media.esEmulador(env),
        subidaDirecta: true,
        imageMax: media.LIMITES.image,
        videoMax: media.LIMITES.video,
        formatos: media.FORMATOS,
        maxBytes: media.LIMITES
      },
      firebase: { projectId: env.PROYECTO_FIREBASE, apiKey: env.FIREBASE_API_KEY, authDomain: env.PROYECTO_FIREBASE + '.firebaseapp.com' },
      authEmulator: media.esEmulador(env) ? 'http://127.0.0.1:9099' : null
    });
  }

  if (recurso === 'public' && rid === 'catalogo' && request.method === 'GET') {
    return json(200, await catalogoPublico(db));
  }

  // Archivo del adaptador QA: solo existe fuera de producción.
  if (recurso === 'multimedia' && rid === 'qa-archivo' && request.method === 'GET') {
    if (!media.esEmulador(env)) throw new Fault(404, 'Recurso no disponible.');
    const archivo = media.archivoQA(accion);
    if (!archivo) throw new Fault(404, 'Archivo inexistente.');
    return new Response(archivo.bytes, {
      headers: { 'Content-Type': archivo.mimeType || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  if (recurso === 'multimedia' && rid === 'qa-upload' && request.method === 'POST') {
    if (!media.esEmulador(env)) throw new Fault(404, 'Recurso no disponible.');
    const form = await request.formData();
    const archivo = form.get('file');
    if (!archivo || typeof archivo === 'string') throw new Fault(400, 'Selecciona un solo archivo.');
    return json(200, await media.guardarQA(env, {
      filename: archivo.name,
      tipo: String(form.get('tipo') || 'image'),
      publicId: String(form.get('public_id') || ''),
      bytes: new Uint8Array(await archivo.arrayBuffer()),
      mimeType: archivo.type
    }));
  }

  const quien = await actor(env, db, request.headers.get('authorization'));
  if (request.method !== 'GET') mismoOrigen(request, env);

  if (recurso === 'me' && request.method === 'GET') return json(200, { user: quien, mode: media.esEmulador(env) ? 'WORKER_EMULADOR' : 'WORKER_CLOUDFLARE' });
  if (recurso === 'dashboard' && request.method === 'GET') return json(200, await tablero(db));
  if (recurso === 'solicitudes') throw new Fault(503, 'No existe un canal de captura o contrato de solicitudes verificado.');

  if (recurso === 'multimedia' && rid === 'firma' && request.method === 'POST') {
    const b = await cuerpo(request);
    return json(200, await media.emitirFirma(env, b.tipo));
  }
  if (recurso === 'multimedia' && rid === 'registrar' && request.method === 'POST') {
    const b = await cuerpo(request);
    return json(200, { id: await registrarMedia(env, db, quien, b) });
  }
  if (recurso === 'multimedia' && accion === 'uso' && request.method === 'GET') return json(200, { items: await usoDeMedia(db, rid) });
  if (recurso === 'multimedia' && rid && request.method === 'DELETE') {
    requireSuper(quien);
    const b = await cuerpo(request);
    if (b.confirm !== 'ELIMINAR ARCHIVO') throw new Fault(400, 'Confirmación requerida.');
    const archivo = await db.leerDoc('multimedia/' + id(rid));
    if (!archivo) throw new Fault(404, 'Archivo inexistente.');
    if (archivo.eliminado) throw new Fault(409, 'El archivo ya fue eliminado.');
    if ((await usoDeMedia(db, rid)).length) throw new Fault(409, 'El archivo está en uso. Retíralo antes de eliminarlo.');
    await media.eliminar(env, archivo);
    const ahora = new Date().toISOString();
    const resultado = await db.confirmar([
      {
        actualizar: 'multimedia/' + id(rid),
        datos: { ...archivo, estado: 'ARCHIVADO', eliminado: true, eliminacionPendiente: false, revision: (archivo.revision || 0) + 1, updatedAt: ahora },
        tiempo: archivo._updateTime
      },
      {
        crear: 'auditoria/' + crypto.randomUUID(),
        datos: { actor: quien.uid, rol: quien.rol, accion: 'ELIMINAR_MULTIMEDIA', coleccion: 'multimedia', registro: id(rid), fecha: ahora, campos: [] }
      }
    ]);
    if (!resultado.ok) throw new Fault(409, 'El archivo cambió. Recarga antes de eliminar.');
    return json(200, { ok: true });
  }

  if (recurso === 'usuarios' && request.method === 'POST') {
    const b = await cuerpo(request);
    return json(200, { id: await guardarUsuario(db, quien, b) });
  }

  if (request.method === 'GET' && !rid) {
    return json(200, await listar(db, quien, recurso, url.searchParams.get('cursor') || ''));
  }

  if (['POST', 'PATCH'].includes(request.method)) {
    const b = await cuerpo(request);
    const requestId = request.headers.get('idempotency-key');
    return json(200, { id: await guardar(env, db, quien, { coleccion: recurso, rid, valores: b.values, revision: b.revision, requestId }) });
  }

  throw new Fault(404, 'Operación no disponible.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith('/admin/api/')) {
        // Todo lo que no es API lo sirve el binding de estáticos (panel).
        if (env.ASSETS) return env.ASSETS.fetch(request);
        return new Response('No disponible.', { status: 404 });
      }
      return await api(request, env, url);
    } catch (e) {
      if (e instanceof Fault) return json(e.status, { error: e.message });
      // En local se devuelve el detalle para poder depurar; en producción no.
      const detalle = media.esEmulador(env) ? ' [' + (e && e.message ? e.message : String(e)) + ']' : '';
      return json(500, { error: 'La operación no pudo completarse. Los datos no se muestran como cero.' + detalle });
    }
  }
};
