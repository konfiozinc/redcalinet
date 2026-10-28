// KZ-REDCALINET-016 — Medición y captura del acceso administrativo.
//
// No basta con capturas: este modelo no puede verlas. Así que además de la
// captura, mide en el navegador real lo que el propietario describió como
// defecto: proporción de la tarjeta, tamaño del logotipo, espacio vacío,
// desbordamiento y comodidad táctil. Sirve para comparar antes/después.
//
// Uso (desde admin/):
//   node test/visual-login-016.mjs antes
//   node test/visual-login-016.mjs despues
//
// Requiere la API en 5176 con el build vigente en admin/dist.

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const etiqueta = (process.argv[2] || 'medicion').replace(/[^a-z0-9-]/gi, '');
const BASE = 'http://127.0.0.1:5176/admin/';
const salida = fileURLToPath(new URL('../.runtime/screenshots/', import.meta.url));
await fs.mkdir(salida, { recursive: true });

const VISTAS = [
  { nombre: '320x640', w: 320, h: 640, clase: 'movil' },
  { nombre: '375x667', w: 375, h: 667, clase: 'movil' },
  { nombre: '390x844', w: 390, h: 844, clase: 'movil' },
  { nombre: '768x1024', w: 768, h: 1024, clase: 'tableta' },
  { nombre: '1024x768', w: 1024, h: 768, clase: 'escritorio' },
  { nombre: '1440x900', w: 1440, h: 900, clase: 'escritorio' },
  { nombre: '1920x1080', w: 1920, h: 1080, clase: 'escritorio' }
];

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const filas = [];
let fallos = 0;

