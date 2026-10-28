/* KZ-REDCALINET-023 — Subida directa firmada, sin exponer credenciales.

   El archivo NO atraviesa la API. El navegador pide una firma, sube el archivo
   directo al proveedor y después registra solo los metadatos:

     1. POST /admin/api/multimedia/firma      → firma de vida corta
     2. POST <uploadUrl>  (navegador → proveedor, fuera de la función)
     3. POST /admin/api/multimedia/registrar  → valida el resultado y guarda

   La firma cubre exactamente {folder, timestamp, allowed_formats}. Al registrar
   se recalcula con el secreto del servidor, así que solo vale una firma emitida
   por este proceso y solo dentro de su ventana de vigencia. El `api_secret`
   nunca se devuelve en ninguna respuesta y nunca llega al navegador.

   Con subida directa el límite de tamaño lo pone el proveedor: la función ya no
   recibe bytes y el tope de las Cloud Functions deja de ser el factor limitante. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Fault} from './schema.mjs';
import {inspectFile,IMAGE_MAX,VIDEO_MAX} from './media.mjs';

export const CARPETA='redcalinet/admin';
export const FORMATOS={image:['jpg','jpeg','png','webp'],video:['mp4','webm']};
export const LIMITES={image:IMAGE_MAX,video:VIDEO_MAX};
export const VIGENCIA_SEGUNDOS=900;
export const RUTA_CARGA_QA=/^\/admin\/test-cloudinary\/v1_1\/[a-z0-9-]+\/auto\/upload$/;
const NUBE_QA='qa-directo',CLAVE_QA='qa-directo',RUTA_QA='/admin/test-cloudinary',RUTA_MEDIA_QA='/admin/test-media';
const MEDIA_QA=fileURLToPath(new URL('../.runtime/media/',import.meta.url));

/* Firma oficial de subida de Cloudinary: SHA-1 de los parámetros ordenados
   alfabéticamente y unidos con `&`, seguido del `api_secret`. Es una función
   pura para poder probarla sin red ni cuenta. */
export function firma(params,apiSecret){
 const base=Object.keys(params).sort().filter(k=>params[k]!==undefined&&params[k]!==null&&params[k]!=='').map(k=>k+'='+params[k]).join('&');
 return crypto.createHash('sha1').update(base+apiSecret).digest('hex');
}
const iguales=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
export const parametrosFirmados=(tipo,publicId)=>({allowed_formats:FORMATOS[tipo].join(','),folder:CARPETA,...(publicId?{public_id:publicId}:{})});
const dentroDeCarpeta=p=>{
 if(typeof p!=='string'||!p.startsWith(CARPETA+'/'))return null;
 const resto=p.slice(CARPETA.length+1);
 return resto.length>0&&resto.length<=120&&!resto.includes('/')&&/^[A-Za-z0-9_-]+$/.test(resto)?resto:null;
};
/* Ancho y alto se leen del IHDR de PNG cuando el archivo es local. Para el resto
   de formatos no se inventan dimensiones: quedan sin declarar. */
