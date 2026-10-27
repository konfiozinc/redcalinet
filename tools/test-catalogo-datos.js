'use strict';
/* ============================================================
 * Prueba del catálogo público SIN emulador ni navegador.
 * ------------------------------------------------------------
 * Certifica tres cosas:
 *   1. data.json cumple el contrato que el panel escribe en Firestore.
 *   2. El mapeo Firestore → catálogo agrupa, ordena y descarta bien.
 *   3. El buscador y los filtros devuelven lo que deben.
 *
 * Ejecutar: node tools/test-catalogo-datos.js
 * No necesita Java, ni firebase-tools, ni dependencias npm.
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const C = require(path.join(ROOT, 'script.js'));

let ok = 0, fail = 0;
const chk = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  PASA   ' + nombre.padEnd(58) + (detalle || '')); }
  else { fail++; console.log('  **FALLA** ' + nombre.padEnd(56) + (detalle || '')); }
};

console.log('== data.json (respaldo local del catálogo) ==');
const bruto = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const local = C.mapearCatalogo(bruto);

chk('data.json es JSON válido y trae marca', Boolean(bruto.marca && bruto.marca.nombre), bruto.marca.nombre);
chk('contacto.whatsapp son solo dígitos', /^\d{10,13}$/.test(String(bruto.contacto.whatsapp)), bruto.contacto.whatsapp);
chk('hay al menos 4 categorías', local.categorias.length >= 4, local.categorias.length + ' categorías');

const productos = [];
local.categorias.forEach((cat) => cat.productos.forEach((p) => productos.push(p)));
chk('el catálogo local tiene productos', productos.length > 0, productos.length + ' productos');

const idsCat = local.categorias.map((c) => c.id);
chk('los ids de categoría son únicos', new Set(idsCat).size === idsCat.length, idsCat.join(', '));
chk('los ids de producto son únicos', new Set(productos.map((p) => p.id)).size === productos.length);
chk('todo producto tiene nombre', productos.every((p) => p.nombre.length > 0));

/* Las imágenes declaradas en data.json deben existir: si se borra el
   archivo, el catálogo no puede quedar apuntando a la nada. */
const conImagen = productos.filter((p) => p.imagen);
chk('hay productos con imagen', conImagen.length > 0, conImagen.length + ' con imagen');
conImagen.forEach((p) => {
  const abs = path.join(ROOT, p.imagen);
  chk('  imagen existe: ' + p.imagen, fs.existsSync(abs));
});

/* Todo producto local sin precio debe ofrecerse como "consultar":
   no se inventan precios en el catálogo. */
const sinPrecio = productos.filter((p) => p.precioTexto === null);
chk('los productos sin precio quedan como consultar', sinPrecio.length === productos.length,
  sinPrecio.length + '/' + productos.length + ' sin precio');

console.log('\n== formatearPrecio ==');
chk('25000 → "$ 25.000"', C.formatearPrecio(25000) === '$ 25.000', C.formatearPrecio(25000));
chk('"25.000" (formato colombiano) → "$ 25.000"', C.formatearPrecio('25.000') === '$ 25.000', C.formatearPrecio('25.000'));
chk('"25000" (texto) → "$ 25.000"', C.formatearPrecio('25000') === '$ 25.000', C.formatearPrecio('25000'));
chk('null → null (consultar)', C.formatearPrecio(null) === null);
chk('cadena vacía → null', C.formatearPrecio('') === null);
chk('0 → null (no se muestra precio)', C.formatearPrecio(0) === null);
chk('texto basura → null', C.formatearPrecio('a convenir') === null);

console.log('\n== resolverImagen ==');
chk('Cloudinary se deja intacto',
  C.resolverImagen('https://res.cloudinary.com/f07x0wga/x.webp') === 'https://res.cloudinary.com/f07x0wga/x.webp');
chk('ruta relativa se conserva', C.resolverImagen('assets/img/galeria/iphone.webp') === 'assets/img/galeria/iphone.webp');
chk('ruta con "/" inicial se normaliza', C.resolverImagen('/assets/x.webp') === 'assets/x.webp');
chk('vacío → ""', C.resolverImagen(null) === '');

console.log('\n== mapearCatalogo (documentos de Firestore) ==');
const categoriasFs = [
  { id: 'cat-tecnologia', nombre: 'Tecnología', icono: 'i-tech', orden: 1, visible: true },
  { id: 'cat-streaming', nombre: 'Streaming', icono: 'i-streaming', orden: 0, visible: true },
  { id: 'cat-oculta', nombre: 'Oculta', icono: 'i-check', orden: 2, visible: false }
];
const serviciosFs = [
  { id: 'svc-b', categoriaId: 'cat-tecnologia', nombre: 'Honor', descripcion: 'Equipo', precio: null, detalles: ['Garantía'], imagen: 'assets/img/galeria/honor-magic.webp', estado: 'PUBLICADO', orden: 1 },
  { id: 'svc-a', categoriaId: 'cat-tecnologia', nombre: 'iPhone', descripcion: 'Equipo', precio: 2100000, detalles: [], imagen: 'https://res.cloudinary.com/f07x0wga/iphone.webp', estado: 'PUBLICADO', orden: 0, destacado: true },
  { id: 'svc-c', categoriaId: 'cat-streaming', nombre: 'Netflix', descripcion: 'Plan mensual', precio: 25000, detalles: ['Mensual'], imagen: null, estado: 'PUBLICADO', orden: 0 },
  { id: 'svc-huerfano', categoriaId: 'cat-inexistente', nombre: 'Huérfano', descripcion: '', precio: null, detalles: [], imagen: null, estado: 'PUBLICADO', orden: 0 },
  { id: 'svc-oculta', categoriaId: 'cat-oculta', nombre: 'De categoría oculta', descripcion: '', precio: null, detalles: [], imagen: null, estado: 'PUBLICADO', orden: 0 }
];

