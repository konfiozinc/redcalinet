'use strict';
/* ============================================================
 * Comparativa visual antes/después (navegador real, por CDP)
 * ------------------------------------------------------------
 * Sirve un árbol cualquiera (el actual o una copia de otra revisión) y, en
 * las siete resoluciones oficiales, mide la geometría y la tipografía que
 * definen el aspecto del catálogo, y guarda una captura de cada una.
 *
 * Uso:
 *   node tools/comparar-visual.js --raiz <carpeta> --etiqueta "ANTES" \
 *     --capturas capturas/comparativa/antes --salida <archivo.txt> [--anexar]
 *
 * No ejecuta aserciones: mide. Las aserciones viven en test-catalogo-dom.js.
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const opcion = (n, d) => {
  const i = args.indexOf('--' + n);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};

const RAIZ = path.resolve(opcion('raiz', path.resolve(__dirname, '..')));
const ETIQUETA = opcion('etiqueta', 'ÁRBOL');
const CAPTURAS = path.resolve(opcion('capturas', path.join(RAIZ, 'capturas', 'comparativa')));
const PORT = Number(opcion('puerto', 5187));

const RESOLUCIONES = [
  { ancho: 320, alto: 640, nombre: '320x640' },
  { ancho: 360, alto: 640, nombre: '360x640' },
  { ancho: 375, alto: 667, nombre: '375x667' },
  { ancho: 390, alto: 844, nombre: '390x844' },
  { ancho: 768, alto: 1024, nombre: '768x1024' },
  { ancho: 1024, alto: 768, nombre: '1024x768' },
  { ancho: 1440, alto: 900, nombre: '1440x900' }
];

const LINEAS = [];
const imprimir = console.log.bind(console);
const decir = (t) => { LINEAS.push(t); imprimir(t); };

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const abs = path.join(RAIZ, ruta);
  if (!abs.startsWith(RAIZ)) { res.writeHead(403); return res.end('no'); }
  fs.readFile(abs, (e, b) => {
    if (e) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(b);
  });
});

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pend = new Map(); this.oyentes = new Map();
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id && this.pend.has(m.id)) {
        const p = this.pend.get(m.id); this.pend.delete(m.id);
        if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
        return;
      }
      (this.oyentes.get(m.method) || []).forEach((cb) => cb(m.params));
    });
  }
  enviar(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pend.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pend.has(id)) { this.pend.delete(id); rej(new Error('CDP sin respuesta: ' + method)); }
      }, 30000);
    });
  }
  al(m, cb) { if (!this.oyentes.has(m)) this.oyentes.set(m, []); this.oyentes.get(m).push(cb); }
  cerrar() { try { this.ws.close(); } catch (e) { /* nada */ } }
}

function conectar(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => res(new CDP(ws)));
    ws.addEventListener('error', () => rej(new Error('WebSocket CDP no disponible: ' + url)));
  });
}

async function abrirNavegador() {
  const externo = process.env.KZ_CDP_URL || '';
  if (externo) return { base: externo.replace(/\/+$/, ''), proceso: null };

  const exe = process.env.KZ_CHROME || path.join(
    process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium_headless_shell-1243',
    'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  if (!fs.existsSync(exe)) throw new Error('No encuentro Chromium en ' + exe);

  const puerto = Number(process.env.KZ_CDP_PORT || 9335);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-cmp-'));
  const log = path.join(perfil, 'nav.log');
  const fd = fs.openSync(log, 'w');
  const proceso = spawn(exe, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-allow-origins=*', '--noerrdialogs', '--disable-breakpad',
    '--disable-crash-reporter', '--disable-features=Crashpad',
    '--remote-debugging-port=' + puerto, '--user-data-dir=' + perfil, 'about:blank'
  ], { stdio: ['ignore', fd, fd] });

  const base = 'http://127.0.0.1:' + puerto;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/json/version'); if (r.ok) return { base, proceso }; } catch (e) { /* arrancando */ }
    await dormir(250);
  }
  try { proceso.kill(); } catch (e) { /* nada */ }
  throw new Error('El navegador no abrió CDP en ' + base);
}