function dimensionesPNG(buffer){
 if(buffer.length<24||!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null;
 const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
 return width>0&&height>0?{width,height}:null;
}

/* El `public_id` también va firmado: el servidor decide el identificador del
   archivo y el proveedor rechaza cualquier otro. Así el registro solo puede
   referirse al archivo que este servidor autorizó, y una limpieza tras un fallo
   nunca puede borrar el archivo de otro. */
export function emitirFirma({tipo,apiKey,cloudName,apiSecret,uploadUrl,fixture=false,ahora=Date.now(),publicId=CARPETA+'/'+crypto.randomUUID()}){
 if(!FORMATOS[tipo])throw new Fault(400,'Tipo de archivo no admitido.');
 const timestamp=Math.floor(ahora/1000),firmados={timestamp,...parametrosFirmados(tipo,publicId)};
 return{proveedor:fixture?'QA_DIRECT_FIXTURE':'CLOUDINARY',fixture,tipo,timestamp,publicId,signature:firma(firmados,apiSecret),apiKey,cloudName,uploadUrl,carpeta:CARPETA,formatos:FORMATOS[tipo],maxBytes:LIMITES[tipo],vigenciaSegundos:VIGENCIA_SEGUNDOS};
}

/* Valida el resultado que el navegador declara del proveedor. Todo lo que se
   puede comprobar sin red se comprueba aquí: que la firma la emitió este
   servidor, que sigue vigente, que el archivo está en la carpeta autorizada,
   que el formato y el tipo son los firmados y que el tamaño está dentro del
   límite. */
/* Primera fase: ¿esta carga la autorizó este servidor? Solo si la respuesta es
   sí se puede limpiar el archivo cuando el resto de la validación falla: la
   firma cubre el `public_id`, así que un identificador ajeno nunca llega aquí. */
export function autorizarCarga({entrada,tipo,apiSecret,ahora=Date.now()}){
 if(!FORMATOS[tipo])throw new Fault(400,'Tipo de archivo no admitido.');
 if(!entrada||typeof entrada!=='object'||Array.isArray(entrada))throw new Fault(400,'Faltan los metadatos de la subida.');
 const timestamp=entrada.timestamp;
 if(!Number.isSafeInteger(timestamp)||typeof entrada.signature!=='string')throw new Fault(400,'Firma de subida inválida.');
 const r=entrada.resultado;
 if(!r||typeof r!=='object'||Array.isArray(r))throw new Fault(400,'El proveedor no devolvió el resultado de la carga.');
 const resto=dentroDeCarpeta(r.public_id);
 if(!resto)throw new Fault(400,'El archivo subido no está en la carpeta autorizada.');
 const esperada=firma({timestamp,...parametrosFirmados(tipo,r.public_id)},apiSecret);
 if(!iguales(entrada.signature,esperada))throw new Fault(403,'La firma no corresponde a una subida autorizada por este servidor.');
 const edad=Math.floor(ahora/1000)-timestamp;
 if(edad>VIGENCIA_SEGUNDOS)throw new Fault(403,'La firma expiró: solicita una nueva antes de volver a subir.');
 if(edad<-60)throw new Fault(403,'Marca de tiempo de la firma fuera de rango.');
 return{timestamp,publicId:r.public_id};
}

/* Segunda fase: el resultado cumple las reglas del tipo firmado. */
export function verificarRegistro({entrada,tipo,apiSecret,cloudName='',fixture=false,ahora=Date.now()}){
 autorizarCarga({entrada,tipo,apiSecret,ahora});
 const r=entrada.resultado,resto=dentroDeCarpeta(r.public_id);
 const format=String(r.format||'').toLowerCase();
 if(!FORMATOS[tipo].includes(format))throw new Fault(400,'El formato del archivo no está permitido para el tipo firmado.');
 if(r.resource_type!==tipo)throw new Fault(400,'El tipo del archivo no coincide con la firma.');
 const bytes=r.bytes;
 if(!Number.isSafeInteger(bytes)||bytes<=0)throw new Fault(400,'Tamaño del archivo inválido.');
 if(bytes>LIMITES[tipo])throw new Fault(413,'El archivo supera el límite permitido para su tipo.');
 const extension=format==='jpeg'?'jpg':format,url=String(r.secure_url||'');
 const urlOk=fixture?url===RUTA_MEDIA_QA+'/'+resto+'.'+extension:Boolean(cloudName)&&url.startsWith('https://res.cloudinary.com/'+cloudName+'/');
 if(!urlOk)throw new Fault(400,'La URL del archivo no corresponde al proveedor autorizado.');
 const asset={tipo,provider:fixture?'QA_DIRECT_FIXTURE':'CLOUDINARY',publicId:r.public_id,extension,url,bytes,procesamiento:'LISTO',origen:'SUBIDA_DIRECTA'};
 asset.optimizedUrl=fixture||tipo==='video'?url:url.replace('/image/upload/','/image/upload/f_auto,q_auto/');
 for(const [k,v] of [['width',r.width],['height',r.height],['duration',r.duration]])if(Number.isSafeInteger(v)&&v>0)asset[k]=v;
 if(Number.isSafeInteger(r.version)&&r.version>0)asset.version=r.version;
 return asset;
}

/* Adaptador QA local. No es Cloudinary: imita su endpoint de carga firmada en
   el propio loopback para poder ejercitar el recorrido completo (firma → carga
   directa → registro) sin cuenta, sin cuota y sin una sola petición externa. */
export class ProveedorDirectoQA{
 constructor({secreto,cloudName=NUBE_QA,apiKey=CLAVE_QA}={}){
  if(typeof secreto!=='string'||secreto.length<32)throw Error('El adaptador QA exige un secreto efímero.');
  Object.assign(this,{secreto,cloudName,apiKey,fixture:true,mode:'QA_DIRECT_FIXTURE',enabled:true});
 }
 firma(tipo){return emitirFirma({tipo,apiKey:this.apiKey,cloudName:this.cloudName,apiSecret:this.secreto,uploadUrl:RUTA_QA+'/v1_1/'+this.cloudName+'/auto/upload',fixture:true})}
 verificar(entrada,ahora=Date.now()){return verificarRegistro({entrada,tipo:entrada.tipo,apiSecret:this.secreto,cloudName:this.cloudName,fixture:true,ahora})}
 autorizar(entrada,ahora=Date.now()){return autorizarCarga({entrada,tipo:entrada.tipo,apiSecret:this.secreto,ahora})}
 async huella(asset){return crypto.createHash('sha256').update(await fs.readFile(path.join(MEDIA_QA,path.basename(asset.url)))).digest('hex')}
 async remove(asset){
  if(asset.provider!=='QA_DIRECT_FIXTURE')throw new Fault(409,'Proveedor incompatible.');
  const resto=typeof asset.publicId==='string'&&asset.publicId.startsWith(CARPETA+'/')?asset.publicId.slice(CARPETA.length+1):'';
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(resto))throw new Fault(409,'Identificador de archivo inválido.');
  for(const nombre of await fs.readdir(MEDIA_QA).catch(()=>[]))if(nombre.startsWith(resto+'.'))await fs.unlink(path.join(MEDIA_QA,nombre)).catch(e=>{if(e.code!=='ENOENT')throw e});
 }
}

