/* ============================================================
   Red CaliNet — script.js
   Catálogo público.
   - Fuente de datos en cascada: Firestore (en vivo) → data.json → respaldo embebido.
   - Pinta marca, categorías, catálogo de productos, beneficios, contacto y redes.
   - Catálogo: buscador, filtro por categoría, ficha de detalle y cierre por WhatsApp.
   - Guarda nombre y correo en localStorage para la próxima visita.
   Sin dependencias externas: JS vanilla.
   ============================================================ */
"use strict";

/* Respaldo por si data.json no carga (p. ej. abriendo el HTML con file://).
   Debe coincidir con data.json: si editas los productos ahí, edítalos aquí. */
const FALLBACK = {
  marca: {
    nombre: "Red CaliNet",
    nombreLegal: "REDCALINET",
    eslogan: "Tu conexión con servicios y soluciones digitales",
    esloganHistorico: "Calidad de ventas por internet",
    promesa: "Servicio garantizado, lo primordial para nosotros es el cliente.",
    ciudad: "Bello, Antioquia, Colombia"
  },
  contacto: {
    telefono: "573014585658",
    telefonoTexto: "+57 301 458 5658",
    whatsapp: "573014585658",
    whatsappTexto: "Hola, vi su página web y quiero información.",
    correo: "redcalinetmono@gmail.com",
    direccion: "Calle 64 AB #105 A 93, Bello, Antioquia, Colombia",
    direccionNota: "Atendemos también por WhatsApp"
  },
  horarios: [
    { dia: "Lunes a sábado", hora: "09:00 – 21:30" },
    { dia: "Domingo", hora: "10:00 – 20:00" }
  ],
  redes: [
    { id: "instagram", nombre: "Instagram", usuario: "@red_calinet", url: "https://www.instagram.com/red_calinet" },
    { id: "whatsapp", nombre: "WhatsApp", usuario: "+57 301 458 5658", url: "https://wa.me/573014585658" },
    { id: "facebook", nombre: "Facebook", usuario: "Red CaliNet", url: "https://www.facebook.com/share/1DfEomgbbL/?mibextid=wwXIfr" }
  ],
  categorias: [
    {
      id: "streaming", nombre: "Streaming", icono: "i-streaming",
      descripcion: "Suscripciones, planes y servicios digitales.",
      nota: "Referencias históricas en Facebook: Netflix, Amazon Prime, Fox, IPTV, Claro Video y HBO Go. No se publican como oferta vigente: confirmar plataformas, precios y autorización de comercialización.",
      fichas: [
        { nombre: "Plataformas de streaming", descripcion: "Planes de suscripción a las plataformas digitales que ofrecemos actualmente.", precio: null, detalles: ["Planes y suscripciones", "Activación y soporte"], imagen: null }
      ]
    },
    {
      id: "tramites", nombre: "Trámites", icono: "i-tramites",
      descripcion: "Asesoría y acompañamiento en gestiones y citas.",
      nota: "Servicio de asesoría o acompañamiento: no somos una entidad oficial.",
      fichas: [
        { nombre: "Pasaportes", descripcion: "Asesoría y acompañamiento para tu trámite de pasaporte.", precio: null, detalles: ["Acompañamiento en el proceso", "Asesoría en requisitos"], imagen: null },
        { nombre: "Citas RUNT", descripcion: "Gestión y acompañamiento para tus citas RUNT.", precio: null, detalles: ["Acompañamiento", "Asesoría en requisitos"], imagen: null },
        { nombre: "Trámites de salud", descripcion: "Asesoría en citas y trámites de salud (EPS, autorizaciones).", precio: null, detalles: ["Asesoría"], imagen: null }
      ]
    },
    {
      id: "tv-app", nombre: "TV por App", icono: "i-streaming",
      descripcion: "Televisión mediante aplicaciones y dispositivos compatibles.",
      nota: "Servicios sujetos a disponibilidad y autorización del proveedor.",
      fichas: [
        { nombre: "Planes de TV por aplicación", descripcion: "Planes de televisión para Smart TV, celular y más.", precio: null, detalles: ["Planes por duración", "Dispositivos compatibles"], imagen: null }
      ]
    },
    {
      id: "tecnologia", nombre: "Tecnología", icono: "i-tech",
      descripcion: "Equipos y accesorios de calidad.",
      nota: "Referencia histórica en Facebook: celulares y accesorios (marcas como Redmi). Equipos, existencias y disponibilidad por confirmar.",
      fichas: [
        { nombre: "iPhone", descripcion: "Equipos iPhone con garantía.", precio: null, detalles: ["Garantía"], imagen: "assets/img/galeria/iphone.webp" },
        { nombre: "Honor Magic 8 Lite", descripcion: "Equipos Honor con garantía.", precio: null, detalles: ["Garantía"], imagen: "assets/img/galeria/honor-magic.webp" },
        { nombre: "Accesorios", descripcion: "Audífonos, cargadores, cables y más.", precio: null, detalles: ["Audífonos", "Cargadores", "Cables"], imagen: null }
      ]
    }
  ],
  beneficios: [
    { id: "cliente", icono: "i-heart", titulo: "Lo primordial es el cliente", texto: "Tu satisfacción manda: te acompañamos antes, durante y después de la compra." },
    { id: "personalizada", icono: "i-chat", titulo: "Atención personalizada", texto: "Te atendemos uno a uno por WhatsApp y en el punto físico." },
    { id: "punto", icono: "i-pin", titulo: "Punto físico en Bello", texto: "Nos puedes encontrar en Bello, Antioquia. No somos solo un chat." }
  ]
};

