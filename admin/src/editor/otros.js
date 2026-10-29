// KZ-REDCALINET-037 — Formularios de categorías, promociones, archivos,
// usuarios y configuración.
//
// Mismos campos y mismo payload que el archivo único; se agrupan en bloques con
// título y la galería de promociones pasa al selector visual de miniaturas.

import { esc, estado, localTime } from '../nucleo/estado.js';
import { label, input, area, select, check, seccion } from './campos.js';
import { selectorMedios } from './medios.js';
import { camposPublicacion } from './publicacion.js';

export function camposCategorias(r) {
  return `${seccion('Datos de la categoría', `<div class="form-grid">
    ${label('Nombre', input('nombre', r.nombre, 'text', 'required maxlength="200" placeholder="Ej.: Tecnología"'))}
    ${label('Tipo', select('tipo', r.tipo, ['producto', 'servicio']), 'Decide si sus fichas son productos o servicios.')}
    ${label('Descripción', area('descripcion', r.descripcion), '', true)}
    ${label('Icono', input('icono', r.icono || 'i-check', 'text', 'required pattern="i-[a-z]+"'), 'Identificador del icono: i-tech, i-seguros, i-check…')}
    ${label('Aviso legal', area('nota', r.nota || ''), 'Se muestra junto a la categoría, si aplica.', true)}
    ${label('Orden', input('orden', r.orden, 'number', 'min="0" max="10000" step="1" inputmode="numeric" required'), 'Menor número aparece primero.')}
  </div>`)}
  ${seccion('Visibilidad', `<div class="form-grid">${check('visible', r.visible, 'Categoría visible en la web', 'Si la ocultas, sus fichas no pueden publicarse.', true)}</div>`)}`;
}

export function camposPromociones(r) {
  return `${seccion('1 · La oferta', `<div class="form-grid">
    ${label('Nombre', input('nombre', r.nombre, 'text', 'required maxlength="200"'))}
    ${label('Descuento (%)', input('descuentoPorcentaje', r.descuentoPorcentaje, 'number', 'required min="0.01" max="100" step="0.01" inputmode="decimal"'))}
    ${label('Descripción', area('descripcion', r.descripcion), 'Obligatoria para publicar.', true)}
  </div>`)}
  ${seccion('2 · A qué aplica', `<div class="form-grid">
    ${label('Productos', `<select name="productos" multiple size="4">${(estado.data.productos || []).map((p) => `<option value="${esc(p.id)}" ${r.productos?.includes(p.id) ? 'selected' : ''}>${esc(p.nombre)} · ${esc(p.estado)}</option>`).join('')}</select>`, 'Solo ofertas publicadas y validadas.')}
    ${label('Servicios', `<select name="servicios" multiple size="4">${(estado.data.servicios || []).map((p) => `<option value="${esc(p.id)}" ${r.servicios?.includes(p.id) ? 'selected' : ''}>${esc(p.nombre)} · ${esc(p.estado)}</option>`).join('')}</select>`)}
    ${label('Inicio', input('inicio', localTime(r.inicio), 'datetime-local', 'required'), 'Hora local de tu dispositivo.')}
    ${label('Vencimiento', input('fin', localTime(r.fin), 'datetime-local', 'required'))}
  </div>`)}
  ${selectorMedios('imagenes', 'image', r)}
  ${camposPublicacion(r)}`;
}

export function camposMultimedia(r) {
  return `${seccion('Datos del archivo', `<div class="form-grid">
    ${label('Título', input('titulo', r.titulo, 'text', 'required maxlength="200"'))}
    ${label('Estado', select('estado', r.estado, [...['BORRADOR', 'PUBLICADO', 'OCULTO'], 'ARCHIVADO']), 'Un archivo en BORRADOR no puede publicar la ficha que lo usa.')}
    ${label('Texto alternativo', input('alt', r.alt, 'text', 'maxlength="200"'), 'Obligatorio para publicar imágenes: describe lo que se ve.', true)}
    ${label('Descripción', area('descripcion', r.descripcion), '', true)}
  </div>`)}
  <section class="form-section"><h3>Dónde se usa</h3><div id="usage" class="usage-list">Consultando dónde se utiliza…</div><p class="help">Para reemplazar: sube la nueva versión, selecciónala en la galería del producto y guarda. Después archiva el original; no se altera su contenido.</p></section>`;
}

