'use strict';
/* Certificación de reglas Firestore de Red CaliNet (emulador).
   Verifica: lectura pública solo de PUBLICADO, escritura anónima denegada,
   escritura autorizada por rol y aislamiento de permisos (usuarios solo SUPERADMIN). */
const FS = 'http://127.0.0.1:8080', AUTH = 'http://127.0.0.1:9199', P = 'red-calinet', K = 'AIzaSyAJ4mWGO1gdXtnsJQDveY0l6icBM_uFlSk';
const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v }), b = (v) => ({ booleanValue: v }), n = (v) => ({ integerValue: String(v) });
const pedir = async (m, url, c, t) => {
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = 'Bearer ' + t;
  const r = await fetch(url, { method: m, headers: h, body: c === undefined ? undefined : JSON.stringify(c) });
  return r.status;
};
const crear = (c, id, f, t = 'owner') => pedir('POST', `${u(c)}?documentId=${id}`, { fields: f }, t);
const alta = async (e) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: 'Prueba#123', returnSecureToken: true }) });
  const j = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: 'Prueba#123', returnSecureToken: true }) })).json();
  return { uid: j.localId, tok: j.idToken };
};

let ok = 0, fail = 0;
const chk = (nm, c, d) => { if (c) { ok++; console.log('  PASA   ' + nm.padEnd(50) + (d || '')); } else { fail++; console.log('  **FALLA** ' + nm.padEnd(48) + (d || '')); } };

(async () => {
  // limpiar
  await fetch(FS + '/emulator/v1/projects/' + P + '/databases/(default)/documents', { method: 'DELETE' });
  const sa = await alta('sa@rc.test'), pr = await alta('pr@rc.test');

  // seed (owner): usuarios, configuracion, categoria, servicios
  await crear('usuarios', sa.uid, { rol: s('SUPERADMIN'), activo: b(true) });
  await crear('usuarios', pr.uid, { rol: s('PROPIETARIO'), activo: b(true) });
  await crear('configuracion', 'empresa', { nombre: s('Red CaliNet') });
  await crear('categorias', 'cat-streaming', { nombre: s('Streaming'), visible: b(true), orden: n(0) });
  await crear('servicios', 'svc-pub', { estado: s('PUBLICADO'), categoriaId: s('cat-streaming'), nombre: s('Publicado'), orden: n(0) });
  await crear('servicios', 'svc-borrador', { estado: s('BORRADOR'), categoriaId: s('cat-streaming'), nombre: s('Borrador'), orden: n(1) });

  // 1) Lectura pública de PUBLICADO
  chk('Anónimo lee servicio PUBLICADO', (await pedir('GET', u('servicios/svc-pub'))) === 200);
  // 2) Lectura pública denegada de BORRADOR
  chk('Anónimo NO lee servicio BORRADOR', (await pedir('GET', u('servicios/svc-borrador'))) === 403);
  // 3) Lectura pública de configuración y categorías
  chk('Anónimo lee configuracion', (await pedir('GET', u('configuracion/empresa'))) === 200);
  chk('Anónimo lee categorías', (await pedir('GET', u('categorias/cat-streaming'))) === 200);

  // 4) Escritura anónima denegada (sin token)
  chk('Anónimo NO crea servicio', (await crear('servicios', 'x1', { estado: s('PUBLICADO') }, '')) === 403);

  // 5) Escritura autorizada por PROPIETARIO
  chk('PROPIETARIO crea servicio', (await crear('servicios', 'x2', { estado: s('BORRADOR'), categoriaId: s('cat-streaming'), nombre: s('Nuevo'), orden: n(2) }, pr.tok)) === 200);

  // 6) Aislamiento: PROPIETARIO no administra usuarios
  chk('PROPIETARIO NO escribe usuarios', (await crear('usuarios', 'x3', { rol: s('SUPERADMIN') }, pr.tok)) === 403);
  // 7) SUPERADMIN administra usuarios
  chk('SUPERADMIN escribe usuarios', (await crear('usuarios', 'x4', { rol: s('PROPIETARIO') }, sa.tok)) === 200);

  console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