const CLAVE_LOCAL = "redcalinet-contacto";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Solo acepto ids de icono del sprite; cualquier otra cosa cae a un check. */
const icono = (id) => (/^i-[a-z]+$/.test(String(id)) ? id : "i-check");

function svg(id, clase) {
  return '<svg class="ico' + (clase ? " " + clase : "") + '" aria-hidden="true"><use href="#' + icono(id) + '"></use></svg>';
}

/* ============================================================
   Utilidades puras del catálogo
   (sin DOM: se prueban en Node con tools/test-catalogo-datos.js)
   ============================================================ */

const MONEDA = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

/* Convierte 25000 → "$ 25.000". Devuelve null si no hay precio usable:
   null, "", 0 o basura significan "consultar por WhatsApp". */
function formatearPrecio(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  let n;
  if (typeof valor === "number") {
    n = valor;
  } else {
    const limpio = String(valor).trim();
    // "25.000" o "25,000" son separadores de miles; "25000,50" es decimal.
    n = /^-?\d{1,3}([.,]\d{3})+$/.test(limpio)
      ? Number(limpio.replace(/[.,]/g, ""))
      : Number(limpio.replace(/,/g, ".").replace(/[^\d.-]/g, ""));
  }

  if (!Number.isFinite(n) || n <= 0) return null;
  return MONEDA.format(n).replace(/[\u00a0\u202f]/g, " ");
}

/* URL absoluta (Cloudinary) o ruta relativa al sitio. Vacío = sin imagen. */
function resolverImagen(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s) || s.startsWith("data:")) return s;
  return s.replace(/^\/+/, "");
}

