/* ============================================================
   Red CaliNet — Panel de administración (MVP)
   - Auth (email/contraseña) + rol desde Firestore.
   - Módulos: Mi empresa, Categorías, Servicios, Contacto.
   - CRUD sobre Firestore; la landing lee los mismos documentos.
   Sin frameworks. Sin dependencias externas (solo Firebase SDK).
   ============================================================ */
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  addDoc, getDocs, query, orderBy, onSnapshot
} from "firebase/firestore";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ESTADOS = ["BORRADOR", "PUBLICADO", "OCULTO"];
let rolActual = "";

/* ---------- Utilidades ---------- */
function msg(t, tipo) {
  const el = $("#modalMsg");
  if (!el) return;
  el.textContent = t || "";
  el.className = "msg " + (tipo || "");
}

function cerrarModal() { $("#modalRoot").innerHTML = ""; }

function abrirModal(titulo, cuerpoHTML) {
  $("#modalRoot").innerHTML =
    '<div class="modal-fondo"><div class="modal" role="dialog" aria-modal="true">' +
      "<h3>" + esc(titulo) + "</h3>" + cuerpoHTML +
      '<p class="msg" id="modalMsg" role="alert"></p>' +
    "</div></div>";
  $("#modalRoot").querySelector(".modal-fondo").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-fondo")) cerrarModal();
  });
}

/* ---------- Navegación ---------- */
function prepararNav() {
  const titulos = { empresa: "Mi empresa", categorias: "Categorías", servicios: "Servicios", contacto: "Contacto y redes" };
  $$(".nav-item[data-vista]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-item[data-vista]").forEach((b) => b.classList.remove("activo"));
      $$(".panel-seccion").forEach((s) => s.classList.remove("activo"));
      btn.classList.add("activo");
      const vista = btn.dataset.vista;
      document.querySelector('[data-panel="' + vista + '"]').classList.add("activo");
      $("#vistaTitulo").textContent = titulos[vista] || "Panel";
    });
  });
}

/* ---------- Mi empresa ---------- */
async function cargarEmpresa() {
  const snap = await getDoc(doc(db, "configuracion", "empresa"));
  const d = snap.exists ? snap.data() : {};
  $("#formEmpresa").innerHTML = camposEmpresa(d);
}
function camposEmpresa(d) {
  const f = (label, name, val, ph) =>
    '<div class="campo"><label>' + label + '</label><input name="' + name + '" value="' + esc(val ?? "") + '" placeholder="' + esc(ph || "") + '"></div>';
  const t = (label, name, val) =>
    '<div class="campo"><label>' + label + '</label><textarea name="' + name + '">' + esc(val ?? "") + "</textarea></div>";
  return (
    f("Nombre", "nombre", d.nombre, "Red CaliNet") +
    f("Eslogan", "eslogan", d.eslogan, "Tu conexión con servicios y soluciones digitales") +
    f("Eslogan histórico", "esloganHistorico", d.esloganHistorico, "Calidad de ventas por internet") +
    t("Promesa / descripción", "promesa", d.promesa) +
    f("Ciudad", "ciudad", d.ciudad, "Bello, Antioquia, Colombia") +
    f("Dirección", "direccion", d.direccion) +
    f("Nota de dirección", "direccionNota", d.direccionNota)
  );
}
async function guardarEmpresa() {
  const fd = new FormData($("#formEmpresa"));
  const datos = Object.fromEntries(fd.entries());
  await setDoc(doc(db, "configuracion", "empresa"), datos, { merge: true });
  alert("Datos de la empresa guardados.");
}

