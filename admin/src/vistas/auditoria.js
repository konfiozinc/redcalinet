// KZ-REDCALINET-037 — Historial de auditoría (solo SUPERADMIN).
//
// Bloques de 25 registros. El orden cronológico (más reciente primero) lo
// garantiza la API desde KZ-020, así que aquí solo se corta la página. Es
// lectura: no borra ni modifica ninguna entrada.

import { esc, estado } from '../nucleo/estado.js';

export function auditoria() {
  const rows = estado.data.auditoria;
  if (!rows) return '<div class="panel empty">Consulta de auditoría pendiente.</div>';
  const paginas = Math.max(1, Math.ceil(rows.length / 25));
  const pagina = Math.min(Math.max(estado.auditPage, 0), paginas - 1);
  const visibles = rows.slice(pagina * 25, pagina * 25 + 25);
  const desde = pagina * 25 + 1;
  const hasta = Math.min(rows.length, (pagina + 1) * 25);
  return `<section class="panel">
    <div class="panel-head"><h2>Historial de modificaciones</h2><span class="badge">SOLO SUPERADMIN</span></div>
    ${visibles.map((r) => `<div class="activity"><i></i><div><strong>${esc(r.accion)}</strong><small>${esc(r.coleccion)} / ${esc(r.registro)} · ${esc(r.fecha)}<br>Usuario: ${esc(r.actor)} · Campos: ${esc((r.campos || []).join(', ') || 'Permisos')}</small></div></div>`).join('') || '<div class="empty">Sin operaciones registradas.</div>'}
    ${rows.length ? `<div class="pager"><span class="dim">Registros ${desde}–${hasta} de ${rows.length} cargados · página ${pagina + 1} de ${paginas}</span><div class="pager-botones"><button class="secondary" data-action="audit-page" data-page="${pagina - 1}" ${pagina <= 0 ? 'disabled' : ''}>← 25 anteriores</button><button class="secondary" data-action="audit-page" data-page="${pagina + 1}" ${pagina >= paginas - 1 ? 'disabled' : ''}>25 siguientes →</button></div></div>` : ''}
    ${estado.cursors.auditoria ? '<div class="pager-mas"><button class="secondary" data-action="more">Cargar 100 registros anteriores</button></div>' : ''}
  </section>`;
}

export function solicitudes() {
  return `<section class="panel empty"><span class="badge gold">CANAL NO HABILITADO</span><h3>Las solicitudes necesitan un canal real de captura</h3><p>No hay una colección ni integración verificadas para registrar cotizaciones.<br>Las conversaciones de WhatsApp no se importan ni se presentan como recibidas.</p></section>`;
}
