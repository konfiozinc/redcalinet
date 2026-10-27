'use strict';
/* ============================================================
 * Auditoría visual estática — comparativa antes/después
 * ------------------------------------------------------------
 * Lee los archivos de un árbol (el actual o una copia de otra revisión) y
 * extrae las MEDIDAS que definen el aspecto del catálogo y del hero:
 * columnas por resolución, tipografía, contraste WCAG y portadas.
 *
 * Sirve para comparar dos revisiones con los mismos números en vez de con
 * impresiones. No sustituye a la captura de pantalla: mide lo que la captura
 * debería mostrar.
 *
 * Uso:
 *   node tools/auditar-visual.js --etiqueta "ANTES (01fe213)" --dir <ruta>
 *   node tools/auditar-visual.js --etiqueta "DESPUÉS"
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf('--' + nombre);
  return i !== -1 && args[i + 1] ? args[i + 1] : porDefecto;
};

const DIR = path.resolve(opcion('dir', path.resolve(__dirname, '..')));
const ETIQUETA = opcion('etiqueta', 'ÁRBOL ACTUAL');

/* Todo lo que se imprime se acumula para poder volcarlo como evidencia. */
const LINEAS = [];
const imprimirOriginal = console.log.bind(console);
console.log = function () {
  const texto = Array.prototype.slice.call(arguments).join(' ');
  LINEAS.push(texto);
  imprimirOriginal(texto);
};

const leer = (f) => {
  const ruta = path.join(DIR, f);
  if (!fs.existsSync(ruta)) return '';
  /* Sin BOM: Windows y algunas herramientas lo añaden al guardar. */
  return fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '');
};

const css = leer('styles.css');
const html = leer('index.html');
const js = leer('script.js');
const datos = leer('data.json') ? JSON.parse(leer('data.json')) : { categorias: [] };

/* ---------- Parser CSS mínimo (con soporte de @media) ---------- */
function parsearDeclaraciones(cuerpo) {
  const decls = {};
  cuerpo.split(';').forEach((trozo) => {
    const i = trozo.indexOf(':');
    if (i === -1) return;
    const prop = trozo.slice(0, i).trim().toLowerCase();
    const valor = trozo.slice(i + 1).trim().replace(/\s+/g, ' ');
    if (prop && valor) decls[prop] = valor;
  });
  return decls;
}

function parsearCSS(texto) {
  const limpio = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = [];
  const pila = [];
  let media = null;
  let pendiente = '';
  let i = 0;

  while (i < limpio.length) {
    const c = limpio[i];

    if (c === '{') {
      const cabeza = pendiente.trim();
      if (!cabeza) { pendiente = ''; i++; continue; }

      if (cabeza.startsWith('@media')) {
        pila.push(cabeza);
        media = cabeza;
        pendiente = '';
      } else if (cabeza.startsWith('@')) {
        pila.push('@otra');
        pendiente = '';
      } else {
        const fin = limpio.indexOf('}', i);
        reglas.push({ media, selector: cabeza, decls: parsearDeclaraciones(limpio.slice(i + 1, fin)) });
        pendiente = '';
        i = fin + 1;
        continue;
      }
    } else if (c === '}') {
      pila.pop();
      media = null;
      for (let k = pila.length - 1; k >= 0; k--) {
        if (pila[k] !== '@otra') { media = pila[k]; break; }
      }
      pendiente = '';
    } else {
      pendiente += c;
    }
    i++;
  }
  return reglas;
}

const REGLAS = parsearCSS(css);

/* Variables de :root para resolver var() */
const VARIABLES = (function () {
  const mapa = {};
  REGLAS.filter((r) => r.selector === ':root').forEach((r) => {
    Object.keys(r.decls).forEach((k) => { if (k.indexOf('--') === 0) mapa[k] = r.decls[k]; });
  });
  return mapa;
})();

function resolverVar(valor, vueltas) {
  const n = (vueltas || 0);
  if (n > 8) return valor;
  return String(valor).replace(/var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)/gi, (m, nombre, alt) => {
    const v = VARIABLES[nombre];
    if (v === undefined) return alt !== undefined ? alt.trim() : m;
    return resolverVar(v, n + 1);
  });
}

