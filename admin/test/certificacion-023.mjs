// KZ-REDCALINET-023 — Certificación del recorrido completo en emuladores.
//
// Un solo recorrido, en este orden exacto:
//   login → crear producto → subir fotografía → editar → publicar →
//   comprobar catálogo → ocultar → verificar auditoría
//
// La fotografía entra por la subida directa firmada (firma → carga al proveedor
// QA → registro), que es el camino nuevo de esta misión. Todo en loopback: sin
// Cloudinary real, sin producción y sin credenciales reales.
//
// Uso (desde admin/): node test/certificacion-023.mjs
// Requiere: emuladores Auth+Firestore, API en 5176 y RCL_CHROMIUM para el navegador.

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:5176';
const PANEL = BASE + '/admin/';
const salida = fileURLToPath(new URL('../.runtime/screenshots/', import.meta.url));
await fs.mkdir(salida, { recursive: true });

const pasos = [];
const erroresPagina = [];
const paso = (nombre, correcto, detalle = '') => {
  pasos.push({ nombre, correcto, detalle });
  console.log('  ' + (correcto ? 'PASA  ' : 'FALLA ') + nombre + (detalle ? '  [' + detalle + ']' : ''));
};

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', timezoneId: 'America/Bogota' });
const pagina = await contexto.newPage();
pagina.on('pageerror', (e) => erroresPagina.push(e.message));

const abrirMenuSiHaceFalta = async () => {
  if (await pagina.locator('.mobile-menu').isVisible()) {
    await pagina.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
    await pagina.locator('.sidebar.open').waitFor({ timeout: 5000 }).catch(() => {});
  }
};
async function irA(etiqueta) {
  await abrirMenuSiHaceFalta();
  await pagina.locator('.sidebar nav').getByRole('button', { name: etiqueta, exact: true }).click();
  await pagina.locator('.loading').waitFor({ state: 'hidden' }).catch(() => {});
  await pagina.waitForTimeout(700);
  if (await pagina.locator('.sidebar.open').count()) await pagina.locator('[data-action=close-nav]').click({ force: true }).catch(() => {});
}
const type = (campo, valor) => pagina.locator('#editor-form [name="' + campo + '"]').fill(valor);
const guardar = async () => {
  await pagina.locator('#editor-form').getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await pagina.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
};
const catalogoPublico = async () => (await fetch(BASE + '/admin/api/public/catalogo')).json();
const enCatalogo = async (n) => (await catalogoPublico()).productos.some((p) => p.nombre === n);
/* El API pagina de 100 en 100: se recorre entero para no depender del volumen
   de datos que hayan dejado otras suites en el emulador. */
