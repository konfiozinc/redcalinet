// KZ-REDCALINET-037 — Editor administrativo.
//
// Reúne el ciclo completo de un registro: abrir, pintar, validar en pantalla y
// guardar. El editor era la parte que concentraba el código difícil de mantener
// (formularios gigantes dentro de una sola plantilla). Ahora cada formulario vive
// en su módulo y aquí solo queda el ciclo de vida y el envío al Worker.
//
// Lo que NO cambia: el payload, las rutas de la API, la revisión optimista, el
// sello comercial obligatorio para publicar y la auditoría del servidor.

import { estado, esc, kind, title } from '../nucleo/estado.js';
import { request, refresh, subidaDirecta } from '../nucleo/api.js';
import { modalFrame as capaModal, pintar } from '../nucleo/pintar.js';
import { camposCatalogo, valoresCatalogo } from './catalogo.js';
import { camposCategorias, camposPromociones, camposMultimedia, camposUsuarios, camposConfiguracion, valoresOtros } from './otros.js';
import { selectorMedios, ordenMedios, archivo } from './medios.js';
import { checklist, avisoFaltaSello } from './publicacion.js';

export function defaultRow(c) {
  if (c === 'usuarios') return { nombre: '', email: '', rol: 'PROPIETARIO', activo: true };
  if (c === 'categorias') return { nombre: '', descripcion: '', tipo: 'servicio', icono: 'i-check', nota: '', orden: 0, visible: true };
  if (c === 'multimedia') return { titulo: '', descripcion: '', alt: '', estado: 'BORRADOR' };
  if (c === 'configuracion') return {};
  if (c === 'promociones') return { nombre: '', descripcion: '', productos: [], servicios: [], descuentoPorcentaje: 10, inicio: '', fin: '', imagenes: [], estado: 'BORRADOR', validado: false, fuenteValidacion: '' };
  return {
    nombre: '', descripcion: '', precio: null, categoriaId: null, imagenes: [], videos: [], estado: 'BORRADOR', validado: false, fuenteValidacion: '',
    ...(c === 'productos' ? { stock: null, disponibilidad: 'DESCONOCIDA', especificaciones: '', variantes: [], destacado: false } : { requisitos: '', condiciones: '' })
  };
}

/* ---------- ciclo de vida ---------- */

export function abrirEditor(rid, opciones = {}) {
  const coleccion = kind();
  const record = estado.data[coleccion]?.find((r) => r.id === rid);
  estado.lastFocus = document.activeElement;
  const id = coleccion === 'configuracion' ? (rid || (estado.view === 'redes' ? 'contacto' : 'empresa')) : rid;
  estado.modal = {
    tipo: 'editor',
    coleccion,
    record,
    draft: opciones.draft ? structuredClone(opciones.draft) : structuredClone(record || defaultRow(coleccion)),
    id
  };
  pintarModal();
  if (opciones.foco) enfocarModulo(opciones.foco);
  if (coleccion === 'multimedia' && rid) cargarUso(rid);
}

export function abrirSubida(desdeEditor = null) {
  estado.lastFocus = document.activeElement;
  estado.modal = { tipo: 'upload', desdeEditor };
  pintarModal();
}

export function abrirEliminar(id) {
  estado.lastFocus = document.activeElement;
  estado.modal = { tipo: 'delete', id };
  pintarModal();
}

export function cerrarModal() {
  if (estado.modalBusy) { estado.notice = 'Hay una operación en curso. Espera su resultado.'; return; }
  if (estado.previewURL) URL.revokeObjectURL(estado.previewURL);
  estado.previewURL = null;
  estado.modal = null;
  document.querySelector('#modal-host').innerHTML = '';
  const shell = document.querySelector('#shell');
  if (shell) shell.inert = false;
  document.body.style.overflow = '';
  estado.lastFocus?.focus();
}

export function setBusy(activo) {
  estado.modalBusy = activo;
  document.querySelectorAll('#modal-host button,#modal-host input,#modal-host select,#modal-host textarea').forEach((x) => { x.disabled = activo; });
}

export function errorFormulario(mensaje) {
  const nodo = document.querySelector('#form-error');
  if (!nodo) return;
  nodo.innerHTML = `<div class="alert error">${esc(mensaje)}</div>`;
  nodo.scrollIntoView({ block: 'nearest' });
}

