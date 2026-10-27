'use strict';
/* ============================================================
 * KZ-REDCALINET-006 — Certificación visual del catálogo público
 * ------------------------------------------------------------
 * Ejecuta las pruebas del catálogo en un navegador real (Chromium por CDP),
 * captura las SIETE resoluciones oficiales y mide lo que un revisor humano
 * comprobaría: desbordamiento, columnas de rejilla, solapamiento, contraste
 * WCAG AA, imágenes, teclado, desplazamiento y fichas.
 *
 * ESTADO: NO EJECUTADO en el entorno del agente. Allí Chromium aborta con
 * STATUS_BREAKPOINT (0x80000003) porque el sandbox deniega los canales IPC
 * con nombre; la causa y las evidencias están en
 * docs/misiones/INFORME-KZ-REDCALINET-005.md. Este archivo es el entregable
 * para ejecutarlo en un entorno autorizado.
 *
 * Uso (equipo normal):
 *   node tools/test-catalogo-dom.js
 *
 * Si el lanzamiento directo falla, se arranca el navegador aparte:
 *   chrome-headless-shell --headless --no-sandbox --remote-allow-origins=* \
 *     --remote-debugging-port=9333 --user-data-dir=<carpeta temporal> about:blank
 *   KZ_CDP_URL=http://127.0.0.1:9333 node tools/test-catalogo-dom.js
 *
 * Salidas:
 *   capturas/responsive/<resolucion>.png   (7 capturas)
 *   capturas/redcalinet-catalogo-movil.png (375x667, la oficial de móvil)
 *   capturas/informe-visual.json           (resultado legible por máquina)
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 5185;

/* Las siete resoluciones oficiales de la orden KZ-REDCALINET-006
   y las columnas que la rejilla del catálogo debe usar en cada una. */
const RESOLUCIONES = [
  { ancho: 320, alto: 640, nombre: '320x640', columnas: 1 },
  { ancho: 360, alto: 640, nombre: '360x640', columnas: 1 },
  { ancho: 375, alto: 667, nombre: '375x667', columnas: 1 },
  { ancho: 390, alto: 844, nombre: '390x844', columnas: 1 },
  { ancho: 768, alto: 1024, nombre: '768x1024', columnas: 2 },
  { ancho: 1024, alto: 768, nombre: '1024x768', columnas: 3 },
  { ancho: 1440, alto: 900, nombre: '1440x900', columnas: 3 }
];

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

const resultados = [];
let ok = 0, fail = 0;

const chk = (nombre, cond, detalle) => {
  if (cond) {
    ok++;
    console.log('  PASA   ' + nombre.padEnd(58) + (detalle === undefined ? '' : detalle));
  } else {
    fail++;
    console.log('  **FALLA** ' + nombre.padEnd(56) + (detalle === undefined ? '' : detalle));
  }
  resultados.push({ prueba: nombre, pasa: Boolean(cond), detalle: detalle === undefined ? '' : String(detalle) });
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

/* ---------- Cliente CDP mínimo (WebSocket nativo de Node) ---------- */
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
    /* Sin ventanas de error si el entorno bloquea el navegador. */
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
    ' if (!el) return false; el.focus(); el.click(); return true; })()'
  );
  if (!hecho) throw new Error('No existe el elemento: ' + selector);
  await dormir(140);
}

async function escribir(selector, texto) {
  const hecho = await js(
    '(() => { const el = document.querySelector(' + JSON.stringify(selector) + ');' +
    ' if (!el) return false; el.value = ' + JSON.stringify(texto) + ';' +
    " el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()"
  );
  if (!hecho) throw new Error('No existe el campo: ' + selector);
  await dormir(160);
}

async function tecla(key, code, keyCode, shift) {
  const modificadores = shift ? 8 : 0;
  const base = { key, code: code || key, windowsVirtualKeyCode: keyCode || 0, modifiers: modificadores };
  await cdp.enviar('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, base));
  await cdp.enviar('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
  await dormir(160);
}

async function metricas(ancho, alto) {
  await cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 768
  });
  await dormir(380);
}

async function irAlCatalogo() {
  await js("document.querySelector('#catalogo').scrollIntoView({ behavior: 'instant', block: 'start' })");
  await dormir(220);
}