export function camposUsuarios(r, esNuevo) {
  return `${seccion('Cuenta', `<div class="form-grid">
    ${label('Nombre de cuenta', input('nombre', r.nombre, 'text', 'required maxlength="100"'))}
    ${esNuevo ? label('Correo', input('email', '', 'email', 'required autocomplete="off"')) : ''}
    ${esNuevo ? label('Contraseña inicial', input('password', '', 'password', 'required minlength="12" autocomplete="new-password"'), 'Entregar por un canal privado; no se guarda en auditoría.') : ''}
    ${label('Rol', select('rol', r.rol, ['PROPIETARIO', 'SUPERADMIN']), 'SUPERADMIN administra usuarios y ve la auditoría.')}
  </div>`)}
  ${seccion('Acceso', `<div class="form-grid">${check('activo', r.activo, 'Acceso activo', 'Si se desactiva, la cuenta deja de poder entrar al panel.', true)}</div>`)}`;
}

const EMPRESA = [
  ['nombre', 'Nombre empresarial'],
  ['eslogan', 'Eslogan principal'],
  ['descripcion', 'Descripción del hero'],
  ['esloganHistorico', 'Eslogan histórico'],
  ['promesa', 'Promesa'],
  ['ciudad', 'Ciudad'],
  ['direccion', 'Dirección'],
  ['direccionNota', 'Nota de dirección']
];

export function camposConfiguracion(id, r) {
  if (id === 'empresa') {
    return seccion('Datos de la empresa', `<div class="form-grid">${EMPRESA.map(([k, etiqueta]) => label(etiqueta, ['descripcion', 'promesa'].includes(k) ? area(k, r[k] || '') : input(k, r[k] || ''), '', true)).join('')}</div>`, 'Solo información autorizada. Los campos ajenos al formulario se conservan.');
  }
  return `${seccion('Contacto', `<div class="form-grid">
    ${['whatsapp', 'telefono', 'correo', 'facebook', 'instagram', 'tiktok'].map((k) => label(k, input(k, r[k] || '', k === 'correo' ? 'email' : 'text'), 'Sin datos inventados. Teléfonos: solo dígitos con indicativo.')).join('')}
  </div>`)}
  ${seccion('Horarios', `<div class="form-grid">${label('Horarios', area('horarios', (r.horarios || []).map((x) => x.dia + ' | ' + x.hora).join('\n')), 'Una línea: Lunes a viernes | 09:00–18:00', true)}</div>`)}`;
}

/* Payload de cada módulo, idéntico al anterior. */
export function valoresOtros(c, leer, form, modal) {
  if (c === 'configuracion') {
    return modal.id === 'empresa'
      ? Object.fromEntries(EMPRESA.map(([k]) => [k, leer.v(k)]))
      : {
        ...Object.fromEntries(['whatsapp', 'telefono', 'correo', 'facebook', 'instagram', 'tiktok'].map((k) => [k, leer.v(k)])),
        horarios: leer.v('horarios').split('\n').filter((x) => x.trim()).map((x) => {
          const [dia, ...hours] = x.split('|');
          return { dia: dia.trim(), hora: hours.join('|').trim() };
        })
      };
  }
  if (c === 'categorias') return { nombre: leer.v('nombre'), descripcion: leer.v('descripcion'), tipo: leer.v('tipo'), icono: leer.v('icono'), nota: leer.v('nota'), orden: leer.n('orden'), visible: leer.yes('visible') };
  if (c === 'multimedia') return { titulo: leer.v('titulo'), descripcion: leer.v('descripcion'), alt: leer.v('alt'), estado: leer.v('estado') };
  if (c === 'usuarios') {
    return {
      ...(modal.record ? { uid: modal.id, revision: modal.record.revision } : { email: leer.v('email'), password: leer.v('password') }),
      nombre: leer.v('nombre'),
      rol: leer.v('rol'),
      activo: leer.yes('activo')
    };
  }
  if (c === 'promociones') {
    return {
      nombre: leer.v('nombre'),
      descripcion: leer.v('descripcion'),
      descuentoPorcentaje: leer.n('descuentoPorcentaje'),
      productos: leer.todos('productos'),
      servicios: leer.todos('servicios'),
      inicio: new Date(leer.v('inicio')).toISOString(),
      fin: new Date(leer.v('fin')).toISOString(),
      imagenes: modal.draft.imagenes || [],
      estado: leer.v('estado'),
      validado: leer.yes('validado'),
      fuenteValidacion: leer.v('fuenteValidacion')
    };
  }
  return null;
}
