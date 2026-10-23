/* ============================================================
   Red CaliNet — script.js
   - Carga data.json (con respaldo embebido si la petición falla).
   - Pinta servicios, beneficios, chips, datos de contacto y redes.
   - Construye el mensaje de WhatsApp a partir del formulario.
   - Guarda nombre y teléfono en localStorage para la próxima visita.
   Sin dependencias externas: JS vanilla.
   ============================================================ */
"use strict";

/* Respaldo por si data.json no carga (p. ej. abriendo el HTML con file://).
   Debe coincidir con data.json: si editas los servicios ahí, edítalos aquí. */
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
        { nombre: "Plataformas de streaming", descripcion: "Planes de suscripción a las plataformas digitales que ofrecemos actualmente.", precio: null, detalles: ["Planes y suscripciones", "Activación y soporte"] }
      ]
    },
    {
      id: "tramites", nombre: "Trámites", icono: "i-tramites",
      descripcion: "Asesoría y acompañamiento en gestiones y citas.",
      nota: "Servicio de asesoría o acompañamiento: no somos una entidad oficial.",
      fichas: [
        { nombre: "Pasaportes", descripcion: "Asesoría y acompañamiento para tu trámite de pasaporte.", precio: null, detalles: ["Acompañamiento en el proceso", "Asesoría en requisitos"] },
        { nombre: "Citas RUNT", descripcion: "Gestión y acompañamiento para tus citas RUNT.", precio: null, detalles: ["Acompañamiento", "Asesoría en requisitos"] },
        { nombre: "Trámites de salud", descripcion: "Asesoría en citas y trámites de salud (EPS, autorizaciones).", precio: null, detalles: ["Asesoría"] }
      ]
    },
    {
      id: "tv-app", nombre: "TV por App", icono: "i-streaming",
      descripcion: "Televisión mediante aplicaciones y dispositivos compatibles.",
      nota: "Servicios sujetos a disponibilidad y autorización del proveedor.",
      fichas: [
        { nombre: "Planes de TV por aplicación", descripcion: "Planes de televisión para Smart TV, celular y más.", precio: null, detalles: ["Planes por duración", "Dispositivos compatibles"] }
      ]
    },
    {
      id: "tecnologia", nombre: "Tecnología", icono: "i-tech",
      descripcion: "Equipos y accesorios de calidad.",
      nota: "Referencia histórica en Facebook: celulares y accesorios (marcas como Redmi). Equipos, existencias y disponibilidad por confirmar.",
      fichas: [
        { nombre: "iPhone", descripcion: "Equipos iPhone con garantía.", precio: null, detalles: ["Garantía"] },
        { nombre: "Honor", descripcion: "Equipos Honor con garantía.", precio: null, detalles: ["Garantía"] },
        { nombre: "Accesorios", descripcion: "Audífonos, cargadores, cables y más.", precio: null, detalles: ["Audífonos", "Cargadores", "Cables"] }
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

let DATA = FALLBACK;

/* ---------- Enlaces de WhatsApp ---------- */
function waLink(texto) {
  return "https://wa.me/" + DATA.contacto.whatsapp + "?text=" + encodeURIComponent(texto);
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

function pintarCategorias() {
  const cont = $("#categorias");
  if (!cont) return;

  cont.innerHTML = (DATA.categorias || [])
    .map((cat) => {
      const fichas = (cat.fichas || [])
        .map((f) => {
          const detalles = (f.detalles || [])
            .map((d) => "<li>" + svg("i-check") + "<span>" + esc(d) + "</span></li>")
            .join("");
          const precio = f.precio
            ? '<p class="ficha__precio">' + esc(f.precio) + "</p>"
            : '<p class="ficha__precio ficha__precio--consultar">Precio: consultar por WhatsApp</p>';

          return (
            '<article class="ficha revelar">' +
              "<h4>" + esc(f.nombre) + "</h4>" +
              "<p>" + esc(f.descripcion) + "</p>" +
              precio +
              (detalles ? '<ul class="ficha__lista">' + detalles + "</ul>" : "") +
              '<a class="ficha__cta" data-wa data-wa-texto="Hola, quiero información sobre ' + esc(f.nombre) + ' (Red CaliNet)." target="_blank" rel="noopener">' +
                "Consultar por WhatsApp" + svg("i-arrow") +
              "</a>" +
            "</article>"
          );
        })
        .join("");

      return (
        '<section class="categoria" id="cat-' + esc(cat.id) + '">' +
          '<header class="categoria__head">' +
            '<div class="categoria__ico">' + svg(cat.icono) + "</div>" +
            "<div><h3>" + esc(cat.nombre) + "</h3><p>" + esc(cat.descripcion) + "</p></div>" +
          "</header>" +
          (cat.nota ? '<p class="categoria__nota">' + esc(cat.nota) + "</p>" : "") +
          '<div class="fichas">' + fichas + "</div>" +
        "</section>"
      );
    })
    .join("");
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

  const waRed = (DATA.redes || []).find((r) => r.id === "whatsapp");
  const waMostrar = (waRed && waRed.usuario) ? waRed.usuario : "+57 301 458 5658";

  /* WhatsApp se quito de aqui: ya esta en el pie y en el CTA del aside */

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

  /* Instagram se quito de aqui: ya esta en el pie */

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

function pintarSelect() {
  const sel = $("#fServicio");
  if (!sel) return;

  sel.innerHTML =
    '<option value="">Aún no lo sé / quiero asesoría</option>' +
    DATA.categorias.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.nombre) + "</option>").join("") +
    '<option value="otro">Otro (te cuento en el mensaje)</option>';
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

function prepararRevelado() {
  const objetivos = $$(".revelar");
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
  pintarChips();
  pintarCategorias();
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

/* Lee el catálogo desde Firestore (si hay datos publicados) y lo mapea a la
   estructura de DATA. Devuelve null si no hay datos o Firestore no está
   disponible, para usar data.json como respaldo. */
async function cargarDesdeFirestore() {
  if (!window.firebaseConfig || !window.firebaseConfig.projectId) return null;
  try {
    const { initializeApp } = await import("firebase/app");
    const { getFirestore, connectFirestoreEmulator, collection, getDocs, query, orderBy, where, doc, getDoc } = await import("firebase/firestore");
    const app = initializeApp(window.firebaseConfig);
    const db = getFirestore(app);
    // Modo de pruebas: ?emulador=1 conecta la landing al emulador local.
    if (new URLSearchParams(window.location.search).get("emulador") === "1") {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }

    const [empresaSnap, contactoSnap, catsSnap, servsSnap] = await Promise.all([
      getDoc(doc(db, "configuracion", "empresa")),
      getDoc(doc(db, "configuracion", "contacto")),
      getDocs(query(collection(db, "categorias"), orderBy("orden"))),
      // Filtra por estado en la consulta para que la regla de lectura pública
      // (solo PUBLICADO) sea satisfacible sin exponer borradores/ocultos.
      getDocs(query(collection(db, "servicios"), where("estado", "==", "PUBLICADO")))
    ]);

    const empresa = empresaSnap.exists ? empresaSnap.data() : {};
    const contacto = contactoSnap.exists ? contactoSnap.data() : {};
    const categorias = catsSnap.docs
      .filter((d) => d.data().visible !== false)
      .map((d) => ({ id: d.id, ...d.data(), fichas: [] }));
    const servicios = servsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

    if (!categorias.length) return null; // sin datos: usar data.json

    categorias.forEach((cat) => {
      cat.fichas = servicios
        .filter((s) => s.categoriaId === cat.id)
        .map((s) => ({ nombre: s.nombre, descripcion: s.descripcion || "", precio: s.precio != null ? s.precio : null, detalles: s.detalles || [] }));
    });

    const redes = [];
    if (contacto.whatsapp) redes.push({ id: "whatsapp", nombre: "WhatsApp", usuario: formatearTel(contacto.whatsapp), url: "https://wa.me/" + String(contacto.whatsapp).replace(/\D/g, "") });
    if (contacto.facebook) redes.push({ id: "facebook", nombre: "Facebook", usuario: "Red CaliNet", url: contacto.facebook });
    if (contacto.instagram) redes.push({ id: "instagram", nombre: "Instagram", usuario: "", url: contacto.instagram });
    if (contacto.tiktok) redes.push({ id: "tiktok", nombre: "TikTok", usuario: "", url: contacto.tiktok });

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
      redes: redes,
      categorias: categorias,
      beneficios: DATA.beneficios
    };
  } catch (e) {
    console.warn("Red CaliNet: Firestore no disponible, uso data.json.", e);
    return null;
  }
}

async function iniciar() {
  // 1) Catálogo en Firestore (fuente viva editada desde el panel).
  const desdeFirestore = await cargarDesdeFirestore();
  if (desdeFirestore) {
    DATA = desdeFirestore;
  } else {
    // 2) Respaldo: data.json (o el objeto embebido si falla la petición).
    try {
      const res = await fetch("data.json", { cache: "no-cache" });
      if (res.ok) DATA = await res.json();
    } catch (e) {
      console.warn("Red CaliNet: data.json no disponible, uso el respaldo embebido.", e);
    }
  }

  pintar();

  // Los elementos creados por pintar() también deben entrar en los observadores.
  prepararRevelado();

  prepararCabecera();
  prepararMenu();
  prepararFlotante();

  const form = $("#formContacto");
  if (form) form.addEventListener("submit", enviarFormulario);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