for (const v of VISTAS) {
  const contexto = await navegador.newContext({
    viewport: { width: v.w, height: v.h },
    deviceScaleFactor: 1,          // escala y zoom normales
    reducedMotion: 'reduce'
  });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await pagina.locator('#login-form').waitFor({ timeout: 20000 });
  await pagina.waitForTimeout(250);

  const m = await pagina.evaluate(() => {
    const caja = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // visible de verdad: display:none en un ancestro no cambia el display propio
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), visible: el.offsetParent !== null, fs: parseFloat(cs.fontSize) };
    };
    const correo = document.querySelector('#login-form input[name=email]');
    const boton = document.querySelector('#login-form button.primary');
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      tarjeta: caja('.login-form'),
      marca: caja('.login-brand'),
      logo: caja('.brand-mark'),
      h1: caja('.login-brand h1'),
      h2: caja('.login-form h2'),
      input: correo ? Math.round(correo.getBoundingClientRect().height) : 0,
      boton: boton ? Math.round(boton.getBoundingClientRect().height) : 0,
      tieneFondo: (() => {
        const el = document.querySelector('.login-form');
        if (!el) return false;
        const cs = getComputedStyle(el);
        return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      })()
    };
  });

  const desborda = m.scrollW > m.vw + 1;
  const unaColumna = m.marca === null || m.marca.w === 0 || m.marca.w >= m.vw - 2;
  const alto = m.tarjeta ? m.tarjeta.h : 0;
  const proporcion = m.vh ? alto / m.vh : 0;
  const cabeSinScroll = m.tarjeta ? m.tarjeta.top + alto <= m.vh + 1 : false;

  const problemas = [];
  if (desborda) problemas.push('desborda a lo ancho (' + m.scrollW + ' > ' + m.vw + ')');
  if (!m.tarjeta) problemas.push('no hay tarjeta de acceso');
  if (m.input < 44) problemas.push('campo bajo para tocar (' + m.input + 'px)');
  if (m.boton < 44) problemas.push('botón bajo para tocar (' + m.boton + 'px)');
  if (v.clase === 'movil' && m.logo && (!m.logo.visible || m.logo.w < 40)) problemas.push('logotipo diminuto o ausente (' + m.logo.w + 'px)');
  if (v.clase === 'escritorio' && m.logo && (!m.logo.visible || m.logo.w < 48)) problemas.push('logotipo pequeño en escritorio (' + m.logo.w + 'px)');
  if (v.clase === 'movil' && !cabeSinScroll) problemas.push('el formulario no cabe sin desplazar');
  if (v.clase === 'movil' && !unaColumna) problemas.push('en móvil debería ser una sola columna');
  if (v.clase === 'escritorio' && unaColumna) problemas.push('en escritorio perdió la composición de dos columnas');
  if (v.clase === 'movil' && m.h1 && m.h1.visible) problemas.push('el titular institucional ocupa espacio en móvil');
  if (v.clase === 'escritorio' && m.h1 && !m.h1.visible) problemas.push('el titular institucional desapareció en escritorio');
  if (v.clase === 'escritorio' && m.tarjeta && (m.tarjeta.w < 380 || m.tarjeta.w > 560)) problemas.push('tarjeta fuera de proporción (' + m.tarjeta.w + 'px)');
  if (v.clase === 'movil' && m.tarjeta && m.tarjeta.w < Math.round(m.vw * 0.86)) problemas.push('tarjeta estrecha en móvil (' + m.tarjeta.w + ' de ' + m.vw + ')');
  if (errores.length) problemas.push('excepción JS: ' + errores[0]);

  await pagina.screenshot({ path: salida + 'login-016-' + etiqueta + '-' + v.nombre + '.png' });

  /* El acceso tiene que funcionar, no solo verse: se comprueba una vez por vista
     en las dos más representativas. */
  let entra = null;
  if (v.nombre === '375x667' || v.nombre === '1440x900') {
    await pagina.locator('#login-form input[name=email]').fill('admin@rcl.example.test');
    await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
    await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
    try {
      await pagina.locator('.stats').waitFor({ timeout: 20000 });
      entra = true;
    } catch { entra = false; problemas.push('el acceso no completa el login'); }
  }

  if (problemas.length) fallos++;
  filas.push({
    vista: v.nombre, clase: v.clase, desborda, unaColumna, entra,
    tarjetaW: m.tarjeta ? m.tarjeta.w : 0, tarjetaH: alto,
    tarjetaTop: m.tarjeta ? m.tarjeta.top : 0,
    proporcion: Math.round(proporcion * 100) + '%',
    logo: m.logo ? m.logo.w : 0, h1: m.h1 ? Math.round(m.h1.fs) : 0,
    inputH: m.input, botonH: m.boton, fondo: m.tieneFondo,
    cabeSinScroll, problemas: problemas.join(' · ')
  });
  await contexto.close();
}

/* ---------------------------------------------------------------- */
/* Accesibilidad por teclado: el orden debe ser correo → contraseña →  */
/* entrar → recuperación, y el foco tiene que verse.                   */
/* ---------------------------------------------------------------- */
console.log('\n== Teclado ==');
{
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const pagina = await contexto.newPage();
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await pagina.locator('#login-form').waitFor({ timeout: 20000 });
  await pagina.locator('body').click({ position: { x: 4, y: 4 } });

  const orden = [];
  for (let i = 0; i < 4; i++) {
    await pagina.keyboard.press('Tab');
    orden.push(await pagina.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return 'ninguno';
      return (a.getAttribute('name') || a.textContent || a.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    }));
  }
  const esperado = ['email', 'password', 'Entrar al panel', 'Olvidé mi contraseña'];
  const ordenOk = esperado.every((v, i) => (orden[i] || '').toLowerCase().includes(v.toLowerCase()));
  if (ordenOk) console.log('  PASA   el orden de tabulación es correo → contraseña → entrar → recuperación');
  else { fallos++; console.log('  **FALLA** orden de tabulación: ' + orden.join(' → ')); }

  const foco = await pagina.evaluate(() => {
    const el = document.querySelector('#login-form input[name=email]');
    el.focus();
    const cs = getComputedStyle(el);
    return { anillo: cs.boxShadow !== 'none', borde: cs.borderColor };
  });
  if (foco.anillo) console.log('  PASA   el campo enfocado muestra anillo visible (' + foco.borde + ')');
  else { fallos++; console.log('  **FALLA** el campo enfocado no muestra anillo'); }

  await pagina.screenshot({ path: salida + 'login-016-' + etiqueta + '-foco-teclado.png' });
  await contexto.close();
}

