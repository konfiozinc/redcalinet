#!/usr/bin/env node
/* ============================================================
 * Red CaliNet — Servidor estático local del sitio aprobado
 * ------------------------------------------------------------
 * Sirve la raíz del repositorio para revisar la web en el navegador
 * sin publicar nada. No modifica el sitio: solo lo entrega.
 *
 * Uso:
 *   node tools/servir-sitio.js            → http://127.0.0.1:5180/
 *   PORT=5181 node tools/servir-sitio.js  → otro puerto
 *
 * Con el emulador de Firestore en 8080:
 *   http://127.0.0.1:5180/?emulador=1     → catálogo desde Firestore
 *   http://127.0.0.1:5180/                → catálogo desde data.json
 * ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const PUERTO = Number(process.env.PORT || 5180);
const HOST = process.env.HOST || "127.0.0.1";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2"
};

/* Carpetas que no se sirven: código de administración y material privado.
   El sitio público es una web estática; el panel vive detrás de su API. */
const BLOQUEADAS = ["admin", "node_modules", ".git", "capturas", "docs", "tools", "_transferencia"];

const servidor = http.createServer((req, res) => {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Solicitud inválida");
    return;
  }
  if (ruta.endsWith("/")) ruta += "index.html";

  const relativa = ruta.replace(/^\/+/, "");
  const primera = relativa.split("/")[0];
  if (BLOQUEADAS.includes(primera)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("No disponible en el servidor de revisión.");
    return;
  }

  const absoluta = path.join(RAIZ, relativa);
  if (!absoluta.startsWith(RAIZ)) {
    res.writeHead(403).end("Fuera de la raíz.");
    return;
  }

  fs.readFile(absoluta, (error, datos) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><meta charset=utf-8><h1>404</h1><p>No existe " + relativa.replace(/</g, "&lt;") + "</p>");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TIPOS[path.extname(absoluta).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(datos);
  });
});

servidor.listen(PUERTO, HOST, () => {
  console.log("Sitio aprobado en http://" + HOST + ":" + PUERTO + "/");
  console.log("  catálogo desde data.json: http://" + HOST + ":" + PUERTO + "/");
  console.log("  catálogo desde Firestore: http://" + HOST + ":" + PUERTO + "/?emulador=1");
});
