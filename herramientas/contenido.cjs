"use strict";

// Contrato compartido por el generador y sus regresiones. Sin dependencias.
const DIAS = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
const NOMBRES_DIAS = {Monday:"Lunes",Tuesday:"Martes",Wednesday:"Miércoles",Thursday:"Jueves",Friday:"Viernes",Saturday:"Sábado",Sunday:"Domingo"};
function etiquetaDias(days) {
  const ordered = [...DIAS], first = ordered.indexOf(days[0]);
  if (days.length > 1 && days.every((day,index)=>ordered[first+index] === day)) return NOMBRES_DIAS[days[0]]+" a "+NOMBRES_DIAS[days.at(-1)].toLowerCase();
  return days.map(day=>NOMBRES_DIAS[day]).join(", ");
}
const ICONOS = new Set(["i-streaming", "i-tech", "i-seguros", "i-tramites", "i-heart", "i-chat", "i-pin"]);
const esc = (value) => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
function objeto(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Objeto inválido: " + name);
}
function texto(value, name, optional = false) {
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw Error("Texto inválido: " + name);
}
function lista(value, name, nonempty = true) {
  if (!Array.isArray(value) || (nonempty && !value.length) || value.length > 50) throw Error("Lista inválida: " + name);
}
function https(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !/[\s\\]/.test(value);
  } catch { return false; }
}
function validar(data) {
  objeto(data, "data");
  for (const key of ["marca", "contacto", "sitio"]) objeto(data[key], key);
  for (const key of ["nombre", "nombreLegal", "eslogan", "promesa", "ciudad"]) texto(data.marca[key], "marca." + key);
  for (const key of ["whatsapp", "whatsappTexto", "correo", "direccion", "direccionNota"]) texto(data.contacto[key], "contacto." + key, key === "direccionNota");
  if (!/^[1-9]\d{7,14}$/.test(data.contacto.whatsapp)) throw Error("WhatsApp inválido");
  if (!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]{2,}$/.test(data.contacto.correo)) throw Error("Correo inválido");
  texto(data.sitio.url, "sitio.url");
  texto(data.sitio.areaServida, "sitio.areaServida");
  if (!https(data.sitio.url) || !data.sitio.url.endsWith("/") || new URL(data.sitio.url).search || new URL(data.sitio.url).hash) throw Error("URL del sitio inválida");
  objeto(data.contacto.direccionPostal, "direccionPostal");
  for (const key of ["streetAddress", "addressLocality", "addressRegion", "addressCountry"]) texto(data.contacto.direccionPostal[key], "direccionPostal." + key);
  if (!/^[A-Z]{2}$/.test(data.contacto.direccionPostal.addressCountry)) throw Error("País inválido");
  const address = data.contacto.direccionPostal;
  // Evita que la dirección de presentación y los datos estructurados diverjan.
  for (const key of ["streetAddress", "addressLocality", "addressRegion"]) {
    if (!data.contacto.direccion.includes(address[key])) throw Error("Direcciones incompatibles: " + key);
  }
  lista(data.horarios, "horarios");
  const usedDays = new Set();
  for (const h of data.horarios) {
    objeto(h, "horario"); texto(h.dia, "horario.dia"); texto(h.hora, "horario.hora"); lista(h.dias, "horario.dias");
    if (!/^([01]\d|2[0-3]):[0-5]\d – ([01]\d|2[0-3]):[0-5]\d$/.test(h.hora)) throw Error("Horas inválidas");
    for (const day of h.dias) {
      if (!DIAS.has(day) || usedDays.has(day)) throw Error("Día inválido o duplicado");
      usedDays.add(day);
    }
    if (h.dia !== etiquetaDias(h.dias)) throw Error("Etiqueta y días del horario incompatibles");
  }
  for (const collection of ["servicios", "beneficios", "redes"]) {
    lista(data[collection], collection, collection !== "redes");
    const ids = new Set();
    for (const item of data[collection]) {
      objeto(item, collection);
      if (typeof item.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) throw Error("ID inválido o duplicado: " + collection);
      ids.add(item.id);
      if (collection === "redes") {
        if (!["instagram", "whatsapp", "facebook", "tiktok"].includes(item.id)) throw Error("Red desconocida");
        texto(item.nombre, "red.nombre"); texto(item.url, "red.url", true); texto(item.usuario, "red.usuario", true);
        if (item.url && !https(item.url)) throw Error("Protocolo de red no autorizado");
        if (item.id === "whatsapp" && item.url && item.url !== "https://wa.me/" + data.contacto.whatsapp) throw Error("WhatsApp inconsistente");
      } else {
        if (!ICONOS.has(item.icono)) throw Error("Icono desconocido");
        if (collection === "servicios") {
          texto(item.nombre, "servicio.nombre"); texto(item.descripcion, "servicio.descripcion"); lista(item.detalles, "servicio.detalles", false);
          item.detalles.forEach(value => texto(value, "servicio.detalle"));
        } else { texto(item.titulo, "beneficio.titulo"); texto(item.texto, "beneficio.texto"); }
      }
    }
  }
  return data;
}
const svg = id => '<svg class="ico" aria-hidden="true"><use href="#' + esc(id) + '"></use></svg>';
function contenido(input) {
  const d = validar(input), m = d.marca, c = d.contacto, url = d.sitio.url;
  const wa = "https://wa.me/" + c.whatsapp;
  const title = m.nombre + " — " + m.eslogan + " | " + m.ciudad;
  const description = m.nombre + " en " + m.ciudad + ": " + d.servicios.map(s => s.nombre.toLowerCase()).join(", ") + ". " + m.promesa + " Atención por WhatsApp y punto físico.";
  const schema = {
    "@context":"https://schema.org", "@type":"LocalBusiness", name:m.nombre, legalName:m.nombreLegal,
    slogan:m.eslogan, description, url, image:url+"assets/logo/og-image.jpg", logo:url+"assets/logo/logo-500.webp",
    telephone:"+"+c.whatsapp, email:c.correo, address:{"@type":"PostalAddress", ...c.direccionPostal}, areaServed:{"@type":"AdministrativeArea",name:d.sitio.areaServida},
    openingHoursSpecification:d.horarios.map(h => {const [opens, closes] = h.hora.split(" – "); return {"@type":"OpeningHoursSpecification",dayOfWeek:h.dias,opens,closes};}),
    sameAs:d.redes.filter(r => r.url && r.id !== "whatsapp").map(r => r.url),
    contactPoint:{"@type":"ContactPoint",contactType:"customer service",telephone:"+"+c.whatsapp,availableLanguage:"es"},
    hasOfferCatalog:{"@type":"OfferCatalog",name:"Servicios "+m.nombre,itemListElement:d.servicios.map(s => ({"@type":"Offer",itemOffered:{"@type":"Service",name:s.nombre}}))}
  };
  return {
    TITLE:esc(title), DESCRIPTION:esc(description), BRAND:esc(m.nombre), LEGAL:esc(m.nombreLegal), SLOGAN:esc(m.eslogan), PROMISE:esc(m.promesa), CITY:esc(m.ciudad),
    URL:esc(url), PRIVACY_URL:esc(url+"privacidad.html"), OG_IMAGE:esc(url+"assets/logo/og-image.jpg"),
    WA:esc(wa), WA_DEFAULT:esc(wa+"?text="+encodeURIComponent(c.whatsappTexto)), EMAIL:esc(c.correo), PHONE:esc("+"+c.whatsapp),
    HERO_SUB:esc(d.servicios.map(s=>s.nombre).join(", ")+". "+m.promesa),
    SERVICE_COUNT:d.servicios.length === 4 ? "Cuatro" : String(d.servicios.length),
    CHIPS:d.servicios.map(s=>"<li>"+svg(s.icono)+esc(s.nombre)+"</li>").join("\n"),
    SERVICES:d.servicios.map(s => '<article class="servicio revelar"><div class="servicio__ico">'+svg(s.icono)+'</div><h3>'+esc(s.nombre)+'</h3><p>'+esc(s.descripcion)+'</p>'+ (s.detalles.length ? '<ul class="servicio__lista">'+s.detalles.map(t=>'<li>'+svg("i-check")+'<span>'+esc(t)+'</span></li>').join("")+"</ul>" : "")+'<a class="servicio__cta" href="'+esc(wa+"?text="+encodeURIComponent("Hola, quiero información sobre "+s.nombre+"."))+'" target="_blank" rel="noopener noreferrer">Consultar por WhatsApp'+svg("i-arrow")+'</a></article>').join("\n"),
    BENEFITS:d.beneficios.map(b=>'<article class="beneficio revelar"><div class="beneficio__ico">'+svg(b.icono)+'</div><div><h3>'+esc(b.titulo)+'</h3><p>'+esc(b.texto)+'</p></div></article>').join("\n"),
    OPTIONS:d.servicios.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.nombre)+'</option>').join("\n"),
    NETWORKS:d.redes.filter(r=>r.url).map(r=>'<a class="social-btn '+esc(r.id)+'" href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc(r.nombre+" de "+m.nombre)+'">'+svg("i-"+r.id)+'</a>').join("\n"),
    INFO:'<li class="info__item"><div class="info__ico">'+svg("i-store")+'</div><div><h3>Punto físico</h3><p>'+esc(c.direccion)+'</p><small>'+esc(c.direccionNota)+'</small></div></li>'+ '<li class="info__item"><div class="info__ico">'+svg("i-mail")+'</div><div><h3>Correo</h3><a href="mailto:'+esc(c.correo)+'" aria-label="'+esc("Enviar correo a "+m.nombre)+'">Enviar correo</a><small>Para solicitudes por escrito</small></div></li>'+ '<li class="info__item info__item--ancho"><div class="info__ico">'+svg("i-clock")+'</div><div class="info__horario"><h3>Horario de atención</h3>'+d.horarios.map(h=>'<div><span>'+esc(h.dia)+'</span><span>'+esc(h.hora)+'</span></div>').join("")+'<small>Hora de Colombia (GMT-5)</small></div></li>',
    JSON_LD:JSON.stringify(schema,null,2).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026")
  };
}
function render(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values,key)) throw Error("Variable desconocida: " + key);
    return values[key];
  });
}
module.exports = {validar, contenido, render, https, esc};