const remoto = C.mapearCatalogo({ categorias: categoriasFs, servicios: serviciosFs, origen: 'firestore' });
chk('origen = firestore', remoto.origen === 'firestore', remoto.origen);
chk('descarta la categoría con visible:false', remoto.categorias.length === 2, remoto.categorias.length + ' categorías');
chk('respeta el orden de categorías', remoto.categorias[0].id === 'cat-streaming', remoto.categorias[0].id);
chk('descarta el producto de categoría inexistente',
  remoto.categorias.every((c) => c.productos.every((p) => p.id !== 'svc-huerfano')));
chk('descarta el producto de categoría oculta',
  remoto.categorias.every((c) => c.productos.every((p) => p.id !== 'svc-oculta')));

const tec = remoto.categorias.find((c) => c.id === 'cat-tecnologia');
chk('coloca cada producto en su categoría', tec.productos.length === 2, tec.productos.length + ' en Tecnología');
chk('el destacado va primero aunque tenga orden mayor', tec.productos[0].id === 'svc-a', tec.productos[0].nombre);
chk('rellena categoriaNombre en el producto', tec.productos[0].categoriaNombre === 'Tecnología', tec.productos[0].categoriaNombre);
chk('precio numérico se formatea', tec.productos[0].precioTexto === '$ 2.100.000', tec.productos[0].precioTexto);
chk('precio null queda en null (consultar)', tec.productos[1].precioTexto === null);
chk('URL de Cloudinary intacta', tec.productos[0].imagen.indexOf('https://res.cloudinary.com/') === 0);
chk('imagen relativa intacta', tec.productos[1].imagen === 'assets/img/galeria/honor-magic.webp');
chk('totales coinciden', C.contarProductos(remoto.categorias) === 3, C.contarProductos(remoto.categorias) + ' productos');

const conAgotado = C.mapearCatalogo({
  categorias: [{ id: 'cat-x', nombre: 'X', orden: 0, visible: true }],
  servicios: [{ id: 'p1', categoriaId: 'cat-x', nombre: 'Agotado', agotado: true, estado: 'PUBLICADO', orden: 0 }]
});
chk('lee el flag agotado', conAgotado.categorias[0].productos[0].agotado === true);

console.log('\n== buscador y filtros ==');
const todo = C.filtrarCatalogo(local.categorias, { q: '', categoriaId: 'todas' });
chk('sin filtro devuelve todo', todo.length === productos.length, todo.length + ' de ' + productos.length);

const porCat = C.filtrarCatalogo(local.categorias, { q: '', categoriaId: 'tecnologia' });
chk('filtro por categoría acota', porCat.length > 0 && porCat.every((p) => p.categoriaId === 'tecnologia'),
  porCat.length + ' en Tecnología');

const sinTildes = C.filtrarCatalogo(local.categorias, { q: 'tramites', categoriaId: 'todas' });
chk('busca sin tildes ("tramites" encuentra "Trámites")', sinTildes.length > 0, sinTildes.length + ' resultados');

const iphone = C.filtrarCatalogo(local.categorias, { q: 'IPHONE', categoriaId: 'todas' });
chk('busca ignorando mayúsculas', iphone.length === 1 && iphone[0].nombre === 'iPhone', iphone.length + ' resultado');

const detalle = C.filtrarCatalogo(local.categorias, { q: 'cargadores', categoriaId: 'todas' });
chk('busca dentro de los detalles del producto', detalle.length === 1, detalle.length + ' resultado');

const nada = C.filtrarCatalogo(local.categorias, { q: 'zzzz-no-existe', categoriaId: 'todas' });
chk('búsqueda sin coincidencias devuelve 0', nada.length === 0);

const combinado = C.filtrarCatalogo(local.categorias, { q: 'a', categoriaId: 'tramites' });
chk('texto + categoría se combinan', combinado.every((p) => p.categoriaId === 'tramites'));

console.log('\n== negocioDesdeFirestore (configuración del panel) ==');
const negocio = C.negocioDesdeFirestore(
  { nombre: 'Red CaliNet', eslogan: 'Eslogan', ciudad: 'Bello', direccion: 'Calle 1' },
  { telefono: '573014585658', whatsapp: '+57 301 458 5658', correo: 'a@b.co', facebook: 'https://facebook.com/x', horarios: [] },
  categoriasFs,
  serviciosFs
);
chk('teléfono queda en dígitos', negocio.contacto.telefono === '573014585658', negocio.contacto.telefono);
chk('teléfono legible para mostrar', negocio.contacto.telefonoTexto === '+57 301 458 5658', negocio.contacto.telefonoTexto);
chk('whatsapp sin símbolos', negocio.contacto.whatsapp === '573014585658', negocio.contacto.whatsapp);
chk('arma enlaces de redes desde contacto',
  negocio.redes.some((r) => r.id === 'whatsapp' && r.url === 'https://wa.me/573014585658') &&
  negocio.redes.some((r) => r.id === 'facebook'));
chk('conserva los beneficios del respaldo', Array.isArray(negocio.beneficios) && negocio.beneficios.length > 0);
chk('vuelve a mapear sin errores', C.mapearCatalogo(negocio).categorias.length === 2);

console.log('\n== mensaje de WhatsApp por producto ==');
const primero = local.categorias[0].productos[0];
const msg = C.mensajeProducto(primero);
chk('el mensaje nombra el producto', msg.indexOf(primero.nombre) !== -1, msg);

console.log(`\n  TOTAL ${ok + fail} · PASA ${ok} · FALLA ${fail}`);
process.exit(fail ? 1 : 0);