/* Minúsculas y sin tildes: "Tramites" encuentra "Trámites". */
function normalizarTexto(valor) {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TIPO_PRODUCTO = "producto";
const TIPO_SERVICIO = "servicio";

/* Un producto físico se compra y se entrega; un servicio se presta.
   `tipo` es opcional en los datos: si falta (Firestore antiguo o el respaldo
   embebido) se infiere del icono de la categoría, sin inventar nada. */
function normalizarTipo(valor, icono) {
  const t = String(valor || "").trim().toLowerCase();
  if (t === TIPO_PRODUCTO || t === TIPO_SERVICIO) return t;
  return icono === "i-tech" ? TIPO_PRODUCTO : TIPO_SERVICIO;
}

function normalizarCategoria(cat, indice) {
  if (!cat || typeof cat !== "object") return null;
  const nombre = String(cat.nombre || "").trim();
  if (!nombre) return null;
  const orden = Number(cat.orden);
  const iconoCat = cat.icono || "i-check";
  return {
    id: String(cat.id || "categoria-" + indice),
    nombre: nombre,
    icono: iconoCat,
    tipo: normalizarTipo(cat.tipo, iconoCat),
    descripcion: String(cat.descripcion || "").trim(),
    nota: String(cat.nota || "").trim(),
    orden: Number.isFinite(orden) ? orden : indice,
    visible: cat.visible !== false,
    productos: []
  };
}

function normalizarProducto(doc, indice) {
  if (!doc || typeof doc !== "object") return null;
  const nombre = String(doc.nombre || "").trim();
  if (!nombre) return null;
  const orden = Number(doc.orden);
  return {
    id: String(doc.id || doc.slug || "producto-" + indice),
    nombre: nombre,
    descripcion: String(doc.descripcion || "").trim(),
    precio: doc.precio === null || doc.precio === undefined || doc.precio === "" ? null : doc.precio,
    precioTexto: formatearPrecio(doc.precio),
    imagen: resolverImagen(doc.imagen),
    detalles: Array.isArray(doc.detalles) ? doc.detalles.map((d) => String(d).trim()).filter(Boolean) : [],
    /* Opcionales: si el panel no los escribe, el producto se comporta normal. */
    destacado: doc.destacado === true,
    agotado: doc.agotado === true,
    orden: Number.isFinite(orden) ? orden : indice,
    categoriaId: String(doc.categoriaId || ""),
    /* Se resuelve en mapearCatalogo con el tipo de su categoría. */
    tipo: String(doc.tipo || "").trim().toLowerCase(),
    tipoTexto: "",
    esFisico: false,
    categoriaNombre: "",
    iconoCategoria: "i-check"
  };
}

function ordenDeProductos(a, b) {
  return (Number(b.destacado) - Number(a.destacado)) || (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es");
}

/* Acepta las dos formas de origen:
   - Firestore: colección `servicios` aparte, enlazada por categoriaId.
   - data.json: fichas anidadas dentro de cada categoría. */
function serviciosDeFuente(fuente, categoriasCrudas) {
  if (Array.isArray(fuente.servicios)) return fuente.servicios;

  const salida = [];
  (categoriasCrudas || []).forEach((cat, ci) => {
    const idCat = String((cat && cat.id) || "categoria-" + ci);
    const fichas = Array.isArray(cat && cat.fichas) ? cat.fichas : [];
    fichas.forEach((ficha, fi) => {
      const copia = Object.assign({}, ficha);
      if (!copia.id) copia.id = idCat + "-" + fi;
      if (!copia.categoriaId) copia.categoriaId = idCat;
      salida.push(copia);
    });
  });
  return salida;
}

/* Empareja categorías y productos, descarta categorías ocultas y deja
   cada producto dentro de su categoría (PUBLICADO lo garantizan las reglas). */
function mapearCatalogo(negocio) {
  const fuente = negocio || {};
  const categoriasCrudas = Array.isArray(fuente.categorias) ? fuente.categorias : [];
  const serviciosCrudos = serviciosDeFuente(fuente, categoriasCrudas);

  const categorias = categoriasCrudas
    .map(normalizarCategoria)
    .filter(Boolean)
    .filter((c) => c.visible)
    .sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"));

  const productos = serviciosCrudos
    .map(normalizarProducto)
    .filter(Boolean)
    .sort(ordenDeProductos);

  const porCategoria = new Map();
  categorias.forEach((cat) => porCategoria.set(cat.id, []));

  productos.forEach((p) => {
    if (!porCategoria.has(p.categoriaId)) return; // huérfano: categoría inexistente u oculta
    const cat = categorias.find((c) => c.id === p.categoriaId);
    p.categoriaNombre = cat ? cat.nombre : "";
    p.iconoCategoria = cat ? cat.icono : "i-check";
    /* El producto puede forzar su tipo; si no, manda su categoría. */
    p.tipo = p.tipo === TIPO_PRODUCTO || p.tipo === TIPO_SERVICIO
      ? p.tipo
      : (cat ? cat.tipo : TIPO_SERVICIO);
    p.esFisico = p.tipo === TIPO_PRODUCTO;
    p.tipoTexto = p.esFisico ? "Producto" : "Servicio";
    porCategoria.get(p.categoriaId).push(p);
  });

  categorias.forEach((cat) => { cat.productos = porCategoria.get(cat.id) || []; });

  return {
    marca: fuente.marca || FALLBACK.marca,
    contacto: fuente.contacto || FALLBACK.contacto,
    horarios: Array.isArray(fuente.horarios) ? fuente.horarios : FALLBACK.horarios,
    redes: Array.isArray(fuente.redes) ? fuente.redes : FALLBACK.redes,
    categorias: categorias,
    beneficios: Array.isArray(fuente.beneficios) && fuente.beneficios.length ? fuente.beneficios : FALLBACK.beneficios,
    origen: fuente.origen || "local"
  };
}

/* Filtro del catálogo: texto libre + categoría. Devuelve la lista plana
   en el orden de las categorías (y destacados primero dentro de cada una). */
function filtrarCatalogo(categorias, filtro) {
  const q = normalizarTexto(filtro && filtro.q);
  const categoriaId = (filtro && filtro.categoriaId) || "todas";
  const salida = [];

  (categorias || []).forEach((cat) => {
    if (categoriaId !== "todas" && cat.id !== categoriaId) return;
    const productos = (cat.productos || []).slice().sort(ordenDeProductos);
    productos.forEach((p) => {
      if (!q) { salida.push(p); return; }
      const heno = normalizarTexto([p.nombre, p.descripcion, p.detalles.join(" "), cat.nombre].join(" "));
      if (heno.indexOf(q) !== -1) salida.push(p);
    });
  });

  return salida;
}

function contarProductos(categorias) {
  return (categorias || []).reduce((n, c) => n + ((c.productos || []).length), 0);
}

/* ============================================================
   Estado de la interfaz
   ============================================================ */

let DATA = mapearCatalogo({ ...FALLBACK, origen: "respaldo" });
const FILTRO = { q: "", categoriaId: "todas" };

/* ---------- Enlaces de WhatsApp ---------- */
function waLink(texto) {
  return "https://wa.me/" + DATA.contacto.whatsapp + "?text=" + encodeURIComponent(texto);
}

function mensajeProducto(prod) {
  const cat = prod.categoriaNombre ? " (" + prod.categoriaNombre + ")" : "";
  return 'Hola, quiero información sobre "' + prod.nombre + '"' + cat + " — vi el catálogo de Red CaliNet.";
}

function pintarEnlacesWa() {
  $$("[data-wa]").forEach((el) => {
    el.href = waLink(el.dataset.waTexto || DATA.contacto.whatsappTexto);
  });
}

/* Enlace de Facebook (URL desde data.json). Oculta el botón si no hay URL. */
function pintarFacebookCta() {
  const fb = (DATA.redes || []).find((r) => r.id === "facebook");
  const el = $("#facebookCta");
  if (!el) return;
  if (fb && fb.url) {
    el.href = fb.url;
  } else {
    el.hidden = true;
  }
}

/* ---------- Render ---------- */
function pintarMarca() {
  document.title = DATA.marca.nombre + " — " + DATA.marca.eslogan + " | Bello, Antioquia";

  const eyebrow = $("#heroEyebrow");
  if (eyebrow) eyebrow.innerHTML = svg("i-pin") + esc(DATA.marca.ciudad);

  const titulo = $("#heroTitulo");
  if (titulo) titulo.textContent = DATA.marca.eslogan;

  const sub = $("#heroSub");
  if (sub) {
    const lista = DATA.categorias.map((c) => c.nombre.toLowerCase()).join(", ");
    sub.textContent = lista.charAt(0).toUpperCase() + lista.slice(1) + ". " + DATA.marca.promesa;
  }

  const anio = $("#anio");
  if (anio) anio.textContent = String(new Date().getFullYear());
}

function pintarChips() {
  const ul = $("#chips");
  if (!ul) return;
  ul.innerHTML = DATA.categorias
    .map((c) => '<li><a href="#cat-' + esc(c.id) + '">' + svg(c.icono) + esc(c.nombre) + "</a></li>")
    .join("");
}

/* El hero dice, en tres golpes, por qué comprar aquí. Todo sale de los datos
   reales (promesa de marca, ciudad y WhatsApp): no hay promesas inventadas. */
function pintarHero() {
  const ul = $("#heroValores");
  if (ul) {
    const ciudadCorta = String(DATA.marca.ciudad || "").split(",")[0].trim() || "Bello";
    const valores = [
      { icono: "i-shield", texto: "Servicio garantizado" },
      { icono: "i-pin", texto: "Punto físico en " + ciudadCorta },
      { icono: "i-whatsapp", texto: "Atención por WhatsApp" }
    ];
    ul.innerHTML = valores
      .map((v) => "<li>" + svg(v.icono) + "<span>" + esc(v.texto) + "</span></li>")
      .join("");
  }

  const fb = $("#heroFacebook");
  if (fb) {
    const red = (DATA.redes || []).find((r) => r.id === "facebook");
    if (red && red.url) fb.href = red.url;
    else fb.hidden = true;
  }
}

/* Categorías: cabecera, nota y cuántos productos tiene.
   La lista de productos vive en el catálogo (#catalogo), no se duplica aquí. */
function pintarCategorias() {
  const cont = $("#categorias");
  if (!cont) return;

  cont.innerHTML = (DATA.categorias || [])
    .map((cat) => {
      const n = (cat.productos || []).length;
      const cuenta = n === 1 ? "1 producto" : n + " productos";
      return (
        '<section class="categoria" id="cat-' + esc(cat.id) + '">' +
          '<header class="categoria__head">' +
            '<div class="categoria__ico">' + svg(cat.icono) + "</div>" +
            "<div><h3>" + esc(cat.nombre) + "</h3><p>" + esc(cat.descripcion) + "</p></div>" +
          "</header>" +
          (cat.nota ? '<p class="categoria__nota">' + esc(cat.nota) + "</p>" : "") +
          (n
            ? '<p class="categoria__pie"><a href="#catalogo" data-filtro-cat="' + esc(cat.id) + '">' +
                "Ver " + esc(cuenta) + " en el catálogo" + svg("i-arrow") +
              "</a></p>"
            : '<p class="categoria__pie"><span>Sin productos publicados por ahora.</span></p>') +
        "</section>"
      );
    })
    .join("");
}

/* ---------- Catálogo ---------- */
function pintarFiltros() {
  const cont = $("#catFiltros");
  if (!cont) return;

  const total = contarProductos(DATA.categorias);
  const opciones = [{ id: "todas", nombre: "Todos", n: total }].concat(
    DATA.categorias.map((c) => ({ id: c.id, nombre: c.nombre, n: (c.productos || []).length }))
  );

  /* Si la categoría filtrada desapareció, se vuelve a "Todos". */
  if (!opciones.some((o) => o.id === FILTRO.categoriaId)) FILTRO.categoriaId = "todas";

  cont.innerHTML = opciones
    .map((o) => {
      const activo = o.id === FILTRO.categoriaId;
      return (
        '<button type="button" class="filtro' + (activo ? " activo" : "") + '" data-filtro="' + esc(o.id) + '"' +
          ' aria-pressed="' + (activo ? "true" : "false") + '">' +
          esc(o.nombre) + '<span class="filtro__n">' + o.n + "</span>" +
        "</button>"
      );
    })
    .join("");
}

/* ---------- Portada gráfica de lo que no tiene fotografía ----------
   No se inventan fotos de inventario: se compone una portada de marca con el
   azul de Red CaliNet, una trama de puntos y el icono de la categoría. Es un
   recurso gráfico declarado, no una foto de producto. */
const PORTADAS = {
  "i-streaming": { fondo: "#123a6b", brillo: "#2f6fb5" },
  "i-tramites": { fondo: "#0f3a63", brillo: "#1d6ba6" },
  "i-tech": { fondo: "#16335e", brillo: "#2c6aa0" },
  "i-check": { fondo: "#173a68", brillo: "#24548c" }
};

function idSeguro(texto) {
  const s = String(texto || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  return s || "p";
}

function portada(prod, contexto) {
  const clave = icono(prod.iconoCategoria);
  const tono = PORTADAS[clave] || PORTADAS["i-check"];
  const id = "pt-" + (contexto || "c") + "-" + idSeguro(prod.id);

  return (
    '<svg class="ficha__portada" viewBox="0 0 400 300" aria-hidden="true" focusable="false">' +
      '<defs><pattern id="' + esc(id) + '" width="26" height="26" patternUnits="userSpaceOnUse">' +
        '<circle cx="5" cy="5" r="2.1" fill="#ffffff" opacity=".09"/>' +
      "</pattern></defs>" +
      '<rect width="400" height="300" fill="' + tono.fondo + '"/>' +
      '<ellipse cx="330" cy="30" rx="190" ry="128" fill="' + tono.brillo + '" opacity=".5"/>' +
      '<rect width="400" height="300" fill="url(#' + esc(id) + ')"/>' +
    "</svg>" +
    '<span class="ficha__sinfoto" aria-hidden="true">' + svg(clave) + "</span>"
  );
}

/* Imagen real si la hay; si no, portada gráfica. */
function mediaProducto(prod, contexto, lado) {
  if (prod.imagen) {
    return (
      '<img src="' + esc(prod.imagen) + '" alt="' + esc(prod.nombre) + '" width="' + lado + '" height="' + lado +
      '" loading="lazy" decoding="async">'
    );
  }
  return portada(prod, contexto);
}

function tarjetaProducto(prod) {
  const media = mediaProducto(prod, "c", 600);

  const etiquetas = [];
  if (prod.destacado) etiquetas.push('<span class="ficha__etiqueta ficha__etiqueta--destacado">Destacado</span>');
  if (prod.agotado) etiquetas.push('<span class="ficha__etiqueta ficha__etiqueta--agotado">No disponible</span>');

  const precio = prod.precioTexto
    ? '<p class="ficha__precio">' + esc(prod.precioTexto) + "</p>"
    : '<p class="ficha__precio ficha__precio--consultar">Precio: consultar por WhatsApp</p>';

  const detalles = prod.detalles
    .map((d) => "<li>" + svg("i-check") + "<span>" + esc(d) + "</span></li>")
    .join("");

  /* La clase se arma aparte para no dejar un token a medias en el marcado. */
  const claseTipo = prod.esFisico ? " ficha--fisico" : " ficha--servicio";
  const clases = "ficha ficha--producto" + claseTipo + (prod.agotado ? " ficha--agotado" : "");

  return (
    '<article class="' + clases + '" data-producto="' + esc(prod.id) + '">' +
      '<div class="ficha__media">' + media + etiquetas.join("") + "</div>" +
      '<div class="ficha__meta">' +
        '<span class="ficha__cat">' + esc(prod.categoriaNombre) + "</span>" +
        '<span class="ficha__tipo ' + (prod.esFisico ? "ficha__tipo--producto" : "ficha__tipo--servicio") + '">' +
          esc(prod.tipoTexto) +
        "</span>" +
      "</div>" +
      "<h4>" + esc(prod.nombre) + "</h4>" +
      (prod.descripcion ? "<p>" + esc(prod.descripcion) + "</p>" : "") +
      precio +
      (detalles ? '<ul class="ficha__lista">' + detalles + "</ul>" : "") +
      '<div class="ficha__acciones">' +
        '<button type="button" class="ficha__ver" data-ver="' + esc(prod.id) + '">Ver detalle' + svg("i-arrow") + "</button>" +
        '<a class="ficha__cta" data-wa data-wa-texto="' + esc(mensajeProducto(prod)) + '" target="_blank" rel="noopener">' +
          "Consultar" + svg("i-whatsapp") +
        "</a>" +
      "</div>" +
    "</article>"
  );
}

function pintarCatalogo() {
  const grid = $("#catGrid");
  const cuenta = $("#catCuenta");
  const vacio = $("#catVacio");
  const limpiar = $("#catLimpiar");
  if (!grid) return;

  pintarFiltros();

  const lista = filtrarCatalogo(DATA.categorias, FILTRO);
  const total = contarProductos(DATA.categorias);

  if (limpiar) limpiar.hidden = !FILTRO.q;

  if (!lista.length) {
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "false");
    if (vacio) vacio.hidden = false;
    if (cuenta) cuenta.textContent = total
      ? "Ningún producto coincide con tu búsqueda. Prueba con otra palabra."
      : "El catálogo se está actualizando. Escríbenos por WhatsApp y te contamos qué hay disponible.";
    return;
  }

  grid.innerHTML = lista.map(tarjetaProducto).join("");
  grid.setAttribute("aria-busy", "false");
  if (vacio) vacio.hidden = true;
  if (cuenta) {
    const mostrados = lista.length;
    cuenta.textContent = mostrados === total
      ? total + (total === 1 ? " producto disponible" : " productos disponibles")
      : "Mostrando " + mostrados + " de " + total + " productos";
  }

  pintarEnlacesWa();
}

function pintarBeneficios() {
  const cont = $("#beneficiosGrid");
  if (!cont) return;

  cont.innerHTML = DATA.beneficios
    .map(
      (b) =>
        '<article class="beneficio revelar">' +
          '<div class="beneficio__ico">' + svg(b.icono) + "</div>" +
          "<div><h3>" + esc(b.titulo) + "</h3><p>" + esc(b.texto) + "</p></div>" +
        "</article>"
    )
    .join("");
}

function pintarInfo() {
  const ul = $("#infoLista");
  if (!ul) return;

  const c = DATA.contacto;
  const items = [];

  items.push(
    '<li class="info__item">' +
      '<div class="info__ico">' + svg("i-phone") + "</div>" +
      "<div><h3>Teléfono y WhatsApp</h3>" +
        '<a href="tel:+' + esc(c.telefono) + '" aria-label="Llamar a Red CaliNet">' + esc(c.telefonoTexto || c.telefono) + "</a>" +
        "<small>Llamadas y mensajes</small>" +
      "</div>" +
    "</li>"
  );

  items.push(
    '<li class="info__item">' +
      '<div class="info__ico">' + svg("i-store") + "</div>" +
      "<div><h3>Punto físico</h3>" +
        "<p>" + esc(c.direccion) + "</p>" +
        (c.direccionNota ? "<small>" + esc(c.direccionNota) + "</small>" : "") +
      "</div>" +
    "</li>"
  );

  items.push(
    '<li class="info__item">' +
      '<div class="info__ico">' + svg("i-mail") + "</div>" +
      "<div><h3>Correo</h3>" +
        '<a href="mailto:' + esc(c.correo) + '" aria-label="Enviar correo a Red CaliNet">Enviar correo</a>' +
        "<small>Para solicitudes por escrito</small>" +
      "</div>" +
    "</li>"
  );

  const horarios = (DATA.horarios || [])
    .map((h) => "<div><span>" + esc(h.dia) + "</span><span>" + esc(h.hora) + "</span></div>")
    .join("");

  if (horarios) {
    items.push(
      '<li class="info__item info__item--ancho">' +
        '<div class="info__ico">' + svg("i-clock") + "</div>" +
        '<div class="info__horario"><h3>Horario de atención</h3>' +
          horarios +
          "<small>Hora de Colombia (GMT-5)</small>" +
        "</div>" +
      "</li>"
    );
  }

  ul.innerHTML = items.join("");
}

function pintarRedes() {
  const cont = $("#pieRedes");
  if (!cont) return;

  cont.innerHTML = (DATA.redes || [])
    .filter((r) => r.url !== undefined)
    .map(
      (r) =>
        '<a class="social-btn ' + esc(r.id) + '"' + (r.url && r.url !== '#' ? '' : ' hidden data-social="' + esc(r.id) + '"') + ' href="' + esc(r.url && r.url !== '#' ? r.url : '#') + '" target="_blank" rel="noopener" aria-label="' + esc(r.nombre) + ' de Red CaliNet">' +
          svg("i-" + r.id) +
        "</a>"
    )
    .join("");
}

/* Mantiene la selección del visitante si sigue existiendo. */
function pintarSelect() {
  const sel = $("#fServicio");
  if (!sel) return;

  const previo = sel.value;
  sel.innerHTML =
    '<option value="">Aún no lo sé / quiero asesoría</option>' +
    DATA.categorias.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.nombre) + "</option>").join("") +
    '<option value="otro">Otro (te cuento en el mensaje)</option>';

  if (previo && Array.from(sel.options).some((o) => o.value === previo)) sel.value = previo;
}

