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

try {
  estado.boot = await fetch('/admin/api/bootstrap').then((r) => r.json());
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
} catch {
  raiz().innerHTML = '<main class="error-page"><h1>No se pudo iniciar el panel</h1><p>La configuración o el servicio no están disponibles. No se muestran datos inventados.</p></main>';
}
