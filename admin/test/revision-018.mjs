// KZ-REDCALINET-018 — Revisión visual y funcional del panel completo.
//
// Recorre los doce módulos del menú con sesión iniciada, mide cada uno en tres
// resoluciones, captura todo y después ejecuta el recorrido funcional pedido
// (crear, editar, publicar, ocultar) comprobando el catálogo del emulador.
//
// No modifica nada de la interfaz: es misión de revisión.
// Uso (desde admin/): node test/revision-018.mjs

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:5176';
const PANEL = BASE + '/admin/';
const salida = fileURLToPath(new URL('../.runtime/screenshots/', import.meta.url));
await fs.mkdir(salida, { recursive: true });

const MODULOS = [
  ['Dashboard', 'dashboard'],
  ['Productos', 'productos'],
  ['Servicios', 'servicios'],
  ['Categorías', 'categorias'],
  ['Inventario', 'inventario'],
  ['Promociones', 'promociones'],
  ['Biblioteca multimedia', 'multimedia'],
  ['Solicitudes y cotizaciones', 'solicitudes'],
  ['Configuración empresarial', 'configuracion'],
  ['Redes sociales', 'redes'],
  ['Usuarios y permisos', 'usuarios'],
  ['Auditoría', 'auditoria']
];
const RESOLUCIONES = [
  { w: 1440, h: 900, clave: 'escritorio' },
  { w: 768, h: 1024, clave: 'tableta' },
  { w: 390, h: 844, clave: 'movil' }
];

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', timezoneId: 'America/Bogota' });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

const abrirMenuSiHaceFalta = async () => {
  if (await pagina.locator('.mobile-menu').isVisible()) {
    await pagina.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
    await pagina.locator('.sidebar.open').waitFor({ timeout: 5000 }).catch(() => {});
  }
};
const cerrarMenuSiAbierto = async () => {
  if (await pagina.locator('.sidebar.open').count()) {
    await pagina.locator('[data-action=close-nav]').click({ force: true }).catch(() => {});
    await pagina.waitForTimeout(200);
  }
};
async function irA(etiqueta) {
  await abrirMenuSiHaceFalta();
  await pagina.locator('.sidebar nav').getByRole('button', { name: etiqueta, exact: true }).click();
  await pagina.locator('.loading').waitFor({ state: 'hidden' }).catch(() => {});
  await pagina.waitForTimeout(800);
}

/* ---------- sesión ---------- */
await pagina.goto(PANEL, { waitUntil: 'load', timeout: 30000 });
await pagina.locator('#login-form input[name=email]').fill('superadmin@rcl.example.test');
await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
await pagina.locator('.stats').waitFor({ timeout: 20000 });

const sesion = await pagina.evaluate(() => ({
  rol: document.querySelector('.sidebar .badge')?.textContent.trim(),
  cuenta: document.querySelector('.sidebar .identity')?.textContent.replace(/\s+/g, ' ').trim(),
  entradas: [...document.querySelectorAll('.sidebar nav button')].map((b) => b.textContent.trim())
}));
console.log('== Sesión ==');
console.log('  rol: ' + sesion.rol + ' · cuenta: ' + sesion.cuenta);
console.log('  entradas del menú (' + sesion.entradas.length + '): ' + sesion.entradas.join(' · '));

/* ---------- recorrido de módulos ---------- */
const inventario = [];
const problemas = [];

