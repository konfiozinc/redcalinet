import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import crypto from 'node:crypto';import Busboy from 'busboy';
import {Store,initFirebase,contract,contractHash} from './store.mjs';import {Fault,id,text} from './schema.mjs';import {VIDEO_MAX,IMAGE_MAX} from './media.mjs';import {proveedorDirecto,recibirCargaQA,FORMATOS,LIMITES,RUTA_CARGA_QA} from './directa.mjs';
const runtime=initFirebase(),store=new Store(runtime),media=proveedorDirecto({local:runtime.local}),port=Number(process.env.PORT||5176),host=process.env.RCL_HOST||'127.0.0.1';
const root=fileURLToPath(new URL('../dist/',import.meta.url)),fixtureRoot=fileURLToPath(new URL('../.runtime/media/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value))}
async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new Fault(415,'Se requiere JSON.');let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>100000)throw new Fault(413,'Solicitud demasiado grande.');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw new Fault(400,'JSON inválido.')}}
function sameOrigin(req){const allowed=new Set([...(runtime.local?[`http://${host}:${port}`]:[]),...(process.env.RCL_PUBLIC_ORIGIN?process.env.RCL_PUBLIC_ORIGIN.split(',').map(o=>o.trim()).filter(Boolean):[])]);if(!allowed.size||!allowed.has(req.headers.origin))throw new Fault(403,'Origen no permitido.');}
/* KZ-REDCALINET-023 — La API ya no recibe bytes de archivos: el navegador los
   envía directo al proveedor. Este analizador solo existe para el adaptador QA
   local, que imita el endpoint de carga firmada del proveedor en loopback. */
async function qaMultipart(req){if(!req.headers['content-type']?.startsWith('multipart/form-data'))throw new Fault(415,'Se requiere un formulario de archivo.');return new Promise((resolve,reject)=>{let parts,fields={},file,truncated=false;try{parts=Busboy({headers:req.headers,limits:{fileSize:VIDEO_MAX,files:1,fields:8,fieldSize:4000}})}catch{return reject(new Fault(400,'Formulario de archivo inválido.'))}
 parts.on('file',(_name,stream,info)=>{const chunks=[];stream.on('limit',()=>{truncated=true});stream.on('data',c=>chunks.push(c));stream.on('end',()=>{file={buffer:Buffer.concat(chunks),mimeType:info.mimeType,filename:info.filename}})});parts.on('field',(name,value)=>{fields[name]=value});parts.on('filesLimit',()=>{truncated=true});parts.on('fieldsLimit',()=>{truncated=true});parts.on('error',()=>reject(new Fault(400,'Carga incompleta.')));parts.on('close',()=>{try{if(truncated)throw new Fault(413,'Archivo o formulario superior al límite.');if(!file?.buffer?.length)throw new Fault(400,'Selecciona un solo archivo.');resolve({campos:fields,...file})}catch(e){reject(e)}});req.on('aborted',()=>reject(new Fault(400,'Carga cancelada.')));req.pipe(parts)})}
