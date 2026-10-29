// KZ-REDCALINET-037 — Estado y utilidades compartidas del panel.
//
// Este módulo no importa nada: es la base de la que dependen las vistas, la API y
// el editor. El comportamiento es el mismo que el del archivo único anterior; lo
// que cambia es que el estado deja de ser un conjunto de variables sueltas y pasa
// a ser un objeto con nombre, para que cualquier módulo pueda leerlo y escribirlo
// sin depender del orden de carga.

export const NAV = [
  ['dashboard', 'Dashboard', '▦'],
  ['productos', 'Productos', '▣'],
  ['servicios', 'Servicios', '◇'],
  ['categorias', 'Categorías', '⊞'],
  ['inventario', 'Inventario', '▤'],
  ['promociones', 'Promociones', '◈'],
  ['fotografias', 'Fotografías', '▧'],
  ['videos', 'Videos', '▧'],
  ['solicitudes', 'Solicitudes y cotizaciones', '✉'],
  ['configuracion', 'Configuración empresarial', '⚙'],
  ['redes', 'Redes sociales', '↗'],
  ['usuarios', 'Usuarios y permisos', '♙'],
  ['auditoria', 'Auditoría', '◷']
];

/* El menú se lee por grupos: trece entradas seguidas en un teléfono obligan a
   recorrer la lista entera para encontrar algo. Los grupos no cambian qué
   módulos existen ni sus permisos, solo cómo se presentan. */
export const GRUPOS = [
  ['Resumen', ['dashboard']],
  ['Catálogo', ['productos', 'servicios', 'categorias', 'inventario']],
  ['Contenido', ['fotografias', 'videos', 'promociones']],
  ['Empresa', ['configuracion', 'redes', 'solicitudes']],
  ['Sistema', ['usuarios', 'auditoria']]
];

export const STATES = ['BORRADOR', 'PUBLICADO', 'OCULTO'];
export const SOLO_SUPERADMIN = ['usuarios', 'auditoria'];

export const estado = {
  boot: null,
  auth: null,
  user: null,
  // Logotipo oficial del proyecto (KZ-REDCALINET-017): lo inyecta app.js desde
  // el mismo archivo que publica la web aprobada, ya emitido por Vite con hash.
  logoUrl: '',
  actor: null,
  view: 'dashboard',
  data: {},
  cursors: {},
  dashboard: null,
  loading: false,
  error: '',
  loginNotice: '',
  notice: '',
  search: '',
  filter: '',
  sidebar: false,
  modal: null,
  modalBusy: false,
  lastFocus: null,
  previewURL: null,
  auditPage: 0,
  // Cada inicio o cierre de sesión incrementa la generación: una respuesta que
  // llega tarde de la sesión anterior se descarta en vez de pintar datos ajenos.
  sesion: 0
};

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const localTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fileSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB');

export const money = (v) => (v === null || v === undefined || v === 0
  ? 'Consultar por WhatsApp'
  : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(v));

export const badge = (v) => `<span class="badge ${v === 'PUBLICADO' ? 'green' : v === 'PENDIENTE_VALIDACION' ? 'gold' : v === 'OCULTO' || v === 'ARCHIVADO' ? 'red' : 'blue'}">${esc(v || 'Sin información')}</span>`;

export const title = (c) => NAV.find((n) => n[0] === c)?.[1] || c;

/* Las dos secciones de medios (Fotografías y Videos) son vistas distintas de la
   misma colección `multimedia`; el inventario es la vista de existencias de
   `productos`. */
export const kind = () => (['fotografias', 'videos'].includes(estado.view) ? 'multimedia'
  : estado.view === 'inventario' ? 'productos'
    : ['redes', 'configuracion'].includes(estado.view) ? 'configuracion'
      : estado.view);

export const esSuperadmin = () => estado.actor?.rol === 'SUPERADMIN';

export const brand = () => `<div class="brand"><span class="brand-mark"><img src="${estado.logoUrl}" alt="" width="200" height="200" decoding="async"></span><span>Red CaliNet<small>ADMINISTRACIÓN</small></span></div>`;

/* Cierre de sesión: borra todo lo privado y descarta lo que esté en vuelo. */
export function clearPrivateState() {
  estado.sesion++;
  estado.actor = null;
  estado.data = {};
  estado.cursors = {};
  estado.dashboard = null;
  estado.view = 'dashboard';
  estado.search = '';
  estado.filter = '';
  estado.sidebar = false;
  estado.modal = null;
  estado.modalBusy = false;
  estado.notice = '';
  estado.loading = false;
  document.body.style.overflow = '';
}

export const raiz = () => document.querySelector('#app');
