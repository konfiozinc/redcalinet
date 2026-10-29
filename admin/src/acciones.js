// KZ-REDCALINET-037 — Cableado de eventos.
//
// Un único punto donde se decide qué hace cada acción declarada en el HTML con
// `data-action`. Los formularios delegan en el editor; aquí solo se enrutan los
// clics, el foco y las acciones rápidas de las filas.

import { estado, kind, raiz, clearPrivateState } from './nucleo/estado.js';
import { request, loadKind, refresh } from './nucleo/api.js';
import { pintar, pintarLogin } from './nucleo/pintar.js';
import { contenido } from './vistas/index.js';
import {
  abrirEditor, abrirSubida, abrirEliminar, cerrarModal, guardar, subir, eliminar,
  alternarMedia, reordenarMedio, quitarMedio, abrirPicker, cambiarEstadoMedia, actualizarChecklist, errorFormulario
} from './editor/index.js';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';

const repintarContenido = () => { document.querySelector('#module-content').innerHTML = contenido(); };

/* Cambio de estado inmediato desde la fila o la tarjeta. Publicar sigue exigiendo
   el sello comercial: cuando falta, no se fuerza nada, se abre la ficha en la
   sección de publicación para que el propietario lo complete. */
async function cambiarEstadoFicha(rid, nuevo) {
  const c = kind();
  const rec = (estado.data[c] || []).find((r) => r.id === rid);
  if (!rec) return;
  if (nuevo === 'PUBLICADO' && (!rec.validado || !String(rec.fuenteValidacion || '').trim())) {
    abrirEditor(rid, { foco: 'publicacion' });
    errorFormulario('Para publicar falta confirmar la validación comercial y su fuente. Complétalo en la sección de publicación.');
    return;
  }
  try {
    await request(c + '/' + rid, { method: 'PATCH', body: JSON.stringify({ values: { estado: nuevo }, revision: rec.revision }) });
    await refresh();
    estado.notice = nuevo === 'PUBLICADO' ? 'Ficha publicada. Ya puede verse en la web.' : 'Ficha oculta. Deja de mostrarse en la web.';
    pintar();
  } catch (e) {
    await refresh();
    estado.error = e.message;
    pintar();
  }
}

async function alternarVisibilidadCategoria(rid) {
  const rec = (estado.data.categorias || []).find((r) => r.id === rid);
  if (!rec) return;
  try {
    await request('categorias/' + rid, { method: 'PATCH', body: JSON.stringify({ values: { visible: !rec.visible }, revision: rec.revision }) });
    await refresh();
    estado.notice = rec.visible ? 'Categoría oculta.' : 'Categoría visible.';
    pintar();
  } catch (e) {
    await refresh();
    estado.error = e.message;
    pintar();
  }
}

