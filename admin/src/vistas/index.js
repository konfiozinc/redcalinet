// KZ-REDCALINET-037 — Selector de vista.
//
// Una sola función decide qué se pinta en `#module-content`. Las vistas son
// puras: leen el estado y devuelven HTML, no llaman a la API ni pintan.

import { estado, kind } from '../nucleo/estado.js';
import { dashboard } from './dashboard.js';
import { rowsTable } from './tabla.js';
import { multimedia } from './multimedia.js';
import { configuracion } from './configuracion.js';
import { auditoria, solicitudes } from './auditoria.js';

export function contenido() {
  const { view } = estado;
  if (view === 'dashboard') return dashboard();
  if (view === 'promociones') return '<div class="alert">Extensión administrativa privada. La web pública actual de Harness no consume promociones; PUBLICADO aquí no significa visible en esa web.</div>' + rowsTable(kind());
  if (view === 'solicitudes') return solicitudes();
  if (['configuracion', 'redes'].includes(view)) return configuracion();
  if (view === 'auditoria') return auditoria();
  if (['multimedia', 'fotografias', 'videos'].includes(view)) return multimedia();
  return rowsTable(kind());
}
