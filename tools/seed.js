#!/usr/bin/env node
/* ============================================================
 * Red CaliNet — Seed inicial (IDEMPOTENTE y NO destructivo)
 * ------------------------------------------------------------
 * - NO sobrescribe documentos existentes (solo crea lo que falta).
 * - NO usa contraseñas incrustadas: se leen de variables de entorno
 *   o se generan al azar y se imprimen UNA sola vez.
 * - IDs fijos para categorías y servicios (no duplica al re-ejecutar).
 *
 * Producción (clave de servicio LOCAL, nunca en el repo):
 *   GOOGLE_APPLICATION_CREDENTIALS=clave.json \
 *   PROPIETARIO_EMAIL=... PROPIETARIO_PASS=... \
 *   SUPERADMIN_EMAIL=... SUPERADMIN_PASS=... \
 *   node tools/seed.js
 *
 * Emulador:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 node tools/seed.js
 * ============================================================ */
"use strict";

const crypto = require("crypto");
const admin = require("firebase-admin");
const data = require("../data.json");

const PROYECTO = process.env.PROYECTO || "red-calinet";

function claveAleatoria() {
  return "Rc-" + crypto.randomBytes(9).toString("base64url") + "-" + crypto.randomInt(10, 99);
}

async function main() {
  admin.initializeApp({ projectId: PROYECTO });
  const db = admin.firestore();
  const auth = admin.auth();

  /* ---------- Usuarios (roles) ---------- */
  async function asegurarUsuario(email, passEnv, rol, nombre) {
    const pass = passEnv || claveAleatoria();
    let uid;
    try {
      uid = (await auth.createUser({ email, password: pass, displayName: nombre })).uid;
      console.log("  · usuario creado:", email, "— contraseña:", pass);
    } catch (e) {
      if (e.code === "auth/email-already-exists") {
        uid = (await auth.getUserByEmail(email)).uid;
        console.log("  · usuario ya existía (no se tocó su contraseña):", email);
      } else {
        throw e;
      }
    }
    // Solo se crea el documento si falta: nunca se pisa un rol existente.
    const ref = db.collection("usuarios").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ email, rol, activo: true, nombre });
      console.log("  · rol asignado:", rol, "→", uid);
    } else {
      console.log("  · usuarios/{uid} ya existe (rol intacto):", rol, "→", uid);
    }
  }

  console.log("== Usuarios ==");
  await asegurarUsuario(
    process.env.PROPIETARIO_EMAIL || "redcalinetmono@gmail.com",
    process.env.PROPIETARIO_PASS || "",
    "PROPIETARIO", "Red CaliNet"
  );
  await asegurarUsuario(
    process.env.SUPERADMIN_EMAIL || "admin@konfiozinc.com",
    process.env.SUPERADMIN_PASS || "",
    "SUPERADMIN", "KONFÍO ZINC"
  );

  /* ---------- Configuración (solo si falta) ---------- */
  console.log("== Configuración ==");
  async function crearSiFalta(coll, id, campos) {
    const ref = db.collection(coll).doc(id);
    if ((await ref.get()).exists) { console.log("  · ya existe:", coll + "/" + id); return; }
    await ref.set(campos);
    console.log("  · creado:", coll + "/" + id);
  }

  await crearSiFalta("configuracion", "empresa", {
    nombre: data.marca.nombre,
    eslogan: data.marca.eslogan,
    esloganHistorico: data.marca.esloganHistorico,
    promesa: data.marca.promesa,
    ciudad: data.marca.ciudad,
    direccion: data.contacto.direccion,
    direccionNota: data.contacto.direccionNota
  });

  const redes = data.redes || [];
  await crearSiFalta("configuracion", "contacto", {
    whatsapp: data.contacto.whatsapp,
    telefono: data.contacto.telefono,
    correo: data.contacto.correo,
    facebook: (redes.find((r) => r.id === "facebook") || {}).url || "",
    instagram: (redes.find((r) => r.id === "instagram") || {}).url || "",
    tiktok: (redes.find((r) => r.id === "tiktok") || {}).url || "",
    horarios: data.horarios || []
  });

  /* ---------- Categorías y servicios (IDs fijos, sin duplicar) ---------- */
  console.log("== Catálogo ==");
  const idsCategoria = ["cat-streaming", "cat-tramites", "cat-tv-app", "cat-tecnologia"];
  let ci = 0;
  for (const cat of (data.categorias || [])) {
    const catId = idsCategoria[ci] || ("cat-" + cat.id);
    const catRef = db.collection("categorias").doc(catId);
    if (!(await catRef.get()).exists) {
      await catRef.set({
        nombre: cat.nombre, icono: cat.icono, descripcion: cat.descripcion || "", nota: cat.nota || "",
        orden: ci, visible: true
      });
      console.log("  · categoría creada:", cat.nombre, "(" + catId + ")");
    } else {
      console.log("  · categoría ya existía:", cat.nombre, "(" + catId + ")");
    }

    let fi = 0;
    for (const f of (cat.fichas || [])) {
      const svcId = catId.replace(/^cat-/, "svc-") + "-" + fi;
      const svcRef = db.collection("servicios").doc(svcId);
      if (!(await svcRef.get()).exists) {
        await svcRef.set({
          categoriaId: catId, nombre: f.nombre, descripcion: f.descripcion || "",
          precio: f.precio != null ? f.precio : null, detalles: f.detalles || [],
          imagen: null, estado: "PUBLICADO", orden: fi
        });
        console.log("  · servicio creado:", f.nombre, "(" + svcId + ")");
      } else {
        console.log("  · servicio ya existía:", f.nombre, "(" + svcId + ")");
      }
      fi++;
    }
    ci++;
  }

  console.log("\n✓ Seed idempotente completado (nada se sobrescribió).");
  console.log("  Guarda las contraseñas impresas arriba en un gestor seguro.");
  process.exit(0);
}

main().catch((e) => { console.error("Seed falló:", e.message); process.exit(1); });