/* Cascada: gana la última regla aplicable (base + @media de ancho ≤ actual). */
function valor(selector, prop, ancho) {
  let encontrado = null;
  REGLAS.forEach((r) => {
    if (r.decls[prop] === undefined) return;
    const selectores = r.selector.split(',').map((s) => s.trim());
    if (selectores.indexOf(selector) === -1) return;
    if (r.media) {
      const m = r.media.match(/min-width:\s*(\d+)px/);
      if (!m) return;
      if (Number(m[1]) > ancho) return;
    }
    encontrado = r.decls[prop];
  });
  return encontrado === null ? null : resolverVar(encontrado);
}

/* ---------- Color y contraste ---------- */
function aRGB(color) {
  const c = String(color || '').trim();
  if (c.charAt(0) === '#') {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }
  const nums = c.replace(/[^0-9.,]/g, ' ').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (nums.length >= 3) return { r: nums[0], g: nums[1], b: nums[2], a: nums.length > 3 ? nums[3] : 1 };
  return null;
}

function luminancia(c) {
  const s = [c.r, c.g, c.b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}

function contraste(fg, bg) {
  const a = luminancia(fg);
  const b = luminancia(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const BLANCO = { r: 255, g: 255, b: 255, a: 1 };

function contrastePar(selector, propColor, propFondo, ancho) {
  const color = aRGB(valor(selector, propColor || 'color', ancho));
  if (!color) return null;
  let fondo = BLANCO;
  if (propFondo) {
    /* Puede venir por `background-color` o por el atajo `background`. */
    const crudo = valor(selector, 'background-color', ancho) || valor(selector, 'background', ancho);
    const f = aRGB(crudo);
    if (f && f.a > 0.5) fondo = f;
  }
  return contraste(color, fondo);
}

/* ---------- Columnas de rejilla ---------- */
function columnas(valorPlantilla) {
  if (!valorPlantilla) return null;
  const rep = valorPlantilla.match(/repeat\(\s*(\d+)/);
  if (rep) return Number(rep[1]);
  return valorPlantilla.split(/\s+/).filter(Boolean).length;
}

/* ---------- Portadas ---------- */
const fichas = [];
(datos.categorias || []).forEach((c) => (c.fichas || []).forEach((f) => fichas.push(f)));
const conFoto = fichas.filter((f) => f.imagen).length;
const sinFoto = fichas.length - conFoto;
const tienePortadaGrafica = js.indexOf('ficha__portada') !== -1;
const tieneTipo = (datos.categorias || []).some((c) => c.tipo) && js.indexOf('ficha__tipo') !== -1;

/* ---------- Informe ---------- */
const ANCHOS = [320, 360, 375, 390, 768, 1024, 1440];

console.log('============================================================');
console.log(' AUDITORÍA VISUAL ESTÁTICA · ' + ETIQUETA);
console.log(' árbol: ' + DIR);
console.log('============================================================');

console.log('\n-- Rejilla del catálogo por resolución --');
console.log('ancho   columnas   gap      margen-sup');
ANCHOS.forEach((w) => {
  const cols = columnas(valor('.catalogo__grid', 'grid-template-columns', w));
  const gap = valor('.catalogo__grid', 'gap', w);
  const margen = valor('.catalogo__grid', 'margin-top', w);
  console.log(
    String(w).padEnd(8) + String(cols === null ? '-' : cols).padEnd(11) +
    String(gap || '-').padEnd(9) + String(margen || '-')
  );
});

console.log('\n-- Tipografía de la tarjeta (a 375px y a 1440px) --');
const TIPOS = [
  ['.ficha--producto h4', 'font-size', 'título'],
  ['.ficha--producto h4', 'line-height', '  interlineado'],
  ['.ficha--producto > p:not([class])', 'font-size', 'descripción'],
  ['.ficha--producto > p:not([class])', 'line-height', '  interlineado'],
  ['.ficha--producto .ficha__precio', 'font-size', 'precio'],
  ['.ficha--producto .ficha__precio', 'font-weight', '  peso'],
  ['.ficha__cat', 'font-size', 'categoría'],
  ['.ficha--producto .ficha__lista li', 'font-size', 'detalles']
];
console.log('elemento'.padEnd(22) + 'propiedad'.padEnd(16) + '375'.padEnd(12) + '1440');
TIPOS.forEach((t) => {
  console.log(
    t[2].padEnd(22) + t[1].padEnd(16) +
    String(valor(t[0], t[1], 375) || '-').padEnd(12) +
    String(valor(t[0], t[1], 1440) || '-')
  );
});

console.log('\n-- Hero --');
console.log('padding          375: ' + (valor('.hero', 'padding', 375) || '-') + '   1440: ' + (valor('.hero', 'padding', 1440) || '-'));
console.log('h1 font-size     375: ' + (valor('.hero h1', 'font-size', 375) || '-') + '   1440: ' + (valor('.hero h1', 'font-size', 1440) || '-'));
console.log('valores hero:     ' + (valor('.hero__valores', 'display', 375) ? 'sí' : 'no'));
console.log('fila de contacto: ' + (valor('.hero__contacto', 'display', 375) ? 'sí' : 'no'));

console.log('\n-- Contraste WCAG AA (texto sobre blanco) --');
const PARES = [
  ['categoría de la tarjeta', '.ficha__cat', null],
  ['precio', '.ficha--producto .ficha__precio', null],
  ['precio "consultar"', '.ficha--producto .ficha__precio--consultar', null],
  ['descripción', '.ficha--producto > p:not([class])', null],
  ['botón ver detalle', '.ficha__ver', null],
  ['pastilla servicio', '.ficha__tipo--servicio', 'background-color'],
  ['pastilla producto', '.ficha__tipo--producto', 'background-color']
];
PARES.forEach((p) => {
  const r = contrastePar(p[1], 'color', p[2], 375);
  if (r === null) { console.log(p[0].padEnd(24) + 'no medible'); return; }
  console.log(p[0].padEnd(24) + String(r).padEnd(8) + (r >= 4.5 ? 'AA' : (r >= 3 ? 'solo texto grande' : 'FALLA')));
});

console.log('\n-- Portadas y tipo --');
console.log('fichas totales:            ' + fichas.length);
console.log('con foto real:             ' + conFoto);
console.log('sin foto:                  ' + sinFoto);
console.log('portada gráfica de marca:  ' + (tienePortadaGrafica ? 'sí' : 'no'));
console.log('distintivo producto/servicio: ' + (tieneTipo ? 'sí' : 'no'));

const tipos = {};
(datos.categorias || []).forEach((c) => { tipos[c.tipo || 'inferido'] = (tipos[c.tipo || 'inferido'] || 0) + 1; });
console.log('categorías por tipo:       ' + JSON.stringify(tipos));

console.log('\n-- Estructura conservada --');
console.log('sección #catalogo:         ' + (html.indexOf('id="catalogo"') !== -1 ? 'sí' : 'no'));
console.log('buscador #catBuscar:       ' + (html.indexOf('id="catBuscar"') !== -1 ? 'sí' : 'no'));
console.log('filtros #catFiltros:       ' + (html.indexOf('id="catFiltros"') !== -1 ? 'sí' : 'no'));
console.log('modal #fichaModal:         ' + (html.indexOf('id="fichaModal"') !== -1 ? 'sí' : 'no'));
console.log('WhatsApp en hero:          ' + (html.indexOf('data-wa') !== -1 ? 'sí' : 'no'));
console.log('Facebook en hero:          ' + (html.indexOf('heroFacebook') !== -1 ? 'sí' : 'no'));

/* Volcado opcional del informe (UTF-8 sin BOM) para adjuntarlo como evidencia. */
const salida = opcion('salida', null);
if (salida) {
  const destino = path.resolve(salida);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const texto = LINEAS.join('\n') + '\n';
  if (args.indexOf('--anexar') !== -1) fs.appendFileSync(destino, texto, 'utf8');
  else fs.writeFileSync(destino, texto, 'utf8');
  imprimirOriginal('\n(evidencia: ' + destino + ')');
}
