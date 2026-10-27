'use strict';
/* ============================================================
 * Certificación de reglas + integración del catálogo
 * contra el EMULADOR de Firestore (nunca contra producción).
 * ------------------------------------------------------------
 * Responde a la verificación comercial de KZ-REDCALINET-005:
 *   - ¿el público solo puede leer lo PUBLICADO?
 *   - ¿un pendiente (BORRADOR) o un OCULTO se filtran?
 *   - ¿la consulta real de la landing devuelve solo publicado?
 *   - ¿el mapeo a catálogo no publica precios inventados?
 *
 * No usa el emulador de Auth (firebase-tools lo necesita y aquí no puede
 * lanzar Java). Por eso los permisos por rol se verifican con lecturas
 * anónimas —que es justo lo que ve el visitante— y la siembra se hace con
 * `Bearer owner`, el bypass de administrador del emulador.
 *
 * Requisitos: emulador de Firestore escuchando en 127.0.0.1:8080 (o el puerto
 * que indique KZ_FIRESTORE) con firestore.rules cargado:
 *   java -jar cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8080 \
 *     --rules <ruta absoluta a firestore.rules> --project_id red-calinet
 *
 * Ejecutar: node tools/test-reglas-publico.js
 *           KZ_FIRESTORE=http://127.0.0.1:8090 node tools/test-reglas-publico.js
 * ============================================================ */

const path = require('path');
const C = require(path.join(__dirname, '..', 'script.js'));

const FS = (process.env.KZ_FIRESTORE || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const P = 'red-calinet';
const BASE = `${FS}/v1/projects/${P}/databases/(default)/documents`;
const u = (r) => `${BASE}/${r}`;

let ok = 0, fail = 0;
const chk = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  PASA   ' + nombre.padEnd(58) + (detalle === undefined ? '' : detalle)); }
  else { fail++; console.log('  **FALLA** ' + nombre.padEnd(56) + (detalle === undefined ? '' : detalle)); }
};

/* --- ayudantes REST de Firestore --- */
const s = (v) => ({ stringValue: v });
const b = (v) => ({ booleanValue: v });
const n = (v) => ({ integerValue: String(v) });
const nulo = () => ({ nullValue: null });
const lista = (v) => ({ arrayValue: { values: v } });

async function pedir(metodo, url, cuerpo, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* respuesta vacía */ }
  return { estado: r.status, json, texto };
}

const crear = async (col, id, campos) =>
  pedir('POST', `${u(col)}?documentId=${id}`, { fields: campos }, 'owner');

const leer = async (ruta, token) => pedir('GET', u(ruta), undefined, token);