/* ---------------------------------------------------------------- */
/* Contraste WCAG: lo que un modelo sin visión puede comprobar de la   */
/* legibilidad. AA exige 4.5 en texto normal y 3.0 en texto grande.    */
/* ---------------------------------------------------------------- */
console.log('\n== Contraste ==');
{
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const pagina = await contexto.newPage();
  await pagina.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await pagina.locator('#login-form').waitFor({ timeout: 20000 });

  const pares = await pagina.evaluate(() => {
    const rgb = (s) => { const m = (s || '').match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : null; };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fondoReal = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        const c = cs.backgroundColor;
        const p = rgb(c);
        const transparente = !p || /^rgba\(\d+, ?\d+, ?\d+, ?0\)$/.test(c);
        if (p && !transparente) return p;
        // El panel de marca usa degradado: se aproxima por su color base #0f2c50.
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return [15, 44, 80];
        n = n.parentElement;
      }
      return [243, 247, 252];
    };
    const mide = (sel, etiqueta, grande) => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) return null;
      const cs = getComputedStyle(el);
      const a = lum(rgb(cs.color)), b = lum(fondoReal(el));
      const ratio = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      return { etiqueta, ratio, minimo: grande ? 3 : 4.5, ok: ratio >= (grande ? 3 : 4.5) };
    };
    return [
      mide('.login-brand h1', 'titular institucional (grande)', true),
      mide('.login-brand p', 'texto de la marca', false),
      mide('.login-brand .brand', 'nombre Red CaliNet (marca)', true),
      mide('.login-brand>small', 'pie de la marca', false),
      mide('.login-form h2', 'saludo del formulario (grande)', true),
      mide('.login-form .dim', 'texto de ayuda', false),
      mide('.login-form .eyebrow', 'antetítulo ACCESO', false),
      mide('#login-form input[name=email]', 'texto del campo', false),
      mide('#login-form button.primary', 'botón Entrar (grande)', true),
      mide('.login-form>.muted-button', 'recuperación de contraseña', false),
      mide('.login-footer', 'pie del acceso', false)
    ].filter(Boolean);
  });

  for (const p of pares) {
    const linea = '  ' + p.etiqueta.padEnd(34) + String(p.ratio).padStart(5) + ':1  (mín ' + p.minimo + ')';
    if (p.ok) console.log('  PASA ' + linea);
    else { fallos++; console.log('  **FALLA** ' + linea); }
  }
  await contexto.close();
}

await navegador.close();

console.log('\n=== ' + etiqueta.toUpperCase() + ' ===');
for (const f of filas) {
  console.log(
    f.vista.padEnd(10) +
    (f.desborda ? 'DESBORDA' : 'ok').padEnd(9) +
    (f.unaColumna ? '1 col' : '2 col').padEnd(7) +
    ('tarjeta ' + f.tarjetaW + 'x' + f.tarjetaH).padEnd(18) +
    ('top ' + f.tarjetaTop).padEnd(9) +
    ('alto/vh ' + f.proporcion).padEnd(12) +
    ('logo ' + f.logo).padEnd(9) +
    ('h1 ' + f.h1).padEnd(8) +
    ('campo ' + f.inputH).padEnd(11) +
    ('botón ' + f.botonH).padEnd(12) +
    (f.fondo ? 'tarjeta con fondo' : 'SIN fondo') +
    (f.entra === null ? '' : (f.entra ? ' · login ok' : ' · LOGIN FALLA'))
  );
  if (f.problemas) console.log('           ↳ ' + f.problemas);
}
console.log('\nproblemas detectados (vistas + teclado + contraste): ' + fallos);
console.log('capturas: admin/.runtime/screenshots/login-016-' + etiqueta + '-*.png');
process.exit(0);
