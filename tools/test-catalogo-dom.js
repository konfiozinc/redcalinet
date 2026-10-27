'use strict';
/* ============================================================
 * Prueba del catálogo público EN NAVEGADOR REAL (Chromium).
 * ------------------------------------------------------------
 * Habla directamente con el navegador por CDP (WebSocket nativo de Node),
 * sin Playwright y sin npm. Bloquea el SDK de Firebase para forzar el
 * respaldo local (data.json) y certifica el catálogo completo:
 * pintado, precios, WhatsApp, filtro, buscador, ficha y accesibilidad.
 *
 * Uso normal (lanza su propio navegador):
 *   node tools/test-catalogo-dom.js
 *
 * Si el entorno bloquea el lanzamiento (sandbox), se arranca aparte:
 *   chrome-headless-shell --headless --no-sandbox --remote-allow-origins=* \
 *     --remote-debugging-port=9333 --user-data-dir=<carpeta temporal> about:blank
 *   KZ_CDP_URL=http://127.0.0.1:9333 node tools/test-catalogo-dom.js
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 5185;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8'
};

let ok = 0, fail = 0;
const chk = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  PASA   ' + nombre.padEnd(56) + (detalle === undefined ? '' : detalle)); }
  else { fail++; console.log('  **FALLA** ' + nombre.padEnd(54) + (detalle === undefined ? '' : detalle)); }
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Servidor estático del sitio ---------- */
const server = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const abs = path.join(ROOT, ruta);
  if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end('no'); }
  fs.readFile(abs, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

/* ---------- Cliente CDP mínimo ---------- */
class ClienteCDP {
  constructor(ws) {
    this.ws = ws;
    this.secuencia = 0;
    this.pendientes = new Map();
    this.oyentes = new Map();

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }

      if (msg.id && this.pendientes.has(msg.id)) {
        const { resolver, rechazar } = this.pendientes.get(msg.id);
        this.pendientes.delete(msg.id);
        if (msg.error) rechazar(new Error(msg.error.message));
        else resolver(msg.result);
        return;
      }
      if (msg.method && this.oyentes.has(msg.method)) {
        this.oyentes.get(msg.method).forEach((cb) => cb(msg.params));
      }
    });
  }

  enviar(method, params) {
    const id = ++this.secuencia;
    const datos = JSON.stringify({ id, method, params: params || {} });
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      this.ws.send(datos);
      setTimeout(() => {
        if (this.pendientes.has(id)) {
          this.pendientes.delete(id);
          rechazar(new Error('CDP sin respuesta: ' + method));
        }
      }, 30000);
    });
  }

  al(method, cb) {
    if (!this.oyentes.has(method)) this.oyentes.set(method, []);
    this.oyentes.get(method).push(cb);
  }

  cerrar() { try { this.ws.close(); } catch (e) { /* ya cerrado */ } }
}

function conectarWS(url) {
  return new Promise((resolver, rechazar) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolver(new ClienteCDP(ws)));
    ws.addEventListener('error', () => rechazar(new Error('No pude abrir el WebSocket de CDP: ' + url)));
    ws.addEventListener('close', (ev) => {
      if (ev.code && ev.code !== 1000) {
        rechazar(new Error('CDP cerró la conexión (' + ev.code + '): ' + (ev.reason || 'sin motivo')));
      }
    });
  });
}

/* ---------- Lanzar o reutilizar el navegador ---------- */
async function abrirNavegador() {
  const externo = process.env.KZ_CDP_URL || '';
  if (externo) return { base: externo.replace(/\/+$/, ''), proceso: null };

  const exe = process.env.KZ_CHROME || path.join(
    process.env.LOCALAPPDATA || '',
    'ms-playwright', 'chromium_headless_shell-1243',
    'chrome-headless-shell-win64', 'chrome-headless-shell.exe'
  );
  if (!fs.existsSync(exe)) {
    throw new Error(
      'No encuentro un Chromium en ' + exe + '.\n' +
      '  Arranca uno aparte y repite con KZ_CDP_URL=http://127.0.0.1:9333'
    );
  }

  const puerto = Number(process.env.KZ_CDP_PORT || 9333);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-catalogo-'));
  const log = path.join(perfil, 'navegador.log');
  const fd = fs.openSync(log, 'w');

  const proceso = spawn(exe, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-allow-origins=*',
    /* Sin ventanas ni reportes de error si el entorno bloquea el navegador:
       Chromium aborta con STATUS_BREAKPOINT (0x80000003) al no poder crear
       sus canales IPC, y el manejador de fallos abre una ventana molesta. */
    '--noerrdialogs', '--disable-breakpad', '--disable-crash-reporter',
    '--disable-features=Crashpad',
    '--remote-debugging-port=' + puerto,
    '--user-data-dir=' + perfil,
    'about:blank'
  ], { stdio: ['ignore', fd, fd] });

  const base = 'http://127.0.0.1:' + puerto;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + '/json/version');
      if (r.ok) return { base, proceso };
    } catch (e) { /* todavía arrancando */ }
    await dormir(250);
  }

  let detalle = '';
  try { detalle = fs.readFileSync(log, 'utf8').slice(0, 600); } catch (e) { /* sin log */ }
  try { proceso.kill(); } catch (e) { /* ya cerrado */ }

  throw new Error(
    'El navegador no abrió CDP en ' + base + '.' +
    (detalle ? '\n  Registro: ' + detalle.trim() : '') +
    '\n  Arranca uno aparte y repite con KZ_CDP_URL=' + base
  );
}

