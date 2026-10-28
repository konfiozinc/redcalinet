import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {Fault,text} from './schema.mjs';
export const IMAGE_MAX=10*1024*1024,VIDEO_MAX=25*1024*1024;
export function inspectFile(buffer,mime){
 let kind,extension;
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){kind='image';extension='png';if(mime!=='image/png')throw new Fault(400,'El contenido no corresponde al tipo PNG.');}
 else if(buffer.length>3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255){kind='image';extension='jpg';if(mime!=='image/jpeg')throw new Fault(400,'El contenido no corresponde a JPEG.');}
 else if(buffer.length>12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'){kind='image';extension='webp';if(mime!=='image/webp')throw new Fault(400,'Tipo WebP incorrecto.');}
 else if(buffer.length>12&&buffer.toString('ascii',4,8)==='ftyp'){kind='video';extension='mp4';if(mime!=='video/mp4')throw new Fault(400,'Tipo MP4 incorrecto.');}
 else if(buffer.length>4&&buffer.subarray(0,4).equals(Buffer.from([26,69,223,163]))){kind='video';extension='webm';if(mime!=='video/webm')throw new Fault(400,'Tipo WebM incorrecto.');}
 else throw new Fault(415,'Formato no admitido. Usa JPEG, PNG, WebP, MP4 o WebM.');
 if(buffer.length>(kind==='image'?IMAGE_MAX:VIDEO_MAX))throw new Fault(413,'Archivo superior al límite permitido.');return{kind,extension};
}
export class FixtureMediaProvider{
 constructor(root){this.root=root;this.mode='QA_FIXTURE';this.enabled=true}
 async upload(buffer,{kind,extension}){await fs.mkdir(this.root,{recursive:true});const publicId=crypto.randomUUID();await fs.writeFile(path.join(this.root,publicId+'.'+extension),buffer);return{tipo:kind,provider:'QA_FIXTURE',publicId,extension,url:'/admin/test-media/'+publicId+'.'+extension,optimizedUrl:'/admin/test-media/'+publicId+'.'+extension,bytes:buffer.length,procesamiento:'LISTO',sha256:crypto.createHash('sha256').update(buffer).digest('hex')}}
 async remove(asset){if(asset.provider!=='QA_FIXTURE')throw Error('Proveedor incompatible.');await fs.unlink(path.join(this.root,asset.publicId+'.'+asset.extension)).catch(e=>{if(e.code!=='ENOENT')throw e})}
}
export class CloudinaryMediaProvider{
 constructor(client){this.client=client;this.mode='CLOUDINARY';this.enabled=true}
 async upload(buffer,{kind}){
  // Usage must be readable and reviewed before sending bytes; no account/billing changes.
  const usage=await this.client.api.usage();if(!usage.plan||!usage.credits||!Number.isFinite(usage.credits.limit)||!Number.isFinite(usage.credits.usage)||usage.credits.usage>=usage.credits.limit)throw new Fault(503,'Cuota/plan Cloudinary no verificable o agotado. No se subió el archivo.');
  const result=await new Promise((resolve,reject)=>{const stream=this.client.uploader.upload_stream({resource_type:kind,folder:'redcalinet/admin',public_id:crypto.randomUUID(),overwrite:false,allowed_formats:kind==='image'?['jpg','png','webp']:['mp4','webm'],use_filename:false,unique_filename:false},(e,r)=>e?reject(e):resolve(r));stream.end(buffer)});
  if(typeof result.secure_url!=='string'||!result.secure_url.startsWith('https://res.cloudinary.com/'))throw new Fault(502,'El proveedor no devolvió una URL multimedia segura.');
  const optimized=kind==='image'?result.secure_url.replace('/image/upload/','/image/upload/f_auto,q_auto/'):result.secure_url;
  return{tipo:kind,provider:'CLOUDINARY',publicId:result.public_id,extension:result.format,url:result.secure_url,optimizedUrl:optimized,bytes:result.bytes,procesamiento:'LISTO',sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
 }
 async remove(asset){if(asset.provider!=='CLOUDINARY')throw new Fault(409,'Proveedor incompatible.');const r=await this.client.uploader.destroy(asset.publicId,{resource_type:asset.tipo,invalidate:true});if(!['ok','not found'].includes(r.result))throw new Fault(502,'Cloudinary no confirmó la eliminación.');}
}
export async function mediaProvider(local){
 if(process.env.RCL_TEST_MEDIA==='fixture'){if(!local)throw Error('La fixture multimedia solo existe en QA local.');return new FixtureMediaProvider(fileURLToPath(new URL('../.runtime/media/',import.meta.url)))}
 // ADMIN-003: contract-only integration. Even configured credentials must not enable real uploads here.
 return{mode:'REAL_UPLOADS_DISABLED_ADMIN_003',enabled:false,upload(){throw new Fault(503,'Carga real bloqueada hasta configurar y verificar Cloudinary en una misión autorizada.')}};
}
