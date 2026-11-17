// KZ-REDCALINET-037 — Configuración empresarial y redes sociales.
//
// Mismos dos documentos (`configuracion/empresa` y `configuracion/contacto`) y
// mismo formulario. Solo se separa del archivo único.

import { esc, estado } from '../nucleo/estado.js';

export function configuracion() {
  const record = estado.data.configuracion?.find((r) => r.id === (estado.view === 'redes' ? 'contacto' : 'empresa'));
  const contact = estado.data.configuracion?.find((r) => r.id === 'contacto');
  const editar = estado.view === 'redes' ? 'contacto' : 'empresa';
  return `<section class="panel">
    <div class="panel-head"><div><h2>Información comercial</h2><p>Documentos configuracion/empresa y configuracion/contacto · contrato Harness</p></div><button class="primary" data-action="edit" data-id="${editar}">Editar configuración</button></div>
    <div class="next-step">
      ${record ? `<h3>${esc(record.nombre || 'Contacto y redes')}</h3>
      <p>WhatsApp: ${esc(contact?.whatsapp || 'Sin registrar')}</p>
      <p>Dirección: ${esc(record.direccion || 'Por confirmar')}</p>
      ${['facebook', 'instagram', 'tiktok'].map((k) => `<p>${esc(k)}: ${contact?.[k] ? `<a href="${esc(contact[k])}" target="_blank" rel="noopener noreferrer">${esc(contact[k])}</a>` : 'Sin enlace confirmado'}</p>`).join('')}`
        : 'La configuración todavía no está registrada.'}
    </div>
  </section>`;
}
