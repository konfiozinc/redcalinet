// KZ-REDCALINET-037 — Selector visual de fotografías y videos dentro de la ficha.
//
// Antes era una lista desplegable múltiple: en un teléfono hay que mantener
// pulsado para elegir varios archivos y no se ve ninguna imagen. Ahora es una
// rejilla de miniaturas que se toca, con el orden de la galería debajo, la
// portada marcada, y la posibilidad de subir un archivo sin salir de la ficha.
//
// No cambia el contrato: sigue escribiendo `modal.draft.imagenes` y
// `modal.draft.videos`, que es lo que el formulario envía como siempre.

import { esc, estado, badge } from '../nucleo/estado.js';

export const archivo = (id) => (estado.data.multimedia || []).find((m) => m.id === id) || null;

const disponibles = (tipo) => (estado.data.multimedia || [])
  .filter((m) => m.tipo === tipo && !m.eliminado && m.estado !== 'ARCHIVADO');

const miniatura = (m) => {
  if (m.tipo === 'video') return `<span class="picker-video" aria-hidden="true">▶</span>`;
  return `<img src="${esc(m.optimizedUrl || m.url)}" alt="" loading="lazy" decoding="async">`;
};

/* Un archivo puede estar asociado a la ficha y estar en BORRADOR: es válido
   guardar la ficha así, pero no publicarla. Se avisa aquí para que el error no
   aparezca solo al final, cuando el servidor lo rechaza. */
const listoParaPublicar = (m) => m.estado === 'PUBLICADO' && m.procesamiento === 'LISTO' && (m.tipo !== 'image' || Boolean(String(m.alt || '').trim()));

export function selectorMedios(campo, tipo, draft) {
  const ids = draft[campo] || [];
  const catalogo = disponibles(tipo);
  const esVideo = tipo === 'video';
  const titulo = esVideo ? 'Videos' : 'Fotografías';
  const ayuda = esVideo
    ? 'Toca los videos que quieras mostrar en esta ficha.'
    : 'Toca las fotos que quieras mostrar. La primera es la portada.';
  const abierto = !ids.length || estado.pickers[campo] === true;
  const cabecera = `<div class="section-head">
      <h3>${titulo}</h3>
      <button type="button" class="secondary" data-action="subir-desde-editor" data-campo="${campo}">+ ${esVideo ? 'Subir video' : 'Subir fotografía'}</button>
    </div>`;
  /* Al editar una ficha que ya tiene archivos, la rejilla completa ocupa más de
     lo que aporta: se muestra un resumen con la selección y el botón para
     cambiarla. La primera vez (ficha nueva o vacía) la rejilla va abierta. */
  if (!abierto) return `<section class="form-section media-selector" data-picker="${campo}">
    ${cabecera}
    <p class="section-help">${ids.length} ${ids.length === 1 ? 'archivo seleccionado' : 'archivos seleccionados'}${campo === 'imagenes' ? ' · la primera es la portada' : ''}.</p>
    <div class="picker-resumen">${ids.slice(0, 4).map((mid) => {
      const m = archivo(mid);
      return `<span class="picker-mini">${m ? miniatura(m) : ''}</span>`;
    }).join('')}<button type="button" class="secondary" data-action="abrir-picker" data-campo="${campo}">Cambiar selección</button></div>
    <div class="gallery-order" data-gallery="${campo}">${ordenMedios(campo, draft)}</div>
    <div id="media-error" role="alert" class="form-error"></div>
  </section>`;
  const rejilla = catalogo.length
    ? `<div class="picker-grid">${catalogo.map((m) => {
      const elegido = ids.includes(m.id);
      return `<button type="button" class="picker-item ${elegido ? 'selected' : ''}" data-action="toggle-media" data-campo="${campo}" data-id="${esc(m.id)}" aria-pressed="${elegido}">
        <span class="picker-thumb">${miniatura(m)}</span>
        <span class="picker-name">${esc(m.titulo)}</span>
        <span class="picker-meta">${badge(m.estado)}${listoParaPublicar(m) ? '' : '<span class="picker-alerta">No publicable todavía</span>'}</span>
        ${elegido ? '<span class="picker-marca" aria-hidden="true">✓</span>' : ''}
      </button>`;
    }).join('')}</div>`
    : `<p class="picker-vacio">Todavía no hay ${esVideo ? 'videos' : 'fotografías'} en la biblioteca.</p>`;
  return `<section class="form-section media-selector" data-picker="${campo}">
    ${cabecera}
    <p class="section-help">${ayuda} ${catalogo.length > 6 ? `<span class="picker-contador">${catalogo.length} archivos en la biblioteca; desplaza la rejilla para verlos todos.</span>` : ''}</p>
    ${rejilla}
    <div class="gallery-order" data-gallery="${campo}">${ordenMedios(campo, draft)}</div>
    <div id="media-error" role="alert" class="form-error"></div>
  </section>`;
}

export function ordenMedios(campo, draft) {
  const ids = draft[campo] || [];
  if (!ids.length) return `<p class="help">Ningún archivo seleccionado todavía.</p>`;
  return ids.map((mid, i) => {
    const m = archivo(mid);
    const nombre = m ? m.titulo : mid;
    const publicado = m && m.estado === 'PUBLICADO';
    return `<div data-gallery-id="${esc(mid)}">
      <span class="orden-nombre">${i === 0 && campo === 'imagenes' ? '<b class="portada-chip">PORTADA</b> ' : ''}${esc(nombre)}</span>
      <button type="button" data-action="reorder" data-field="${campo}" data-index="${i}" data-direction="-1" aria-label="Mover arriba ${i + 1}">↑</button>
      <button type="button" data-action="reorder" data-field="${campo}" data-index="${i}" data-direction="1" aria-label="Mover abajo ${i + 1}">↓</button>
      ${m && !m.eliminado ? (publicado
        ? `<button type="button" class="mini" data-action="media-estado" data-id="${esc(mid)}" data-estado="OCULTO" data-desde-editor="1">Ocultar</button>`
        : `<button type="button" class="mini" data-action="media-estado" data-id="${esc(mid)}" data-estado="PUBLICADO" data-desde-editor="1" ${m.tipo === 'image' && !String(m.alt || '').trim() ? 'data-requiere-alt="1"' : ''}>Publicar</button>`) : ''}
      <button type="button" data-action="quitar-media" data-campo="${campo}" data-id="${esc(mid)}" aria-label="Quitar ${esc(nombre)} de esta ficha">✕</button>
    </div>`;
  }).join('');
}

/* Resumen para la sección de publicación: qué falta para poder publicar. */
export function resumenMedios(draft) {
  const cuenta = (campo, tipo) => {
    const ids = draft[campo] || [];
    const publicados = ids.filter((mid) => { const m = archivo(mid); return m && listoParaPublicar(m); }).length;
    return { total: ids.length, publicados, tipo };
  };
  return [cuenta('imagenes', 'image'), cuenta('videos', 'video')];
}