/* Adaptador real. Aplica la misma firma y la misma verificación; lo único que
   no se puede certificar sin cuenta es la respuesta del servicio, por eso queda
   apagado salvo configuración explícita. */
export class ProveedorCloudinaryDirecto{
 constructor({cloudName,apiKey,apiSecret}){
  if(!cloudName||!apiKey||!apiSecret)throw Error('Faltan credenciales de Cloudinary.');
  Object.assign(this,{cloudName,apiKey,apiSecret,fixture:false,mode:'CLOUDINARY_DIRECT',enabled:true});
 }
 firma(tipo){return emitirFirma({tipo,apiKey:this.apiKey,cloudName:this.cloudName,apiSecret:this.apiSecret,uploadUrl:'https://api.cloudinary.com/v1_1/'+this.cloudName+'/auto/upload'})}
 verificar(entrada,ahora=Date.now()){return verificarRegistro({entrada,tipo:entrada.tipo,apiSecret:this.apiSecret,cloudName:this.cloudName,ahora})}
 autorizar(entrada,ahora=Date.now()){return autorizarCarga({entrada,tipo:entrada.tipo,apiSecret:this.apiSecret,ahora})}
 async huella(){return null}
 async remove(asset,fetchImpl=globalThis.fetch){
  if(asset.provider!=='CLOUDINARY')throw new Fault(409,'Proveedor incompatible.');
  const timestamp=Math.floor(Date.now()/1000),params={public_id:asset.publicId,timestamp};
  const cuerpo=new URLSearchParams({...params,api_key:this.apiKey,signature:firma(params,this.apiSecret)});
  const res=await fetchImpl('https://api.cloudinary.com/v1_1/'+this.cloudName+'/'+(asset.tipo==='video'?'video':'image')+'/destroy',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:cuerpo});
  let data={};
  try{data=await res.json()}catch{}
  if(!res.ok||!['ok','not found'].includes(data.result))throw new Fault(502,'Cloudinary no confirmó la eliminación del archivo.');
 }
}

/* Selección del proveedor. Falla cerrado: sin adaptador QA explícito y sin
   decisión de configuración explícita, la subida queda deshabilitada. Las
   credenciales por sí solas nunca habilitan transporte real. */