/* ---------- Utilidades de página ---------- */
let cdp = null;

async function js(expresion) {
  const r = await cdp.enviar('Runtime.evaluate', {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('Fallo en la página: ' + ((d.exception && d.exception.description) || d.text));
  }
  return r.result ? r.result.value : undefined;
}

async function esperarA(expresion, ms) {
  const limite = Date.now() + (ms || 10000);
  while (Date.now() < limite) {
    if (await js('Boolean(' + expresion + ')')) return true;
    await dormir(120);
  }
  throw new Error('Tiempo agotado esperando: ' + expresion);
}

async function clic(selector) {
  const hecho = await js(
    '(() => { const el = document.querySelector(' + JSON.stringify(selector) + ');' +
    ' if (!el) return false; el.click(); return true; })()'
  );
  if (!hecho) throw new Error('No existe el elemento: ' + selector);
  await dormir(120);
}

async function escribir(selector, texto) {
  const hecho = await js(
    '(() => { const el = document.querySelector(' + JSON.stringify(selector) + ');' +
    ' if (!el) return false; el.value = ' + JSON.stringify(texto) + ';' +
    " el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()"
  );
  if (!hecho) throw new Error('No existe el campo: ' + selector);
  await dormir(150);
}

async function tecla(key, code, keyCode) {
  await cdp.enviar('Input.dispatchKeyEvent', {
    type: 'keyDown', key: key, code: code || key, windowsVirtualKeyCode: keyCode || 0
  });
  await cdp.enviar('Input.dispatchKeyEvent', {
    type: 'keyUp', key: key, code: code || key, windowsVirtualKeyCode: keyCode || 0
  });
  await dormir(200);
}

async function captura(destino, completo) {
  const r = await cdp.enviar('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: Boolean(completo)
  });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(r.data, 'base64'));
}

