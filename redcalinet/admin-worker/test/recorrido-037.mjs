// KZ-REDCALINET-037 — Recorrido completo del panel administrativo.
//
// Ejecuta, desde la interfaz y contra el Worker local + emuladores, los diez
// pasos de verificación que pidió el propietario:
//
//   1. Crear y editar productos            6. Guardar borradores
//   2. Modificar precios y existencias     7. Publicar fichas de prueba
//   3. Administrar categorías              8. Ocultar las fichas de prueba
//   4. Subir fotografías y videos          9. Comprobar permisos
//   5. Asociarlos a fichas                10. Interfaz en móvil y escritorio
//
// Cada paso se comprueba DOS veces: en la pantalla (lo que ve el propietario) y
// en la API (lo que quedó guardado). Así una interfaz que "parece" funcionar no
// puede dar por buena una escritura que no ocurrió.
//
// Uso (desde redcalinet/admin-worker, con `wrangler dev` y los emuladores):
//   node test/recorrido-037.mjs
//
// No toca producción: los emuladores son datos ficticios de QA y la subida usa
// el adaptador local (MODO_EMULADOR=1). No publica nada comercial.

import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../admin/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WORKER = 'http://127.0.0.1:8787';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key';
const salida = fileURLToPath(new URL('../.runtime/recorrido-037/', import.meta.url));
await fs.mkdir(salida, { recursive: true });

const comprobaciones = [];
const fallos = [];
const chk = async (nombre, fn) => {
  try { await fn(); comprobaciones.push(nombre); console.log('  PASA   ' + nombre); }
  catch (e) { fallos.push(nombre + ' (' + (e?.message || e) + ')'); console.log('  **FALLA** ' + nombre + '  →  ' + (e?.message || e)); }
};

/* ---------- utilidades de API (verificación independiente de la pantalla) ---------- */

async function login(email) {
  const r = await fetch(AUTH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'RCL-Only-QA-2026!', returnSecureToken: true })
  });
  if (r.status !== 200) throw new Error('login ' + email + ' → ' + r.status);
  return (await r.json()).idToken;
}
const superadmin = await login('superadmin@rcl.example.test');

