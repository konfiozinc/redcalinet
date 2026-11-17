// KZ-REDCALINET-037 — Formulario de productos y servicios.
//
// El propietario pedía «formularios claros y organizados» y «evitar formularios
// excesivamente largos». Se conservan TODOS los campos y la MISMA validación
// (el Payload que viaja al Worker es idéntico); lo que cambia es el orden y la
// agrupación: primero lo que el cliente ve, después el precio, después las
// fotografías y los videos, y al final la publicación. Lo que se toca poco
// (especificaciones largas, variantes, orden, URL de portada) queda plegado.

import { esc, estado } from '../nucleo/estado.js';
import { label, input, area, select, check, seccion, plegable } from './campos.js';
import { selectorMedios } from './medios.js';
import { camposPublicacion } from './publicacion.js';

const opcionesCategoria = (actual) => {
  const categorias = (estado.data.categorias || []).map((c) => [c.id, `${c.nombre} · ${c.tipo === 'producto' ? 'producto' : 'servicio'}`]);
  return actual && !categorias.some(([id]) => id === actual) ? [['', '— Selecciona una categoría —'], [actual, actual], ...categorias] : [['', '— Selecciona una categoría —'], ...categorias];
};

export function camposCatalogo(c, r) {
  const esProducto = c === 'productos';
  const sinCategorias = !(estado.data.categorias || []).length;
  const esenciales = seccion('1 · Lo esencial', `<div class="form-grid">
    ${label('Nombre', input('nombre', r.nombre, 'text', 'required maxlength="200" placeholder="Ej.: iPhone 16, 128 GB"'), 'Tal como debe leerlo el cliente.', true)}
    ${label('Categoría', select('categoriaId', r.categoriaId || '', opcionesCategoria(r.categoriaId)), sinCategorias ? 'Todavía no hay categorías. Crea una en «Categorías» antes de guardar.' : 'Decide en qué sección del catálogo aparece.')}
    ${label('Descripción', area('descripcion', r.descripcion), 'Qué incluye y para quién es. Sin promesas que no puedas cumplir.', true)}
  </div>`, 'Lo que el cliente lee primero.');

  const comercial = seccion(esProducto ? '2 · Precio y existencias' : '2 · Precio y disponibilidad', `<div class="form-grid">
    ${label('Precio (COP)', input('precio', r.precio ?? '', 'number', 'min="0" max="1000000000" step="1" inputmode="numeric" placeholder="Ej.: 49900"'), 'Solo números. Vacío = «Consultar por WhatsApp», no cero.')}
    ${esProducto ? label('Disponibilidad', select('disponibilidad', r.disponibilidad || 'DESCONOCIDA', ['DESCONOCIDA', 'DISPONIBLE', 'AGOTADO', 'POR_ENCARGO']), 'Es lo que se anuncia en la ficha pública.') : ''}
    ${esProducto ? label('Existencias', input('stock', r.stock ?? '', 'number', 'min="0" step="1" inputmode="numeric" placeholder="Ej.: 5"'), 'Vacío significa «no confirmado», no cero.') : ''}
    ${esProducto ? `<div class="form-grid-inner">${check('agotado', r.agotado, 'No disponible (agotado)')}${check('destacado', r.destacado, 'Ficha destacada')}</div>` : ''}
  </div>`, 'El precio y las existencias se guardan con su valor real. No se inventan cifras.');

  const fotos = selectorMedios('imagenes', 'image', r);
  const videos = selectorMedios('videos', 'video', r);

  const avanzado = plegable('Más detalles (opcional)', `
    ${esProducto
      ? label('Especificaciones', area('especificaciones', r.especificaciones), 'Solo características verificadas.', true)
      : `${label('Requisitos', area('requisitos', r.requisitos), '', true)}${label('Condiciones', area('condiciones', r.condiciones), 'No afirmar representación oficial sin evidencia.', true)}`}
    ${esProducto ? label('Variantes', area('variantes', (r.variantes || []).map((v) => v.nombre + ': ' + v.valor).join('\n')), 'Una por línea: Color: Azul. Sin código ni JSON.', true) : ''}
    ${label('Características destacadas', area('detalles', (r.detalles || []).join('\n')), 'Una característica verificada por línea.', true)}
    ${label('Orden en el catálogo', input('orden', r.orden ?? 0, 'number', 'min="0" step="1" inputmode="numeric"'), 'Menor número aparece primero.')}
    ${label('Portada por URL (avanzado)', input('imagen', r.imagen || ''), 'Normalmente no hace falta: la portada es la primera fotografía de la galería.', true)}
    <p class="help wide">Contrato público: las galerías y videos se conservan como extensión privada; la web actual usa la portada.</p>`);

  return `${esenciales}${comercial}${fotos}${videos}${avanzado}${camposPublicacion(r)}`;
}

/* Mismo payload que antes, campo por campo. El orden de las claves cambia; el
   contenido no. */
export function valoresCatalogo(c, leer, draft) {
  const pub = { estado: leer.v('estado'), validado: leer.yes('validado'), fuenteValidacion: leer.v('fuenteValidacion') };
  const comunes = {
    nombre: leer.v('nombre'),
    descripcion: leer.v('descripcion'),
    categoriaId: leer.v('categoriaId') || null,
    precio: leer.n('precio'),
    imagen: leer.v('imagen') || null,
    orden: leer.n('orden'),
    agotado: leer.yes('agotado'),
    tipo: c === 'productos' ? 'producto' : 'servicio',
    detalles: leer.v('detalles').split('\n').filter((x) => x.trim()),
    imagenes: draft.imagenes || [],
    videos: draft.videos || [],
    ...pub
  };
  if (c === 'productos') {
    return {
      ...comunes,
      stock: leer.n('stock'),
      disponibilidad: leer.v('disponibilidad'),
      especificaciones: leer.v('especificaciones'),
      destacado: leer.yes('destacado'),
      variantes: leer.v('variantes').split('\n').filter((x) => x.trim()).map((x) => {
        const [nombre, ...value] = x.split(':');
        return { nombre: nombre.trim(), valor: value.join(':').trim() };
      })
    };
  }
  return { ...comunes, requisitos: leer.v('requisitos'), condiciones: leer.v('condiciones') };
}