for (const [etiqueta, clave] of MODULOS) {
  await irA(etiqueta);
  const ficha = { etiqueta, clave, resoluciones: {}, problemas: [] };

  for (const r of RESOLUCIONES) {
    await pagina.setViewportSize({ width: r.w, height: r.h });
    await pagina.waitForTimeout(350);
    await cerrarMenuSiAbierto();
    const m = await pagina.evaluate(() => {
      const visible = (el) => el && el.offsetParent !== null;
      const texto = (sel) => { const el = document.querySelector(sel); return visible(el) ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
      const cuenta = (sel) => [...document.querySelectorAll(sel)].filter(visible).length;
      const tamanos = [];
      const alertaError = document.querySelector('.content .alert.error, .content [role=alert].alert.error');
      const hayDatos = !!document.querySelector('.content tbody tr') || !!document.querySelector('.content .stat') || !!document.querySelector('.content .media-card') || !!document.querySelector('.content .activity');
      let peor = null;
      for (const el of document.querySelectorAll('.content *')) {
        if (!el.offsetParent || el.children.length || !el.textContent.trim()) continue;
        const f = parseFloat(getComputedStyle(el).fontSize);
        if (!Number.isFinite(f)) continue;
        if (!peor || f < peor.f) peor = { f, clase: String(el.className || el.tagName).slice(0, 40), texto: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 46) };
      }
      return {
        h1: texto('.page-head h1'),
        subtitulo: texto('.page-head p'),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollW: document.documentElement.scrollWidth,
        vw: window.innerWidth,
        filas: cuenta('.content tbody tr'),
        tarjetas: cuenta('.content .stat'),
        medios: cuenta('.content .media-card'),
        actividad: cuenta('.content .activity'),
        botones: cuenta('.content button'),
        campos: cuenta('.content input, .content select'),
        estadoVacio: !hayDatos && /no hay|por ahora|sin registros|vac[íi]o|no se han/i.test(document.querySelector('.content')?.textContent || ''),
        error: alertaError ? alertaError.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : null,
        minFuente: peor ? peor.f : null,
        elementoMinimo: peor,
        altoPagina: document.documentElement.scrollHeight,
        vh: window.innerHeight
      };
    });
    ficha.resoluciones[r.clave] = m;
    if (m.overflow) ficha.problemas.push('desborda a lo ancho en ' + r.clave + ' (' + m.scrollW + ' > ' + m.vw + ')');
    if (!m.h1) ficha.problemas.push('sin titular en ' + r.clave);
    if (m.minFuente !== null && m.minFuente < 10) ficha.problemas.push('texto de ' + m.minFuente + 'px en ' + r.clave);
    if (m.error) ficha.problemas.push('error visible en ' + r.clave + ': "' + m.error + '"');
    await pagina.screenshot({ path: salida + 'rev018-' + clave + '-' + r.clave + '.png' });
  }
  await pagina.setViewportSize({ width: 1440, height: 900 });

  const e = ficha.resoluciones.escritorio;
  console.log('\n== ' + etiqueta + ' ==');
  console.log('  titular: ' + (e.h1 || '—'));
  console.log('  filas ' + e.filas + ' · tarjetas ' + e.tarjetas + ' · medios ' + e.medios + ' · actividad ' + e.actividad + ' · botones ' + e.botones + ' · campos ' + e.campos);
  console.log('  estado vacío: ' + (e.estadoVacio ? 'sí' : 'no') + ' · fuente mínima ' + e.minFuente + 'px ' + (e.elementoMinimo ? '[' + e.elementoMinimo.clase + '] "' + e.elementoMinimo.texto + '"' : '') + ' · alto ' + e.altoPagina + '/' + e.vh);
  if (ficha.problemas.length) { console.log('  PROBLEMAS: ' + ficha.problemas.join(' · ')); problemas.push(...ficha.problemas.map((p) => etiqueta + ': ' + p)); }
  inventario.push(ficha);
}

/* ---------- recorrido funcional ---------- */
console.log('\n== Recorrido funcional (crear, editar, publicar, ocultar) ==');
const pasos = [];
const paso = (nombre, ok, detalle = '') => {
  pasos.push({ nombre, ok, detalle });
  console.log('  ' + (ok ? 'OK    ' : 'FALLA ') + nombre + (detalle ? '  ' + detalle : ''));
  if (!ok) problemas.push('funcional: ' + nombre);
};
const nombre = 'QA revisión 018 ' + Date.now();
const type = (campo, valor) => pagina.locator('#editor-form [name="' + campo + '"]').fill(valor);
const guardar = async () => {
  await pagina.locator('#editor-form').getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await pagina.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
};
const abrirFicha = async (n) => {
  await pagina.locator('[data-search]').fill(n);
  await pagina.waitForTimeout(400);
  await pagina.locator('tbody .row-name').first().click();
  await pagina.getByRole('dialog').waitFor();
};
const catalogoPublico = async () => (await fetch(BASE + '/admin/api/public/catalogo')).json();
const enCatalogo = async (n) => (await catalogoPublico()).productos.some((p) => p.nombre === n);

