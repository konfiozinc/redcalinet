// KZ-REDCALINET-037 — Composición de la pantalla: acceso, armazón y capa modal.
//
// Mismo HTML, mismas clases y mismos identificadores que el archivo único, para
// no tocar el CSS aprobado ni los selectores de las pruebas. El menú lateral
// pasa a estar agrupado y la cabecera de módulo explica en una línea qué hace
// cada sección, porque el propietario administra desde el teléfono.

import { estado, esc, brand, title, kind, NAV, GRUPOS, SOLO_SUPERADMIN, raiz } from './estado.js';
import { contenido } from '../vistas/index.js';

const descripcion = (v) => {
  if (v === 'dashboard') return 'Una mirada clara a tu catálogo y al trabajo reciente. Datos consultados de Firestore.';
  if (['multimedia', 'fotografias', 'videos'].includes(v)) return 'Sube, organiza y administra las fotografías y videos de tu catálogo.';
  if (v === 'inventario') return 'Existencias y disponibilidad de cada producto, sin abrir ficha por ficha.';
  if (v === 'categorias') return 'Ordena el catálogo: cada categoría decide si sus fichas pueden publicarse.';
  if (v === 'promociones') return 'Ofertas con vigencia. Solo se asocian a fichas ya publicadas.';
  if (['configuracion', 'redes'].includes(v)) return 'Datos comerciales que ve el cliente: contacto, redes y horarios.';
  return 'Información actualizada, con permisos y cambios registrados.';
};

export function pintarLogin() {
  raiz().innerHTML = `<div class="login-page">
    <section class="login-brand">${brand()}<div><span class="eyebrow">TU NEGOCIO, EN ORDEN</span><h1>El control que tu negocio necesita.</h1><p>Productos, servicios y contenido. Un solo espacio para mantener cada detalle al día.</p></div><small class="credito-marca">Administrado por <a href="https://konfiozinc.github.io/card/" target="_blank" rel="noopener noreferrer">KONFÍO ZINC</a></small></section>
    <section class="login-form-wrap"><div class="login-form">
      <span class="eyebrow">ACCESO ADMINISTRATIVO</span>
      <h2>Bienvenido de nuevo.</h2>
      <p class="dim">Ingresa con tu cuenta autorizada de Red CaliNet.</p>
      ${estado.boot?.local ? '<div class="alert">Entorno local de prueba · Firebase Emulator. Sin conexión a producción.</div>' : ''}
      ${estado.loginNotice ? `<div class="alert success" role="status">${esc(estado.loginNotice)}</div>` : ''}
      <div id="login-error" role="alert">${estado.error ? `<div class="alert error">${esc(estado.error)}</div>` : ''}</div>
      <form id="login-form">
        <label>Correo electrónico<input name="email" type="email" autocomplete="username" required placeholder="tu@correo.com"></label>
        <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="primary" type="submit">Entrar al panel</button>
      </form>
      <button data-action="reset-password" class="muted-button">Olvidé mi contraseña</button>
      ${estado.user ? '<button data-action="logout" class="secondary">Cerrar sesión actual</button>' : ''}
      <div class="login-footer">Acceso restringido · Firebase Authentication<br>Tu rol se comprueba en el servidor.</div>
    </div></section>
  </div>`;
}

function menu() {
  const permitidas = new Set(NAV.filter(([key]) => estado.actor.rol === 'SUPERADMIN' || !SOLO_SUPERADMIN.includes(key)).map(([key]) => key));
  return GRUPOS.map(([grupo, claves]) => {
    const visibles = claves.filter((k) => permitidas.has(k));
    if (!visibles.length) return '';
    return `<div class="nav-group"><span class="nav-label">${esc(grupo)}</span><nav aria-label="${esc(grupo)}">${visibles.map((key) => {
      const [, label, icon] = NAV.find((n) => n[0] === key);
      return `<button data-action="navigate" data-view="${key}" class="${estado.view === key ? 'active' : ''}" ${estado.view === key ? 'aria-current="page"' : ''}><span class="icon" aria-hidden="true">${icon}</span>${label}</button>`;
    }).join('')}</nav></div>`;
  }).join('');
}

