import './style.css';
// Logotipo oficial del proyecto (KZ-REDCALINET-017). Se reutiliza el mismo
// archivo que publica la web aprobada; Vite lo emite con hash en el build.
import logoUrl from '../../assets/logo/logo-200.webp';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence, onAuthStateChanged } from 'firebase/auth';
import { estado, raiz, clearPrivateState } from './nucleo/estado.js';
import { request, refresh } from './nucleo/api.js';
import { pintarLogin } from './nucleo/pintar.js';
import { conectar } from './acciones.js';

estado.logoUrl = logoUrl;
conectar();

/* KZ-REDCALINET-024 — El panel solo pregunta por su API si lo sirve su API.
   Antes pedía `/admin/api/bootstrap` siempre, y abierto como archivo estático
   (o publicado en un alojamiento que no tiene la API) el navegador dejaba un
   «404» en consola que parecía un fallo del panel. Ahora el servidor declara su
   presencia con <meta name="redcalinet-api">; si esa etiqueta no está, no se
   hace ni una petición y se dice en pantalla, sin inventar datos. */
const declaracionApi = document.querySelector('meta[name="redcalinet-api"]');
const baseApi = declaracionApi ? String(declaracionApi.getAttribute('content') || '').replace(/\/$/, '') : null;

try {
  if (baseApi === null) throw new Error('SIN_API');
  const respuestaBoot = await fetch(baseApi + '/admin/api/bootstrap');
  if (!respuestaBoot.ok) throw new Error('bootstrap HTTP ' + respuestaBoot.status);
  estado.boot = await respuestaBoot.json();
  estado.auth = getAuth(initializeApp(estado.boot.firebase));
  if (estado.boot.authEmulator) connectAuthEmulator(estado.auth, estado.boot.authEmulator, { disableWarnings: true });
  await setPersistence(estado.auth, browserLocalPersistence);
  onAuthStateChanged(estado.auth, async (u) => {
    if (!u || estado.user?.uid !== u.uid) clearPrivateState();
    estado.user = u;
    const generacion = estado.sesion;
    if (!u) return pintarLogin();
    try {
      const perfil = (await request('me')).user;
      if (generacion !== estado.sesion || estado.user?.uid !== u.uid) return;
      estado.actor = perfil;
      await refresh();
    } catch (e) {
      if (generacion !== estado.sesion) return;
      clearPrivateState();
      estado.error = e.message;
      pintarLogin();
    }
  });
} catch (e) {
  if (e?.message === 'SIN_API') {
    raiz().innerHTML = '<main class="error-page"><h1>Este panel necesita su servidor</h1><p>Estás viendo el panel compilado como archivo estático. Los datos los sirve <code>admin/server/index.mjs</code>; sin ese servidor no hay nada que mostrar, y aquí no se inventan cifras.</p><p>Cómo abrirlo: <code>npm start</code> dentro de <code>admin/</code>.</p></main>';
  } else {
    raiz().innerHTML = '<main class="error-page"><h1>No se pudo iniciar el panel</h1><p>La configuración o el servicio no están disponibles. No se muestran datos inventados.</p></main>';
  }
}
