// KZ-REDCALINET-037 — Auditoría medible del diseño del panel.
//
// Las capturas de pantalla las revisa una persona; esta prueba mide lo que una
// captura no garantiza: tamaño real de las zonas táctiles, columnas de la
// rejilla de miniaturas, contraste del texto sobre su fondo, que la barra de
// acciones siga visible al desplazar el formulario y que nada desborde.
//
// Uso (desde redcalinet/admin-worker, con `wrangler dev` y los emuladores):
//   node test/diseno-037.mjs

import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../admin/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const WORKER = 'http://127.0.0.1:8787';
const comprobaciones = [];
const fallos = [];
const chk = async (nombre, fn) => {
  try { await fn(); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); }
  catch (e) { fallos.push(nombre + ' (' + (e?.message || e) + ')'); console.log('  **FALLA** ' + nombre + '  →  ' + (e?.message || e)); }
};

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});

async function entrar(p) {
  await p.goto(WORKER + '/admin/', { waitUntil: 'load', timeout: 30000 });
  await p.locator('#login-form input[name=email]').fill('superadmin@rcl.example.test');
  await p.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
  await p.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await p.locator('.stats').waitFor({ timeout: 25000 });
}

/* ---------- móvil 375x667 ---------- */
const movil = await (await navegador.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' })).newPage();
await entrar(movil);

console.log('== Móvil 375×667 ==');
await chk('ninguna zona táctil del menú mide menos de 44 px de alto', async () => {
  await movil.locator('.mobile-menu').click();
  await movil.locator('.sidebar.open').waitFor();
  const chicas = await movil.evaluate(() => [...document.querySelectorAll('.sidebar nav button')]
    .map((b) => ({ texto: b.innerText.trim(), alto: Math.round(b.getBoundingClientRect().height) }))
    .filter((x) => x.alto < 44));
  if (chicas.length) throw new Error(JSON.stringify(chicas.slice(0, 3)));
});
await chk('el menú abierto no tapa la pantalla completa ni desborda', async () => {
  const caja = await movil.locator('.sidebar.open').boundingBox();
  if (caja.width > 260) throw new Error('el menú mide ' + Math.round(caja.width) + ' px de ancho');
  if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde con el menú abierto');
  // Se toca la zona del velo que queda libre, a la derecha del menú.
  await movil.locator('.overlay').click({ position: { x: 340, y: 300 } });
  await movil.waitForTimeout(300);
});

await chk('la rejilla de fotografías tiene al menos dos columnas y miniaturas de 90 px', async () => {
  await movil.locator('.mobile-menu').click();
  await movil.locator('.sidebar nav').getByRole('button', { name: 'Productos', exact: true }).click();
  await movil.waitForTimeout(500);
  await movil.locator('.row-name').first().click();
  await movil.locator('#editor-form').waitFor();
  await movil.waitForTimeout(400);
  const m = await movil.evaluate(() => {
    const rejilla = document.querySelector('.media-selector .picker-grid');
    if (!rejilla) return null;
    const estilo = getComputedStyle(rejilla).gridTemplateColumns.split(' ').filter(Boolean).length;
    const item = rejilla.querySelector('.picker-item');
    return { columnas: estilo, ancho: item ? Math.round(item.getBoundingClientRect().width) : 0 };
  });
  if (!m) throw new Error('no hay rejilla de miniaturas');
  if (m.columnas < 2) throw new Error('solo ' + m.columnas + ' columna(s)');
  if (m.ancho < 90) throw new Error('miniatura de ' + m.ancho + ' px');
});
await chk('el formulario va por secciones, con el precio dentro de las tres primeras', async () => {
  const secciones = (await movil.locator('#editor-form .form-section h3').allInnerTexts()).map((t) => t.trim());
  if (secciones.length < 4) throw new Error('solo ' + secciones.length + ' secciones');
  const precio = secciones.findIndex((t) => /Precio/.test(t));
  if (precio < 0 || precio > 2) throw new Error('el precio queda en la sección ' + (precio + 1));
});
await chk('los campos del formulario se pueden tocar cómodamente (≥44 px)', async () => {
  const bajos = await movil.evaluate(() => [...document.querySelectorAll('#editor-form input:not([type=checkbox]),#editor-form select,#editor-form textarea')]
    .map((c) => ({ campo: c.name || c.type, alto: Math.round(c.getBoundingClientRect().height) }))
    .filter((x) => x.alto < 40));
  if (bajos.length) throw new Error(JSON.stringify(bajos.slice(0, 4)));
});
await chk('la barra de acciones sigue visible al desplazar el formulario', async () => {
  const modal = movil.locator('.modal');
  await modal.evaluate((n) => { n.scrollTop = Math.round(n.scrollHeight / 2); });
  await movil.waitForTimeout(300);
  const visible = await movil.evaluate(() => {
    const barra = document.querySelector('#editor-form .fixed-actions');
    const cajaModal = document.querySelector('.modal').getBoundingClientRect();
    const cajaBarra = barra.getBoundingClientRect();
    return cajaBarra.bottom <= cajaModal.bottom + 2 && cajaBarra.top < cajaModal.bottom;
  });
  if (!visible) throw new Error('la barra de acciones no queda a la vista al desplazar');
});
await chk('la barra de acciones no se sale del ancho de la pantalla', async () => {
  const caja = await movil.locator('#editor-form .fixed-actions').boundingBox();
  if (caja.width > 375) throw new Error('la barra mide ' + Math.round(caja.width) + ' px');
  const botones = await movil.evaluate(() => [...document.querySelectorAll('#editor-form .fixed-actions button')]
    .map((b) => ({ t: b.innerText.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })));
  for (const b of botones) {
    if (b.h < 40) throw new Error('botón «' + b.t + '» de ' + b.h + ' px de alto');
    if (b.w < 80) throw new Error('botón «' + b.t + '» de ' + b.w + ' px de ancho');
  }
});
await chk('la lista de comprobación se lee en el teléfono (≥11 px y con contraste)', async () => {
  const m = await movil.evaluate(() => {
    const li = document.querySelector('#checklist-vivo li');
    if (!li) return null;
    const e = getComputedStyle(li);
    return { tamano: parseFloat(e.fontSize), color: e.color };
  });
  if (!m) throw new Error('no hay lista de comprobación');
  if (m.tamano < 11) throw new Error('texto de ' + m.tamano + ' px');
  const contraste = await movil.evaluate(() => {
    const li = document.querySelector('#checklist-vivo li');
    const num = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let fondo = li, color = 'rgba(0, 0, 0, 0)';
    while (fondo && (color === 'rgba(0, 0, 0, 0)' || color === 'transparent')) { color = getComputedStyle(fondo).backgroundColor; fondo = fondo.parentElement; }
    const a = lum(num(color)), b = lum(num(getComputedStyle(li).color));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  if (contraste < 4.5) throw new Error('contraste ' + contraste.toFixed(2) + ':1');
});
await chk('móvil: el panel no desborda en ninguna de las secciones principales', async () => {
  await movil.getByRole('button', { name: 'Cerrar formulario' }).click();
  for (const vista of ['Productos', 'Servicios', 'Categorías', 'Inventario', 'Fotografías', 'Videos', 'Configuración empresarial', 'Auditoría']) {
    await movil.locator('.mobile-menu').click();
    await movil.locator('.sidebar nav').getByRole('button', { name: vista, exact: true }).click();
    await movil.waitForTimeout(450);
    if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde en ' + vista);
  }
});

/* ---------- escritorio 1440x900 ---------- */
const escritorio = await (await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
await entrar(escritorio);

console.log('\n== Escritorio 1440×900 ==');
await chk('escritorio: el menú agrupado muestra los cinco grupos', async () => {
  const grupos = (await escritorio.locator('.sidebar .nav-group .nav-label').allInnerTexts()).map((g) => g.trim().toLowerCase());
  if (grupos.length !== 5) throw new Error('hay ' + grupos.length + ' grupos: ' + grupos.join(' | '));
});
await chk('escritorio: la ficha usa dos columnas y no desborda', async () => {
  await escritorio.locator('.sidebar nav').getByRole('button', { name: 'Productos', exact: true }).click();
  await escritorio.waitForTimeout(500);
  await escritorio.locator('.row-name').first().click();
  await escritorio.locator('#editor-form').waitFor();
  await escritorio.waitForTimeout(400);
  const columnas = await escritorio.evaluate(() => {
    const rejilla = document.querySelector('#editor-form .form-grid');
    return rejilla ? getComputedStyle(rejilla).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  });
  if (columnas !== 2) throw new Error('la rejilla tiene ' + columnas + ' columnas');
  if (await escritorio.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde horizontal');
});
await chk('escritorio: las acciones de la fila se ven sin abrir la ficha', async () => {
  const acciones = await escritorio.evaluate(() => [...document.querySelectorAll('#module-content tbody tr')][0]
    ? [...document.querySelectorAll('#module-content tbody tr')][0].querySelectorAll('button').length : 0);
  if (acciones < 2) throw new Error('solo ' + acciones + ' acción(es) por fila');
});

await navegador.close();
console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
process.exit(fallos.length ? 1 : 0);