await irA('Productos');
await pagina.locator('[data-search]').fill('');
await pagina.getByRole('button', { name: '+ Nuevo producto', exact: true }).click();
await pagina.getByRole('dialog').waitFor();
await type('nombre', nombre);
await type('descripcion', 'Producto ficticio de la revisión 018');
await type('precio', '89900');
await type('stock', '1');
await pagina.locator('#editor-form select[name=categoriaId]').selectOption('tecnologia');
await pagina.locator('#editor-form select[name=estado]').selectOption('BORRADOR');
await pagina.locator('#editor-form select[name=disponibilidad]').selectOption('DISPONIBLE');
await guardar();
await pagina.locator('[data-search]').fill(nombre);
await pagina.waitForTimeout(500);
paso('crear: el producto aparece en la tabla', (await pagina.locator('tbody tr').count()) >= 1);
paso('crear: no aparece todavía en el catálogo público', !(await enCatalogo(nombre)));

await abrirFicha(nombre);
await type('precio', '94900');
await guardar();
await pagina.waitForTimeout(600);
const fila = await pagina.locator('tbody').innerText();
paso('editar: el precio nuevo se refleja en la tabla', /94\.900/.test(fila), (fila.split('\n').find((l) => /94\.900/.test(l)) || '').trim());

await abrirFicha(nombre);
await pagina.locator('#editor-form select[name=estado]').selectOption('PUBLICADO');
const sinSello = await guardar().then(() => null).catch((e) => e);
if (sinSello) {
  await pagina.keyboard.press('Escape');
  await pagina.getByRole('dialog').waitFor({ state: 'hidden' }).catch(() => {});
  paso('publicar: sin sello de validación el panel lo impide', true);
} else {
  paso('publicar: sin sello de validación el panel lo impide', false, 'se publicó sin validar');
}
await abrirFicha(nombre);
await pagina.locator('#editor-form select[name=estado]').selectOption('PUBLICADO');
await pagina.locator('#editor-form input[name=validado]').check();
await type('fuenteValidacion', 'Revisión QA 018');
await guardar();
await pagina.waitForTimeout(700);
paso('publicar: el producto queda PUBLICADO', /PUBLICADO/.test(await pagina.locator('tbody').innerText()));
paso('publicar: aparece en el catálogo del emulador', await enCatalogo(nombre));

await abrirFicha(nombre);
await pagina.locator('#editor-form select[name=estado]').selectOption('OCULTO');
await guardar();
await pagina.waitForTimeout(700);
paso('ocultar: desaparece del catálogo del emulador', !(await enCatalogo(nombre)));
paso('ocultar: sigue en el panel como OCULTO', /OCULTO/.test(await pagina.locator('tbody').innerText()));

/* Comprobación por API: la auditoría guarda el id del registro, no su nombre */
const token = await (async () => {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@rcl.example.test', password: 'RCL-Only-QA-2026!', returnSecureToken: true })
  });
  return (await r.json()).idToken;
})();
const api = async (ruta) => (await fetch(BASE + '/admin/api/' + ruta, { headers: { Authorization: 'Bearer ' + token } })).json();
const prodId = ((await api('productos')).items || []).find((p) => p.nombre === nombre)?.id || '';
const entradas = ((await api('auditoria')).items || []).filter((a) => a.registro === prodId);
const delProducto = entradas.length;
const acciones = [...new Set(entradas.map((a) => a.accion))];
paso('auditoría: el producto queda identificado en el API', !!prodId, prodId);

await irA('Auditoría');
await pagina.waitForTimeout(600);
const enPantalla = await pagina.locator('.activity').count();
const entradaProducto = (await pagina.locator('.activity').allInnerTexts()).some((t) => t.includes(prodId) || t.includes('productos'));
paso('auditoría: la vista muestra entradas', enPantalla > 0, enPantalla + ' entradas en pantalla');
paso('auditoría: registra los cambios del producto (comprobado por API)', delProducto >= 4, delProducto + ' entradas: ' + acciones.join(', '));
paso('auditoría: la vista incluye el registro del producto', entradaProducto);
await pagina.screenshot({ path: salida + 'rev018-auditoria-recorrido-escritorio.png' });

/* ---------- mensajes de la aplicación ---------- */
/* 1. Validación nativa: el campo precio tiene min=0, así que el navegador
      bloquea el envío antes de llamar a la API. No es un fallo del panel. */
