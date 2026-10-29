// KZ-REDCALINET-037 — Bloque de publicación.
//
// Publicar nunca es automático: exige que el propietario confirme que la
// información comercial fue validada y deje la fuente. Esa regla la impone el
// servidor (KZ-025) y aquí se explica antes, con una lista de lo que falta, para
// que el rechazo no llegue como sorpresa al final.

import { esc, estado, STATES } from '../nucleo/estado.js';
import { label, select, area, check } from './campos.js';
import { resumenMedios } from './medios.js';

export function camposPublicacion(draft) {
  const validado = Boolean(draft.validado);
  const fuente = String(draft.fuenteValidacion || '').trim();
  return `<section class="form-section" id="seccion-publicacion">
    <h3>Publicación</h3>
    <p class="section-help">Un borrador se guarda sin publicarse. Publicar exige la confirmación comercial.</p>
    <div class="form-grid">
      ${label('Estado', select('estado', draft.estado || 'BORRADOR', STATES), 'BORRADOR: no se ve en la web. PUBLICADO: visible. OCULTO: se retira sin borrar.')}
      ${label('Fuente de validación', area('fuenteValidacion', draft.fuenteValidacion), 'Dónde confirmaste precio y condiciones (por ejemplo: «lista del propietario, 28/10»). No guardes documentos privados.')}
      ${check('validado', validado, 'Confirmo que la información comercial fue validada.', '', true)}
    </div>
    <div id="checklist-vivo">${checklist(draft, validado, fuente)}</div>
  </section>`;
}

/* Lista de comprobación calculada con lo que hay en pantalla en este momento. */
export function checklist(draft, validado, fuente) {
  const medios = resumenMedios(draft);
  const [fotos, videos] = medios;
  const items = [
    { ok: Boolean(String(draft.nombre || '').trim()), texto: 'Nombre de la ficha' },
    { ok: Boolean(draft.categoriaId), texto: 'Categoría asignada' },
    { ok: draft.precio !== null && draft.precio !== undefined && draft.precio !== '', opcional: true, texto: 'Precio confirmado (si está vacío se muestra «Consultar»)' },
    { ok: fotos.total === 0 ? true : fotos.publicados === fotos.total, opcional: fotos.total === 0, texto: fotos.total ? `Fotografías publicadas (${fotos.publicados} de ${fotos.total})` : 'Sin fotografías (opcional)' },
    { ok: videos.total === 0 ? true : videos.publicados === videos.total, opcional: true, texto: videos.total ? `Videos publicados (${videos.publicados} de ${videos.total})` : 'Sin videos (opcional)' },
    { ok: validado && Boolean(String(fuente || '').trim()), texto: 'Sello comercial y su fuente' }
  ];
  return `<ul class="checklist" aria-label="Comprobaciones para publicar">${items.map((i) => `<li class="${i.ok ? 'ok' : i.opcional ? 'opcional' : 'pendiente'}"><span aria-hidden="true">${i.ok ? '✓' : i.opcional ? '·' : '✗'}</span> ${esc(i.texto)}</li>`).join('')}</ul>`;
}

/* Estado del sello tal como está escrito en el formulario, no en el borrador.
   Se usa al pulsar «Publicar» para decidir si se envía o se avisa. */
export function selloDesdeFormulario(form, draft) {
  const valores = new FormData(form);
  return {
    validado: valores.has('validado'),
    fuente: String(valores.get('fuenteValidacion') || '').trim(),
    estado: String(valores.get('estado') || draft?.estado || 'BORRADOR')
  };
}

export const avisoFaltaSello = 'Para publicar, marca «Confirmo que la información comercial fue validada» y escribe la fuente en la sección de publicación.';
