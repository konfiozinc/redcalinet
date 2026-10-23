'use strict';
/* Prueba funcional E2E (emulador) del flujo completo del MVP:
   login → Mi empresa → Categorías → Servicios (borrador → publicar → editar → ocultar)
   → verificación de lectura pública. Simula lo que hace el panel vía Firestore REST. */
const FS = 'http://127.0.0.1:8080', AUTH = 'http://127.0.0.1:9199', P = 'red-calinet', K = 'AIzaSyAJ4mWGO1gdXtnsJQDveY0l6icBM_uFlSk';
const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v }), b = (v) => ({ booleanValue: v }), n = (v) => ({ integerValue: String(v) });
const pedir = async (m, url, c, t) => {
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = 'Bearer ' + t;
  const r = await fetch(url, { method: m, headers: h, body: c === undefined ? undefined : JSON.stringify(c) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  return { st: r.status, j };
};
const crear = (c, id, f, t = 'owner') => pedir('POST', `${u(c)}?documentId=${id}`, { fields: f }, t);
const leer = (r, t) => pedir('GET', u(r), undefined, t);
const parchear = (r, f, t) => {
  const q = Object.keys(f).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  return pedir('PATCH', `${u(r)}?${q}`, { fields: f }, t);
};
const alta = async (e) => {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${K}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: 'Prueba#123', returnSecureToken: true }) });
  const j = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${K}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: 'Prueba#123', returnSecureToken: true }) })).json();
  return { uid: j.localId, tok: j.idToken };
};

let ok = 0, fail = 0;
const chk = (nm, c, d) => { if (c) { ok++; console.log('  PASA   ' + nm.padEnd(52) + (d || '')); } else { fail++; console.log('  **FALLA** ' + nm.padEnd(50) + (d || '')); } };

(async () => {
  await fetch(FS + '/emulator/v1/projects/' + P + '/databases/(default)/documents', { method: 'DELETE' });
  const pr = await alta('prop@rc.test');
  await crear('usuarios', pr.uid, { rol: s('PROPIETARIO'), activo: b(true) });

  // 1) Login → token
  chk('Login PROPIETARIO (token)', !!pr.tok, 'uid=' + pr.uid);

  // 2) Mi empresa (configuracion/empresa)
  let r = await crear('configuracion', 'empresa', { nombre: s('Red CaliNet'), eslogan: s('Tu conexión con servicios y soluciones digitales') }, pr.tok);
  chk('Mi empresa: crear configuración', r.st === 200, 'HTTP ' + r.st);
  r = await parchear('configuracion/empresa', { eslogan: s('Eslogan editado') }, pr.tok);
  chk('Mi empresa: editar', r.st === 200, 'HTTP ' + r.st);
  const emp = await leer('configuracion/empresa');
  chk('Mi empresa: cambio persistido', emp.j && emp.j.fields.eslogan.stringValue === 'Eslogan editado');

  // 3) Categorías
  r = await crear('categorias', 'cat-streaming', { nombre: s('Streaming'), icono: s('i-streaming'), descripcion: s('Planes'), nota: s('Sujeto a autorización'), orden: n(0), visible: b(true) }, pr.tok);
  chk('Categorías: crear', r.st === 200, 'HTTP ' + r.st);
  r = await parchear('categorias/cat-streaming', { visible: b(false) }, pr.tok);
  chk('Categorías: ocultar', r.st === 200, 'HTTP ' + r.st);
  await parchear('categorias/cat-streaming', { visible: b(true) }, pr.tok);

  // 4) Servicios: crear borrador
  r = await crear('servicios', 'svc-demo', { categoriaId: s('cat-streaming'), nombre: s('Netflix'), descripcion: s('Plan demo'), precio: n(25000), detalles: { arrayValue: { values: [s('Mensual')] } }, imagen: { nullValue: null }, estado: s('BORRADOR'), orden: n(0) }, pr.tok);
  chk('Servicios: crear borrador', r.st === 200, 'HTTP ' + r.st);
  chk('Borrador NO visible al público', (await leer('servicios/svc-demo')).st === 403, 'HTTP ' + (await leer('servicios/svc-demo')).st);

  // 5) Publicar
  r = await parchear('servicios/svc-demo', { estado: s('PUBLICADO') }, pr.tok);
  chk('Servicios: publicar', r.st === 200, 'HTTP ' + r.st);
  const pub = await leer('servicios/svc-demo');
  chk('Publicado visible al público', pub.st === 200, 'HTTP ' + pub.st);

  // 6) Editar
  r = await parchear('servicios/svc-demo', { nombre: s('Netflix (editado)') }, pr.tok);
  chk('Servicios: editar', r.st === 200, 'HTTP ' + r.st);
  const edit = await leer('servicios/svc-demo');
  chk('Edición persistida', edit.j && edit.j.fields.nombre.stringValue === 'Netflix (editado)');

  // 7) Ocultar
  r = await parchear('servicios/svc-demo', { estado: s('OCULTO') }, pr.tok);
  chk('Servicios: ocultar', r.st === 200, 'HTTP ' + r.st);
  chk('Oculto NO visible al público', (await leer('servicios/svc-demo')).st === 403, 'HTTP ' + (await leer('servicios/svc-demo')).st);

  // 8) Contacto
  r = await crear('configuracion', 'contacto', { whatsapp: s('573014585658'), telefono: s('573014585658'), correo: s('redcalinetmono@gmail.com'), facebook: s('https://www.facebook.com/share/1DfEomgbbL/'), instagram: s('https://www.instagram.com/red_calinet'), tiktok: s(''), horarios: { arrayValue: { values: [{ mapValue: { fields: { dia: s('Lun-Sáb'), hora: s('09:00 – 21:30') } } }] } } }, pr.tok);
  chk('Contacto: guardar', r.st === 200, 'HTTP ' + r.st);
  const cont = await leer('configuracion/contacto');
  chk('Contacto: WhatsApp persistido', cont.j && cont.j.fields.whatsapp.stringValue === '573014585658');

  console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
