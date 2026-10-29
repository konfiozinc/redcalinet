// KZ-REDCALINET-037 — Tablero de indicadores.
//
// Solo lee `estado.dashboard`, que la API entrega ya calculado. No inventa ceros:
// si la consulta no llegó, lo dice.

import { esc, estado } from '../nucleo/estado.js';

export function dashboard() {
  if (!estado.dashboard) return '<div class="panel empty"><h3>Indicadores no disponibles</h3><p>Esperando la consulta de Firestore.</p></div>';
  const d = estado.dashboard;
  const cards = [
    ['Productos', d.productos, 'Referencias registradas'],
    ['Publicados', d.publicados, 'Validados para oferta pública'],
    ['Por validar', d.pendientes, 'No se ofrecen públicamente'],
    ['Ocultos', d.ocultos, 'Fuera del catálogo público'],
    ['Servicios', d.servicios, 'Servicios registrados'],
    ['Promociones activas', d.promocionesActivas, 'Dentro de su vigencia'],
    ['Promociones vencidas', d.promocionesVencidas, 'Conservadas en historial'],
    ['Solicitudes', 'Sin captura', 'WhatsApp no genera un registro automático']
  ];
  return `<section class="stats">${cards.map(([label, value, note]) => `<article class="stat"><span>${label}</span><strong>${esc(value)}</strong><small>${note}</small></article>`).join('')}</section>
  <div class="columns">
    <section class="panel">
      <div class="panel-head"><h2>Últimos cambios</h2><span class="badge blue">AUDITORÍA</span></div>
      ${d.actividad.length
        ? d.actividad.map((r) => `<div class="activity"><i></i><div><strong>${esc(r.accion.replaceAll('_', ' '))}</strong><small>${esc(r.coleccion)} · ${esc(r.fecha)} · ${esc(r.rol)}</small></div></div>`).join('')
        : '<div class="empty">Todavía no hay modificaciones registradas.</div>'}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Tu catálogo, bien presentado</h2></div>
      <div class="next-step">
        <h3>Primero validar, después publicar.</h3>
        <p>Confirma precios, disponibilidad y condiciones antes de ofrecer una referencia.</p>
        <p>Organiza fotos y videos en sus secciones. La primera foto de cada ficha es la portada.</p>
        <button class="primary" data-action="navigate" data-view="productos">Administrar productos →</button>
      </div>
    </section>
  </div>`;
}
