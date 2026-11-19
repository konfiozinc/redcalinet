/* ══════════════════════════════════════════════════════════════════════════
   KZ-REDCALINET-024 · entrada del panel

   Este archivo existe por un motivo concreto: `src/app.js` importa «firebase/app»,
   que solo resuelve un empaquetador (Vite). Cuando `index.html` se servía tal
   cual —sin compilar— el navegador no podía resolver ese import y dejaba el
   error en consola, que parecía un fallo del panel.

   Ahora se intenta cargar el panel y, si no se puede, se explica en pantalla.
   Compilado con Vite este archivo se empaqueta igual que antes: no cambia nada
   del panel que se sirve en producción.
   ══════════════════════════════════════════════════════════════════════════ */

try {
  await import('./src/app.js');
} catch (error) {
  const caja = document.getElementById('app') || document.body;
  caja.innerHTML =
    '<main class="error-page"><h1>Este panel se sirve compilado</h1>' +
    '<p>Esta página es la entrada de desarrollo: necesita Vite para resolver las dependencias del panel. ' +
    'Abre la versión compilada en <code>dist/</code> o ejecuta <code>npm start</code> dentro de <code>admin/</code>.</p>' +
    '<p>Aquí no se muestran datos inventados.</p></main>';
  // El detalle queda en la consola del desarrollador, no como error suelto.
  console.warn('Panel sin compilar:', error && error.message ? error.message : error);
}