async function serve(req,res,file,range=false){try{const data=await fs.readFile(file),type=mime[path.extname(file)]||'application/octet-stream';const headers={'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://res.cloudinary.com; media-src 'self' blob: https://res.cloudinary.com; connect-src 'self' http://127.0.0.1:9099 https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.cloudinary.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"};const match=range&&req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(match){const start=+match[1],end=match[2]?Math.min(+match[2],data.length-1):data.length-1;if(start>end||start>=data.length){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});return res.end()}res.writeHead(206,{...headers,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});return res.end(data.subarray(start,end+1))}res.writeHead(200,{...headers,'Accept-Ranges':'bytes'});res.end(data)}catch{json(res,404,{error:'Recurso inexistente.'})}}
export async function handler(req,res){try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/admin/api/bootstrap'&&req.method==='GET')return json(res,200,{local:runtime.local,contractStatus:contract.status,contractHash,requestChannel:false,media:{enabled:media.enabled,mode:media.mode,fixture:media.fixture===true,subidaDirecta:true,imageMax:IMAGE_MAX,videoMax:VIDEO_MAX,formatos:FORMATOS,maxBytes:LIMITES},firebase:{projectId:runtime.projectId,apiKey:runtime.local?'demo-key':process.env.FIREBASE_WEB_API_KEY,authDomain:runtime.local?'demo-redcalinet-admin.firebaseapp.com':process.env.FIREBASE_AUTH_DOMAIN},authEmulator:runtime.local?'http://127.0.0.1:9099':null});
 if(pathname==='/admin/api/public/catalogo'&&req.method==='GET')return json(res,200,await store.publicCatalog());
 /* Adaptador QA local: imita el endpoint de carga firmada del proveedor y se
    autentica solo con la firma, igual que el real. Solo existe en el emulador. */
 if(runtime.local&&media.mode==='QA_DIRECT_FIXTURE'&&req.method==='POST'&&RUTA_CARGA_QA.test(pathname))return json(res,200,await recibirCargaQA(media,await qaMultipart(req)));
 if(pathname.startsWith('/admin/api/')){
  const actor=await store.actor(req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null);
  if(req.method!=='GET')sameOrigin(req);
  const parts=pathname.slice('/admin/api/'.length).split('/');const [resource,rid,action]=parts;
  /* KZ-REDCALINET-023 — Subida directa firmada. La firma se emite aquí, con el
     secreto del servidor y una sesión administrativa válida; el registro valida
     lo que el navegador declara del proveedor antes de escribir nada. */
  if(resource==='multimedia'&&rid==='firma'&&req.method==='POST'){const b=await body(req);return json(res,200,media.firma(b.tipo))}  if(resource==='multimedia'&&rid==='registrar'&&req.method==='POST'){
   const b=await body(req),entrada={tipo:b.tipo,timestamp:b.timestamp,signature:b.signature,resultado:b.resultado};
   /* Solo se limpia el archivo del proveedor cuando la firma demuestra que este
      servidor autorizó ese `public_id`: nunca se borra un archivo ajeno. */
   const autorizada=media.autorizar(entrada);
   try{
    const asset=await media.verificar(entrada);
    const huella=await media.huella(asset).catch(()=>null);
    if(huella){asset.sha256=huella;asset.sha256Origen='SERVIDOR_LOCAL'}else if(typeof b.sha256Cliente==='string'&&/^[a-f0-9]{64}$/.test(b.sha256Cliente)){asset.sha256=b.sha256Cliente;asset.sha256Origen='CLIENTE'}
    const meta={titulo:text(b.titulo||'',200),alt:text(b.alt||'',200),descripcion:text(b.descripcion||'',3000)};
    return json(res,200,{id:await store.addMedia(asset,actor,meta,'SUBIDA_DIRECTA')});
   }catch(e){if(!(e instanceof Fault&&e.status===409))await media.remove({provider:media.fixture?'QA_DIRECT_FIXTURE':'CLOUDINARY',publicId:autorizada.publicId,tipo:b.tipo}).catch(()=>{});throw e}
  }
  if(resource==='multimedia'&&req.method==='POST'&&!rid)throw new Fault(410,'La API ya no recibe archivos. Usa la subida directa firmada: pide la firma, carga el archivo en el proveedor y registra los metadatos.');
  if(resource==='me'&&req.method==='GET')return json(res,200,{user:actor,mode:runtime.local?'FIREBASE_EMULATOR':'FIREBASE'});
  if(resource==='dashboard'&&req.method==='GET')return json(res,200,await store.dashboard());
  if(resource==='solicitudes')throw new Fault(503,'No existe un canal de captura o contrato de solicitudes verificado. WhatsApp no se importa.');
  if(resource==='usuarios'&&req.method==='POST')return json(res,200,{id:await store.users(await body(req),actor)});
  if(resource==='multimedia'&&action==='uso'&&req.method==='GET')return json(res,200,{items:await store.mediaUsage(rid)});
  if(resource==='multimedia'&&rid&&req.method==='DELETE'){const b=await body(req);if(b.confirm!=='ELIMINAR ARCHIVO')throw new Fault(400,'Confirmación requerida.');if(!media.enabled)throw new Fault(503,'Proveedor multimedia no configurado.');await store.deleteMedia(rid,actor,media);return json(res,200,{ok:true})}
  if(req.method==='GET'&&!rid)return json(res,200,await store.list(resource,actor,new URL(req.url,'http://localhost').searchParams.get('cursor')||''));
  if(['POST','PATCH'].includes(req.method)){const b=await body(req);const requestId=req.headers['idempotency-key'];if(!requestId)throw new Fault(400,'Identificador de operación requerido.');return json(res,200,{id:await store.save(resource,rid,b.values,b.revision,actor,id(requestId))})}
  throw new Fault(404,'Operación no disponible.');
 }
 if(runtime.local&&media.fixture&&pathname.startsWith('/admin/test-media/')){const name=pathname.slice('/admin/test-media/'.length);if(!/^[a-f0-9-]+\.(png|jpg|webp|mp4|webm)$/.test(name))throw new Fault(404,'Archivo inválido.');return serve(req,res,path.join(fixtureRoot,name),true)}
 if(req.method!=='GET'&&req.method!=='HEAD')throw new Fault(405,'Método no permitido.');
 if(pathname==='/'){res.writeHead(302,{Location:'/admin/'});return res.end()}
 if(pathname==='/admin/'||pathname==='/admin/index.html')return serve(req,res,path.join(root,'index.html'));
 if(pathname.startsWith('/admin/assets/')&&/^\/admin\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname))return serve(req,res,path.join(root,pathname.slice('/admin/'.length)));
 throw new Fault(404,'Recurso no disponible.');
 }catch(e){if(!req.readableEnded&&!req.destroyed)req.resume();json(res,e instanceof Fault?e.status:500,{error:e instanceof Fault?e.message:'La operación no pudo completarse. Los datos no se muestran como cero.'});}}
// Arranque local: solo cuando este archivo es el programa principal. Cloud
// Functions (admin/deploy/index.mjs) importa `handler` y no ejecuta esto, así
// que el mismo código de rutas sirve para los dos entornos.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 http.createServer(handler).listen(port,host,()=>console.log(`Red CaliNet admin: http://${host}:${port}/admin/ · ${runtime.local?'QA FIREBASE EMULATOR / NO PRODUCCIÓN':'FIREBASE · contrato aprobado'}`));
}