/* ---------- Prueba ---------- */
(async () => {
  const bruto = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const totalEsperado = bruto.categorias.reduce((n, c) => n + (c.fichas || []).length, 0);
  const conImagenEsperados = bruto.categorias.reduce(
    (n, c) => n + (c.fichas || []).filter((f) => f.imagen).length, 0
  );

  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const sitio = 'http://127.0.0.1:' + PORT + '/';

  const { base, proceso } = await abrirNavegador();

  /* Target nuevo con el sitio y su webSocket. */
  const creado = await (await fetch(base + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' })).json();
  cdp = await conectarWS(creado.webSocketDebuggerUrl);

  const excepciones = [];
  cdp.al('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    excepciones.push((d.exception && d.exception.description) || d.text || 'excepción');
  });

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Network.enable');

  /* Sin SDK de Firebase no hay Firestore: se certifica el respaldo local. */
  await cdp.enviar('Network.setBlockedURLs', { urls: ['*firebasejs*', '*firebase-config*'] });

  await cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 667, deviceScaleFactor: 1, mobile: true
  });

  await cdp.enviar('Page.navigate', { url: sitio });
  await esperarA("document.readyState === 'complete'", 20000);
  await esperarA("document.querySelectorAll('.ficha--producto').length > 0", 15000);

  console.log('== Pintado del catálogo ==');
  const inicial = await js(`(() => ({
    tarjetas: document.querySelectorAll('.ficha--producto').length,
    conImagen: document.querySelectorAll('.ficha__media img').length,
    categorias: document.querySelectorAll('.categoria').length,
    filtros: document.querySelectorAll('#catFiltros .filtro').length,
    cuenta: (document.querySelector('#catCuenta') || {}).textContent || '',
    vacioOculto: document.querySelector('#catVacio') ? document.querySelector('#catVacio').hidden : null,
    linkNav: Boolean(document.querySelector('.nav a[href="#catalogo"]'))
  }))()`);

  chk('pinta todas las fichas de data.json', inicial.tarjetas === totalEsperado, inicial.tarjetas + '/' + totalEsperado);
  chk('pinta las imágenes declaradas', inicial.conImagen === conImagenEsperados, inicial.conImagen + '/' + conImagenEsperados);
  chk('mantiene las 4 categorías de servicios', inicial.categorias === 4, inicial.categorias);
  chk('crea el filtro "Todos" + una por categoría', inicial.filtros === 5, inicial.filtros);
  chk('el contador anuncia el total', inicial.cuenta.indexOf(String(totalEsperado)) !== -1, inicial.cuenta.trim());
  chk('el estado vacío está oculto al cargar', inicial.vacioOculto === true);
  chk('el menú enlaza al catálogo', inicial.linkNav === true);

  const ancho = await js('document.documentElement.scrollWidth');
  chk('sin desbordamiento horizontal a 375px', ancho <= 375, ancho + 'px');

  /* Las fotos del catálogo son loading="lazy": hay que llegar a ellas. */
  await js("document.querySelector('#catalogo').scrollIntoView({ block: 'start' })");
  await dormir(900);
  const imagenes = await js(`(() => {
    const imgs = Array.from(document.querySelectorAll('.ficha__media img'));
    return {
      total: imgs.length,
      cargadas: imgs.filter((i) => i.complete && i.naturalWidth > 0).length
    };
  })()`);
  chk('las imágenes cargan de verdad (no 404)',
    imagenes.total > 0 && imagenes.cargadas === imagenes.total, imagenes.cargadas + '/' + imagenes.total);

  console.log('\n== Precio y WhatsApp ==');
  const precios = await js(
    "Array.from(document.querySelectorAll('.ficha--producto .ficha__precio')).map((p) => p.textContent.trim())"
  );
  chk('sin precio muestra "consultar por WhatsApp"',
    precios.length === totalEsperado && precios.every((t) => t.indexOf('consultar') !== -1), precios[0]);

  const waHrefs = await js(
    "Array.from(document.querySelectorAll('.ficha--producto a[data-wa]')).map((a) => a.getAttribute('href') || '')"
  );
  chk('cada producto tiene enlace de WhatsApp',
    waHrefs.length === totalEsperado && waHrefs.every((h) => h.indexOf('https://wa.me/573014585658?text=') === 0),
    waHrefs.length + ' enlaces');

  const primerMensaje = decodeURIComponent((waHrefs[0] || '').split('text=')[1] || '');
  chk('el mensaje de WhatsApp incluye el producto',
    primerMensaje.indexOf('Hola, quiero información sobre') === 0, primerMensaje);

  console.log('\n== Filtro por categoría ==');
  await js("Array.from(document.querySelectorAll('#catFiltros .filtro')).find((b) => b.textContent.indexOf('Tecnología') !== -1).click()");
  await dormir(200);
  const filtrado = await js(`(() => ({
    tarjetas: document.querySelectorAll('.ficha--producto').length,
    activo: (document.querySelector('#catFiltros .filtro.activo') || {}).textContent || '',
    cuenta: (document.querySelector('#catCuenta') || {}).textContent || ''
  }))()`);
  chk('el filtro acota a los productos de la categoría', filtrado.tarjetas === 3, filtrado.tarjetas + ' tarjetas');
  chk('marca el filtro activo', filtrado.activo.indexOf('Tecnología') !== -1, filtrado.activo.trim());
  chk('el contador avisa del filtro activo',
    filtrado.cuenta.indexOf('Mostrando 3 de ' + totalEsperado) !== -1, filtrado.cuenta.trim());

  await js("Array.from(document.querySelectorAll('#catFiltros .filtro')).find((b) => b.textContent.indexOf('Todos') !== -1).click()");
  await dormir(200);
  chk('volver a "Todos" restaura la lista',
    (await js("document.querySelectorAll('.ficha--producto').length")) === totalEsperado);

  console.log('\n== Buscador ==');
  await escribir('#catBuscar', 'iphone');
  const busca = await js(`(() => ({
    tarjetas: document.querySelectorAll('.ficha--producto').length,
    titulo: (document.querySelector('.ficha--producto h4') || {}).textContent || '',
    limpiarVisible: document.querySelector('#catLimpiar') ? !document.querySelector('#catLimpiar').hidden : false
  }))()`);
  chk('busca por nombre', busca.tarjetas === 1 && busca.titulo === 'iPhone', busca.titulo);
  chk('muestra el botón de limpiar', busca.limpiarVisible === true);

  await escribir('#catBuscar', 'tramites');
  const sinTildes = await js("document.querySelectorAll('.ficha--producto').length");
  chk('busca sin tildes', sinTildes > 0, sinTildes + ' resultados');

  await escribir('#catBuscar', 'producto-que-no-existe');
  const vacio = await js(`(() => ({
    tarjetas: document.querySelectorAll('.ficha--producto').length,
    visible: document.querySelector('#catVacio') ? !document.querySelector('#catVacio').hidden : false,
    cuenta: (document.querySelector('#catCuenta') || {}).textContent || ''
  }))()`);
  chk('sin coincidencias no pinta tarjetas', vacio.tarjetas === 0);
  chk('sin coincidencias muestra el aviso', vacio.visible === true);
  chk('el aviso explica qué pasó', /coincide/i.test(vacio.cuenta), vacio.cuenta.trim());

  await clic('#catLimpiar');
  chk('limpiar devuelve el catálogo completo',
    (await js("document.querySelectorAll('.ficha--producto').length")) === totalEsperado);

  console.log('\n== Ficha de producto (modal) ==');
  await clic('.ficha--producto .ficha__ver');
  const ficha = await js(`(() => {
    const m = document.querySelector('#fichaModal');
    const caja = document.querySelector('#fichaModal .ficha-modal__caja');
    const wa = document.querySelector('#fichaWa');
    return {
      abierto: m ? !m.hidden : false,
      titulo: (document.querySelector('#fichaTitulo') || {}).textContent || '',
      cat: (document.querySelector('#fichaCat') || {}).textContent || '',
      rol: caja ? caja.getAttribute('role') : '',
      modalAttr: caja ? caja.getAttribute('aria-modal') : '',
      wa: wa ? wa.getAttribute('href') : '',
      foco: document.activeElement ? document.activeElement.id : '',
      sinScroll: document.body.classList.contains('sin-scroll')
    };
  })()`);
  chk('abre la ficha', ficha.abierto === true);
  chk('la ficha muestra el nombre', ficha.titulo.length > 0, ficha.titulo);
  chk('la ficha muestra la categoría', ficha.cat.length > 0, ficha.cat);
  chk('es un diálogo accesible', ficha.rol === 'dialog' && ficha.modalAttr === 'true', ficha.rol + '/' + ficha.modalAttr);
  chk('el foco entra al botón de cerrar', ficha.foco === 'fichaCerrar', ficha.foco);
  chk('bloquea el scroll del fondo', ficha.sinScroll === true);
  chk('la ficha tiene su propio WhatsApp',
    String(ficha.wa).indexOf('https://wa.me/573014585658?text=') === 0);

  await tecla('Escape', 'Escape', 27);
  chk('Escape cierra la ficha', (await js("document.querySelector('#fichaModal').hidden")) === true);
  chk('devuelve el foco al disparador',
    (await js("document.activeElement ? document.activeElement.className : ''")).indexOf('ficha__ver') !== -1);
  chk('libera el scroll del fondo',
    (await js("document.body.classList.contains('sin-scroll')")) === false);

  await clic('.ficha--producto .ficha__media');
  chk('tocar la tarjeta también abre la ficha',
    (await js("!document.querySelector('#fichaModal').hidden")) === true);
  await clic('#fichaCerrar');
  chk('el botón de cerrar funciona',
    (await js("document.querySelector('#fichaModal').hidden")) === true);

  console.log('\n== Capturas ==');
  await js("document.querySelector('#catalogo').scrollIntoView({ behavior: 'instant', block: 'start' })");
  await dormir(250);
  await captura(path.join(ROOT, 'capturas', 'redcalinet-catalogo-movil.png'));
  await captura(path.join(ROOT, 'capturas', 'redcalinet-catalogo-completo.png'), true);
  console.log('  capturas/redcalinet-catalogo-movil.png y redcalinet-catalogo-completo.png');

  console.log('\n== Sin errores de JavaScript ==');
  chk('no hubo excepciones en la página', excepciones.length === 0,
    excepciones.length ? JSON.stringify(excepciones.slice(0, 3)) : 'ninguna');

  /* Cierre limpio */
  try { await fetch(base + '/json/close/' + creado.id); } catch (e) { /* da igual */ }
  cdp.cerrar();
  if (proceso) { try { proceso.kill(); } catch (e) { /* ya cerrado */ } }
  server.close();

  console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('ERROR ' + (e && e.message ? e.message : e));
  if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  try { if (cdp) cdp.cerrar(); } catch (x) { /* nada */ }
  server.close();
  process.exit(2);
});