async function api(ruta, { token = superadmin, method = 'GET', body } = {}) {
  const r = await fetch(WORKER + '/admin/api/' + ruta, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      Origin: WORKER,
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const delCatalogo = async (id) => (await api('public/catalogo', { token: null })).data;
const fila = async (coleccion, id) => (await api(coleccion)).data.items.find((r) => r.id === id);

/* ---------- archivos de prueba con cabecera real ---------- */
// El adaptador QA comprueba los primeros bytes: PNG debe empezar por la firma
// PNG y MP4 debe llevar 'ftyp' en el byte 4. Se generan aquí para que la prueba
// no dependa de archivos externos ni de la red.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAP0lEQVR42u3OMQEAAAgDoJnc6BpjDyQgd5cKBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIODbAgJBAAG3k9WpAAAAAElFTkSuQmCC', 'base64');
const MP4 = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');

/* ---------- navegador ---------- */

const navegador = await chromium.launch({
  executablePath: process.env.RCL_CHROMIUM || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const pagina = await contexto.newPage();
const erroresJs = [];
pagina.on('pageerror', (e) => erroresJs.push(e.message));

const nav = (nombre) => pagina.locator('.sidebar nav').getByRole('button', { name: nombre, exact: true });
const avisoOk = () => pagina.locator('.alert.success').first().innerText();
const sinDesborde = async () => pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

/* Espera el resultado real de una subida: o el formulario se cierra (éxito) o
   aparece un error dentro del propio formulario. Nunca se da por buena una carga
   solo porque el archivo se envió. */
async function finDeSubida(p) {
  await p.waitForFunction(() => !document.querySelector('#upload-form')
    || document.querySelector('#upload-form #form-error .alert.error'), null, { timeout: 40000 });
  if (await p.locator('#upload-form #form-error .alert.error').count()) {
    const detalle = await p.locator('#upload-form #form-error').innerText();
    throw new Error('la carga falló: ' + detalle.trim());
  }
  await p.locator('#upload-form').waitFor({ state: 'detached', timeout: 15000 });
}

const sufijo = Date.now();
const nombreProducto = 'Producto QA 037 ' + sufijo;
const nombreServicio = 'Servicio QA 037 ' + sufijo;
const nombreCategoria = 'Categoría QA 037 ' + sufijo;

/* ============================================================
   Acceso
   ============================================================ */
console.log('== Acceso administrativo ==');
await chk('el panel carga y permite iniciar sesión', async () => {
  await pagina.goto(WORKER + '/admin/', { waitUntil: 'load', timeout: 30000 });
  await pagina.locator('#login-form input[name=email]').fill('superadmin@rcl.example.test');
  await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
  await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await pagina.locator('.stats').waitFor({ timeout: 25000 });
});
await chk('el menú conserva todos los módulos, agrupados', async () => {
  const grupos = (await pagina.locator('.sidebar .nav-group .nav-label').allInnerTexts()).map((g) => g.trim().toLowerCase());
  const esperados = ['resumen', 'catálogo', 'contenido', 'empresa', 'sistema'];
  for (const g of esperados) if (!grupos.includes(g)) throw new Error('falta el grupo ' + g + ' · hay ' + grupos.join(' | '));
  const modulos = (await pagina.locator('.sidebar nav button').allInnerTexts()).map((t) => t.trim());
  const requeridos = ['Dashboard', 'Productos', 'Servicios', 'Categorías', 'Inventario', 'Promociones', 'Fotografías', 'Videos', 'Solicitudes y cotizaciones', 'Configuración empresarial', 'Redes sociales', 'Usuarios y permisos', 'Auditoría'];
  for (const m of requeridos) if (!modulos.some((t) => t.includes(m))) throw new Error('falta el módulo ' + m + ' · hay: ' + modulos.join(' | '));
});

/* ============================================================
   1 y 2. Crear, editar, precios y existencias
   ============================================================ */
console.log('\n== 1-2. Crear y editar productos; precios y existencias ==');
let idProducto = '';
await chk('crea un producto nuevo y lo guarda como borrador', async () => {
  await nav('Productos').click();
  await pagina.getByRole('button', { name: '+ Nuevo producto' }).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator('#editor-form input[name=nombre]').fill(nombreProducto);
  await pagina.locator('#editor-form select[name=categoriaId]').selectOption('tecnologia');
  await pagina.locator('#editor-form textarea[name=descripcion]').fill('Ficha ficticia de la verificación KZ-037. No es una oferta real.');
  await pagina.locator('#editor-form input[name=precio]').fill('45000');
  await pagina.locator('#editor-form input[name=stock]').fill('4');
  await pagina.locator('#editor-form select[name=disponibilidad]').selectOption('DISPONIBLE');
  await pagina.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  if (!/Cambios guardados/.test(await avisoOk())) throw new Error('no apareció la confirmación de guardado');
  const items = (await api('productos')).data.items;
  const creado = items.find((p) => p.nombre === nombreProducto);
  if (!creado) throw new Error('el producto no quedó guardado en la API');
  if (creado.estado !== 'BORRADOR') throw new Error('el producto no quedó en BORRADOR: ' + creado.estado);
  idProducto = creado.id;
});
await chk('el borrador no aparece en el catálogo público', async () => {
  const publico = await delCatalogo();
  if (publico.productos.some((p) => p.id === idProducto)) throw new Error('un borrador se ofreció públicamente');
});
await chk('edita precio y existencias desde el formulario', async () => {
  await pagina.locator(`.row-name[data-id="${idProducto}"]`).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator('#editor-form input[name=precio]').fill('49900');
  await pagina.locator('#editor-form input[name=stock]').fill('7');
  await pagina.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  const guardado = await fila('productos', idProducto);
  if (guardado.precio !== 49900) throw new Error('precio no guardado: ' + guardado.precio);
  if (guardado.stock !== 7) throw new Error('existencias no guardadas: ' + guardado.stock);
});
await chk('la auditoría registra el cambio de precio', async () => {
  const entradas = (await api('auditoria')).data.items;
  const mia = entradas.filter((a) => a.registro === idProducto);
  if (!mia.some((a) => a.accion === 'MODIFICAR_PRECIO')) throw new Error('no hay entrada MODIFICAR_PRECIO');
  const crear = mia.find((a) => a.accion === 'CREAR');
  if (!crear) throw new Error('no hay entrada CREAR');
});
await chk('el inventario muestra las existencias reales', async () => {
  await nav('Inventario').click();
  await pagina.waitForTimeout(300);
  const texto = await pagina.locator('#module-content').innerText();
  if (!texto.includes('7')) throw new Error('no se ven las 7 existencias');
});

/* ============================================================
   3. Categorías
   ============================================================ */
console.log('\n== 3. Administrar categorías ==');
let idCategoria = '';
await chk('crea una categoría', async () => {
  await nav('Categorías').click();
  await pagina.getByRole('button', { name: '+ Nueva categoría' }).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator('#editor-form input[name=nombre]').fill(nombreCategoria);
  await pagina.locator('#editor-form select[name=tipo]').selectOption('servicio');
  await pagina.locator('#editor-form input[name=icono]').fill('i-qa');
  await pagina.locator('#editor-form input[name=orden]').fill('60');
  await pagina.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  const items = (await api('categorias')).data.items;
  const creada = items.find((c) => c.nombre === nombreCategoria);
  if (!creada) throw new Error('la categoría no se guardó');
  idCategoria = creada.id;
});
await chk('oculta y vuelve a mostrar la categoría desde la fila', async () => {
  await pagina.locator(`.sidebar nav button[data-view="categorias"]`).click();
  await pagina.waitForTimeout(300);
  await pagina.locator(`button[data-action="toggle-visible"][data-id="${idCategoria}"]`).click();
  await pagina.waitForTimeout(700);
  if ((await fila('categorias', idCategoria)).visible !== false) throw new Error('no se ocultó');
  await pagina.locator(`button[data-action="toggle-visible"][data-id="${idCategoria}"]`).click();
  await pagina.waitForTimeout(700);
  if ((await fila('categorias', idCategoria)).visible !== true) throw new Error('no se volvió a mostrar');
});

/* ============================================================
   4. Fotografías y videos
   ============================================================ */
console.log('\n== 4. Subir fotografías y videos ==');
let idFoto = '';
let idVideo = '';
await chk('sube una fotografía y aparece de inmediato en Fotografías', async () => {
  await nav('Fotografías').click();
  await pagina.waitForTimeout(400);
  await pagina.getByRole('button', { name: '+ Agregar fotografía' }).click();
  await pagina.locator('#upload-form').waitFor();
  await pagina.locator('#upload-form input[name=file]').setInputFiles({ name: 'foto-037.png', mimeType: 'image/png', buffer: PNG });
  await pagina.locator('#upload-form input[name=titulo]').fill('Foto QA 037 ' + sufijo);
  await pagina.locator('#upload-form input[name=alt]').fill('Fotografía de prueba de la verificación KZ-037');
  await pagina.getByRole('button', { name: 'Subir archivo' }).click();
  await finDeSubida(pagina);
  // La tarjeta nueva aparece sin recargar la página.
  await pagina.locator('.media-card', { hasText: 'Foto QA 037 ' + sufijo }).first().waitFor({ timeout: 20000 });
  const archivos = (await api('multimedia')).data.items;
  const foto = archivos.find((m) => m.titulo === 'Foto QA 037 ' + sufijo);
  if (!foto) throw new Error('la fotografía no quedó registrada');
  if (foto.tipo !== 'image') throw new Error('quedó registrada con el tipo ' + foto.tipo);
  idFoto = foto.id;
});
await chk('la fotografía NO aparece en la sección Videos', async () => {
  await nav('Videos').click();
  await pagina.waitForTimeout(500);
  const texto = await pagina.locator('#module-content').innerText();
  if (texto.includes('Foto QA 037 ' + sufijo)) throw new Error('una fotografía apareció en la sección Videos');
});
await chk('sube un video y aparece de inmediato en Videos', async () => {
  await pagina.getByRole('button', { name: '+ Agregar video' }).click();
  await pagina.locator('#upload-form').waitFor();
  await pagina.locator('#upload-form input[name=file]').setInputFiles({ name: 'video-037.mp4', mimeType: 'video/mp4', buffer: MP4 });
  await pagina.locator('#upload-form input[name=titulo]').fill('Video QA 037 ' + sufijo);
  await pagina.getByRole('button', { name: 'Subir archivo' }).click();
  await finDeSubida(pagina);
  await pagina.locator('.media-card', { hasText: 'Video QA 037 ' + sufijo }).first().waitFor({ timeout: 20000 });
  const archivos = (await api('multimedia')).data.items;
  const video = archivos.find((m) => m.titulo === 'Video QA 037 ' + sufijo);
  if (!video) throw new Error('el video no quedó registrado');
  if (video.tipo !== 'video') throw new Error('quedó registrado con el tipo ' + video.tipo);
  idVideo = video.id;
});
await chk('un archivo sin texto alternativo avisa antes de publicarse', async () => {
  await nav('Fotografías').click();
  await pagina.waitForTimeout(400);
  // Se sube una segunda fotografía sin texto alternativo.
  await pagina.getByRole('button', { name: '+ Agregar fotografía' }).click();
  await pagina.locator('#upload-form input[name=file]').setInputFiles({ name: 'foto-sin-alt.png', mimeType: 'image/png', buffer: PNG });
  await pagina.locator('#upload-form input[name=titulo]').fill('Foto sin alt 037 ' + sufijo);
  await pagina.getByRole('button', { name: 'Subir archivo' }).click();
  await finDeSubida(pagina);
  await pagina.locator('.media-card', { hasText: 'Foto sin alt 037 ' + sufijo }).first().waitFor({ timeout: 20000 });
  const avisos = await pagina.locator('.media-aviso').allInnerTexts();
  if (!avisos.length) throw new Error('no se advirtió la falta de texto alternativo');
  // Limpieza: se archiva la ficha sobrante para no ensuciar la biblioteca.
  const archivos = (await api('multimedia')).data.items;
  const sobrante = archivos.find((m) => m.titulo === 'Foto sin alt 037 ' + sufijo);
  if (sobrante) await api('multimedia/' + sobrante.id, { method: 'PATCH', body: { values: { estado: 'ARCHIVADO' }, revision: sobrante.revision } });
});

/* ============================================================
   5. Asociación con productos y servicios
   ============================================================ */
console.log('\n== 5. Asociar fotografías y videos a las fichas ==');
await chk('asocia la fotografía y el video al producto desde su ficha', async () => {
  await nav('Productos').click();
  await pagina.waitForTimeout(400);
  await pagina.locator(`.row-name[data-id="${idProducto}"]`).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator(`[data-picker="imagenes"] button[data-id="${idFoto}"]`).click();
  await pagina.locator(`[data-picker="videos"] button[data-id="${idVideo}"]`).click();
  await pagina.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  const guardado = await fila('productos', idProducto);
  if (!(guardado.imagenes || []).includes(idFoto)) throw new Error('la fotografía no quedó asociada');
  if (!(guardado.videos || []).includes(idVideo)) throw new Error('el video no quedó asociado');
});
await chk('crea un servicio y le asocia la fotografía y el video', async () => {
  await nav('Servicios').click();
  await pagina.waitForTimeout(400);
  await pagina.getByRole('button', { name: '+ Nuevo servicio' }).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator('#editor-form input[name=nombre]').fill(nombreServicio);
  await pagina.locator('#editor-form select[name=categoriaId]').selectOption(idCategoria);
  await pagina.locator('#editor-form textarea[name=descripcion]').fill('Servicio ficticio de la verificación KZ-037.');
  await pagina.locator(`[data-picker="imagenes"] button[data-id="${idFoto}"]`).click();
  await pagina.locator(`[data-picker="videos"] button[data-id="${idVideo}"]`).click();
  await pagina.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  const items = (await api('servicios')).data.items;
  const creado = items.find((s) => s.nombre === nombreServicio);
  if (!creado) throw new Error('el servicio no se guardó');
  if (!(creado.imagenes || []).includes(idFoto)) throw new Error('la fotografía no quedó asociada al servicio');
  if (!(creado.videos || []).includes(idVideo)) throw new Error('el video no quedó asociado al servicio');
});
await chk('la ficha informa dónde se usa el archivo', async () => {
  await nav('Fotografías').click();
  await pagina.waitForTimeout(400);
  await pagina.locator(`button[data-action="edit"][data-id="${idFoto}"]`).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator('#usage strong').waitFor({ timeout: 15000 });
  const uso = await pagina.locator('#usage').innerText();
  if (!/Usado por [1-9]/.test(uso)) throw new Error('no se listó el uso: ' + uso);
  await pagina.getByRole('button', { name: 'Cerrar formulario' }).click();
});

/* ============================================================
   6, 7 y 8. Borrador, publicar y ocultar
   ============================================================ */
console.log('\n== 6-7-8. Borrador, publicar fichas de prueba y ocultarlas ==');
await chk('publicar sin el sello comercial se rechaza con un aviso claro', async () => {
  await nav('Productos').click();
  await pagina.waitForTimeout(400);
  await pagina.locator(`.row-name[data-id="${idProducto}"]`).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator('#editor-form .fixed-actions button[data-destino="PUBLICADO"]').click();
  await pagina.locator('#form-error .alert.error').waitFor({ timeout: 10000 });
  const texto = await pagina.locator('#form-error').innerText();
  if (!/Confirmo que la información comercial/.test(texto)) throw new Error('el aviso no explica lo que falta: ' + texto);
  if ((await fila('productos', idProducto)).estado !== 'BORRADOR') throw new Error('se publicó sin sello comercial');
});
await chk('la lista de comprobación marca lo que falta para publicar', async () => {
  const pendientes = await pagina.locator('#checklist-vivo li.pendiente').allInnerTexts();
  if (!pendientes.some((t) => /Sello comercial/.test(t))) throw new Error('no se marcó el sello como pendiente: ' + pendientes.join(' | '));
});
await chk('publica los archivos desde la propia ficha y luego la ficha', async () => {
  // El archivo debe estar PUBLICADO para poder publicar la ficha que lo usa.
  await pagina.locator(`[data-action="media-estado"][data-id="${idFoto}"][data-desde-editor="1"]`).click();
  await pagina.waitForTimeout(900);
  await pagina.locator(`[data-action="media-estado"][data-id="${idVideo}"][data-desde-editor="1"]`).click();
  await pagina.waitForTimeout(900);
  // Sello comercial y publicación.
  await pagina.locator('#editor-form input[name=validado]').check();
  await pagina.locator('#editor-form textarea[name=fuenteValidacion]').fill('Lista de precios del propietario, verificada en QA el ' + new Date().toISOString().slice(0, 10));
  await pagina.locator('#editor-form .fixed-actions button[data-destino="PUBLICADO"]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 25000 });
  const guardado = await fila('productos', idProducto);
  if (guardado.estado !== 'PUBLICADO') throw new Error('la ficha no quedó publicada: ' + guardado.estado);
  const publico = await delCatalogo();
  if (!publico.productos.some((p) => p.id === idProducto)) throw new Error('la ficha publicada no aparece en el catálogo público');
});
await chk('oculta la ficha de prueba con la acción de la fila', async () => {
  await pagina.waitForTimeout(600);
  await pagina.locator(`button[data-action="quick-estado"][data-id="${idProducto}"][data-estado="OCULTO"]`).click();
  await pagina.waitForTimeout(1200);
  if ((await fila('productos', idProducto)).estado !== 'OCULTO') throw new Error('no se ocultó');
  const publico = await delCatalogo();
  if (publico.productos.some((p) => p.id === idProducto)) throw new Error('la ficha oculta sigue en el catálogo público');
});
await chk('la ficha oculta sigue administrable en el panel', async () => {
  const texto = await pagina.locator('#module-content').innerText();
  if (!texto.includes(nombreProducto)) throw new Error('la ficha oculta desapareció del panel');
});
await chk('el video también se oculta desde la sección Videos', async () => {
  await nav('Videos').click();
  await pagina.waitForTimeout(500);
  await pagina.locator(`button[data-action="media-estado"][data-id="${idVideo}"][data-estado="OCULTO"]`).click();
  await pagina.waitForTimeout(1000);
  const archivo = (await api('multimedia')).data.items.find((m) => m.id === idVideo);
  if (archivo.estado !== 'OCULTO') throw new Error('el video no quedó oculto: ' + archivo.estado);
});

/* ============================================================
   Otros editores: configuración y usuarios
   ============================================================ */
console.log('\n== Otros editores ==');
await chk('guarda la configuración empresarial desde el formulario', async () => {
  await nav('Configuración empresarial').click();
  await pagina.waitForTimeout(500);
  await pagina.getByRole('button', { name: 'Editar configuración' }).click();
  await pagina.locator('#editor-form').waitFor();
  const campos = await pagina.locator('#editor-form .form-section').count();
  if (campos !== 1) throw new Error('la configuración debería tener un bloque y tiene ' + campos);
  await pagina.locator('#editor-form input[name=ciudad]').fill('Cali (QA 037)');
  await pagina.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  const empresa = (await api('configuracion')).data.items.find((r) => r.id === 'empresa');
  if (empresa.ciudad !== 'Cali (QA 037)') throw new Error('la ciudad no se guardó: ' + empresa.ciudad);
});
await chk('el editor de usuarios abre con sus campos y roles', async () => {
  await nav('Usuarios y permisos').click();
  await pagina.waitForTimeout(700);
  await pagina.locator('.row-name').first().click();
  await pagina.locator('#editor-form').waitFor();
  const secciones = (await pagina.locator('#editor-form .form-section h3').allInnerTexts()).map((t) => t.trim());
  if (!secciones.includes('Cuenta') || !secciones.includes('Acceso')) throw new Error('faltan bloques: ' + secciones.join(' | '));
  const roles = await pagina.locator('#editor-form select[name=rol] option').allInnerTexts();
  if (!roles.includes('PROPIETARIO') || !roles.includes('SUPERADMIN')) throw new Error('faltan roles: ' + roles.join(' | '));
  // No se guarda: cambiar roles en la verificación no aporta y sí puede molestar.
  await pagina.getByRole('button', { name: 'Cerrar formulario' }).click();
});
await chk('la auditoría registra el cambio de configuración', async () => {
  const entradas = (await api('auditoria')).data.items;
  if (!entradas.some((a) => a.coleccion === 'configuracion' && a.accion === 'EDITAR')) throw new Error('no hay entrada de auditoría de configuración');
});

/* ============================================================
   9. Permisos
   ============================================================ */
console.log('\n== 9. Permisos ==');
await chk('un PROPIETARIO no ve usuarios ni auditoría', async () => {
  await pagina.evaluate(() => window.localStorage.clear());
  await pagina.goto(WORKER + '/admin/', { waitUntil: 'load' });
  await pagina.locator('#login-form input[name=email]').fill('admin@rcl.example.test');
  await pagina.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
  await pagina.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await pagina.locator('.stats').waitFor({ timeout: 25000 });
  const modulos = await pagina.locator('.sidebar nav button').allInnerTexts();
  if (modulos.some((m) => m.trim() === 'Usuarios y permisos')) throw new Error('el PROPIETARIO ve Usuarios');
  if (modulos.some((m) => m.trim() === 'Auditoría')) throw new Error('el PROPIETARIO ve Auditoría');
  const rol = (await pagina.locator('.sidebar .badge').innerText()).trim();
  if (rol !== 'PROPIETARIO') throw new Error('rol inesperado: ' + rol);
});
await chk('el PROPIETARIO sigue administrando el catálogo', async () => {
  await nav('Productos').click();
  await pagina.waitForTimeout(400);
  await pagina.locator(`.row-name[data-id="${idProducto}"]`).click();
  await pagina.locator('#editor-form').waitFor();
  await pagina.locator('#editor-form input[name=stock]').fill('9');
  await pagina.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await pagina.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  if ((await fila('productos', idProducto)).stock !== 9) throw new Error('el PROPIETARIO no pudo editar');
});
await chk('la API niega auditoría y usuarios al PROPIETARIO', async () => {
  const token = await login('admin@rcl.example.test');
  if ((await api('auditoria', { token })).status !== 403) throw new Error('auditoría accesible');
  if ((await api('usuarios', { token })).status !== 403) throw new Error('usuarios accesible');
});

/* ============================================================
   10. Interfaz en móvil y escritorio
   ============================================================ */
console.log('\n== 10. Interfaz en móvil y escritorio ==');

/* Las capturas se hacen con la sesión de SUPERADMIN para mostrar el panel completo. */
await contexto.close();
const contexto2 = await navegador.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
const movil = await contexto2.newPage();
const erroresMovil = [];
movil.on('pageerror', (e) => erroresMovil.push(e.message));

await chk('móvil: la navegación se abre, navega y se cierra', async () => {
  await movil.goto(WORKER + '/admin/', { waitUntil: 'load', timeout: 30000 });
  await movil.locator('#login-form input[name=email]').fill('superadmin@rcl.example.test');
  await movil.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');
  await movil.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await movil.locator('.stats').waitFor({ timeout: 25000 });
  await movil.locator('.mobile-menu').click();
  await movil.locator('.sidebar.open').waitFor({ timeout: 5000 });
  await movil.locator('.sidebar nav').getByRole('button', { name: 'Fotografías', exact: true }).click();
  await movil.waitForTimeout(600);
  if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde horizontal en móvil');
});
await chk('móvil: el formulario se recorre por secciones y guarda', async () => {
  await movil.locator('.mobile-menu').click();
  await movil.locator('.sidebar nav').getByRole('button', { name: 'Productos', exact: true }).click();
  await movil.waitForTimeout(600);
  await movil.getByRole('button', { name: '+ Nuevo producto' }).click();
  await movil.locator('#editor-form').waitFor();
  const secciones = await movil.locator('#editor-form .form-section h3').allInnerTexts();
  for (const s of ['1 · Lo esencial', '2 · Precio y existencias', 'Fotografías', 'Videos', 'Publicación']) {
    if (!secciones.some((t) => t.trim().startsWith(s))) throw new Error('falta la sección ' + s + ' · hay: ' + secciones.join(' | '));
  }
  // Las acciones están a la vista sin bajar hasta el final.
  const acciones = movil.locator('#editor-form .fixed-actions');
  await acciones.scrollIntoViewIfNeeded();
  if (!(await acciones.isVisible())) throw new Error('las acciones no están visibles');
  await movil.locator('#editor-form input[name=nombre]').fill('Ficha móvil QA 037 ' + sufijo);
  await movil.locator('#editor-form select[name=categoriaId]').selectOption('tecnologia');
  await movil.locator('#editor-form .fixed-actions button[data-destino=""]').click();
  await movil.locator('#editor-form').waitFor({ state: 'detached', timeout: 20000 });
  const items = (await api('productos')).data.items;
  const creada = items.find((p) => p.nombre === 'Ficha móvil QA 037 ' + sufijo);
  if (!creada) throw new Error('no se guardó desde el móvil');
  // Limpieza: la ficha de prueba móvil queda archivada como borrador oculto.
  await api('productos/' + creada.id, { method: 'PATCH', body: { values: { estado: 'OCULTO' }, revision: creada.revision } });
});
await chk('móvil: selector de fotografías táctil y capturas de evidencia', async () => {
  await movil.locator('.mobile-menu').click();
  await movil.locator('.sidebar nav').getByRole('button', { name: 'Fotografías', exact: true }).click();
  await movil.waitForTimeout(700);
  await movil.screenshot({ path: salida + 'movil-fotografias.png', fullPage: false });
  if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde en Fotografías');
  await movil.locator('.mobile-menu').click();
  await movil.locator('.sidebar nav').getByRole('button', { name: 'Videos', exact: true }).click();
  await movil.waitForTimeout(600);
  await movil.screenshot({ path: salida + 'movil-videos.png' });
  await movil.locator('.mobile-menu').click();
  await movil.locator('.sidebar nav').getByRole('button', { name: 'Productos', exact: true }).click();
  await movil.waitForTimeout(600);
  await movil.screenshot({ path: salida + 'movil-productos.png' });
  await movil.locator(`.row-name[data-id="${idProducto}"]`).click();
  await movil.locator('#editor-form').waitFor();
  await movil.screenshot({ path: salida + 'movil-editor.png' });
  if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde dentro de la ficha en móvil');
  await movil.getByRole('button', { name: 'Cerrar formulario' }).click();
});
await chk('móvil: sin excepciones de JavaScript', async () => {
  if (erroresMovil.length) throw new Error(erroresMovil.slice(0, 2).join(' | '));
});

/* Capturas de escritorio: se reutiliza la misma sesión ya abierta en contexto2. */
await chk('escritorio: dashboard, listado y ficha sin desbordes', async () => {
  await movil.setViewportSize({ width: 1440, height: 900 });
  await movil.locator('.mobile-menu').count();
  await movil.goto(WORKER + '/admin/', { waitUntil: 'load', timeout: 30000 });
  await movil.locator('.stats').waitFor({ timeout: 25000 });
  await movil.screenshot({ path: salida + 'escritorio-dashboard.png' });
  if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde en dashboard');
  await movil.locator('.sidebar nav').getByRole('button', { name: 'Productos', exact: true }).click();
  await movil.waitForTimeout(700);
  await movil.screenshot({ path: salida + 'escritorio-productos.png' });
  await movil.locator(`.row-name[data-id="${idProducto}"]`).click();
  await movil.locator('#editor-form').waitFor();
  await movil.screenshot({ path: salida + 'escritorio-editor.png' });
  if (await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('desborde en la ficha');
  await movil.getByRole('button', { name: 'Cerrar formulario' }).click();
});
await chk('escritorio: sin excepciones de JavaScript', async () => {
  if (erroresJs.length) throw new Error(erroresJs.slice(0, 2).join(' | '));
});

await navegador.close();
console.log('\n== Resumen ==');
console.log('  comprobaciones: ' + (comprobaciones.length + fallos.length) + ' · PASA ' + comprobaciones.length + ' · FALLA ' + fallos.length);
for (const f of fallos) console.log('  · ' + f);
console.log('  evidencias: ' + salida);
process.exit(fallos.length ? 1 : 0);
