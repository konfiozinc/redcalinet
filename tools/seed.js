#!/usr/bin/env node
/* ============================================================
 * Red CaliNet — Seed inicial (una sola vez)
 * ------------------------------------------------------------
 * Crea los usuarios con rol (PROPIETARIO + SUPERADMIN) y siembra
 * en Firestore: configuracion/empresa, configuracion/contacto,
 * categorías y servicios (a partir de data.json).
 *
 * Producción:
 *   GOOGLE_APPLICATION_CREDENTIALS=clave.json node tools/seed.js
 *   (clave.json = Service Account de Firebase, Project settings → Service accounts)
 *
 * Emulador (pruebas):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 node tools/seed.js
 *
 * Credenciales de acceso (se pueden sobrescribir con variables de entorno):
 *   PROPIETARIO_EMAIL / PROPIETARIO_PASS
 *   SUPERADMIN_EMAIL / SUPERADMIN_PASS
 * ============================================================ */
"use strict";

const admin = require("firebase-admin");
const data = require("../data.json");

const PROYECTO = process.env.PROYECTO || "red-calinet";
const EMAIL_PROP = process.env.PROPIETARIO_EMAIL || "redcalinetmono@gmail.com";
const PASS_PROP = process.env.PROPIETARIO_PASS || "RedCaliNet#2026";
const EMAIL_SUP = process.env.SUPERADMIN_EMAIL || "admin@konfiozinc.com";
const PASS_SUP = process.env.SUPERADMIN_PASS || "RedCaliNet#2026";

async function main() {
  admin.initializeApp({ projectId: PROYECTO });
  const db = admin.firestore();
  const auth = admin.auth();

  async function crearUsuario(email, pass, rol, nombre) {
    let uid;
    try {
      uid = (await auth.createUser({ email, password: pass, displayName: nombre })).uid;
    } catch (e) {
      if (e.code === "auth/email-already-exists") {
        uid = (await auth.getUserByEmail(email)).uid;
        await auth.updateUser(uid, { password: pass });
      } else {
        throw e;
      }
    }
    await db.collection("usuarios").doc(uid).set({ email, rol, activo: true, nombre });
    return uid;
  }

  await crearUsuario(EMAIL_PROP, PASS_PROP, "PROPIETARIO", "Red CaliNet");
  await crearUsuario(EMAIL_SUP, PASS_SUP, "SUPERADMIN", "KONFÍO ZINC");

  // Configuración de empresa
  await db.collection("configuracion").doc("empresa").set({
    nombre: data.marca.nombre,
    eslogan: data.marca.eslogan,
    esloganHistorico: data.marca.esloganHistorico,
    promesa: data.marca.promesa,
    ciudad: data.marca.ciudad,
    direccion: data.contacto.direccion,
    direccionNota: data.contacto.direccionNota
  });

  // Configuración de contacto y redes
  const redes = data.redes || [];
  await db.collection("configuracion").doc("contacto").set({
    whatsapp: data.contacto.whatsapp,
    telefono: data.contacto.telefono,
    correo: data.contacto.correo,
    facebook: (redes.find((r) => r.id === "facebook") || {}).url || "",
    instagram: (redes.find((r) => r.id === "instagram") || {}).url || "",
    tiktok: (redes.find((r) => r.id === "tiktok") || {}).url || "",
    horarios: data.horarios || []
  });

  // Categorías y servicios (desde data.json)
  let orden = 0;
  for (const cat of (data.categorias || [])) {
    const catRef = await db.collection("categorias").add({
      nombre: cat.nombre,
      icono: cat.icono,
      descripcion: cat.descripcion || "",
      nota: cat.nota || "",
      orden: orden++,
      visible: true
    });
    for (const f of (cat.fichas || [])) {
      await db.collection("servicios").add({
        categoriaId: catRef.id,
        nombre: f.nombre,
        descripcion: f.descripcion || "",
        precio: f.precio != null ? f.precio : null,
        detalles: f.detalles || [],
        imagen: null,
        estado: "PUBLICADO",
        orden: 0
      });
    }
  }

  console.log("✓ Seed completo.");
  console.log("  PROPIETARIO:", EMAIL_PROP);
  console.log("  SUPERADMIN: ", EMAIL_SUP);
  process.exit(0);
}

main().catch((e) => { console.error("Seed falló:", e.message); process.exit(1); });