/* ---------- Categorías ---------- */
function pintarCategorias(lista) {
  const cont = $("#listaCategorias");
  if (!cont) return;
  if (!lista.length) { cont.innerHTML = '<p class="vacio">Aún no hay categorías.</p>'; return; }
  cont.innerHTML = lista.map((c) =>
    '<div class="fila">' +
      '<div class="fila__info"><strong>' + esc(c.nombre) + "</strong>" +
      '<small>' + (c.visible === false ? "Oculta" : "Visible") + " · orden " + (c.orden ?? 0) + "</small></div>" +
      '<div class="fila__acciones">' +
        '<button class="btn btn--ghost btn--sm" data-editar="' + c.id + '">Editar</button>' +
        '<button class="btn btn--ghost btn--sm" data-toggle="' + c.id + '">' + (c.visible === false ? "Mostrar" : "Ocultar") + "</button>" +
        '<button class="btn btn--peligro btn--sm" data-borrar="' + c.id + '">Eliminar</button>' +
      "</div>" +
    "</div>"
  ).join("");

  cont.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirModalCategoria(b.dataset.editar)));
  cont.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => toggleCategoria(b.dataset.toggle)));
  cont.querySelectorAll("[data-borrar]").forEach((b) => b.addEventListener("click", () => eliminarCategoria(b.dataset.borrar)));
}
function abrirModalCategoria(id) {
  const esNueva = !id;
  getDoc(doc(db, "categorias", id || "x")).then((snap) => {
    const d = snap.exists ? snap.data() : {};
    abrirModal(esNueva ? "Nueva categoría" : "Editar categoría",
      '<form class="form-grid" id="formCategoria">' +
        '<div class="campo"><label>Nombre</label><input name="nombre" value="' + esc(d.nombre || "") + '" required></div>' +
        '<div class="campo"><label>Icono (i-streaming, i-tech, i-tramites)</label><input name="icono" value="' + esc(d.icono || "i-check") + '"></div>' +
        '<div class="campo"><label>Descripción</label><textarea name="descripcion">' + esc(d.descripcion || "") + "</textarea></div>" +
        '<div class="campo"><label>Nota / aviso legal</label><textarea name="nota">' + esc(d.nota || "") + "</textarea></div>" +
        '<div class="campo"><label>Orden</label><input name="orden" type="number" value="' + (d.orden ?? 0) + '"></div>' +
        '<label><input type="checkbox" name="visible" ' + (d.visible !== false ? "checked" : "") + "> Visible en la web</label>" +
        '<div class="modal__acciones"><button type="button" class="btn btn--ghost" onclick="document.getElementById(\'modalRoot\').innerHTML=\'\'">Cancelar</button>' +
        '<button class="btn" type="submit">Guardar</button></div>' +
      "</form>"
    );
    $("#formCategoria").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const datos = {
        nombre: fd.get("nombre").trim(),
        icono: fd.get("icono").trim() || "i-check",
        descripcion: fd.get("descripcion").trim(),
        nota: fd.get("nota").trim(),
        orden: Number(fd.get("orden") || 0),
        visible: fd.get("visible") === "on"
      };
      if (!datos.nombre) { msg("El nombre es obligatorio.", "err"); return; }
      const ref = esNueva ? doc(collection(db, "categorias")) : doc(db, "categorias", id);
      (esNueva ? setDoc(ref, datos) : updateDoc(ref, datos)).then(cerrarModal).catch((e) => msg("No se pudo guardar: " + e.message, "err"));
    });
  });
}
async function toggleCategoria(id) {
  const snap = await getDoc(doc(db, "categorias", id));
  if (!snap.exists) return;
  await updateDoc(doc(db, "categorias", id), { visible: snap.data().visible !== false ? false : true });
}
async function eliminarCategoria(id) {
  if (!confirm("¿Eliminar esta categoría? Los servicios que le pertenezcan quedarán sin categoría.")) return;
  await deleteDoc(doc(db, "categorias", id));
}

