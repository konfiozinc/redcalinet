'use strict';
/* Verifica que la landing muestre el contenido PUBLICADO desde Firestore (emulador).
   Siembra con token "owner", sirve el sitio, carga ?emulador=1 y comprueba el render. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 5184;
const FS = 'http://127.0.0.1:8080', P = 'red-calinet';
const u = (r) => `${FS}/v1/projects/${P}/databases/(default)/documents/${r}`;
const s = (v) => ({ stringValue: v }), b = (v) => ({ booleanValue: v }), n = (v) => ({ integerValue: String(v) });
const crear = (c, id, f) => fetch(`${u(c)}?documentId=${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' }, body: JSON.stringify({ fields: f }) });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let r = decodeURIComponent(req.url.split('?')[0]);
  if (r.endsWith('/')) r += 'index.html';
  const abs = path.join(ROOT, r);
  fs.readFile(abs, (e, b) => {
    if (e) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(b);
  });
});

(async () => {
  await fetch(FS + '/emulator/v1/projects/' + P + '/databases/(default)/documents', { method: 'DELETE' });
  await crear('configuracion', 'empresa', { nombre: s('Red CaliNet'), eslogan: s('Tu conexión con servicios y soluciones digitales'), ciudad: s('Bello') });
  await crear('configuracion', 'contacto', { whatsapp: s('573014585658'), telefono: s('573014585658'), correo: s('redcalinetmono@gmail.com'), horarios: { arrayValue: { values: [] } } });
  await crear('categorias', 'cat-streaming', { nombre: s('Streaming'), icono: s('i-streaming'), descripcion: s('Planes'), nota: s('Sujeto a autorización'), orden: n(0), visible: b(true) });
  await crear('servicios', 'svc-pub', { categoriaId: s('cat-streaming'), nombre: s('Netflix Demo'), descripcion: s('Plan de prueba'), precio: n(25000), detalles: { arrayValue: { values: [s('Mensual')] } }, imagen: { nullValue: null }, estado: s('PUBLICADO'), orden: n(0) });
  await crear('servicios', 'svc-borrador', { categoriaId: s('cat-streaming'), nombre: s('Oculto Secreto'), descripcion: s('No debe verse'), precio: { nullValue: null }, detalles: { arrayValue: { values: [] } }, imagen: { nullValue: null }, estado: s('BORRADOR'), orden: n(1) });

  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const { chromium } = require('C:/Users/usuario29/Documents/KONFIO_ZINC/6-LANDING-PAGES/Konfio-Zinc-Web/herramientas/node_modules/playwright');
  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO' });
  const pag = await ctx.newPage();
  const errs = [];
  pag.on('pageerror', (e) => errs.push(e.message));
  await pag.goto('http://127.0.0.1:' + PORT + '/?emulador=1', { waitUntil: 'load', timeout: 30000 });
  await pag.waitForTimeout(2500);

  const r = await pag.evaluate(() => ({
    categorias: document.querySelectorAll('.categoria').length,
    fichas: document.querySelectorAll('.ficha').length,
    texto: document.body.textContent
  }));
  const muestraPublicado = r.texto.includes('Netflix Demo');
  const ocultaBorrador = !r.texto.includes('Oculto Secreto');

  console.log('categorias:', r.categorias, '| fichas:', r.fichas);
  console.log('Landing muestra PUBLICADO:', muestraPublicado);
  console.log('Landing NO muestra BORRADOR:', ocultaBorrador);
  console.log('errores JS:', errs.length ? JSON.stringify(errs) : 'ninguno');

  const outDir = path.join(ROOT, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  await pag.screenshot({ path: path.join(outDir, 'redcalinet-e2e-movil.png'), fullPage: true });

  const fail = r.categorias < 1 || !muestraPublicado || !ocultaBorrador || errs.length > 0;
  await nav.close();
  server.close();
  console.log('\n  ' + (fail ? 'FALLO' : 'PASA'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); server.close(); process.exit(2); });