function avisoModal(mensaje) {
  const nodo = document.querySelector('#form-notice');
  if (nodo) { nodo.innerHTML = `<div class="alert success" role="status">${esc(mensaje)}</div>`; return; }
  estado.notice = mensaje;
}

function enfocarModulo(clave) {
  const objetivo = clave === 'publicacion' ? document.querySelector('#seccion-publicacion')
    : document.querySelector('[data-picker="' + clave + '"]');
  objetivo?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ---------- pintado ---------- */

export function pintarModal() {
  if (!estado.modal) return;
  if (estado.modal.tipo === 'upload') return pintarSubida();
  if (estado.modal.tipo === 'delete') return pintarEliminar();
  const { draft: r, coleccion: c } = estado.modal;
  let fields = '';
  if (['productos', 'servicios'].includes(c)) fields = camposCatalogo(c, r);
  else if (c === 'categorias') fields = camposCategorias(r);
  else if (c === 'promociones') fields = camposPromociones(r);
  else if (c === 'multimedia') fields = camposMultimedia(r);
  else if (c === 'usuarios') fields = camposUsuarios(r, !estado.modal.record);
  else if (c === 'configuracion') fields = camposConfiguracion(estado.modal.id, r);

  capaModal((estado.modal.record ? 'Editar ' : 'Crear ') + title(c).toLowerCase(), `<form id="editor-form" class="form">
    <div id="form-notice" role="status"></div>
    <div id="form-error" role="alert" class="form-error"></div>
    ${fields}
    ${barraAcciones(c, r)}
  </form>`);
}

/* Barra de acciones fija: en el teléfono queda siempre a la vista, así que
   guardar, publicar u ocultar no exige bajar hasta el final del formulario. */
function barraAcciones(c, draft) {
  if (['usuarios', 'configuracion', 'multimedia', 'categorias'].includes(c)) {
    return `<div class="modal-actions fixed-actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary" type="submit" data-destino="">Guardar cambios</button></div>`;
  }
  const publicado = (draft.estado || 'BORRADOR') === 'PUBLICADO';
  return `<div class="modal-actions fixed-actions">
    <button type="button" class="secondary" data-action="close-modal">Cancelar</button>
    <button type="submit" class="secondary" data-destino="">Guardar</button>
    ${publicado
      ? '<button type="submit" class="danger" data-destino="OCULTO">Ocultar ficha</button>'
      : '<button type="submit" class="primary" data-destino="PUBLICADO">Publicar ficha</button>'}
  </div>`;
}

function pintarSubida() {
  const tipo = estado.modal.desdeEditor?.campo === 'videos' || estado.view === 'videos' ? 'video' : 'image';
  capaModal(tipo === 'video' ? 'Subir video' : 'Subir fotografía', `<form id="upload-form" class="upload-box">
    <div id="form-error" role="alert" class="form-error"></div>
    <div class="alert">${estado.boot.media.fixture ? 'Adaptador local de subida directa para pruebas. No es una carga real a Cloudinary.' : 'Subida directa firmada: la firma la emite el servidor y el archivo va del navegador al proveedor. No se publica automáticamente.'}</div>
    <label>Archivo<input type="file" name="file" accept="${tipo === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'}" required></label>
    <p class="help">${tipo === 'video' ? 'Videos hasta 25 MB · MP4 y WebM.' : 'Imágenes hasta 10 MB · JPEG, PNG y WebP.'} El archivo se envía directo al proveedor con una firma de vida corta; el secreto nunca sale del servidor.</p>
    <label>Título<input name="titulo" type="text" required maxlength="200" value=""></label>
    ${tipo === 'image' ? '<label>Texto alternativo<input name="alt" type="text" maxlength="200"><span class="help">Describe la imagen para quien no puede verla. Es obligatorio para publicarla.</span></label>' : '<input type="hidden" name="alt" value="">'}
    <div id="upload-preview"></div>
    <div class="progress-track"><div class="progress-fill" id="upload-progress"></div></div>
    <p id="upload-status" role="status">Selecciona un archivo para previsualizarlo.</p>
    <div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cerrar</button><button type="submit" class="primary">Subir archivo</button></div>
  </form>`);
}

function pintarEliminar() {
  capaModal('Eliminar archivo', `<form id="delete-form" class="form">
    <div class="alert">Se eliminará el archivo del proveedor. No se permite si está asociado a productos, servicios o promociones.</div>
    <label>Escribe ELIMINAR ARCHIVO<input name="confirm" type="text" required autocomplete="off" value=""></label>
    <div id="form-error" role="alert"></div>
    <div class="modal-actions"><button type="button" data-action="close-modal" class="secondary">Cancelar</button><button type="submit" class="danger">Eliminar definitivamente</button></div>
  </form>`);
}

/* ---------- valores del formulario ---------- */

export function valores(form) {
  const datos = new FormData(form);
  const leer = {
    v: (k) => String(datos.get(k) || ''),
    n: (k) => (leer.v(k) === '' ? null : Number(leer.v(k))),
    yes: (k) => datos.has(k),
    todos: (k) => datos.getAll(k)
  };
  const c = estado.modal.coleccion;
  if (['productos', 'servicios'].includes(c)) return valoresCatalogo(c, leer, estado.modal.draft);
  return valoresOtros(c, leer, form, estado.modal);
}

/* ---------- guardar ---------- */

export async function guardar(form, destino = '') {
  let values;
  try { values = valores(form); } catch { return errorFormulario('Revisa los valores y las fechas.'); }
  if (!values) return;
  if (destino) values.estado = destino;

  const coleccion = estado.modal.coleccion;
  const intentaPublicar = values.estado === 'PUBLICADO' && ['productos', 'servicios', 'promociones'].includes(coleccion);
  if (intentaPublicar && (!values.validado || !String(values.fuenteValidacion || '').trim())) {
    enfocarModulo('publicacion');
    return errorFormulario(avisoFaltaSello);
  }

  setBusy(true);
  try {
    if (coleccion === 'usuarios') await request('usuarios', { method: 'POST', body: JSON.stringify(values) });
    else await request(coleccion + (estado.modal.id ? '/' + estado.modal.id : ''), {
      method: estado.modal.record ? 'PATCH' : 'POST',
      body: JSON.stringify({ values, revision: estado.modal.record?.revision })
    });
    setBusy(false);
    cerrarModal();
    estado.notice = values.estado === 'PUBLICADO' ? 'Guardado y publicado. La ficha ya puede verse en la web.'
      : values.estado === 'OCULTO' ? 'Guardado. La ficha quedó oculta y no se muestra en la web.'
        : 'Cambios guardados con auditoría.';
    await refresh();
  } catch (e) {
    setBusy(false);
    errorFormulario(e.message);
  }
}

/* ---------- subida ---------- */

export async function subir(form) {
  const generacion = estado.sesion;
  const file = form.file.files[0];
  if (!file) return;
  const tipo = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
  if (!tipo) return errorFormulario('Formato no permitido. Usa JPEG, PNG, WebP, MP4 o WebM.');
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  const formatos = estado.boot.media.formatos?.[tipo] || [];
  const maximo = estado.boot.media.maxBytes?.[tipo] || 0;
  if (!formatos.includes(extension)) return errorFormulario('Extensión no permitida para ' + tipo + ': ' + formatos.join(', ') + '.');
  if (!maximo || file.size > maximo) return errorFormulario('El archivo supera el tamaño permitido para su tipo.');

  const pendiente = estado.modal.desdeEditor;
  setBusy(true);
  try {
    const firma = await request('multimedia/firma', { method: 'POST', body: JSON.stringify({ tipo }) });
    const cargado = await subidaDirecta(firma, file, generacion);
    if (generacion !== estado.sesion) return;
    const nuevo = await request('multimedia/registrar', {
      method: 'POST',
      body: JSON.stringify({
        tipo: firma.tipo, timestamp: firma.timestamp, signature: firma.signature,
        resultado: cargado.resultado, sha256Cliente: cargado.sha256,
        titulo: form.titulo.value, alt: form.alt.value
      })
    });
    if (generacion !== estado.sesion) return;
    setBusy(false);
    cerrarModal();
    estado.notice = (tipo === 'video' ? 'Video cargado correctamente.' : 'Fotografía cargada correctamente.') + ' Revisa su título y estado antes de publicarlo.';
    await refresh();
    /* Si la carga empezó dentro de una ficha, se vuelve a ella con el archivo
       recién subido ya seleccionado: no se pierde lo que se estaba escribiendo. */
    if (pendiente && nuevo?.id) {
      const draft = structuredClone(pendiente.draft);
      draft[pendiente.campo] = [...(draft[pendiente.campo] || []), nuevo.id];
      abrirEditor(pendiente.id, { draft, foco: pendiente.campo });
      avisoModal('Archivo subido y añadido a esta ficha.');
    }
  } catch (e) {
    if (generacion !== estado.sesion) return;
    setBusy(false);
    errorFormulario(e.message);
    const estadoTexto = document.querySelector('#upload-status');
    if (estadoTexto) estadoTexto.textContent = 'La carga no se completó.';
  }
}

export async function eliminar(form) {
  setBusy(true);
  try {
    await request('multimedia/' + estado.modal.id, { method: 'DELETE', body: JSON.stringify({ confirm: form.confirm.value }) });
    setBusy(false);
    cerrarModal();
    estado.notice = 'Archivo eliminado.';
    await refresh();
  } catch (e) {
    setBusy(false);
    errorFormulario(e.message);
  }
}

/* ---------- galería y archivos ---------- */

export function actualizarPicker(campo) {
  const nodo = document.querySelector('[data-picker="' + campo + '"]');
  if (nodo) nodo.outerHTML = selectorMedios(campo, campo === 'videos' ? 'video' : 'image', estado.modal.draft);
  actualizarChecklist();
}

export function alternarMedia(campo, id) {
  const draft = estado.modal.draft;
  const actuales = draft[campo] || [];
  draft[campo] = actuales.includes(id) ? actuales.filter((m) => m !== id) : [...actuales, id];
  actualizarPicker(campo);
}

export function reordenarMedio(campo, indice, direccion) {
  const lista = estado.modal.draft[campo];
  const j = indice + direccion;
  if (!lista || j < 0 || j >= lista.length) return;
  [lista[indice], lista[j]] = [lista[j], lista[indice]];
  document.querySelector('[data-gallery="' + campo + '"]').innerHTML = ordenMedios(campo, estado.modal.draft);
  actualizarChecklist();
}

export function quitarMedio(campo, id) {
  estado.modal.draft[campo] = (estado.modal.draft[campo] || []).filter((m) => m !== id);
  actualizarPicker(campo);
}

export function actualizarChecklist() {
  const contenedor = document.querySelector('#checklist-vivo');
  const form = document.querySelector('#editor-form');
  if (!contenedor || !form) return;
  const draft = estado.modal?.draft || {};
  const vivo = {
    ...draft,
    nombre: form.nombre?.value ?? draft.nombre,
    categoriaId: form.categoriaId?.value || null,
    precio: form.precio?.value === '' ? null : form.precio?.value,
    validado: Boolean(form.validado?.checked),
    fuenteValidacion: form.fuenteValidacion?.value || ''
  };
  contenedor.innerHTML = checklist(vivo, vivo.validado, vivo.fuenteValidacion);
}

/* ---------- archivos: publicar u ocultar sin salir de la ficha ---------- */

export async function cambiarEstadoMedia(id, nuevo, desdeEditor = false) {
  const m = archivo(id);
  if (!m) return;
  if (nuevo === 'PUBLICADO' && m.tipo === 'image' && !String(m.alt || '').trim()) {
    const mensaje = 'Esta fotografía no tiene texto alternativo. Ábrela en Fotografías para completarlo antes de publicarla.';
    if (desdeEditor) return errorFormulario(mensaje);
    estado.error = mensaje;
    return pintar();
  }
  try {
    await request('multimedia/' + id, { method: 'PATCH', body: JSON.stringify({ values: { estado: nuevo }, revision: m.revision }) });
    m.estado = nuevo;
    m.revision = (m.revision || 0) + 1;
    if (desdeEditor) {
      actualizarPicker(m.tipo === 'video' ? 'videos' : 'imagenes');
      avisoModal(nuevo === 'PUBLICADO' ? 'Archivo publicado.' : 'Archivo oculto.');
    } else {
      estado.notice = nuevo === 'PUBLICADO' ? 'Archivo publicado.' : 'Archivo oculto.';
      pintar();
    }
  } catch (e) {
    if (desdeEditor) return errorFormulario(e.message);
    estado.error = e.message;
    pintar();
  }
}

/* ---------- uso del archivo ---------- */

function cargarUso(rid) {
  request('multimedia/' + rid + '/uso').then((r) => {
    const nodo = document.querySelector('#usage');
    if (nodo) nodo.innerHTML = `<strong>Usado por ${r.items.length} registros</strong>${r.items.map((x) => `<p>${esc(x.coleccion)} · ${esc(x.nombre)}</p>`).join('')}`;
  }).catch((e) => {
    const nodo = document.querySelector('#usage');
    if (nodo) nodo.textContent = e.message;
  });
}