/* ---------- Ficha de producto (modal accesible) ---------- */
const FICHA = { abierta: false, focoPrevio: null, id: null };

function buscarProducto(id) {
  for (const cat of (DATA.categorias || [])) {
    const p = (cat.productos || []).find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

function abrirFicha(id) {
  const prod = buscarProducto(id);
  const modal = $("#fichaModal");
  if (!prod || !modal) return;

  FICHA.id = id;
  FICHA.focoPrevio = document.activeElement;

  const media = $("#fichaMedia");
  if (media) media.innerHTML = mediaProducto(prod, "m", 720);

  const cat = $("#fichaCat");
  if (cat) cat.textContent = prod.categoriaNombre;

  const tipo = $("#fichaTipo");
  if (tipo) {
    tipo.textContent = prod.tipoTexto;
    tipo.className = "ficha__tipo " + (prod.esFisico ? "ficha__tipo--producto" : "ficha__tipo--servicio");
  }

  const titulo = $("#fichaTitulo");
  if (titulo) titulo.textContent = prod.nombre;

  const precio = $("#fichaPrecio");
  if (precio) {
    precio.textContent = prod.precioTexto || "Precio: consultar por WhatsApp";
    precio.classList.toggle("ficha__precio--consultar", !prod.precioTexto);
  }

  const desc = $("#fichaDesc");
  if (desc) {
    desc.textContent = prod.descripcion;
    desc.hidden = !prod.descripcion;
  }

  const lista = $("#fichaLista");
  if (lista) {
    lista.innerHTML = prod.detalles
      .map((d) => "<li>" + svg("i-check") + "<span>" + esc(d) + "</span></li>")
      .join("");
    lista.hidden = !prod.detalles.length;
  }

  const estado = $("#fichaEstado");
  if (estado) {
    estado.textContent = prod.agotado ? "No disponible por ahora" : "";
    estado.hidden = !prod.agotado;
  }

  const wa = $("#fichaWa");
  if (wa) wa.href = waLink(mensajeProducto(prod));

  modal.hidden = false;
  document.body.classList.add("sin-scroll");
  FICHA.abierta = true;

  const cerrar = $("#fichaCerrar");
  if (cerrar) cerrar.focus();
}

function cerrarFicha() {
  const modal = $("#fichaModal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("sin-scroll");
  FICHA.abierta = false;
  FICHA.id = null;
  if (FICHA.focoPrevio && typeof FICHA.focoPrevio.focus === "function") FICHA.focoPrevio.focus();
  FICHA.focoPrevio = null;
}

function atraparFoco(ev) {
  if (!FICHA.abierta) return;

  if (ev.key === "Escape") {
    ev.preventDefault();
    cerrarFicha();
    return;
  }
  if (ev.key !== "Tab") return;

  const caja = $("#fichaModal");
  if (!caja) return;
  const enfocables = $$("#fichaModal a[href], #fichaModal button").filter((el) => !el.hidden && el.offsetParent !== null);
  if (!enfocables.length) return;

  const primero = enfocables[0];
  const ultimo = enfocables[enfocables.length - 1];

  if (ev.shiftKey && document.activeElement === primero) {
    ev.preventDefault();
    ultimo.focus();
  } else if (!ev.shiftKey && document.activeElement === ultimo) {
    ev.preventDefault();
    primero.focus();
  }
}

function prepararFicha() {
  const modal = $("#fichaModal");
  if (!modal) return;

  modal.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-cerrar-ficha]")) { cerrarFicha(); return; }
    const cerrar = ev.target.closest("#fichaCerrar");
    if (cerrar) cerrarFicha();
  });

  document.addEventListener("keydown", atraparFoco);
}