await irA('Productos');
await pagina.locator('[data-search]').fill(nombre);
await pagina.waitForTimeout(500);
await abrirFicha(nombre);
await type('precio', '-5');
const validez = await pagina.evaluate(() => {
  const i = document.querySelector('#editor-form [name=precio]');
  return { valido: i.validity.valid, minimo: i.getAttribute('min'), mensaje: i.validationMessage };
});
await pagina.locator('#editor-form').getByRole('button', { name: 'Guardar cambios', exact: true }).click();
await pagina.waitForTimeout(1500);
paso('mensajes: un precio fuera de rango lo frena el navegador', !validez.valido && validez.minimo === '0', 'min=' + validez.minimo + ' · "' + validez.mensaje + '"');
paso('mensajes: el formulario sigue abierto y no se guarda', await pagina.locator('[role=dialog]').isVisible());
await pagina.screenshot({ path: salida + 'rev018-validacion-nativa-escritorio.png' });

/* 2. Mensaje de error de la aplicación: publicar sin fuente de validación. */
await pagina.locator('#editor-form [name=precio]').fill('94900');
await pagina.locator('#editor-form select[name=estado]').selectOption('PUBLICADO');
await pagina.locator('#editor-form input[name=validado]').check();
await type('fuenteValidacion', '');
await pagina.locator('#editor-form').getByRole('button', { name: 'Guardar cambios', exact: true }).click();
await pagina.waitForTimeout(2000);
const errorApp = await pagina.evaluate(() => {
  const n = document.querySelector('#form-error');
  return { texto: n ? n.textContent.replace(/\s+/g, ' ').trim() : '', clase: n && n.firstElementChild ? n.firstElementChild.className : '' };
});
paso('mensajes: la app explica el rechazo del servidor', errorApp.texto.length > 10 && /alert error/.test(errorApp.clase), '"' + errorApp.texto + '"');
await pagina.screenshot({ path: salida + 'rev018-error-aplicacion-escritorio.png' });
await pagina.keyboard.press('Escape');
await pagina.getByRole('dialog').waitFor({ state: 'hidden' }).catch(() => {});

/* 3. Confirmación al guardar correctamente. */
await pagina.locator('[data-search]').fill(nombre);
await pagina.waitForTimeout(500);
await abrirFicha(nombre);
await pagina.waitForTimeout(400);
await type('fuenteValidacion', 'Revisión QA 018');
await pagina.locator('#editor-form').getByRole('button', { name: 'Guardar cambios', exact: true }).click();
await pagina.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
await pagina.waitForTimeout(1200);
const confirmacion = await pagina.evaluate(() => {
  const a = document.querySelector('.alert.success, [role=status]');
  return a ? a.textContent.replace(/\s+/g, ' ').trim() : '';
});
paso('mensajes: confirma el guardado', /guardad/i.test(confirmacion), '"' + confirmacion + '"');
await pagina.screenshot({ path: salida + 'rev018-confirmacion-escritorio.png' });

/* ---------- resumen ---------- */
console.log('\n== Resumen ==');
for (const f of inventario) {
  const e = f.resoluciones.escritorio;
  const movil = f.resoluciones.movil;
  const estado = e.error ? 'CON ERROR' : (e.filas || e.tarjetas || e.medios || e.actividad || e.botones) ? 'operativo' : 'sin contenido';
  console.log('  ' + f.etiqueta.padEnd(30) + estado.padEnd(13) + 'filas ' + String(e.filas).padEnd(3) + 'tarjetas ' + String(e.tarjetas).padEnd(3) + 'movil ' + (movil.overflow ? 'DESBORDA' : 'ok'));
}
const funcionales = pasos.filter((p) => p.ok).length;
console.log('\n  pasos funcionales: ' + funcionales + '/' + pasos.length);
console.log('  problemas totales: ' + problemas.length);
console.log('  capturas: admin/.runtime/screenshots/rev018-*.png');
console.log('  excepciones JS: ' + (errores.length ? errores.join(' | ') : 'ninguna'));

await fs.writeFile(new URL('../.runtime/revision-018-resultado.json', import.meta.url), JSON.stringify({ sesion, inventario, pasos, problemas, errores }, null, 2));
await navegador.close();
process.exit(problemas.length ? 1 : 0);