const MEDIR = `(() => {
  const grid = document.querySelector('#catGrid');
  const tarjetas = Array.from(document.querySelectorAll('#catGrid .ficha--producto'));
  const cajas = tarjetas.map((t) => t.getBoundingClientRect());
  const primera = tarjetas[0] || null;
  const h4 = primera ? primera.querySelector('h4') : null;
  const precio = primera ? primera.querySelector('.ficha__precio') : null;
  const portadas = { foto: 0, grafica: 0, icono: 0 };
  tarjetas.forEach((t) => {
    if (t.querySelector('.ficha__media img')) portadas.foto++;
    else if (t.querySelector('.ficha__portada')) portadas.grafica++;
    else portadas.icono++;
  });
  const hero = document.querySelector('.hero');
  return {
    desborde: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
    columnas: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    tarjetas: tarjetas.length,
    anchoTarjeta: cajas.length ? Math.round(cajas[0].width) : 0,
    altoTarjeta: cajas.length ? Math.round(cajas[0].height) : 0,
    tituloPx: h4 ? getComputedStyle(h4).fontSize : null,
    precioPx: precio ? getComputedStyle(precio).fontSize : null,
    precioColor: precio ? getComputedStyle(precio).color : null,
    portadas: portadas,
    heroAlto: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
    heroContacto: Boolean(document.querySelector('.hero__contacto')),
    tipos: document.querySelectorAll('#catGrid .ficha__tipo').length
  };
})()`;

(async () => {
  await new Promise((r) => servidor.listen(PORT, '127.0.0.1', r));
  const sitio = 'http://127.0.0.1:' + PORT + '/';
  const { base, proceso } = await abrirNavegador();
  const creado = await (await fetch(base + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' })).json();
  const cdp = await conectar(creado.webSocketDebuggerUrl);

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Network.enable');
  await cdp.enviar('Network.setBlockedURLs', { urls: ['*firebasejs*', '*firebase-config*'] });

  const js = async (expresion) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expresion, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('Fallo en página: ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result ? r.result.value : undefined;
  };

  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
  await cdp.enviar('Page.navigate', { url: sitio });

  const limite = Date.now() + 20000;
  while (Date.now() < limite) {
    if (await js("document.readyState === 'complete'")) break;
    await dormir(150);
  }
  const limite2 = Date.now() + 15000;
  while (Date.now() < limite2) {
    if (await js("document.querySelectorAll('#catGrid .ficha--producto').length > 0")) break;
    await dormir(150);
  }

  fs.mkdirSync(CAPTURAS, { recursive: true });

  decir('============================================================');
  decir(' COMPARATIVA VISUAL · ' + ETIQUETA);
  decir(' árbol: ' + RAIZ);
  decir('============================================================');
  decir('');
  decir('resolución  cols  tarjeta  título  precio             portadas (foto/graf/icono)  hero   tipos');
  decir('---------------------------------------------------------------------------------------------------');

  const filas = [];
  for (const r of RESOLUCIONES) {
    await cdp.enviar('Emulation.setDeviceMetricsOverride', {
      width: r.ancho, height: r.alto, deviceScaleFactor: 1, mobile: r.ancho < 768
    });
    await dormir(420);
    await js("document.querySelector('#catalogo').scrollIntoView({ behavior: 'instant', block: 'start' })");
    await dormir(260);

    const m = await js(MEDIR);
    filas.push(Object.assign({ resolucion: r.nombre }, m));

    decir(
      r.nombre.padEnd(12) +
      String(m.columnas).padEnd(6) +
      (m.anchoTarjeta + 'px').padEnd(9) +
      String(m.tituloPx).padEnd(8) +
      (String(m.precioPx) + ' ' + String(m.precioColor)).padEnd(19) +
      (m.portadas.foto + '/' + m.portadas.grafica + '/' + m.portadas.icono).padEnd(27) +
      (m.heroAlto + 'px').padEnd(7) +
      m.tipos
    );

    const captura = await cdp.enviar('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(CAPTURAS, r.nombre + '.png'), Buffer.from(captura.data, 'base64'));
  }

  decir('');
  decir('capturas: ' + CAPTURAS);

  const json = {
    etiqueta: ETIQUETA,
    raiz: RAIZ,
    fecha: new Date().toISOString(),
    resoluciones: filas
  };
  fs.writeFileSync(path.join(CAPTURAS, 'medidas.json'), JSON.stringify(json, null, 2), 'utf8');

  const salida = opcion('salida', null);
  if (salida) {
    const destino = path.resolve(salida);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const texto = LINEAS.join('\n') + '\n\n';
    if (args.indexOf('--anexar') !== -1) fs.appendFileSync(destino, texto, 'utf8');
    else fs.writeFileSync(destino, texto, 'utf8');
    imprimir('(evidencia: ' + destino + ')');
  }

  try { await fetch(base + '/json/close/' + creado.id); } catch (e) { /* nada */ }
  cdp.cerrar();
  if (proceso) { try { proceso.kill(); } catch (e) { /* nada */ } }
  servidor.close();
  process.exit(0);
})().catch((e) => {
  console.error('ERROR ' + (e && e.message ? e.message : e));
  servidor.close();
  process.exit(1);
});