function botonesCabecera() {
  const k = kind();
  if (['productos', 'servicios', 'categorias', 'promociones'].includes(k)) {
    const etiqueta = k === 'categorias' ? 'Nueva categoría' : k === 'promociones' ? 'Nueva promoción' : k === 'servicios' ? 'Nuevo servicio' : 'Nuevo producto';
    return `<button class="primary" data-action="new">+ ${etiqueta}</button>`;
  }
  if (['multimedia', 'fotografias', 'videos'].includes(estado.view)) {
    const etiqueta = estado.view === 'fotografias' ? '+ Agregar fotografía' : estado.view === 'videos' ? '+ Agregar video' : '+ Subir archivos';
    return `<button class="primary" data-action="upload" ${!estado.boot.media.enabled ? 'disabled' : ''}>${etiqueta}</button>`;
  }
  if (estado.view === 'usuarios') return '<button class="primary" data-action="new">+ Crear usuario</button>';
  return '';
}

export function pintar() {
  if (!estado.actor) return pintarLogin();
  raiz().innerHTML = `<div id="shell">
    <aside class="sidebar ${estado.sidebar ? 'open' : ''}">${brand()}<div class="sidebar-nav">${menu()}</div><div class="sidebar-bottom"><span class="badge blue">${esc(estado.actor.rol)}</span><div class="identity"><span class="avatar">${esc((estado.actor.nombre || 'A').slice(0, 1))}</span><span>${esc(estado.actor.nombre || 'Cuenta autorizada')}<small class="dim"> · Firebase</small></span></div><button data-action="logout" class="secondary">Cerrar sesión</button></div></aside>
    <button data-action="close-nav" class="overlay ${estado.sidebar ? 'open' : ''}" aria-label="Cerrar navegación"></button>
    <div class="workspace">
      <header class="topbar"><div><button class="mobile-menu" data-action="toggle-nav" aria-label="Abrir navegación">☰</button>Red CaliNet <span aria-hidden="true"> / </span><strong>${esc(title(estado.view))}</strong></div><span>● ACCESO RESTRINGIDO</span></header>
      <main class="content">
        <div class="page-head"><div><span class="eyebrow">CENTRO DE ADMINISTRACIÓN</span><h1>${estado.view === 'dashboard' ? 'Todo listo para avanzar.' : esc(title(estado.view))}</h1><p>${esc(descripcion(estado.view))}</p></div><div class="actions"><button class="secondary" data-action="refresh" ${estado.loading ? 'disabled' : ''}>↻ Actualizar</button>${botonesCabecera()}</div></div>
        ${estado.boot.local ? `<div class="alert">QA LOCAL · Firebase Emulator${estado.boot.media.fixture ? ' · Subida directa de prueba (no Cloudinary)' : ''}. Contrato Harness recibido · pruebas locales de compatibilidad. No hay conexión con producción.</div>` : ''}
        ${estado.notice ? `<div class="alert success" role="status">${esc(estado.notice)}</div>` : ''}
        ${estado.error ? `<div class="alert error" role="alert">${esc(estado.error)} <button data-action="refresh">Reintentar</button></div>` : ''}
        ${estado.loading ? '<p class="loading" role="status">Consultando información…</p>' : ''}
        <div id="module-content">${contenido()}</div>
        <footer class="footer"><span>RED CALINET / BUSINESS ADMIN</span><span>Información con respaldo. Cambios con trazabilidad.</span></footer>
      </main>
    </div>
  </div><div id="modal-host"></div>`;
}

/* Capa modal compartida por todos los formularios. */
export function modalFrame(titulo, cuerpo) {
  const host = document.querySelector('#modal-host');
  if (!host) return;
  host.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="modal-header"><div><span class="eyebrow">REGISTRO ADMINISTRATIVO</span><h2 id="dialog-title">${esc(titulo)}</h2><p>Los cambios se guardan en Firestore y generan auditoría.</p></div><button data-action="close-modal" aria-label="Cerrar formulario">✕</button></header>${cuerpo}</section></div>`;
  const shell = document.querySelector('#shell');
  if (shell) shell.inert = true;
  document.body.style.overflow = 'hidden';
  setTimeout(() => host.querySelector('input,select,textarea,button')?.focus(), 0);
}