export function proveedorDirecto({local=false}={}){
 if(local&&process.env.RCL_TEST_MEDIA==='direct')return new ProveedorDirectoQA({secreto:crypto.randomBytes(32).toString('hex')});
 const cloudName=process.env.CLOUDINARY_CLOUD_NAME||'',apiKey=process.env.CLOUDINARY_API_KEY||'',apiSecret=process.env.CLOUDINARY_API_SECRET||'';
 if(!local&&process.env.RCL_MEDIA_MODE==='cloudinary'&&cloudName&&apiKey&&apiSecret&&process.env.RCL_CLOUDINARY_QUOTA_REVIEWED==='yes')return new ProveedorCloudinaryDirecto({cloudName,apiKey,apiSecret});
 const cerrado=()=>{throw new Fault(503,'La subida de multimedia no está habilitada. Configura y verifica Cloudinary en una misión autorizada.')};
 return{enabled:false,fixture:false,mode:'REAL_UPLOADS_DISABLED_ADMIN_003',firma:cerrado,verificar:cerrado,autorizar:cerrado,huella:async()=>null,remove:cerrado};
}

/* Endpoint de carga del adaptador QA. Verifica exactamente lo mismo que el
   proveedor real: clave, firma, vigencia, carpeta, formato y tamaño. */
export async function recibirCargaQA(proveedor,{campos,buffer,mimeType,filename}){
 if(!(proveedor instanceof ProveedorDirectoQA))throw new Fault(503,'El adaptador de carga QA no está disponible.');
 if(campos.api_key!==proveedor.apiKey)throw new Fault(401,'Clave de API incorrecta.');
 const timestamp=Number(campos.timestamp);
 if(!Number.isSafeInteger(timestamp))throw new Fault(400,'Marca de tiempo inválida.');
 const edad=Math.floor(Date.now()/1000)-timestamp;
 if(edad>VIGENCIA_SEGUNDOS||edad<-60)throw new Fault(403,'La firma expiró o no es válida.');
 const publicId=String(campos.public_id||''),restoPublico=dentroDeCarpeta(publicId);
 if(!restoPublico)throw new Fault(403,'Identificador de archivo no autorizado.');
 const firmados={timestamp,folder:campos.folder,allowed_formats:campos.allowed_formats,public_id:publicId};
 if(!iguales(campos.signature,firma(firmados,proveedor.secreto)))throw new Fault(403,'Firma de carga inválida.');
 if(campos.folder!==CARPETA)throw new Fault(403,'Carpeta de carga no autorizada.');
 const tipo=Object.keys(FORMATOS).find(k=>FORMATOS[k].join(',')===campos.allowed_formats);
 if(!tipo)throw new Fault(403,'Formatos de carga no autorizados.');
 const extensionDeclarada=String(filename||'').split('.').pop().toLowerCase();
 if(!FORMATOS[tipo].includes(extensionDeclarada))throw new Fault(415,'Extensión de archivo no permitida.');
 const info=inspectFile(buffer,mimeType);
 if(info.kind!==tipo)throw new Fault(400,'El contenido del archivo no corresponde al tipo autorizado.');
 if(!FORMATOS[tipo].includes(info.extension))throw new Fault(415,'Formato real del archivo no permitido.');
 if(buffer.length>LIMITES[tipo])throw new Fault(413,'Archivo superior al límite permitido.');
 const nombre=restoPublico,extension=info.extension==='jpeg'?'jpg':info.extension;
 await fs.mkdir(MEDIA_QA,{recursive:true});
 await fs.writeFile(path.join(MEDIA_QA,nombre+'.'+extension),buffer);
 const url=RUTA_MEDIA_QA+'/'+nombre+'.'+extension;
 const respuesta={public_id:publicId,version:timestamp,signature:campos.signature,format:extension,resource_type:info.kind,created_at:new Date().toISOString(),bytes:buffer.length,url,secure_url:url,etag:crypto.createHash('md5').update(buffer).digest('hex'),original_filename:String(filename||'archivo')};
 const medidas=dimensionesPNG(buffer);
 if(medidas)Object.assign(respuesta,medidas);
 return respuesta;
}
