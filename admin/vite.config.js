import {defineConfig} from 'vite';
/* KZ-REDCALINET-024 — Rutas RELATIVAS a propósito.
   Con `base:'/admin/'` el panel compilado solo funcionaba servido desde /admin/,
   y las copias publicadas en otras rutas (hosting-public/admin y el worker)
   pedían /admin/assets/… y daban 404. En relativo, el mismo panel compilado
   funciona servido desde /admin/, desde /admin/dist/ o desde cualquier carpeta,
   que es justo lo que hace falta para publicarlo en sitios distintos. */
export default defineConfig({base:'./',build:{outDir:'dist',emptyOutDir:true,sourcemap:false}});
