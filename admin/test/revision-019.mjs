// KZ-REDCALINET-019 — Verificación de las mejoras de usabilidad.
//
// Mide los cuatro arreglos en las seis resoluciones pedidas y deja capturas.
// Sirve igual para el estado «antes» y «después»: lo que no existe se reporta
// como ausente en vez de romper.
//
// Uso (desde admin/): node test/revision-019.mjs antes|despues

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const etiqueta = (process.argv[2] || 'medicion').replace(/[^a-z0-9-]/gi, '');
const BASE = 'http://127.0.0.1:5176';
const salida = fileURLToPath(new URL('../.runtime/screenshots/', import.meta.url));
await fs.mkdir(salida, { recursive: true });

const RESOLUCIONES = [
  { w: 320, h: 640 }, { w: 375, h: 667 }, { w: 390, h: 844 },
  { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1440, h: 900 }
];

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

const irA = async (etiquetaMenu) => {
  if (await pagina.locator('.mobile-menu').isVisible()) {
    await pagina.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
  }
  await pagina.locator('.sidebar nav').getByRole('button', { name: etiquetaMenu, exact: true }).click();
  await pagina.locator('.loading').waitFor({ state: 'hidden' }).catch(() => {});
  await pagina.waitForTimeout(700);
  if (await pagina.locator('.sidebar.open').count()) {
    await pagina.locator('[data-action=close-nav]').click({ force: true }).catch(() => {});
    await pagina.waitForTimeout(200);
  }
};

/* ---------- sesión (SUPERADMIN ve todo) ---------- */
await pagina.goto(BASE + '/admin/', { waitUntil: 'load', timeout: 30000 });
await pagina.locator('#login-form input[name=email]').fill('superadmin@rcl.example.test');
await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
await pagina.locator('.stats').waitFor({ timeout: 20000 });

/* ---------- módulos con tabla ---------- */
const CON_TABLA = ['Productos', 'Servicios', 'Categorías', 'Inventario', 'Promociones', 'Usuarios y permisos'];
const filas = [];

for (const modulo of CON_TABLA) {
  await irA(modulo);
  for (const r of RESOLUCIONES) {
    await pagina.setViewportSize({ width: r.w, height: r.h });
    await pagina.waitForTimeout(320);
    const m = await pagina.evaluate(() => {
      const vis = (el) => !!el && el.offsetParent !== null;
      const th = document.querySelector('.content th');
      const tds = [...document.querySelectorAll('.content tbody tr:first-child td')];
      const botones = [...document.querySelectorAll('.content tbody button')].filter(vis);
      const alturas = botones.map((b) => Math.round(b.getBoundingClientRect().height));
      const anchos = botones.map((b) => Math.round(b.getBoundingClientRect().width));
      const scroll = document.querySelector('.table-scroll');
      const etiquetaCelda = tds.length > 1 ? getComputedStyle(tds[1], '::before') : null;
      const fila = document.querySelector('.content tbody tr');
      return {
        thVisible: vis(th),
        thFuente: th ? parseFloat(getComputedStyle(th).fontSize) : null,
        thColor: th ? getComputedStyle(th).color : null,
        thFondo: th ? getComputedStyle(th).backgroundColor : null,
        celdasVisibles: tds.filter(vis).length,
        modoTarjeta: fila ? getComputedStyle(fila).display === 'block' : null,
        etiquetaVisible: etiquetaCelda ? (etiquetaCelda.content !== 'none' && etiquetaCelda.content !== 'normal' && etiquetaCelda.display !== 'none') : false,
        etiquetaTexto: etiquetaCelda ? etiquetaCelda.content : null,
        minBotonAlto: alturas.length ? Math.min(...alturas) : null,
        minBotonAncho: anchos.length ? Math.min(...anchos) : null,
        desplazamientoInterno: scroll ? scroll.scrollWidth > scroll.clientWidth + 1 : null,
        paginaDesborda: document.documentElement.scrollWidth > window.innerWidth + 1,
        textosCeldas: tds.filter(vis).map((td) => td.textContent.replace(/\s+/g, ' ').trim().slice(0, 26))
      };
    });
    filas.push({ modulo, vista: r.w + 'x' + r.h, ...m });
    if (r.w <= 390) {
      await pagina.screenshot({ path: salida + 'rev019-' + etiqueta + '-' + modulo.toLowerCase().replace(/[^a-z]/g, '') + '-' + r.w + 'x' + r.h + '.png' });
    }
  }
}

/* ---------- auditoría ---------- */
await pagina.setViewportSize({ width: 1440, height: 900 });
await irA('Auditoría');
const audit = await pagina.evaluate(() => {
  const act = [...document.querySelectorAll('.activity')].filter((a) => a.offsetParent !== null);
  const fechas = act.map((a) => (a.textContent.match(/\d{4}-\d{2}-\d{2}T[\d:.-]+Z?/) || [''])[0]).filter(Boolean);
  const ordenDesc = fechas.every((f, i) => i === 0 || String(fechas[i - 1]).localeCompare(String(f)) >= 0);
  const pager = document.querySelector('.pager');
  const botones = [...document.querySelectorAll('.pager button, .pager-mas button')];
  return {
    entradas: act.length,
    pagerPresente: !!pager,
    pagerTexto: pager ? pager.textContent.replace(/\s+/g, ' ').trim() : null,
    botonAnteriorDeshabilitado: botones.length ? botones[0].disabled : null,
    botonesPaginador: botones.map((b) => b.textContent.trim() + (b.disabled ? ' (deshabilitado)' : '')),
    ordenDescendente: ordenDesc,
    camposVisibles: act.length ? {
      operacion: /^[A-ZÁÉÍÓÚ_]+$/.test((act[0].querySelector('strong')?.textContent || '').trim()),
      registro: /\/ .+ ·/.test(act[0].textContent),
      fecha: fechas.length > 0,
      actor: /Usuario:/.test(act[0].textContent)
    } : null
  };
});