/* ---------- Buscador y filtros ---------- */
function prepararCatalogo() {
  const buscador = $("#catBuscar");
  const filtros = $("#catFiltros");
  const grid = $("#catGrid");
  const limpiar = $("#catLimpiar");

  if (buscador) {
    buscador.addEventListener("input", () => {
      FILTRO.q = buscador.value;
      pintarCatalogo();
    });
  }

  if (limpiar) {
    limpiar.addEventListener("click", () => {
      FILTRO.q = "";
      if (buscador) { buscador.value = ""; buscador.focus(); }
      pintarCatalogo();
    });
  }

  if (filtros) {
    filtros.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-filtro]");
      if (!btn) return;
      FILTRO.categoriaId = btn.dataset.filtro;
      pintarCatalogo();
    });
  }

  /* "Ver N productos en el catálogo" desde la sección de categorías. */
  document.addEventListener("click", (ev) => {
    const enlace = ev.target.closest("[data-filtro-cat]");
    if (!enlace) return;
    FILTRO.categoriaId = enlace.dataset.filtroCat;
    FILTRO.q = "";
    if (buscador) buscador.value = "";
    pintarCatalogo();
  });

  if (grid) {
    grid.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-wa]")) return; // el enlace de WhatsApp navega solo
      const disparador = ev.target.closest("[data-ver], [data-producto]");
      if (!disparador) return;
      const id = disparador.dataset.ver || disparador.dataset.producto;
      if (id) abrirFicha(id);
    });
  }
}

