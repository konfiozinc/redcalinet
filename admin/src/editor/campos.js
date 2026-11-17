// KZ-REDCALINET-037 — Primitivas de formulario.
//
// Las mismas etiquetas, ayudas y clases que usaba el archivo único, para que el
// CSS aprobado siga aplicándose sin cambios. Se añade la agrupación por
// secciones: en un teléfono un formulario de quince campos seguidos es
// impracticable, pero partido en bloques con título se recorre sin perderse.

import { esc } from '../nucleo/estado.js';

export const label = (name, control, help = '', wide = false) => `<label class="${wide ? 'wide' : ''}">${name}${control}${help ? `<span class="help">${help}</span>` : ''}</label>`;

export const input = (key, value, type = 'text', extra = '') => `<input name="${key}" type="${type}" value="${esc(value)}" ${extra}>`;

export const area = (key, value, extra = '') => `<textarea name="${key}" rows="3" ${extra}>${esc(value)}</textarea>`;

export const select = (key, value, options, extra = '') => `<select name="${key}" ${extra}>${options.map((o) => {
  const [v, l] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`;
}).join('')}</select>`;

export const check = (key, activo, texto, help = '', wide = false) => `<label class="check ${wide ? 'wide' : ''}"><input name="${key}" type="checkbox" ${activo ? 'checked' : ''}>${texto}${help ? `<span class="help">${help}</span>` : ''}</label>`;

/* Un bloque con título y, opcionalmente, una explicación de una línea. */
export const seccion = (titulo, cuerpo, ayuda = '', extra = '') => `<section class="form-section" ${extra}><h3>${titulo}</h3>${ayuda ? `<p class="section-help">${ayuda}</p>` : ''}${cuerpo}</section>`;

/* Bloque plegable para lo que se toca poco: sigue disponible, pero no compite
   por la atención en la pantalla del teléfono. */
export const plegable = (titulo, cuerpo, abierto = false) => `<details class="form-avanzado" ${abierto ? 'open' : ''}><summary>${titulo}</summary><div class="form-grid">${cuerpo}</div></details>`;