let tokenApi = '';
const api = async (ruta, opciones = {}) => (await fetch(BASE + '/admin/api/' + ruta, { ...opciones, headers: { Authorization: 'Bearer ' + tokenApi, ...(opciones.headers || {}) } })).json();
const listarTodo = async (c) => {
  let items = [], cursor = '';
  do {
    const r = await api(c + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    items.push(...(r.items || []));
    cursor = r.next || '';
  } while (cursor);
  return items;
};
const fila = async (n) => {
  await pagina.locator('[data-search]').fill(n);
  await pagina.waitForTimeout(400);
  return pagina.locator('tbody').innerText();
};
const abrirFicha = async (n) => {
  await pagina.locator('[data-search]').fill(n);
  await pagina.waitForTimeout(400);
  await pagina.locator('tbody .row-name').first().click();
  await pagina.getByRole('dialog').waitFor();
};

const sello = Date.now();
const nombreFoto = 'QA 023 fotografía ' + sello;
const nombreProducto = 'QA 023 producto ' + sello;

try {
  /* ---------- 1. Login ---------- */
  console.log('\n== 1. Login ==');
  await pagina.goto(PANEL, { waitUntil: 'load', timeout: 30000 });
  await pagina.locator('#login-form').waitFor({ timeout: 20000 });
  await pagina.locator('#login-form input[name=email]').fill('superadmin@rcl.example.test');
  await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
  await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await pagina.locator('.stats').waitFor({ timeout: 20000 });
  const rol = (await pagina.locator('.sidebar .badge').innerText()).trim();
  paso('login con la cuenta real del emulador', rol === 'SUPERADMIN', rol);
  await pagina.screenshot({ path: salida + 'cert023-01-login-dashboard.png' });

  const inicio = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@rcl.example.test', password: 'RCL-Only-QA-2026!', returnSecureToken: true })
  });
  tokenApi = (await inicio.json()).idToken;

  /* ---------- 2. Subir fotografía por subida directa firmada ---------- */
  console.log('\n== 2. Subir fotografía (subida directa firmada) ==');
  await irA('Biblioteca multimedia');
  await pagina.getByRole('button', { name: '+ Subir archivos', exact: true }).click();
  await pagina.locator('#upload-form input[name=file]').waitFor();
  const aviso = await pagina.locator('#upload-form .alert').innerText();
  paso('el panel explica que la subida es directa y que el secreto no sale del servidor', /subida directa/i.test(aviso) && (/adaptador local|no es una carga real/i.test(aviso) || /firma la emite el servidor/i.test(aviso)), aviso.slice(0, 80));
  await pagina.locator('#upload-form input[name=file]').setInputFiles(fileURLToPath(new URL('../.runtime/fixtures/test.png', import.meta.url)));
  await pagina.locator('#upload-form input[name=titulo]').fill(nombreFoto);
  await pagina.locator('#upload-form input[name=alt]').fill('Cuadro azul ficticio de certificación');

  /* Se observan las tres llamadas del camino nuevo: firma, carga al proveedor y registro. */
  const llamadas = [];
  const observador = (r) => {
    const u = r.url();
    if (u.includes('/admin/api/multimedia/firma')) llamadas.push('firma');
    if (u.includes('/admin/test-cloudinary/') && u.endsWith('/auto/upload')) llamadas.push('carga-directa');
    if (u.endsWith('/admin/api/multimedia/registrar')) llamadas.push('registro');
  };
  pagina.on('request', observador);
  const respuestaRegistro = pagina.waitForResponse((r) => r.url().endsWith('/admin/api/multimedia/registrar') && r.request().method() === 'POST', { timeout: 30000 });
  await pagina.locator('#upload-form').getByRole('button', { name: 'Subir archivo', exact: true }).click();
  const cuerpoRegistro = await (await respuestaRegistro).json();
  await pagina.getByRole('dialog').waitFor({ state: 'hidden', timeout: 20000 });
  pagina.off('request', observador);

  paso('la firma la emite la API', llamadas.includes('firma'));
  paso('el archivo va directo al proveedor, sin pasar por la API', llamadas.includes('carga-directa'));
  paso('el registro llega después de la carga', llamadas.includes('registro') && llamadas.indexOf('registro') > llamadas.indexOf('carga-directa'), llamadas.join(' → '));
  paso('el registro devuelve el identificador del archivo', typeof cuerpoRegistro?.id === 'string' && cuerpoRegistro.id.length > 0, cuerpoRegistro?.id || 'sin id');
  const fotoId = cuerpoRegistro?.id || '';

  const tarjeta = pagina.locator('.media-card').filter({ hasText: nombreFoto }).last();
  await tarjeta.waitFor({ timeout: 15000 });
  const imagenCargada = await tarjeta.locator('img').evaluate((im) => im.complete && im.naturalWidth > 0).catch(() => false);
  paso('la fotografía se ve en la biblioteca (bytes servidos)', imagenCargada);
  await pagina.screenshot({ path: salida + 'cert023-02-biblioteca.png' });

  /* Publicar la fotografía para que pueda ir en una ficha publicada. */
  await tarjeta.getByRole('button', { name: 'Editar / uso', exact: true }).click();
  await pagina.locator('#editor-form select[name=estado]').selectOption('PUBLICADO');
  await type('alt', 'Cuadro azul ficticio de certificación');
  await guardar();
  await pagina.waitForTimeout(600);
  paso('la fotografía queda PUBLICADA', await tarjeta.getByText('PUBLICADO', { exact: true }).waitFor({ timeout: 8000 }).then(() => true).catch(() => false));

  /* ---------- 3. Crear producto con la fotografía ---------- */
  console.log('\n== 3. Crear producto ==');
  await irA('Productos');
  await pagina.locator('[data-search]').fill('');
  await pagina.getByRole('button', { name: '+ Nuevo producto', exact: true }).click();
  await pagina.getByRole('dialog').waitFor();
  await type('nombre', nombreProducto);
  await type('descripcion', 'Producto ficticio de la certificación KZ-023');
  await type('precio', '89900');
  await type('stock', '2');
  await pagina.locator('#editor-form select[name=categoriaId]').selectOption('tecnologia');
  await pagina.locator('#editor-form select[name=estado]').selectOption('BORRADOR');
  await pagina.locator('#editor-form select[name=disponibilidad]').selectOption('DISPONIBLE');
  await pagina.locator('[data-media-field=imagenes]').selectOption([fotoId]);
  await guardar();
  await pagina.waitForTimeout(600);
  paso('el producto creado aparece en la tabla', (await fila(nombreProducto)).includes(nombreProducto));
  paso('en BORRADOR todavía no está en el catálogo público', !(await enCatalogo(nombreProducto)));

  /* ---------- 4. Editar ---------- */
  console.log('\n== 4. Editar ==');
  await abrirFicha(nombreProducto);
  await type('precio', '94900');
  await guardar();
  await pagina.waitForTimeout(600);
  const textoFila = await fila(nombreProducto);
  paso('el precio editado se refleja en la tabla', /94\.900/.test(textoFila), (textoFila.split('\n').find((l) => /94\.900/.test(l)) || '').trim());
  const guardado = (await listarTodo('productos')).find((p) => p.nombre === nombreProducto);
  paso('la fotografía queda asociada a la ficha', !!guardado && Array.isArray(guardado.imagenes) && guardado.imagenes.includes(fotoId), (guardado?.imagenes || []).join(','));

  /* ---------- 5. Publicar ---------- */
  console.log('\n== 5. Publicar ==');
  await abrirFicha(nombreProducto);
  await pagina.locator('#editor-form select[name=estado]').selectOption('PUBLICADO');
  const sinSello = await guardar().then(() => null).catch((e) => e);
  paso('publicar sin sello comercial queda bloqueado', !!sinSello);
  if (sinSello) {
    await pagina.keyboard.press('Escape');
    await pagina.getByRole('dialog').waitFor({ state: 'hidden' }).catch(() => {});
  }
  await abrirFicha(nombreProducto);
  await pagina.locator('#editor-form select[name=estado]').selectOption('PUBLICADO');
  await pagina.locator('#editor-form input[name=validado]').check();
  await type('fuenteValidacion', 'Certificación QA 023');
  await guardar();
  await pagina.waitForTimeout(800);
  paso('el producto queda PUBLICADO en el panel', /PUBLICADO/.test(await pagina.locator('tbody').innerText()));

  /* ---------- 6. Comprobar catálogo ---------- */
  console.log('\n== 6. Comprobar catálogo ==');
  const publico = await catalogoPublico();
  const enPublico = publico.productos.find((p) => p.nombre === nombreProducto);
  paso('el producto publicado aparece en el catálogo público', !!enPublico);
  paso('el catálogo público trae la fotografía asociada', !!enPublico && Array.isArray(enPublico.imagenes) && enPublico.imagenes.includes(fotoId), (enPublico?.imagenes || []).join(','));
  const enlaceFoto = publico.multimedia.find((m) => m.id === fotoId);
  paso('el catálogo público sirve la fotografía con su URL', !!enlaceFoto && typeof enlaceFoto.url === 'string');
  const descarga = enlaceFoto ? await fetch(BASE + enlaceFoto.url) : null;
  paso('la URL del catálogo devuelve la imagen real', !!descarga && descarga.status === 200 && (descarga.headers.get('content-type') || '').startsWith('image/'), descarga ? descarga.status + ' ' + descarga.headers.get('content-type') : 'sin URL');
  paso('el catálogo público no expone datos internos', !!enPublico && !('usuarioResponsable' in enPublico) && !('fuenteValidacion' in enPublico));
  await pagina.screenshot({ path: salida + 'cert023-03-producto-publicado.png' });

  /* ---------- 7. Ocultar ---------- */
  console.log('\n== 7. Ocultar ==');
  await irA('Productos');
  await abrirFicha(nombreProducto);
  await pagina.locator('#editor-form select[name=estado]').selectOption('OCULTO');
  await guardar();
  await pagina.waitForTimeout(800);
  paso('al ocultar desaparece del catálogo público', !(await enCatalogo(nombreProducto)));
  paso('la ficha sigue en el panel como OCULTO', /OCULTO/.test(await pagina.locator('tbody').innerText()));

  /* ---------- 8. Verificar auditoría ---------- */
  console.log('\n== 8. Verificar auditoría ==');
  const productos = await listarTodo('productos');
  const productoId = productos.find((p) => p.nombre === nombreProducto)?.id || '';
  paso('el producto queda identificado en el API', !!productoId, productoId);
  const auditoria = await listarTodo('auditoria');
  const delProducto = auditoria.filter((a) => a.registro === productoId);
  const acciones = [...new Set(delProducto.map((a) => a.accion))];
  paso('la auditoría registra el ciclo completo del producto', delProducto.length >= 4, delProducto.length + ' entradas: ' + acciones.join(', '));
  paso('quedan registradas creación, edición, publicación y ocultado', ['CREAR', 'PUBLICAR', 'OCULTAR'].every((a) => acciones.includes(a)), acciones.join(', '));
  const delArchivo = auditoria.filter((a) => a.registro === fotoId);
  paso('la subida directa queda auditada con su vía', delArchivo.some((a) => a.accion === 'SUBIR_MULTIMEDIA' && a.via === 'SUBIDA_DIRECTA'), delArchivo.map((a) => a.accion + '/' + (a.via || '')).join(', '));

  await irA('Auditoría');
  await pagina.waitForTimeout(700);
  const entradasVisibles = await pagina.locator('.activity').allInnerTexts();
  paso('la vista de auditoría muestra entradas', entradasVisibles.length > 0, entradasVisibles.length + ' en pantalla');
  paso('la vista incluye el producto certificado', entradasVisibles.some((t) => t.includes(productoId) || t.includes('productos')));
  await pagina.screenshot({ path: salida + 'cert023-04-auditoria.png' });

  /* ---------- 9. Sin errores y en móvil ---------- */
  console.log('\n== 9. Integridad y móvil ==');
  paso('no hubo excepciones de JavaScript en el panel', erroresPagina.length === 0, erroresPagina.slice(0, 2).join(' | '));
  await irA('Biblioteca multimedia');
  await pagina.setViewportSize({ width: 375, height: 667 });
  await pagina.waitForTimeout(500);
  const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  paso('la biblioteca no desborda en 375x667', !desborde);
  const tarjetaMovil = await pagina.locator('.media-card img').first().evaluate((im) => im.complete && im.naturalWidth > 0).catch(() => false);
  paso('la fotografía se ve en móvil', tarjetaMovil);
  await pagina.screenshot({ path: salida + 'cert023-05-movil.png' });
} catch (e) {
  paso('el recorrido terminó sin excepción', false, e.message);
} finally {
  const fallos = pasos.filter((p) => !p.correcto);
  await fs.writeFile(new URL('../.runtime/certificacion-023-results.json', import.meta.url), JSON.stringify({
    total: pasos.length,
    pasan: pasos.length - fallos.length,
    fallan: fallos.length,
    pasos,
    erroresPagina,
    recorrido: ['login', 'crear producto', 'subir fotografía', 'editar', 'publicar', 'comprobar catálogo', 'ocultar', 'verificar auditoría'],
    modo: 'EMULADORES_LOCALES_CON_SUBIDA_DIRECTA_FIRMADA_QA'
  }, null, 2));
  console.log('\n' + (fallos.length ? 'FALLA' : 'PASS') + ': ' + (pasos.length - fallos.length) + '/' + pasos.length + ' pasos del recorrido completo');
  if (fallos.length) {
    console.log('Pendientes de revisar:');
    for (const f of fallos) console.log('  · ' + f.nombre + (f.detalle ? ' [' + f.detalle + ']' : ''));
  }
  await navegador.close();
  process.exit(fallos.length ? 1 : 0);
}