/* ---------- Servicios ---------- */
async function cargarCategoriasParaSelect() {
  const snap = await getDocs(query(collection(db, "categorias"), orderBy("orden")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
function pintarServicios(lista, categorias) {
  const cont = $("#listaServicios");
  if (!cont) return;
  if (!lista.length) { cont.innerHTML = '<p class="vacio">Aún no hay servicios.</p>'; return; }
  cont.innerHTML = lista.map((s) => {
    const cat = categorias.find((c) => c.id === s.categoriaId);
    const est = ESTADOS.includes(s.estado) ? s.estado : "BORRADOR";
    return (
      '<div class="fila">' +
        '<div class="fila__info"><strong>' + esc(s.nombre) + "</strong>" +
        '<small>' + esc(cat ? cat.nombre : "Sin categoría") + " · " + (s.precio != null ? "$" + Number(s.precio).toLocaleString("es-CO") : "Consultar") + "</small></div>" +
        '<span class="estado estado--' + est.toLowerCase() + '">' + est + "</span>" +
        '<div class="fila__acciones">' +
          '<button class="btn btn--ghost btn--sm" data-editar="' + s.id + '">Editar</button>' +
          '<button class="btn btn--ghost btn--sm" data-publicar="' + s.id + '">' + (est === "PUBLICADO" ? "Ocultar" : "Publicar") + "</button>" +
          '<button class="btn btn--peligro btn--sm" data-borrar="' + s.id + '">Eliminar</button>' +
        "</div>" +
      "</div>"
    );
  }).join("");

  cont.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirModalServicio(b.dataset.editar, categorias)));
  cont.querySelectorAll("[data-publicar]").forEach((b) => b.addEventListener("click", () => togglePublicar(b.dataset.publicar)));
  cont.querySelectorAll("[data-borrar]").forEach((b) => b.addEventListener("click", () => eliminarServicio(b.dataset.borrar)));
}
function abrirModalServicio(id, categorias) {
  const esNueva = !id;
  getDoc(doc(db, "servicios", id || "x")).then((snap) => {
    const d = snap.exists ? snap.data() : {};
    const opts = categorias.map((c) => '<option value="' + c.id + '"' + (c.id === d.categoriaId ? " selected" : "") + ">" + esc(c.nombre) + "</option>").join("");
    const estados = ESTADOS.map((e) => '<option value="' + e + '"' + (e === d.estado ? " selected" : "") + ">" + e + "</option>").join("");
    abrirModal(esNueva ? "Nuevo servicio" : "Editar servicio",
      '<form class="form-grid" id="formServicio">' +
        '<div class="campo"><label>Categoría</label><select name="categoriaId"><option value="">—</option>' + opts + "</select></div>" +
        '<div class="campo"><label>Nombre del servicio</label><input name="nombre" value="' + esc(d.nombre || "") + '" required></div>' +
        '<div class="campo"><label>Descripción</label><textarea name="descripcion">' + esc(d.descripcion || "") + "</textarea></div>" +
        '<div class="campo"><label>Precio (COP, vacío = consultar)</label><input name="precio" type="number" step="1" min="0" value="' + (d.precio ?? "") + '"></div>' +
        '<div class="campo"><label>Detalles (separados por coma)</label><input name="detalles" value="' + esc((d.detalles || []).join(", ")) + '"></div>' +
        '<div class="campo"><label>Imagen (URL)</label><input name="imagen" value="' + esc(d.imagen || "") + '"></div>' +
        '<div class="campo"><label>Estado</label><select name="estado">' + estados + "</select></div>" +
        '<div class="campo"><label>Orden</label><input name="orden" type="number" value="' + (d.orden ?? 0) + '"></div>' +
        '<div class="modal__acciones"><button type="button" class="btn btn--ghost" onclick="document.getElementById(\'modalRoot\').innerHTML=\'\'">Cancelar</button>' +
        '<button class="btn" type="submit">Guardar</button></div>' +
      "</form>"
    );
    $("#formServicio").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const precioRaw = fd.get("precio").trim();
      const datos = {
        categoriaId: fd.get("categoriaId"),
        nombre: fd.get("nombre").trim(),
        descripcion: fd.get("descripcion").trim(),
        precio: precioRaw === "" ? null : Number(precioRaw),
        detalles: fd.get("detalles").split(",").map((s) => s.trim()).filter(Boolean),
        imagen: fd.get("imagen").trim() || null,
        estado: fd.get("estado"),
        orden: Number(fd.get("orden") || 0)
      };
      if (!datos.nombre) { msg("El nombre es obligatorio.", "err"); return; }
      const ref = esNueva ? doc(collection(db, "servicios")) : doc(db, "servicios", id);
      (esNueva ? setDoc(ref, datos) : updateDoc(ref, datos)).then(cerrarModal).catch((e) => msg("No se pudo guardar: " + e.message, "err"));
    });
  });
}
async function togglePublicar(id) {
  const snap = await getDoc(doc(db, "servicios", id));
  if (!snap.exists) return;
  const actual = snap.data().estado;
  await updateDoc(doc(db, "servicios", id), { estado: actual === "PUBLICADO" ? "OCULTO" : "PUBLICADO" });
}
async function eliminarServicio(id) {
  if (!confirm("¿Eliminar este servicio?")) return;
  await deleteDoc(doc(db, "servicios", id));
}

