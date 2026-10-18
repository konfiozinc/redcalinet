/* Red CaliNet: interacción progresiva sobre HTML generado y utilizable sin JS.
   Sin fetch de configuración, almacenamiento de conversaciones ni dependencias. */
"use strict";

const $ = selector => document.querySelector(selector);

function destinoWhatsApp(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "wa.me" && !url.username && !url.password && !url.port && /^\/[1-9]\d{7,14}$/.test(url.pathname) && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}

function prepararFormulario() {
  const form = $("#formContacto");
  if (!form) return;
  const fields = $("#camposFormulario"), button = $("#prepararMensaje");
  const nombre = $("#fNombre"), correo = $("#fCorreo"), servicio = $("#fServicio"), mensaje = $("#fMensaje");
  const aviso = $("#formAviso"), resultado = $("#waResultado"), continuar = $("#waContinuar");
  const base = destinoWhatsApp(form.dataset.contacto);
  const informar = text => { aviso.textContent = text; aviso.classList.toggle("visible", Boolean(text)); };
  const error = (field, id, text) => { field.setAttribute("aria-invalid", String(Boolean(text))); field.classList.toggle("error", Boolean(text)); $("#"+id).textContent = text; };
  const limpiarResultado = () => { resultado.hidden = true; continuar.removeAttribute("href"); informar(""); };

  // Se registra antes de habilitar. Sin names, el HTML tampoco serializa datos.
  form.addEventListener("submit", event => {
    event.preventDefault();
    limpiarResultado();
    if (!base) { informar("El contacto no está disponible. Utiliza los datos de contacto publicados."); return; }
    error(nombre,"errorNombre",""); error(correo,"errorCorreo","");
    if (nombre.value.trim().length < 2 || nombre.value.length > 120) {
      error(nombre,"errorNombre","Escribe tu nombre (entre 2 y 120 caracteres)."); informar("Revisa el nombre indicado."); nombre.focus(); return;
    }
    if (correo.value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.value.trim())) {
      error(correo,"errorCorreo","Escribe un correo válido para que podamos responderte."); informar("Revisa el correo indicado."); correo.focus(); return;
    }
    if (mensaje.value.length > 2000) { informar("El mensaje admite hasta 2000 caracteres."); mensaje.focus(); return; }
    const lines = ["Hola, soy " + nombre.value.trim() + "."];
    const option = servicio.selectedOptions[0];
    if (servicio.value === "otro") lines.push("Quiero asesoría sobre otro servicio.");
    else if (servicio.value && option) lines.push("Servicio de interés: " + option.textContent + ".");
    else lines.push("Quiero asesoría sobre sus servicios.");
    lines.push("Correo: " + correo.value.trim());
    if (mensaje.value.trim()) lines.push("",mensaje.value.trim());
    const link = new URL(base); link.searchParams.set("text",lines.join("\n"));
    continuar.href = link.href; resultado.hidden = false;
    informar("Mensaje preparado. No se ha enviado. Si WhatsApp no se abre, utiliza Continuar en WhatsApp.");
    try { window.open(link.href,"_blank","noopener,noreferrer"); }
    catch { informar("No se pudo abrir WhatsApp. Tu mensaje está preparado; utiliza Continuar en WhatsApp."); }
  });
  form.addEventListener("input", event => {
    limpiarResultado();
    if (event.target === nombre) error(nombre,"errorNombre","");
    if (event.target === correo) error(correo,"errorCorreo","");
  });
  if (!base) return; // Estado cerrado seguro; el resto del sitio sigue disponible.
  fields.disabled = false; button.disabled = false;
  $("#estadoFormulario").textContent = "Los datos solo preparan el enlace de WhatsApp. Este sitio no conserva un borrador ni puede confirmar el envío.";
}

function prepararMenu() {
  const btn = $("#menuBtn"), nav = $("#nav");
  if (!btn || !nav) return;
  const cerrar = () => { nav.classList.remove("abierto"); btn.setAttribute("aria-expanded","false"); btn.setAttribute("aria-label","Abrir menú"); };
  btn.addEventListener("click", () => {
    const opened = nav.classList.toggle("abierto");
    btn.setAttribute("aria-expanded",String(opened)); btn.setAttribute("aria-label",opened ? "Cerrar menú" : "Abrir menú");
  });
  nav.addEventListener("click", event => { if (event.target.closest("a")) cerrar(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && nav.classList.contains("abierto")) { const focusInside = nav.contains(document.activeElement); cerrar(); if (focusInside) btn.focus(); }
  });
  window.addEventListener("resize", () => { if (innerWidth >= 900) cerrar(); });
  btn.hidden = false;
  document.documentElement.classList.add("interactivo");
}

function prepararFlotante() {
  const link = $("#waFloat"), contact = $("#contacto");
  if (!link || !contact || !("IntersectionObserver" in window)) return;
  let contactVisible = false;
  const actualizar = () => { link.hidden = contactVisible && document.activeElement !== link; };
  const observer = new IntersectionObserver(entries => { contactVisible = entries[0].isIntersecting; actualizar(); },{threshold:.18});
  link.addEventListener("blur",actualizar);
  observer.observe(contact);
}

function iniciar() {
  // Migración mínima: no lee texto, no borra otras claves del origen compartido.
  try { localStorage.removeItem("redcalinet-contacto"); } catch { /* El bloqueo de almacenamiento no impide el contacto. */ }
  prepararFormulario(); prepararMenu(); prepararFlotante();
  const header = $("#cabecera");
  if (header) { const onScroll = () => header.classList.toggle("pegada",scrollY > 8); onScroll(); window.addEventListener("scroll",onScroll,{passive:true}); }
  const year = $("#anio"); if (year) year.textContent = String(new Date().getFullYear());
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",iniciar,{once:true});
else iniciar();
