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
    eslogan: "Calidad de ventas por internet",
    promesa: "Servicio garantizado, lo primordial para nosotros es el cliente.",
    categoria: "Producto/servicio · Arte y entretenimiento",
    ciudad: "Bello, Antioquia, Colombia"
  },
  contacto: {
    whatsapp: "573014585658",
    whatsappTexto: "Hola, vi su página web y quiero información.",
    correo: "redcalinetmono@gmail.com",
    puntoFisico: true,
    direccion: "Bello, Antioquia, Colombia",
    direccionNota: "Atendemos también por WhatsApp"
  },
  horarios: [
    { dia: "Lunes a sábado", hora: "09:00 – 21:30" },
    { dia: "Domingo", hora: "10:00 – 20:00" }
  ],
  redes: [
    { id: "instagram", nombre: "Instagram", usuario: "@red_calinet", url: "https://www.instagram.com/red_calinet" },
    { id: "whatsapp", nombre: "WhatsApp", usuario: "+57 301 458 5658", url: "https://wa.me/573014585658" }
  ],
  servicios: [
    { id: "streaming", nombre: "Streaming", icono: "i-streaming", descripcion: "Suscripciones y cuentas a tu medida.", detalles: ["Suscripciones y cuentas", "Netflix, Disney+ y más"] },
    { id: "tecnologia", nombre: "Tecnología", icono: "i-tech", descripcion: "iPhones, Honor y equipos de calidad.", detalles: ["iPhone", "Honor"] },
    { id: "seguros", nombre: "Seguros", icono: "i-seguros", descripcion: "Protege lo que más quieres.", detalles: ["Pólizas", "Asesoría"] },
    { id: "tramites", nombre: "Trámites", icono: "i-tramites", descripcion: "Gestiones rápidas y seguras.", detalles: ["Gestiones y diligencias"] }
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

/* ---------- Render ---------- */
function pintarMarca() {
  document.title = DATA.marca.nombre + " — " + DATA.marca.eslogan + " | Bello, Antioquia";

  const eyebrow = $("#heroEyebrow");
  if (eyebrow) eyebrow.innerHTML = svg("i-pin") + esc(DATA.marca.ciudad);

  const titulo = $("#heroTitulo");
  if (titulo) titulo.textContent = DATA.marca.eslogan;

  const sub = $("#heroSub");
  if (sub) {
    const lista = DATA.servicios.map((s) => s.nombre.toLowerCase()).join(", ");
    sub.textContent = lista.charAt(0).toUpperCase() + lista.slice(1) + ". " + DATA.marca.promesa;
  }

  const anio = $("#anio");
  if (anio) anio.textContent = String(new Date().getFullYear());
}

function pintarChips() {
  const ul = $("#chips");
  if (!ul) return;
  ul.innerHTML = DATA.servicios
    .map((s) => "<li>" + svg(s.icono) + esc(s.nombre) + "</li>")
    .join("");
}

function pintarServicios() {
  const cont = $("#serviciosGrid");
  if (!cont) return;

  cont.innerHTML = DATA.servicios
    .map((s) => {
      const detalles = (s.detalles || [])
        .map((d) => "<li>" + svg("i-check") + "<span>" + esc(d) + "</span></li>")
        .join("");

      return (
        '<article class="servicio revelar">' +
          '<div class="servicio__ico">' + svg(s.icono) + "</div>" +
          "<h3>" + esc(s.nombre) + "</h3>" +
          "<p>" + esc(s.descripcion) + "</p>" +
          (detalles ? '<ul class="servicio__lista">' + detalles + "</ul>" : "") +
          '<a class="servicio__cta" data-wa data-wa-texto="Hola, quiero información sobre ' + esc(s.nombre) + '." target="_blank" rel="noopener">' +
            "Consultar por WhatsApp" + svg("i-arrow") +
          "</a>" +
        "</article>"
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

  items.push(
    '<li class="info__item">' +
      '<div class="info__ico">' + svg("i-whatsapp") + "</div>" +
      "<div><h3>WhatsApp</h3>" +
        '<a href="' + waLink(c.whatsappTexto) + '" target="_blank" rel="noopener">' + esc(waMostrar) + "</a>" +
        "<small>La forma más rápida de contactarnos</small>" +
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
        '<a href="mailto:' + esc(c.correo) + '">' + esc(c.correo) + "</a>" +
        "<small>Para solicitudes por escrito</small>" +
      "</div>" +
    "</li>"
  );

  const insta = (DATA.redes || []).find((r) => r.id === "instagram");
  if (insta && insta.url) {
    items.push(
      '<li class="info__item">' +
        '<div class="info__ico">' + svg("i-instagram") + "</div>" +
        "<div><h3>Instagram</h3>" +
          '<a href="' + esc(insta.url) + '" target="_blank" rel="noopener">' + esc(insta.usuario || insta.nombre) + "</a>" +
          "<small>Novedades y disponibilidad</small>" +
        "</div>" +
      "</li>"
    );
  }

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
    .filter((r) => r.url)
    .map(
      (r) =>
        '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" aria-label="' + esc(r.nombre) + ' de Red CaliNet">' +
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
    DATA.servicios.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.nombre) + "</option>").join("") +
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
  const servicio = DATA.servicios.find((s) => s.id === servicioId);

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
  if (servicio) lineas.push("Servicio de interés: " + servicio.nombre + ".");
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
  pintarServicios();
  pintarBeneficios();
  pintarInfo();
  pintarRedes();
  pintarSelect();
  pintarEnlacesWa();
  restaurarFormulario();
}

async function iniciar() {
  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    if (res.ok) DATA = await res.json();
  } catch (e) {
    console.warn("Red CaliNet: data.json no disponible, uso el respaldo embebido.", e);
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