async function captura(destino) {
  const r = await cdp.enviar('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(r.data, 'base64'));
  return fs.statSync(destino).size;
}

/* Mediciones del catálogo en el viewport actual. */
const MEDIR = `(() => {
  const grid = document.querySelector('#catGrid');
  const tarjetas = Array.from(document.querySelectorAll('#catGrid .ficha--producto'));
  const cajas = tarjetas.map((t) => t.getBoundingClientRect());
  let solapes = 0;
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i], b = cajas[j];
      if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) solapes++;
    }
  }
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  const cabecera = document.querySelector('.cabecera');
  const h2 = document.querySelector('#catalogo h2');
  const rc = cabecera ? cabecera.getBoundingClientRect() : null;
  const rh = h2 ? h2.getBoundingClientRect() : null;
  return {
    desborde: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
    columnas: cols,
    tarjetas: tarjetas.length,
    solapes: solapes,
    anchoTarjeta: cajas.length ? Math.round(cajas[0].width) : 0,
    tituloBajoCabecera: (rc && rh) ? Math.round(rh.top - rc.bottom) : null,
    cabeceraAlto: rc ? Math.round(rc.height) : 0
  };
})()`;

/* Contraste WCAG: mide color real del texto contra el fondo efectivo.
   Los fondos con degradado no se pueden medir así y se informan como null. */
const CONTRASTE = `(() => {
  function canales(color) {
    const t = String(color).replace('rgba', '').replace('rgb', '').replace('(', '').replace(')', '');
    const p = t.split(',').map((x) => Number(x.trim()));
    return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    const s = [c.r, c.g, c.b].map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }
  function fondoDe(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const st = getComputedStyle(n);
      if (st.backgroundImage && st.backgroundImage !== 'none') return null;
      const c = canales(st.backgroundColor);
      if (c.a > 0.5) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  function razon(fg, bg) {
    const a = lum(fg), b = lum(bg);
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }
  const casos = [
    ['titulo de producto', '#catGrid .ficha--producto h4'],
    ['precio', '#catGrid .ficha--producto .ficha__precio'],
    ['categoria en la tarjeta', '#catGrid .ficha--producto .ficha__cat'],
    ['descripcion de producto', '#catGrid .ficha--producto h4 + p'],
    ['boton ver detalle', '#catGrid .ficha__ver'],
    ['titulo de la seccion', '#catalogo h2'],
    ['contador de productos', '#catCuenta']
  ];
  return casos.map((c) => {
    const el = document.querySelector(c[1]);
    if (!el) return { caso: c[0], razon: null, nota: 'no existe' };
    const fg = canales(getComputedStyle(el).color);
    const bg = fondoDe(el);
    if (!bg) return { caso: c[0], razon: null, nota: 'fondo con degradado: revisar a ojo' };
    return { caso: c[0], razon: razon(fg, bg), nota: '' };
  });
})()`;

/* Estado del botón flotante de WhatsApp y su choque con controles reales.
   El icono solo cuenta como «visible» si además no está en modo oculto. */
const FAB = `(() => {
  const fab = document.querySelector('#waFloat');
  if (!fab) return { existe: false, visible: false };
  const oculto = fab.classList.contains('oculto');
  const r = fab.getBoundingClientRect();
  const visible = !oculto && getComputedStyle(fab).opacity !== '0' && r.width > 0;
  if (!visible) {
    return {
      existe: true, visible: false,
      aria: fab.getAttribute('aria-hidden'),
      tabindex: fab.tabIndex,
      pointer: getComputedStyle(fab).pointerEvents
    };
  }
  const controles = Array.from(document.querySelectorAll(
    '#catFiltros .filtro, #catBuscar, #catLimpiar, #catGrid .ficha__ver, #catGrid .ficha__cta, ' +
    '.hero__cta a, .cabecera a, .cabecera button, .catalogo__limpiar'
  ));
  const choques = [];
  controles.forEach((el) => {
    const c = el.getBoundingClientRect();
    if (c.width === 0 || c.height === 0) return;
    if (c.bottom < 0 || c.top > window.innerHeight) return;
    if (r.right > c.left + 1 && c.right > r.left + 1 && r.bottom > c.top + 1 && c.bottom > r.top + 1) {
      choques.push(String(el.id || el.className || el.tagName).slice(0, 40));
    }
  });
  return {
    existe: true, visible: true, choques: choques,
    rect: { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left) },
    anchoVista: window.innerWidth, altoVista: window.innerHeight
  };
})()`;

/* Diagnóstico: dónde queda cada sección respecto a la pantalla. */
const SECCIONES = `(() => {
  const leer = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  return {
    scrollY: Math.round(window.scrollY),
    alto: window.innerHeight,
    hero: leer('#inicio'),
    servicios: leer('#servicios'),
    catalogo: leer('#catalogo'),
    contacto: leer('#contacto'),
    clase: (document.querySelector('#waFloat') || {}).className || ''
  };
})()`;

/* ---------- Certificación ---------- */
(async () => {
  const bruto = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const totalEsperado = bruto.categorias.reduce((n, c) => n + (c.fichas || []).length, 0);
  const conImagenEsperados = bruto.categorias.reduce(
    (n, c) => n + (c.fichas || []).filter((f) => f.imagen).length, 0
  );

  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const sitio = 'http://127.0.0.1:' + PORT + '/';

  const { base, proceso } = await abrirNavegador();
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

  /* Sin SDK de Firebase no hay Firestore: se certifica el respaldo local.
     La integración con Firestore ya está aprobada (26/26 contra el emulador). */
  await cdp.enviar('Network.setBlockedURLs', { urls: ['*firebasejs*', '*firebase-config*'] });

  await metricas(375, 667);
  await cdp.enviar('Page.navigate', { url: sitio });
  await esperarA("document.readyState === 'complete'", 20000);
  await esperarA("document.querySelectorAll('.ficha--producto').length > 0", 15000);

  /* ============ 1. Catálogo pintado ============ */
  console.log('== 1. Catálogo ==========================');
  const inicial = await js(`(() => ({
    tarjetas: document.querySelectorAll('.ficha--producto').length,
    categorias: document.querySelectorAll('.categoria').length,
    filtros: document.querySelectorAll('#catFiltros .filtro').length,
    cuenta: (document.querySelector('#catCuenta') || {}).textContent || '',
    vacioOculto: document.querySelector('#catVacio') ? document.querySelector('#catVacio').hidden : null,
    linkNav: Boolean(document.querySelector('.nav a[href="#catalogo"]')),
    gridExiste: Boolean(document.querySelector('#catGrid'))
  }))()`);

  chk('pinta todas las fichas de data.json', inicial.tarjetas === totalEsperado, inicial.tarjetas + '/' + totalEsperado);
  chk('mantiene las 4 categorías de servicios', inicial.categorias === 4, inicial.categorias);
  chk('crea el filtro "Todos" + una por categoría', inicial.filtros === 5, inicial.filtros);
  chk('el contador anuncia el total', inicial.cuenta.indexOf(String(totalEsperado)) !== -1, inicial.cuenta.trim());
  chk('el estado vacío está oculto al cargar', inicial.vacioOculto === true);
  chk('el menú enlaza al catálogo', inicial.linkNav === true);

  /* ============ 2. Imágenes ============ */
  console.log('\n== 2. Imágenes ==========================');
  await irAlCatalogo();
  /* Son loading="lazy" y algunas están muy abajo: se lleva cada una a la vista
     y se espera su carga antes de medir. */
  await js(`(async () => {
    const lista = Array.from(document.querySelectorAll('#catGrid .ficha__media img'));
    for (const img of lista) {
      img.scrollIntoView({ block: 'center' });
      if (img.complete && img.naturalWidth > 0) continue;
      await new Promise((res) => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
        setTimeout(res, 4000);
      });
    }
    return true;
  })()`);
  await irAlCatalogo();
  await dormir(400);
  const imgs = await js(`(() => {
    const lista = Array.from(document.querySelectorAll('#catGrid .ficha__media img'));
    return {
      total: lista.length,
      cargadas: lista.filter((i) => i.complete && i.naturalWidth > 0).length,
      conAlt: lista.filter((i) => i.getAttribute('alt') && i.getAttribute('alt').trim().length > 0).length,
      rotas: lista.filter((i) => i.complete && i.naturalWidth === 0).length,
      sinImagen: document.querySelectorAll('#catGrid .ficha__sinfoto').length
    };
  })()`);
  chk('las imágenes declaradas existen en el DOM', imgs.total === conImagenEsperados, imgs.total + '/' + conImagenEsperados);
  chk('las imágenes cargan de verdad (no 404)', imgs.cargadas === imgs.total && imgs.rotas === 0,
    imgs.cargadas + '/' + imgs.total + ' · rotas ' + imgs.rotas);
  chk('toda imagen tiene texto alternativo', imgs.conAlt === imgs.total, imgs.conAlt + '/' + imgs.total);
  chk('los productos sin foto usan marcador de categoría',
    imgs.sinImagen === totalEsperado - conImagenEsperados, imgs.sinImagen + ' marcadores');

  /* ============ 3. Precios y WhatsApp ============ */
  console.log('\n== 3. Precios y WhatsApp ================');
  const precios = await js(
    "Array.from(document.querySelectorAll('#catGrid .ficha--producto .ficha__precio')).map((p) => p.textContent.trim())"
  );
  chk('sin precio muestra "consultar por WhatsApp"',
    precios.length === totalEsperado && precios.every((t) => t.indexOf('consultar') !== -1), precios[0]);

  const waHrefs = await js(
    "Array.from(document.querySelectorAll('#catGrid a[data-wa]')).map((a) => a.getAttribute('href') || '')"
  );
  chk('cada producto tiene enlace de WhatsApp',
    waHrefs.length === totalEsperado && waHrefs.every((h) => h.indexOf('https://wa.me/573014585658?text=') === 0),
    waHrefs.length + ' enlaces');
  chk('los enlaces abren en pestaña nueva sin filtrar referer',
    (await js("Array.from(document.querySelectorAll('#catGrid a[data-wa]')).every((a) => a.target === '_blank' && a.rel.indexOf('noopener') !== -1)")) === true);

  const primerMensaje = decodeURIComponent((waHrefs[0] || '').split('text=')[1] || '');
  chk('el mensaje de WhatsApp incluye el producto',
    primerMensaje.indexOf('Hola, quiero información sobre') === 0, primerMensaje);

  /* ============ 4. Filtros ============ */
  console.log('\n== 4. Filtros ===========================');
  await js("Array.from(document.querySelectorAll('#catFiltros .filtro')).find((b) => b.textContent.indexOf('Tecnología') !== -1).click()");
  await dormir(220);
  const filtrado = await js(`(() => ({
    tarjetas: document.querySelectorAll('.ficha--producto').length,
    activo: (document.querySelector('#catFiltros .filtro.activo') || {}).textContent || '',
    cuenta: (document.querySelector('#catCuenta') || {}).textContent || '',
    pressed: Array.from(document.querySelectorAll('#catFiltros .filtro')).filter((b) => b.getAttribute('aria-pressed') === 'true').length
  }))()`);
  chk('el filtro acota a los productos de la categoría', filtrado.tarjetas === 3, filtrado.tarjetas + ' tarjetas');
  chk('marca el filtro activo', filtrado.activo.indexOf('Tecnología') !== -1, filtrado.activo.trim());
  chk('solo un filtro queda marcado como presionado', filtrado.pressed === 1, filtrado.pressed);
  chk('el contador avisa del filtro activo',
    filtrado.cuenta.indexOf('Mostrando 3 de ' + totalEsperado) !== -1, filtrado.cuenta.trim());

  await js("Array.from(document.querySelectorAll('#catFiltros .filtro')).find((b) => b.textContent.indexOf('Todos') !== -1).click()");
  await dormir(220);
  chk('volver a "Todos" restaura la lista',
    (await js("document.querySelectorAll('.ficha--producto').length")) === totalEsperado);

  /* ============ 5. Búsqueda ============ */
  console.log('\n== 5. Búsqueda ==========================');
  await escribir('#catBuscar', 'iphone');
  const busca = await js(`(() => ({
    tarjetas: document.querySelectorAll('.ficha--producto').length,
    titulo: (document.querySelector('.ficha--producto h4') || {}).textContent || '',
    limpiarVisible: document.querySelector('#catLimpiar') ? !document.querySelector('#catLimpiar').hidden : false
  }))()`);
  chk('busca por nombre', busca.tarjetas === 1 && busca.titulo === 'iPhone', busca.titulo);
  chk('muestra el botón de limpiar', busca.limpiarVisible === true);

  await escribir('#catBuscar', 'tramites');
  chk('busca sin tildes', (await js("document.querySelectorAll('.ficha--producto').length")) > 0,
    (await js("document.querySelectorAll('.ficha--producto').length")) + ' resultados');

  await escribir('#catBuscar', 'CARGADORES');
  chk('busca en mayúsculas dentro de los detalles',
    (await js("document.querySelectorAll('.ficha--producto').length")) === 1);

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

  /* ============ 6. Ficha de producto ============ */
  console.log('\n== 6. Ficha de producto =================');
  await clic('#catGrid .ficha--producto .ficha__ver');
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
      etiquetado: caja ? caja.getAttribute('aria-labelledby') : '',
      wa: wa ? wa.getAttribute('href') : '',
      foco: document.activeElement ? document.activeElement.id : '',
      sinScroll: document.body.classList.contains('sin-scroll'),
      cajaDentro: (() => {
        const r = caja ? caja.getBoundingClientRect() : null;
        return r ? (r.width <= window.innerWidth + 1 && r.top >= -1) : false;
      })()
    };
  })()`);
  chk('abre la ficha', ficha.abierto === true);
  chk('la ficha muestra el nombre', ficha.titulo.length > 0, ficha.titulo);
  chk('la ficha muestra la categoría', ficha.cat.length > 0, ficha.cat);
  chk('es un diálogo accesible', ficha.rol === 'dialog' && ficha.modalAttr === 'true', ficha.rol + '/' + ficha.modalAttr);
  chk('el diálogo está etiquetado', ficha.etiquetado === 'fichaTitulo', ficha.etiquetado);
  chk('la ficha cabe en el ancho del móvil', ficha.cajaDentro === true);
  chk('el foco entra al botón de cerrar', ficha.foco === 'fichaCerrar', ficha.foco);
  chk('bloquea el scroll del fondo', ficha.sinScroll === true);
  chk('la ficha tiene su propio WhatsApp',
    String(ficha.wa).indexOf('https://wa.me/573014585658?text=') === 0);

  /* ============ 7. Teclado ============ */
  console.log('\n== 7. Teclado ===========================');
  const dentroDelModal = "Boolean(document.activeElement && document.querySelector('#fichaModal').contains(document.activeElement))";

  await tecla('Tab', 'Tab', 9);
  await tecla('Tab', 'Tab', 9);
  await tecla('Tab', 'Tab', 9);
  chk('Tab no escapa del modal (foco atrapado)', (await js(dentroDelModal)) === true,
    await js("document.activeElement ? document.activeElement.className || document.activeElement.id : 'sin foco'"));

  await tecla('Tab', 'Tab', 9, true);
  await tecla('Tab', 'Tab', 9, true);
  chk('Shift+Tab tampoco escapa del modal', (await js(dentroDelModal)) === true);

  await tecla('Escape', 'Escape', 27);
  chk('Escape cierra la ficha', (await js("document.querySelector('#fichaModal').hidden")) === true);
  chk('devuelve el foco al disparador',
    (await js("document.activeElement ? document.activeElement.className : ''")).indexOf('ficha__ver') !== -1);
  chk('libera el scroll del fondo',
    (await js("document.body.classList.contains('sin-scroll')")) === false);

  chk('el enlace "saltar al contenido" es alcanzable',
    (await js("Boolean(document.querySelector('.skip'))")) === true);

  /* ============ 8. Desplazamiento ============ */
  console.log('\n== 8. Desplazamiento ====================');
  await js("window.scrollTo(0, 0)");
  await dormir(200);
  await js("document.querySelector('.nav a[href=\"#catalogo\"]') ? document.querySelector('.nav a[href=\"#catalogo\"]').click() : document.location.hash = '#catalogo'");
  await dormir(900);
  const trasAncla = await js(MEDIR);
  chk('navegar al catálogo deja la cabecera fuera del título',
    trasAncla.tituloBajoCabecera !== null && trasAncla.tituloBajoCabecera > 0,
    trasAncla.tituloBajoCabecera + 'px de holgura (cabecera ' + trasAncla.cabeceraAlto + 'px)');
  chk('la página se desplazó hasta el catálogo',
    (await js("window.scrollY")) > 100, (await js("window.scrollY")) + 'px');

  await js("window.scrollTo(0, document.body.scrollHeight)");
  await dormir(400);
  chk('se puede llegar al final de la página',
    (await js("Math.round(window.scrollY + window.innerHeight) >= Math.round(document.body.scrollHeight) - 4")) === true);

  /* ============ 9. Contraste ============ */
  console.log('\n== 9. Contraste WCAG AA =================');
  await metricas(375, 667);
  await irAlCatalogo();
  const contrastes = await js(CONTRASTE);
  contrastes.forEach((c) => {
    if (c.razon === null) {
      console.log('  revisar  ' + c.caso.padEnd(28) + c.nota);
      resultados.push({ prueba: 'contraste: ' + c.caso, pasa: null, detalle: c.nota });
      return;
    }
    chk('contraste ≥ 4.5 en ' + c.caso, c.razon >= 4.5, 'ratio ' + c.razon);
  });

  /* ============ 9b. Hero, WhatsApp flotante y contador ============ */
  console.log('\n== 9b. Hero y botón flotante ============');

  /* Contador neutral y reactivo: cuenta resultados, no disponibilidad. */
  await escribir('#catBuscar', 'iphone');
  const cuentaFiltrada = await js("(document.querySelector('#catCuenta') || {}).textContent || ''");
  chk('el contador se actualiza al buscar',
    /^Mostrando 1 de \d+ resultados$/.test(cuentaFiltrada.trim()), cuentaFiltrada.trim());
  await clic('#catLimpiar');
  const cuentaPlural = await js("(document.querySelector('#catCuenta') || {}).textContent || ''");
  chk('el contador usa "resultados" en plural',
    new RegExp('^' + totalEsperado + ' resultados$').test(cuentaPlural.trim()), cuentaPlural.trim());
  chk('el contador no afirma disponibilidad comercial',
    !/disponible/i.test(cuentaPlural) && !/disponible/i.test(cuentaFiltrada),
    cuentaPlural.trim() + ' · ' + cuentaFiltrada.trim());

  /* Un solo acceso a WhatsApp en el hero: sin redundancias. */
  const waEnHero = await js("document.querySelectorAll('.hero [data-wa]').length");
  chk('el hero tiene un único acceso a WhatsApp', waEnHero === 1, waEnHero);
  const ctasHero = await js(
    "Array.from(document.querySelectorAll('.hero__cta a')).map((a) => (a.textContent || '').trim().replace(/\\s+/g, ' '))"
  );
  chk('el hero mantiene dos CTA principales', ctasHero.length === 2, ctasHero.join(' | '));
  chk('uno de los CTA es "Explorar catálogo"',
    ctasHero.some((t) => t.indexOf('Explorar catálogo') !== -1), ctasHero.join(' | '));
  chk('uno de los CTA es "Consultar por WhatsApp"',
    ctasHero.some((t) => t.indexOf('Consultar por WhatsApp') !== -1), ctasHero.join(' | '));

  /* Móvil: sin composición visual (no alarga la página) y CTA a la vista. */
  await metricas(375, 667);
  await js('window.scrollTo(0, 0)');
  await dormir(300);
  const heroMovil = await js(`(() => {
    const visual = document.querySelector('.hero__visual');
    const cta = document.querySelector('.hero__cta');
    const logo = document.querySelector('.hero__logo');
    return {
      visual: visual ? getComputedStyle(visual).display : 'sin elemento',
      ctaAbajo: cta ? Math.round(cta.getBoundingClientRect().bottom) : null,
      altoVista: window.innerHeight,
      logoAncho: logo ? Math.round(logo.getBoundingClientRect().width) : 0,
      altoHero: Math.round(document.querySelector('.hero').getBoundingClientRect().height)
    };
  })()`);
  chk('en móvil no se muestra la composición visual', heroMovil.visual === 'none', heroMovil.visual);
  chk('en 375×667 el CTA cabe en la primera pantalla',
    heroMovil.ctaAbajo !== null && heroMovil.ctaAbajo <= heroMovil.altoVista,
    heroMovil.ctaAbajo + 'px de ' + heroMovil.altoVista + 'px');
  chk('el logotipo del hero está contenido (≤ 110px)', heroMovil.logoAncho <= 110, heroMovil.logoAncho + 'px');

  /* Botón flotante: oculto mientras el hero está en pantalla. */
  const fabEnHero = await js(FAB);
  chk('el WhatsApp flotante está oculto sobre el hero', fabEnHero.visible === false);
  chk('oculto también queda fuera del foco',
    fabEnHero.aria === 'true' && fabEnHero.tabindex === -1, 'aria=' + fabEnHero.aria + ' tabindex=' + fabEnHero.tabindex);
  chk('oculto no intercepta el puntero', fabEnHero.pointer === 'none', fabEnHero.pointer);

  /* Aparece al desplazarse a una sección sin accesos redundantes. */
  await js("document.querySelector('#servicios').scrollIntoView({ behavior: 'instant', block: 'start' })");
  await dormir(500);
  const fabServicios = await js(FAB);
  chk('el WhatsApp flotante aparece al desplazarse', fabServicios.visible === true,
    JSON.stringify(await js(SECCIONES)));
  if (fabServicios.visible) {
    chk('aparece sin tapar controles', fabServicios.choques.length === 0, fabServicios.choques.join(', ') || 'limpio');
    chk('respeta márgenes y áreas seguras',
      fabServicios.rect.right <= fabServicios.anchoVista + 1 && fabServicios.rect.bottom <= fabServicios.altoVista + 1 &&
      fabServicios.rect.left > 0 && fabServicios.rect.top > 0,
      JSON.stringify(fabServicios.rect));
  }

  /* Vuelve a ocultarse donde ya hay acceso propio. */
  await js("document.querySelector('#catalogo').scrollIntoView({ behavior: 'instant', block: 'center' })");
  await dormir(500);
  chk('se oculta en el catálogo (cada ficha tiene su Consultar)',
    (await js(FAB)).visible === false);
  await js("document.querySelector('#contacto').scrollIntoView({ behavior: 'instant', block: 'center' })");
  await dormir(500);
  chk('se oculta en la sección de contacto', (await js(FAB)).visible === false);

  /* Escritorio: dos columnas y mitad derecha ocupada. */
  await metricas(1440, 900);
  await js('window.scrollTo(0, 0)');
  await dormir(400);
  const heroEscritorio = await js(`(() => {
    const en = document.querySelector('.hero__in');
    const visual = document.querySelector('.hero__visual');
    const txt = document.querySelector('.hero__txt');
    const fotos = Array.from(document.querySelectorAll('.hero__visual img'));
    const sello = document.querySelector('.hero__sello');
    const rEn = en.getBoundingClientRect();
    const rVis = visual ? visual.getBoundingClientRect() : null;
    return {
      columnas: getComputedStyle(en).gridTemplateColumns.split(' ').filter(Boolean).length,
      visualVisible: visual ? getComputedStyle(visual).display !== 'none' : false,
      fotos: fotos.length,
      fotosCargadas: fotos.filter((i) => i.complete && i.naturalWidth > 0).length,
      sello: sello ? (sello.textContent || '').trim() : '',
      anchoVisual: rVis ? Math.round(rVis.width) : 0,
      anchoHero: Math.round(rEn.width),
      txtAncho: Math.round(txt.getBoundingClientRect().width),
      desbordeHero: Math.round(rEn.right - (rEn.left + rEn.width))
    };
  })()`);
  chk('el hero se compone en dos columnas', heroEscritorio.columnas === 2, heroEscritorio.columnas + ' columnas');
  chk('la composición visual es visible', heroEscritorio.visualVisible === true);
  chk('la mitad derecha no está vacía', heroEscritorio.anchoVisual > heroEscritorio.anchoHero * 0.35,
    heroEscritorio.anchoVisual + 'px de ' + heroEscritorio.anchoHero + 'px');
  chk('la composición usa las fotos reales del catálogo',
    heroEscritorio.fotos === 2 && heroEscritorio.fotosCargadas === 2,
    heroEscritorio.fotosCargadas + '/' + heroEscritorio.fotos);
  chk('la composición declara los servicios con texto',
    heroEscritorio.sello.indexOf('Streaming') !== -1, heroEscritorio.sello);
  chk('las dos columnas quedan equilibradas',
    Math.abs(heroEscritorio.txtAncho - heroEscritorio.anchoVisual) < heroEscritorio.anchoHero * 0.25,
    'texto ' + heroEscritorio.txtAncho + 'px · visual ' + heroEscritorio.anchoVisual + 'px');

  /* ============ 10. Siete resoluciones oficiales ============ */
  console.log('\n== 10. Siete resoluciones oficiales =====');
  const medidas = [];

  for (const r of RESOLUCIONES) {
    await metricas(r.ancho, r.alto);
    await irAlCatalogo();
    const m = await js(MEDIR);

    chk(r.nombre + ': sin desbordamiento horizontal', m.desborde <= m.ancho, m.desborde + 'px / ' + m.ancho + 'px');
    chk(r.nombre + ': rejilla en ' + r.columnas + ' columna(s)', m.columnas === r.columnas, m.columnas + ' columnas');
    chk(r.nombre + ': catálogo completo', m.tarjetas === totalEsperado, m.tarjetas + '/' + totalEsperado);
    chk(r.nombre + ': sin tarjetas solapadas', m.solapes === 0, m.solapes + ' solapes');
    chk(r.nombre + ': la tarjeta conserva ancho útil', m.anchoTarjeta >= 240, m.anchoTarjeta + 'px');
    chk(r.nombre + ': el título no queda bajo la cabecera',
      m.tituloBajoCabecera !== null && m.tituloBajoCabecera > 0, m.tituloBajoCabecera + 'px');

    const destino = path.join(ROOT, 'capturas', 'responsive', r.nombre + '.png');
    const bytes = await captura(destino);
    chk(r.nombre + ': captura generada', bytes > 5000, (bytes / 1024).toFixed(0) + ' KB');

    /* El flotante se comprueba en dos puntos deterministas: donde debe verse
       (Servicios) y donde debe esconderse (catálogo, para no tapar fichas). */
    await js("document.querySelector('#servicios').scrollIntoView({ behavior: 'instant', block: 'start' })");
    await dormir(420);
    const fabServ = await js(FAB);
    chk(r.nombre + ': el flotante aparece fuera del catálogo y no tapa controles',
      fabServ.visible === true && fabServ.choques.length === 0,
      fabServ.visible ? (fabServ.choques.join(', ') || 'sin solapes') : 'no apareció');
    chk(r.nombre + ': el flotante respeta márgenes y áreas seguras',
      fabServ.visible === true && fabServ.rect.left > 0 && fabServ.rect.top > 0 &&
      fabServ.rect.right <= fabServ.anchoVista + 1 && fabServ.rect.bottom <= fabServ.altoVista + 1,
      fabServ.visible ? JSON.stringify(fabServ.rect) : 'no apareció');

    await js("document.querySelector('#catalogo').scrollIntoView({ behavior: 'instant', block: 'start' })");
    await dormir(420);
    chk(r.nombre + ': el flotante no se superpone al catálogo',
      (await js(FAB)).visible === false);

    medidas.push({ resolucion: r.nombre, ...m, captura: 'capturas/responsive/' + r.nombre + '.png' });
  }

  /* Captura oficial de móvil (375×667) */
  await metricas(375, 667);
  await irAlCatalogo();
  const bytesMovil = await captura(path.join(ROOT, 'capturas', 'redcalinet-catalogo-movil.png'));
  chk('captura oficial de móvil 375×667', bytesMovil > 5000, (bytesMovil / 1024).toFixed(0) + ' KB');

  /* ============ 11. Sin errores de JavaScript ============ */
  console.log('\n== 11. Consola ==========================');
  chk('no hubo excepciones en la página', excepciones.length === 0,
    excepciones.length ? JSON.stringify(excepciones.slice(0, 3)) : 'ninguna');

  /* ============ Informe ============ */
  const informe = {
    mision: 'KZ-REDCALINET-006',
    fecha: new Date().toISOString(),
    url: sitio,
    resoluciones: medidas,
    contraste: contrastes,
    pruebas: resultados,
    resumen: { total: ok + fail, pasa: ok, falla: fail }
  };
  fs.mkdirSync(path.join(ROOT, 'capturas'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'capturas', 'informe-visual.json'),
    JSON.stringify(informe, null, 2),
    'utf8'
  );

  try { await fetch(base + '/json/close/' + creado.id); } catch (e) { /* da igual */ }
  cdp.cerrar();
  if (proceso) { try { proceso.kill(); } catch (e) { /* ya cerrado */ } }
  server.close();

  console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
  console.log('  capturas/responsive/*.png (7 resoluciones) e informe: capturas/informe-visual.json');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('ERROR ' + (e && e.message ? e.message : e));
  if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  try { if (cdp) cdp.cerrar(); } catch (x) { /* nada */ }
  server.close();
  process.exit(2);
});