/* ---------- Formulario -> WhatsApp ---------- */
function leerLocal() {
  try {
    const raw = localStorage.getItem(CLAVE_LOCAL);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null; // incógnito o almacenamiento bloqueado
  }
}

function guardarLocal(datos) {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(datos));
  } catch (e) {
    /* sin persistencia: el sitio sigue funcionando */
  }
}

function aviso(texto) {
  const el = $("#formAviso");
  if (!el) return;
  el.textContent = texto || "";
  el.classList.toggle("visible", Boolean(texto));
}

function enviarFormulario(ev) {
  ev.preventDefault();

  const nombreEl = $("#fNombre");
  const correoEl = $("#fCorreo");
  const servEl = $("#fServicio");
  const msgEl = $("#fMensaje");

  const nombre = nombreEl.value.trim();
  const correo = correoEl.value.trim();
  const mensaje = msgEl.value.trim();
  const servicioId = servEl.value;
  const categoria = DATA.categorias.find((c) => c.id === servicioId);

  nombreEl.classList.remove("error");
  correoEl.classList.remove("error");

  if (nombre.length < 2) {
    nombreEl.classList.add("error");
    aviso("Escribe tu nombre para poder saludarte.");
    nombreEl.focus();
    return;
  }

  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo);
  if (!correoValido) {
    correoEl.classList.add("error");
    aviso("Escribe un correo válido para que podamos responderte.");
    correoEl.focus();
    return;
  }

  aviso("");

  const lineas = ["Hola, soy " + nombre + "."];
  if (categoria) lineas.push("Servicio de interés: " + categoria.nombre + ".");
  else if (servicioId === "otro") lineas.push("Quiero asesoría sobre otro servicio.");
  else lineas.push("Quiero asesoría sobre sus servicios.");
  lineas.push("Correo: " + correo);
  if (mensaje) lineas.push("", mensaje);

  guardarLocal({ nombre: nombre, correo: correo });

  window.open(waLink(lineas.join("\n")), "_blank", "noopener");
}

