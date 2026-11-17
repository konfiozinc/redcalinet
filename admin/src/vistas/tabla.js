// KZ-REDCALINET-037 — Listados del catálogo y de la administración.
//
// Misma tabla, mismos filtros y mismas etiquetas que antes. Se añaden dos cosas
// que el propietario pedía explícitamente: acciones inmediatas de publicar u
// ocultar directamente desde la fila, sin abrir el formulario entero.

import { esc, estado, money, badge, title, kind, STATES } from '../nucleo/estado.js';

export function filtered(c) {
  const rows = estado.data[c];
  if (!rows) return null;
  return rows.filter((r) => (!estado.search || [r.nombre, r.titulo, r.id, r.descripcion].join(' ').toLowerCase().includes(estado.search.toLowerCase()))
    && (!estado.filter || (c === 'categorias' ? (r.visible ? 'VISIBLE' : 'OCULTA') : (r.estado || r.rol)) === estado.filter));
}

export function filters(c) {
  const opciones = c === 'usuarios' ? ['PROPIETARIO', 'SUPERADMIN']
    : c === 'categorias' ? ['VISIBLE', 'OCULTA']
      : ['multimedia', 'promociones'].includes(c) ? [...STATES, 'ARCHIVADO'] : STATES;
  return `<div class="filters"><input aria-label="Buscar registros" placeholder="Buscar por nombre o referencia…" value="${esc(estado.search)}" data-search><select aria-label="Filtrar estado" data-filter><option value="">Todos los estados</option>${opciones.map((v) => `<option ${estado.filter === v ? 'selected' : ''}>${v}</option>`).join('')}</select><button class="secondary" data-action="clear-filters">Restablecer</button></div>`;
}

/* Acción inmediata por fila. No sustituye al formulario: es el atajo para el
   cambio de estado más frecuente. Publicar sigue exigiendo el sello comercial,
   así que cuando falta se abre el formulario en la sección de publicación. */
function acciones(r, c) {
  const botones = [];
  if (c === 'categorias') {
    botones.push(`<button class="secondary" data-action="toggle-visible" data-id="${esc(r.id)}">${r.visible ? 'Ocultar' : 'Mostrar'}</button>`);
  } else if (['productos', 'servicios', 'promociones'].includes(c)) {
    botones.push(r.estado === 'PUBLICADO'
      ? `<button class="secondary" data-action="quick-estado" data-id="${esc(r.id)}" data-estado="OCULTO">Ocultar</button>`
      : `<button class="secondary" data-action="quick-estado" data-id="${esc(r.id)}" data-estado="PUBLICADO">Publicar</button>`);
  }
  botones.push(`<button class="secondary" data-action="edit" data-id="${esc(r.id)}">Editar</button>`);
  return `<div class="row-actions">${botones.join('')}</div>`;
}

export function rowsTable(c) {
  const rows = filtered(c);
  if (rows === null) return `<div class="panel empty"><h3>Información todavía no disponible</h3><p>La carga pendiente o fallida no se presenta como cero registros.</p></div>`;
  /* KZ-REDCALINET-019: las etiquetas de columna se calculan una sola vez y
     viajan también en cada celda (data-label). Así, en el teléfono, cada registro
     se lee como tarjeta con su nombre, estado, dato principal y acciones, sin
     perder ningún campo ni duplicar texto en la vista de escritorio. */
  const l2 = c === 'usuarios' ? 'ROL' : 'ESTADO';
  const l3 = c === 'categorias' ? 'TIPO'
    : c === 'productos' && estado.view === 'inventario' ? 'EXISTENCIAS'
      : c === 'promociones' ? 'VIGENCIA'
        : c === 'usuarios' ? 'ACCESO' : 'PRECIO';
  return `${filters(c)}<section class="panel">
    <div class="panel-head"><div><h2>${esc(title(estado.view))}</h2><p>${rows.length} registros cargados${estado.cursors[c] ? ' · hay más por consultar' : ''}</p></div><span class="badge">FIRESTORE</span></div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>NOMBRE / REFERENCIA</th><th>${l2}</th><th>${l3}</th><th>ACCIONES</th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td data-label="Nombre / referencia"><button class="row-name" data-action="edit" data-id="${esc(r.id)}">${esc(r.nombre || r.titulo || r.id)}<small>${esc(r.id)}</small></button></td>
      <td data-label="${l2}">${badge(r.estado || r.rol || (r.visible ? 'VISIBLE' : 'OCULTA'))}</td>
      <td data-label="${l3}">${c === 'categorias' ? esc(r.tipo)
        : c === 'productos' && estado.view === 'inventario' ? `${r.stock === null ? 'Sin inventario confirmado' : esc(r.stock)}<small class="dim"> · ${esc(r.disponibilidad)}</small>`
          : c === 'promociones' ? `${Date.parse(r.fin) <= Date.now() ? '<span class="badge red">VENCIDA</span>' : Date.parse(r.inicio) > Date.now() ? '<span class="badge gold">PROGRAMADA</span>' : 'En período'}<small class="dim"> ${esc(r.fin?.slice(0, 10))}</small>`
            : c === 'usuarios' ? (r.activo ? 'Activa' : 'Desactivada')
              : money(r.precio)}</td>
      <td data-label="Acciones">${acciones(r, c)}</td>
    </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><h3>No hay coincidencias</h3><p>Crea un registro o ajusta los filtros.</p></div>'}
    ${estado.cursors[c] ? '<button class="secondary" data-action="more">Cargar siguientes 100</button>' : ''}
  </section>`;
}