export function conectar() {
  const root = raiz();

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;

    if (form.id === 'login-form') {
      const boton = form.querySelector('button');
      boton.disabled = true;
      estado.error = '';
      estado.loginNotice = '';
      try {
        await signInWithEmailAndPassword(estado.auth, form.email.value, form.password.value);
      } catch {
        estado.error = 'No fue posible iniciar sesión. Revisa la cuenta o su estado.';
        pintarLogin();
      }
      return;
    }

    if (form.id === 'upload-form') return subir(form);
    if (form.id === 'delete-form') return eliminar(form);
    if (form.id === 'editor-form') return guardar(form, ev.submitter?.dataset?.destino || '');
  });

  root.addEventListener('click', async (ev) => {
    const boton = ev.target.closest('[data-action]');
    if (!boton || boton.disabled) return;
    const accion = boton.dataset.action;

    if (accion === 'logout') {
      clearPrivateState();
      await signOut(estado.auth);
      estado.user = null;
      estado.error = '';
      pintarLogin();
      return;
    }

    if (accion === 'reset-password') {
      const email = document.querySelector('#login-form input[name=email]')?.value;
      if (!email) { estado.error = 'Escribe tu correo para solicitar recuperación.'; return pintarLogin(); }
      try {
        await sendPasswordResetEmail(estado.auth, email);
        estado.error = '';
        estado.loginNotice = 'Si la cuenta existe, el servicio de Firebase procesará la recuperación. En QA consulta el emulador.';
      } catch { estado.error = 'No se pudo solicitar recuperación.'; }
      pintarLogin();
      return;
    }

    if (accion === 'toggle-nav' || accion === 'close-nav') {
      estado.sidebar = accion === 'toggle-nav' ? !estado.sidebar : false;
      document.querySelector('.sidebar')?.classList.toggle('open', estado.sidebar);
      document.querySelector('.overlay')?.classList.toggle('open', estado.sidebar);
      return;
    }

    if (accion === 'navigate') {
      estado.view = boton.dataset.view;
      estado.search = '';
      estado.filter = '';
      estado.sidebar = false;
      estado.notice = '';
      estado.error = '';
      estado.auditPage = 0;
      if (['usuarios', 'auditoria'].includes(estado.view)) {
        estado.loading = true;
        pintar();
        try { await loadKind(estado.view); } catch (e) { estado.error = e.message; }
        estado.loading = false;
      }
      pintar();
      return;
    }

    if (accion === 'audit-page') {
      estado.auditPage = Math.max(0, +boton.dataset.page || 0);
      repintarContenido();
      return;
    }

    if (accion === 'refresh') return refresh();

    if (accion === 'clear-filters') {
      estado.search = '';
      estado.filter = '';
      repintarContenido();
      return;
    }

    if (accion === 'new' || accion === 'edit') return abrirEditor(accion === 'new' ? null : boton.dataset.id);

    if (accion === 'upload') return abrirSubida();

    if (accion === 'subir-desde-editor') {
      const campo = boton.dataset.campo || 'imagenes';
      return abrirSubida({
        coleccion: estado.modal.coleccion,
        id: estado.modal.id,
        campo,
        draft: structuredClone(estado.modal.draft)
      });
    }

    if (accion === 'delete-media') return abrirEliminar(boton.dataset.id);

    if (accion === 'close-modal') return cerrarModal();

    if (accion === 'more') {
      try {
        await loadKind(kind(), true);
        repintarContenido();
      } catch (e) {
        estado.error = e.message;
        pintar();
      }
      return;
    }

    if (accion === 'toggle-media') return alternarMedia(boton.dataset.campo, boton.dataset.id);
    if (accion === 'quitar-media') return quitarMedio(boton.dataset.campo, boton.dataset.id);
    if (accion === 'abrir-picker') return abrirPicker(boton.dataset.campo);
    if (accion === 'reorder') return reordenarMedio(boton.dataset.field, +boton.dataset.index, +boton.dataset.direction);

    if (accion === 'media-estado') {
      const desdeEditor = boton.dataset.desdeEditor === '1';
      if (boton.dataset.requiereAlt === '1') {
        const mensaje = 'Esta fotografía necesita texto alternativo antes de publicarse.';
        if (desdeEditor) return errorFormulario(mensaje);
        estado.error = mensaje;
        return pintar();
      }
      return cambiarEstadoMedia(boton.dataset.id, boton.dataset.estado, desdeEditor);
    }

    if (accion === 'quick-estado') return cambiarEstadoFicha(boton.dataset.id, boton.dataset.estado);
    if (accion === 'toggle-visible') return alternarVisibilidadCategoria(boton.dataset.id);
  });

  root.addEventListener('input', (ev) => {
    if (ev.target.matches('[data-search]')) {
      const posicion = ev.target.selectionStart;
      estado.search = ev.target.value;
      repintarContenido();
      const nuevo = document.querySelector('[data-search]');
      nuevo.focus();
      nuevo.setSelectionRange(posicion, posicion);
      return;
    }
    if (ev.target.closest('#editor-form')) actualizarChecklist();
  });

  root.addEventListener('change', (ev) => {
    const x = ev.target;
    if (x.matches('[data-filter]')) {
      estado.filter = x.value;
      repintarContenido();
      return;
    }
    if (x.closest('#editor-form')) actualizarChecklist();
    if (x.type === 'file' && estado.modal?.tipo === 'upload') {
      if (estado.previewURL) URL.revokeObjectURL(estado.previewURL);
      const file = x.files[0];
      const nodo = document.querySelector('#upload-preview');
      nodo.replaceChildren();
      if (!file) return;
      estado.previewURL = URL.createObjectURL(file);
      const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
      el.src = estado.previewURL;
      el.className = 'upload-preview';
      if (el.tagName === 'VIDEO') el.controls = true;
      else el.alt = 'Vista previa del archivo seleccionado';
      nodo.append(el);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (!estado.modal) return;
    if (ev.key === 'Escape') { ev.preventDefault(); cerrarModal(); }
    if (ev.key === 'Tab') {
      const lista = [...document.querySelectorAll('#modal-host button:not(:disabled),#modal-host input:not(:disabled),#modal-host select:not(:disabled),#modal-host textarea:not(:disabled)')];
      if (!lista.length) return;
      const primero = lista[0];
      const ultimo = lista.at(-1);
      if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
    }
  });
}
