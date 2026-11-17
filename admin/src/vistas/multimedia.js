// KZ-REDCALINET-037 — Fotografías y Videos.
//
// Las dos secciones siguen siendo independientes (KZ-036) y siguen resolviendo a
// la misma colección `multimedia`, así que edición, asociación y eliminación no
// cambian. Se añade: el archivo recién subido aparece primero, cada tarjeta
// muestra si le falta el texto alternativo que exige publicar, y publicar u
// ocultar se hace desde la propia tarjeta.

import { esc, estado, badge, fileSize } from '../nucleo/estado.js';
import { filtered } from './tabla.js';

const tipoDe = () => (estado.view === 'videos' ? 'video' : 'image');

export function multimedia() {
  const base = filtered('multimedia');
  const tipo = tipoDe();
  const filas = base === null ? null : base.filter((r) => r.tipo === tipo);
  // Lo más reciente primero: al terminar una carga, el archivo subido queda
  // arriba y se ve sin buscarlo entre los demás.
  const rows = filas && [...filas].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const aviso = !estado.boot.media.enabled
    ? '<div class="alert">Cloudinary y su cuota no están configurados/verificados. La carga real está deshabilitada; no se utiliza almacenamiento alternativo de producción.</div>'
    : '';
  const filtros = `<div class="filters"><input aria-label="Buscar archivos" placeholder="Buscar por título…" value="${esc(estado.search)}" data-search><select aria-label="Filtrar estado" data-filter><option value="">Todos los estados</option>${['BORRADOR', 'PUBLICADO', 'OCULTO', 'ARCHIVADO'].map((v) => `<option ${estado.filter === v ? 'selected' : ''}>${v}</option>`).join('')}</select><button class="secondary" data-action="clear-filters">Restablecer</button></div>`;
  return `${aviso}${filtros}${rows === null ? '<div class="empty">Biblioteca no disponible.</div>' : rows.length ? `<section class="media-grid">${rows.map(tarjeta).join('')}</section>`
    : `<section class="panel empty"><h3>${tipo === 'video' ? 'Todavía no hay videos' : 'Todavía no hay fotografías'}</h3><p>Sube ${tipo === 'video' ? 'videos' : 'fotografías'} auténticos, con permiso para utilizarlos.</p></section>`}${estado.cursors.multimedia ? '<button class="secondary" data-action="more">Cargar siguientes 100</button>' : ''}`;
}

function tarjeta(r) {
  const faltaAlt = r.tipo === 'image' && !String(r.alt || '').trim();
  const vista = r.eliminado ? 'Archivo eliminado'
    : r.tipo === 'video' ? `<video src="${esc(r.url)}" controls preload="metadata" aria-label="${esc(r.titulo)}"></video>`
      : `<img src="${esc(r.optimizedUrl || r.url)}" alt="${esc(r.alt || 'Archivo pendiente de texto alternativo')}" loading="lazy">`;
  const acciones = [];
  if (!r.eliminado && r.estado !== 'ARCHIVADO') {
    acciones.push(r.estado === 'PUBLICADO'
      ? `<button class="secondary" data-action="media-estado" data-id="${esc(r.id)}" data-estado="OCULTO">Ocultar</button>`
      : `<button class="secondary" data-action="media-estado" data-id="${esc(r.id)}" data-estado="PUBLICADO" ${faltaAlt ? 'data-requiere-alt="1"' : ''}>Publicar</button>`);
  }
  acciones.push(`<button class="secondary" data-action="edit" data-id="${esc(r.id)}">Editar / uso</button>`);
  if (!r.eliminado) acciones.push(`<button class="danger" data-action="delete-media" data-id="${esc(r.id)}">Eliminar</button>`);
  return `<article class="media-card">
    <div class="media-preview">${vista}</div>
    <div class="media-info">
      <h3>${esc(r.titulo)}</h3>
      ${badge(r.estado)}
      ${faltaAlt ? '<p class="media-aviso">Falta el texto alternativo: sin él no se puede publicar.</p>' : ''}
      <p>${esc(r.tipo === 'video' ? 'video' : 'imagen')} · ${fileSize(r.bytes)} · ${esc(r.procesamiento)}${r.provider === 'QA_DIRECT_FIXTURE' || r.provider === 'QA_FIXTURE' ? ' · FIXTURE QA' : ''}</p>
      <div class="actions">${acciones.join('')}</div>
    </div>
  </article>`;
}