/* paginación: pasar a la segunda página y comprobar que cambian los registros */
let segunda = null;
if (audit.pagerPresente) {
  const antes = await pagina.locator('.activity').first().innerText();
  const siguiente = pagina.locator('.pager button').nth(1);
  if (await siguiente.isEnabled()) {
    await siguiente.click();
    await pagina.waitForTimeout(400);
    const despues = await pagina.locator('.activity').first().innerText();
    segunda = { cambiaContenido: antes !== despues, entradas: await pagina.locator('.activity').count() };
    await pagina.locator('.pager button').first().click();
    await pagina.waitForTimeout(300);
  }
}
await pagina.screenshot({ path: salida + 'rev019-' + etiqueta + '-auditoria-1440x900.png' });
await pagina.setViewportSize({ width: 390, height: 844 });
await pagina.waitForTimeout(300);
await pagina.screenshot({ path: salida + 'rev019-' + etiqueta + '-auditoria-390x844.png' });

/* ---------- teclado: llegar al paginador con Tab real ---------- */
await pagina.setViewportSize({ width: 1440, height: 900 });
await pagina.locator('body').click({ position: { x: 4, y: 4 } });
const teclado = { alcanzado: null, focoVisible: false, pasos: 0 };
for (let i = 1; i <= 40; i++) {
  await pagina.keyboard.press('Tab');
  const actual = await pagina.evaluate(() => {
    const a = document.activeElement;
    return a ? { texto: (a.textContent || '').trim().slice(0, 30), enPaginador: !!a.closest('.pager') } : null;
  });
  teclado.pasos = i;
  if (actual && actual.enPaginador) {
    teclado.alcanzado = actual.texto;
    teclado.focoVisible = await pagina.evaluate(() => {
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      return a.matches(':focus-visible') && (cs.outlineStyle !== 'none' || cs.boxShadow !== 'none');
    });
    break;
  }
}

/* ---------- contraste del encabezado de tabla ---------- */
await irA('Productos');
const contrasteTh = await pagina.evaluate(() => {
  const th = document.querySelector('.content th');
  const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const cs = getComputedStyle(th);
  const a = lum(rgb(cs.color)), b = lum(rgb(cs.backgroundColor));
  return { fuente: parseFloat(cs.fontSize), color: cs.color, fondo: cs.backgroundColor, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
});

/* ---------- roles intactos ---------- */
await pagina.evaluate(() => document.querySelector('[data-action=logout]')?.click());
await pagina.locator('#login-form').waitFor({ timeout: 15000 });
await pagina.locator('#login-form input[name=email]').fill('admin@rcl.example.test');
await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
await pagina.locator('.stats').waitFor({ timeout: 20000 });
const roles = await pagina.evaluate(() => ({
  entradas: [...document.querySelectorAll('.sidebar nav button')].map((b) => b.textContent.trim().replace(/^[^\wÁÉÍÓÚáéíóú]+/, '')),
  veUsuarios: /Usuarios y permisos/.test(document.querySelector('.sidebar nav').textContent),
  veAuditoria: /Auditoría/.test(document.querySelector('.sidebar nav').textContent),
  rol: document.querySelector('.sidebar .badge')?.textContent.trim()
}));

await navegador.close();

/* ---------- salida ---------- */
console.log('\n=== ' + etiqueta.toUpperCase() + ' — tablas ===');
console.log('módulo'.padEnd(22) + 'vista'.padEnd(11) + 'modo'.padEnd(9) + 'th'.padEnd(6) + 'etiqueta'.padEnd(10) + 'botón'.padEnd(14) + 'desborda');
for (const f of filas) {
  console.log(
    f.modulo.padEnd(22) + f.vista.padEnd(11) +
    (f.modoTarjeta ? 'tarjeta' : 'tabla').padEnd(9) +
    String(f.thFuente).padEnd(6) +
    (f.etiquetaVisible ? 'sí' : 'no').padEnd(10) +
    (f.minBotonAlto + 'x' + f.minBotonAncho).padEnd(14) +
    (f.paginaDesborda ? 'SÍ' : 'no')
  );
}

console.log('\n=== ' + etiqueta.toUpperCase() + ' — auditoría ===');
console.log('  entradas visibles: ' + audit.entradas);
console.log('  paginador: ' + (audit.pagerPresente ? '"' + audit.pagerTexto + '"' : 'AUSENTE'));
console.log('  orden descendente por fecha: ' + (audit.ordenDescendente ? 'sí' : 'no'));
console.log('  campos por entrada: ' + JSON.stringify(audit.camposVisibles));
console.log('  segunda página: ' + JSON.stringify(segunda));
console.log('  teclado (Tab real hasta el paginador): ' + JSON.stringify(teclado));
console.log('  contraste del encabezado: ' + JSON.stringify(contrasteTh));
console.log('\n=== roles ===');
console.log('  ' + JSON.stringify(roles));
console.log('\n  excepciones JS: ' + (errores.length ? errores.join(' | ') : 'ninguna'));

await fs.writeFile(new URL('../.runtime/revision-019-' + etiqueta + '.json', import.meta.url),
  JSON.stringify({ etiqueta, filas, audit, segunda, teclado, contrasteTh, roles, errores }, null, 2));
process.exit(0);