/* ---------- Contacto ---------- */
async function cargarContacto() {
  const snap = await getDoc(doc(db, "configuracion", "contacto"));
  const d = snap.exists ? snap.data() : {};
  $("#formContacto").innerHTML =
    '<div class="campo"><label>WhatsApp (solo números, con 57)</label><input name="whatsapp" value="' + esc(d.whatsapp || "") + '"></div>' +
    '<div class="campo"><label>Teléfono (solo números, con 57)</label><input name="telefono" value="' + esc(d.telefono || "") + '"></div>' +
    '<div class="campo"><label>Correo</label><input name="correo" type="email" value="' + esc(d.correo || "") + '"></div>' +
    '<div class="campo"><label>Facebook (URL)</label><input name="facebook" value="' + esc(d.facebook || "") + '"></div>' +
    '<div class="campo"><label>Instagram (URL)</label><input name="instagram" value="' + esc(d.instagram || "") + '"></div>' +
    '<div class="campo"><label>TikTok (URL)</label><input name="tiktok" value="' + esc(d.tiktok || "") + '"></div>' +
    '<div class="campo"><label>Horarios (línea por línea: "Lunes a sábado | 09:00 – 21:30")</label><textarea name="horarios">' +
      esc((d.horarios || []).map((h) => h.dia + " | " + h.hora).join("\n")) +
    "</textarea></div>";
}
async function guardarContacto() {
  const fd = new FormData($("#formContacto"));
  const horarios = (fd.get("horarios") || "").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => { const p = l.split("|"); return { dia: (p[0] || "").trim(), hora: (p[1] || "").trim() }; });
  const datos = {
    whatsapp: fd.get("whatsapp").trim(),
    telefono: fd.get("telefono").trim(),
    correo: fd.get("correo").trim(),
    facebook: fd.get("facebook").trim(),
    instagram: fd.get("instagram").trim(),
    tiktok: fd.get("tiktok").trim(),
    horarios
  };
  await setDoc(doc(db, "configuracion", "contacto"), datos, { merge: true });
  alert("Contacto y redes guardados.");
}

/* ---------- Arranque ---------- */
async function iniciarPanel(uid) {
  // rol
  const uSnap = await getDoc(doc(db, "usuarios", uid));
  const u = uSnap.exists ? uSnap.data() : null;
  rolActual = u && u.rol ? u.rol : "";
  if (rolActual !== "PROPIETARIO" && rolActual !== "SUPERADMIN") {
    document.body.innerHTML = '<div class="login"><div class="login__card"><h1>Sin acceso</h1><p class="muted">Tu usuario no tiene permisos para este panel. Contacta a KONFÍO ZINC.</p></div></div>';
    return;
  }
  $("#rolBadge").textContent = rolActual;
  $("#usuarioNombre").textContent = u.nombre || u.email || "";

  prepararNav();
  await cargarEmpresa();
  await cargarContacto();
  $("#btnGuardarEmpresa").addEventListener("click", guardarEmpresa);
  $("#btnGuardarContacto").addEventListener("click", guardarContacto);
  $("#btnNuevaCategoria").addEventListener("click", () => abrirModalCategoria(null));
  $("#btnNuevoServicio").addEventListener("click", async () => abrirModalServicio(null, await cargarCategoriasParaSelect()));

  // Tiempo real: categorías y servicios
  onSnapshot(query(collection(db, "categorias"), orderBy("orden")), (snap) => {
    pintarCategorias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
  onSnapshot(query(collection(db, "servicios"), orderBy("orden")), async (snap) => {
    const cats = await cargarCategoriasParaSelect();
    pintarServicios(snap.docs.map((d) => ({ id: d.id, ...d.data() })), cats);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) { location.replace("index.html"); return; }
  iniciarPanel(user.uid);
});

$("#btnSalir").addEventListener("click", () => signOut(auth));