/* consulta estructurada: la misma forma que usa el sitio */
const consultar = async (coleccion, campo, valor, token) =>
  pedir('POST', `${FS}/v1/projects/${P}/databases/(default)/documents:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: coleccion }],
      where: {
        fieldFilter: {
          field: { fieldPath: campo },
          op: 'EQUAL',
          value: s(valor)
        }
      }
    }
  }, token);

/* Firestore REST → objeto plano de JS (para mapearCatalogo) */
function desenvolver(valor) {
  if (!valor || typeof valor !== 'object') return null;
  if ('stringValue' in valor) return valor.stringValue;
  if ('booleanValue' in valor) return valor.booleanValue;
  if ('integerValue' in valor) return Number(valor.integerValue);
  if ('doubleValue' in valor) return Number(valor.doubleValue);
  if ('nullValue' in valor) return null;
  if ('arrayValue' in valor) return (valor.arrayValue.values || []).map(desenvolver);
  if ('mapValue' in valor) {
    const salida = {};
    const campos = valor.mapValue.fields || {};
    Object.keys(campos).forEach((k) => { salida[k] = desenvolver(campos[k]); });
    return salida;
  }
  return null;
}

function documentoAPlano(doc) {
  const campos = (doc && doc.fields) || {};
  const plano = {};
  Object.keys(campos).forEach((k) => { plano[k] = desenvolver(campos[k]); });
  const id = String((doc && doc.name) || '').split('/').pop();
  plano.id = id;
  return plano;
}

(async () => {
  /* ---------- 0. ¿Hay emulador? ---------- */
  try {
    const ping = await fetch(`${FS}/`);
    if (!ping.ok) throw new Error('HTTP ' + ping.status);
  } catch (e) {
    console.error('ERROR: no hay emulador de Firestore en ' + FS + ' (' + e.message + ')');
    console.error('  Arranca: java -jar cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8080 \\');
    console.error('           --rules firestore.rules --project_id red-calinet');
    process.exit(2);
  }

  /* ---------- 1. Limpiar y sembrar ---------- */
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });

  console.log('== Siembra (bypass de administrador del emulador) ==');

  const empresa = await crear('configuracion', 'empresa', {
    nombre: s('Red CaliNet'), eslogan: s('Tu conexión con servicios y soluciones digitales'),
    ciudad: s('Bello, Antioquia, Colombia')
  });
  chk('siembra configuracion/empresa', empresa.estado === 200, 'HTTP ' + empresa.estado);

  await crear('configuracion', 'contacto', {
    whatsapp: s('573014585658'), telefono: s('573014585658'),
    correo: s('redcalinetmono@gmail.com'),
    facebook: s('https://www.facebook.com/share/1DfEomgbbL/?mibextid=wwXIfr'),
    instagram: s('https://www.instagram.com/red_calinet'),
    tiktok: s(''), horarios: lista([])
  });

  await crear('categorias', 'cat-tecnologia', {
    nombre: s('Tecnología'), icono: s('i-tech'), descripcion: s('Equipos'),
    nota: s('Existencias por confirmar'), orden: n(0), visible: b(true)
  });
  await crear('categorias', 'cat-streaming', {
    nombre: s('Streaming'), icono: s('i-streaming'), descripcion: s('Planes'),
    nota: s('Confirmar autorización'), orden: n(1), visible: b(true)
  });
  await crear('categorias', 'cat-oculta', {
    nombre: s('Retirada'), icono: s('i-check'), descripcion: s('Ya no se ofrece'),
    nota: s(''), orden: n(2), visible: b(false)
  });

  const servicio = (campos) => Object.assign({
    descripcion: s('Descripción'), precio: nulo(), detalles: lista([s('Garantía')]),
    imagen: nulo(), orden: n(0)
  }, campos);

  await crear('servicios', 'svc-publicado', servicio({
    categoriaId: s('cat-tecnologia'), nombre: s('iPhone 15'), estado: s('PUBLICADO')
  }));
  await crear('servicios', 'svc-borrador', servicio({
    categoriaId: s('cat-tecnologia'), nombre: s('Secreto Borrador'), estado: s('BORRADOR')
  }));
  await crear('servicios', 'svc-oculto', servicio({
    categoriaId: s('cat-tecnologia'), nombre: s('Secreto Oculto'), estado: s('OCULTO')
  }));
  await crear('servicios', 'svc-en-cat-oculta', servicio({
    categoriaId: s('cat-oculta'), nombre: s('De categoría retirada'), estado: s('PUBLICADO')
  }));
  await crear('servicios', 'svc-publicado-2', servicio({
    categoriaId: s('cat-streaming'), nombre: s('Plan Streaming'), estado: s('PUBLICADO'),
    precio: n(25000), orden: n(1)
  }));

  /* ---------- 2. Lo que ve el visitante (sin autenticación) ---------- */
  console.log('\n== Reglas: lectura pública (sin token) ==');

  chk('anónimo lee un servicio PUBLICADO', (await leer('servicios/svc-publicado')).estado === 200);
  chk('anónimo NO lee un BORRADOR (pendiente de validación)',
    (await leer('servicios/svc-borrador')).estado === 403,
    'HTTP ' + (await leer('servicios/svc-borrador')).estado);
  chk('anónimo NO lee un servicio OCULTO',
    (await leer('servicios/svc-oculto')).estado === 403,
    'HTTP ' + (await leer('servicios/svc-oculto')).estado);
  chk('anónimo lee configuracion/empresa', (await leer('configuracion/empresa')).estado === 200);
  chk('anónimo lee categorias', (await leer('categorias/cat-tecnologia')).estado === 200);
  chk('anónimo NO lee usuarios (roles)', (await leer('usuarios/cualquiera')).estado === 403);

  console.log('\n== Reglas: escritura pública ==');
  chk('anónimo NO crea servicios',
    (await pedir('POST', `${u('servicios')}?documentId=hack`, { fields: { nombre: s('x'), estado: s('PUBLICADO') } })).estado === 403);
  chk('anónimo NO modifica configuracion',
    (await pedir('PATCH', `${u('configuracion/empresa')}`, { fields: { nombre: s('cambiado') } })).estado === 403);

  /* ---------- 3. La consulta real de la landing ---------- */
  console.log('\n== La consulta exacta del catálogo (where estado == PUBLICADO) ==');

  const q = await consultar('servicios', 'estado', 'PUBLICADO');
  chk('la consulta del catálogo se ejecuta sin token', q.estado === 200, 'HTTP ' + q.estado);

  const filas = Array.isArray(q.json) ? q.json.filter((f) => f.document) : [];
  const docs = filas.map((f) => documentoAPlano(f.document));
  const nombres = docs.map((d) => d.nombre);
  chk('devuelve los servicios publicados', docs.length === 3, docs.length + ' documentos');
  chk('NO devuelve borradores', nombres.indexOf('Secreto Borrador') === -1, nombres.join(', '));
  chk('NO devuelve ocultos', nombres.indexOf('Secreto Oculto') === -1);
  chk('todos los devueltos están PUBLICADO', docs.every((d) => d.estado === 'PUBLICADO'));

  const qMaliciosa = await consultar('servicios', 'estado', 'BORRADOR');
  const filasMaliciosas = Array.isArray(qMaliciosa.json) ? qMaliciosa.json.filter((f) => f.document) : [];
  chk('pedir borradores a propósito NO funciona',
    qMaliciosa.estado === 403 || filasMaliciosas.length === 0,
    'HTTP ' + qMaliciosa.estado + ' · ' + filasMaliciosas.length + ' docs');

  const listaSinFiltro = await leer('servicios');
  chk('listar la colección entera sin filtro queda bloqueado',
    listaSinFiltro.estado === 403, 'HTTP ' + listaSinFiltro.estado);

  /* ---------- 4. Del emulador al catálogo ---------- */
  console.log('\n== Integración: emulador → catálogo que ve el cliente ==');

  const cats = await leer('categorias');
  const categoriasDocs = ((cats.json && cats.json.documents) || []).map(documentoAPlano);
  chk('el sitio puede listar categorías', categoriasDocs.length === 3, categoriasDocs.length);

  const empresaDoc = documentoAPlano((await leer('configuracion/empresa')).json);
  const contactoDoc = documentoAPlano((await leer('configuracion/contacto')).json);

  const negocio = C.negocioDesdeFirestore(empresaDoc, contactoDoc, categoriasDocs, docs);
  const catalogo = C.mapearCatalogo(negocio);
  const planos = [];
  catalogo.categorias.forEach((c) => c.productos.forEach((p) => planos.push(p)));
  const nombresCatalogo = planos.map((p) => p.nombre);

  chk('el catálogo descarta la categoría con visible:false',
    catalogo.categorias.every((c) => c.id !== 'cat-oculta'),
    catalogo.categorias.map((c) => c.id).join(', '));
  chk('el catálogo publica solo lo publicado',
    nombresCatalogo.length === 2 &&
    nombresCatalogo.indexOf('iPhone 15') !== -1 &&
    nombresCatalogo.indexOf('Plan Streaming') !== -1 &&
    nombresCatalogo.indexOf('Secreto Borrador') === -1 &&
    nombresCatalogo.indexOf('Secreto Oculto') === -1, nombresCatalogo.join(', '));
  chk('el producto de categoría retirada no se ofrece', nombresCatalogo.indexOf('De categoría retirada') === -1);
  chk('la marca llega desde configuracion/empresa',
    catalogo.marca.nombre === 'Red CaliNet' && catalogo.marca.ciudad.indexOf('Bello') === 0,
    catalogo.marca.nombre + ' · ' + catalogo.marca.ciudad);
  chk('el WhatsApp sale de configuracion/contacto',
    catalogo.contacto.whatsapp === '573014585658', catalogo.contacto.whatsapp);
  chk('Facebook sale de configuracion/contacto',
    (catalogo.redes.find((r) => r.id === 'facebook') || {}).url === 'https://www.facebook.com/share/1DfEomgbbL/?mibextid=wwXIfr');

  const precios = planos.map((p) => p.precioTexto).filter((t) => t !== null);
  chk('solo se muestra precio cuando el panel lo tiene',
    precios.length === 1 && precios[0] === '$ 25.000', precios.join(', ') || 'ninguno');
  chk('los productos sin precio quedan en "consultar"',
    planos.filter((p) => p.precioTexto === null).length === 1,
    planos.filter((p) => p.precioTexto === null).map((p) => p.nombre).join(', '));
  chk('ningún precio es inventado por el sitio',
    planos.every((p) => p.precio === null || p.precio === 25000));

  /* ---------- 5. Resumen ---------- */
  console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('ERROR ' + (e && e.message ? e.message : e));
  process.exit(2);
});