function restaurarFormulario() {
  const previo = leerLocal();
  if (!previo) return;

  const nombreEl = $("#fNombre");
  const correoEl = $("#fCorreo");
  if (nombreEl && !nombreEl.value && previo.nombre) nombreEl.value = previo.nombre;
  if (correoEl && !correoEl.value && previo.correo) correoEl.value = previo.correo;
}

/* ---------- Interfaz ---------- */
function prepararCabecera() {
  const cab = $("#cabecera");
  if (!cab) return;

  const alScroll = () => cab.classList.toggle("pegada", window.scrollY > 8);
  alScroll();
  window.addEventListener("scroll", alScroll, { passive: true });
}

function prepararMenu() {
  const btn = $("#menuBtn");
  const nav = $("#nav");
  if (!btn || !nav) return;

  const cerrar = () => {
    nav.classList.remove("abierto");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Abrir menú");
  };

  btn.addEventListener("click", () => {
    const abierto = nav.classList.toggle("abierto");
    btn.setAttribute("aria-expanded", String(abierto));
    btn.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  });

  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) cerrar();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrar();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 900) cerrar();
  });
}

/* Añade el observador de aparición a un contenedor y a sus hijos .revelar. */
function revelar(raiz) {
  const contenedor = raiz || document;
  const objetivos = Array.from(contenedor.querySelectorAll ? contenedor.querySelectorAll(".revelar") : []);
  if (!objetivos.length) return;

  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (sinMovimiento || !("IntersectionObserver" in window)) {
    objetivos.forEach((el) => el.classList.add("visible"));
    return;
  }

  const obs = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("visible");
          obs.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  objetivos.forEach((el) => obs.observe(el));
}

function prepararRevelado() {
  revelar(document);
}

function prepararFlotante() {
  const flotante = $("#waFloat");
  const seccion = $("#contacto");
  if (!flotante || !seccion || !("IntersectionObserver" in window)) return;

  const obs = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((en) => flotante.classList.toggle("oculto", en.isIntersecting));
    },
    { threshold: 0.18 }
  );

  obs.observe(seccion);
}

/* ---------- Arranque ---------- */
function pintar() {
  pintarMarca();
  pintarHero();
  pintarChips();
  pintarCategorias();
  pintarCatalogo();
  pintarBeneficios();
  pintarInfo();
  pintarRedes();
  pintarSelect();
  pintarEnlacesWa();
  pintarFacebookCta();
  restaurarFormulario();
}

function formatearTel(n) {
  const s = String(n || "").replace(/\D/g, "");
  if (s.startsWith("57") && s.length === 12) return "+57 " + s.slice(2, 5) + " " + s.slice(5, 8) + " " + s.slice(8);
  return s;
}

function redesDesdeContacto(contacto) {
  const redes = [];
  if (contacto.whatsapp) redes.push({ id: "whatsapp", nombre: "WhatsApp", usuario: formatearTel(contacto.whatsapp), url: "https://wa.me/" + String(contacto.whatsapp).replace(/\D/g, "") });
  if (contacto.facebook) redes.push({ id: "facebook", nombre: "Facebook", usuario: "Red CaliNet", url: contacto.facebook });
  if (contacto.instagram) redes.push({ id: "instagram", nombre: "Instagram", usuario: "", url: contacto.instagram });
  if (contacto.tiktok) redes.push({ id: "tiktok", nombre: "TikTok", usuario: "", url: contacto.tiktok });
  return redes;
}

/* Traduce los documentos de Firestore a la estructura del catálogo.
   Toda la lógica de emparejamiento vive en mapearCatalogo (probada en Node). */
function negocioDesdeFirestore(empresa, contacto, categorias, servicios) {
  return {
    marca: {
      nombre: empresa.nombre || "Red CaliNet",
      eslogan: empresa.eslogan || "Tu conexión con servicios y soluciones digitales",
      esloganHistorico: empresa.esloganHistorico || "",
      promesa: empresa.promesa || "Servicio garantizado, lo primordial para nosotros es el cliente.",
      ciudad: empresa.ciudad || "Bello, Antioquia, Colombia"
    },
    contacto: {
      telefono: String(contacto.telefono || "").replace(/\D/g, ""),
      telefonoTexto: formatearTel(contacto.telefono),
      whatsapp: String(contacto.whatsapp || "").replace(/\D/g, ""),
      whatsappTexto: "Hola, vi su página web y quiero información.",
      correo: contacto.correo || "",
      direccion: empresa.direccion || "",
      direccionNota: empresa.direccionNota || ""
    },
    horarios: Array.isArray(contacto.horarios) ? contacto.horarios : [],
    redes: redesDesdeContacto(contacto),
    categorias: categorias,
    /* Los servicios tienen que viajar con las categorías: sin esta línea el
       mapeo no encuentra productos y el catálogo queda vacío en producción. */
    servicios: Array.isArray(servicios) ? servicios : [],
    beneficios: FALLBACK.beneficios,
    origen: "firestore"
  };
}

/* ---------- Lectura de Firestore (en vivo) ---------- */
const NUBE = { empresa: null, contacto: null, categorias: null, servicios: null, activa: false };

function datosDeLaNube() {
  if (!NUBE.activa) return null;
  if (!Array.isArray(NUBE.categorias) || !NUBE.categorias.length) return null;
  return mapearCatalogo(
    negocioDesdeFirestore(NUBE.empresa || {}, NUBE.contacto || {}, NUBE.categorias, NUBE.servicios || [])
  );
}

/* Aplica el mejor origen disponible: nube → data.json → respaldo embebido. */
let datosLocales = null;

function aplicarDatos() {
  const deNube = datosDeLaNube();
  if (deNube) {
    DATA = deNube;
  } else if (datosLocales) {
    DATA = datosLocales;
  }
  pintar();
}

/* Se suscribe al catálogo: cada cambio publicado en el panel se refleja
   sin recargar. Si falla (sin red, reglas, proyecto inexistente) el sitio
   sigue con data.json. */
async function suscribirFirestore() {
  if (typeof window === "undefined") return false;
  if (!window.firebaseConfig || !window.firebaseConfig.projectId) return false;

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getFirestore, connectFirestoreEmulator, collection, onSnapshot, query, orderBy, where, doc } = await import("firebase/firestore");

    const app = getApps().length ? getApps()[0] : initializeApp(window.firebaseConfig);
    const db = getFirestore(app);

    // Modo de pruebas: ?emulador=1 conecta la landing al emulador local.
    if (new URLSearchParams(window.location.search).get("emulador") === "1") {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }

    const alFallar = (etiqueta) => (e) => {
      console.warn("Red CaliNet: Firestore (" + etiqueta + ") no disponible.", e && e.message ? e.message : e);
    };

    onSnapshot(doc(db, "configuracion", "empresa"), (snap) => {
      NUBE.empresa = snap.exists() ? snap.data() : {};
      NUBE.activa = true;
      if (datosDeLaNube()) aplicarDatos();
    }, alFallar("empresa"));

    onSnapshot(doc(db, "configuracion", "contacto"), (snap) => {
      NUBE.contacto = snap.exists() ? snap.data() : {};
      NUBE.activa = true;
      if (datosDeLaNube()) aplicarDatos();
    }, alFallar("contacto"));

    onSnapshot(query(collection(db, "categorias"), orderBy("orden")), (snap) => {
      NUBE.categorias = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      NUBE.activa = true;
      if (datosDeLaNube()) aplicarDatos();
    }, alFallar("categorias"));

    // La regla de lectura pública solo acepta PUBLICADO: filtrar aquí evita
    // que un borrador rompa la consulta entera.
    onSnapshot(query(collection(db, "servicios"), where("estado", "==", "PUBLICADO")), (snap) => {
      NUBE.servicios = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      NUBE.activa = true;
      if (datosDeLaNube()) aplicarDatos();
    }, alFallar("servicios"));

    return true;
  } catch (e) {
    console.warn("Red CaliNet: no se pudo iniciar Firestore, uso data.json.", e);
    return false;
  }
}

async function cargarDataJson() {
  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    if (!res.ok) return null;
    return mapearCatalogo(await res.json());
  } catch (e) {
    console.warn("Red CaliNet: data.json no disponible, uso el respaldo embebido.", e);
    return null;
  }
}

async function iniciar() {
  // 1) Respaldo local primero: el sitio queda usable aunque la nube tarde.
  datosLocales = await cargarDataJson();
  aplicarDatos();

  prepararCabecera();
  prepararMenu();
  prepararFicha();
  prepararCatalogo();
  prepararFlotante();
  prepararRevelado();

  const form = $("#formContacto");
  if (form) form.addEventListener("submit", enviarFormulario);

  // 2) Catálogo en vivo desde Firestore (fuente viva editada desde el panel).
  await suscribirFirestore();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
}

/* Exportaciones para las pruebas en Node (tools/test-catalogo-datos.js). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    formatearPrecio,
    resolverImagen,
    normalizarTexto,
    normalizarCategoria,
    normalizarProducto,
    mapearCatalogo,
    filtrarCatalogo,
    contarProductos,
    normalizarTipo,
    portada,
    mediaProducto,
    negocioDesdeFirestore,
    formatearTel,
    mensajeProducto,
    FALLBACK
  };
}
