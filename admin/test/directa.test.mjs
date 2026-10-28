/* KZ-REDCALINET-023 — Pruebas unitarias de la subida directa firmada.
   No tocan red, ni cuenta, ni emuladores: verifican la firma, la validación del
   resultado del proveedor y el fallo cerrado del proveedor real. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Fault} from '../server/schema.mjs';
import {firma,emitirFirma,verificarRegistro,parametrosFirmados,CARPETA,FORMATOS,LIMITES,VIGENCIA_SEGUNDOS,ProveedorDirectoQA,ProveedorCloudinaryDirecto,proveedorDirecto,recibirCargaQA} from '../server/directa.mjs';

const SECRETO='qa-secreto-de-prueba-000000000000';
const AHORA=1700000000000;
const publicId='redcalinet/admin/5f2b6a10-1111-4222-8333-944455556666';
const resultadoPNG={public_id:publicId,version:1700000000,format:'png',resource_type:'image',bytes:2048,secure_url:'/admin/test-media/5f2b6a10-1111-4222-8333-944455556666.png',width:64,height:64};
const entrada=({tipo='image',timestamp=Math.floor(AHORA/1000),secreto=SECRETO,resultado=resultadoPNG,firmadoPara=publicId}={})=>({tipo,timestamp,signature:firma({timestamp,...parametrosFirmados(tipo,firmadoPara)},secreto),resultado});

test('la firma reproduce el algoritmo documentado de Cloudinary',()=>{
 // Vectores calculados a mano con la fórmula oficial:
 // SHA-1 de parámetros ordenados por clave + api_secret.
 assert.equal(firma({folder:CARPETA,timestamp:1700000000,allowed_formats:'jpg,jpeg,png,webp'},SECRETO),'a16ae4f2ecb6c3a7430ee0ee62f6e3b7fe5e7b17');
 assert.equal(firma({timestamp:1700000000,folder:CARPETA},SECRETO),'735c42883bace640a76567bad8e7c343a280fc83');
});
test('la firma ordena parámetros y descarta los valores vacíos',()=>{
 const a=firma({b:'2',a:'1',vacio:'',nulo:null,ausente:undefined},SECRETO),b=firma({a:'1',b:'2'},SECRETO);
 assert.equal(a,b);
});
test('la firma emitida no contiene el secreto y trae todo lo necesario para subir',()=>{
 const f=emitirFirma({tipo:'image',apiKey:'clave-publica',cloudName:'nube-demo',apiSecret:SECRETO,uploadUrl:'https://api.cloudinary.com/v1_1/nube-demo/auto/upload',ahora:AHORA});
 assert.match(f.signature,/^[a-f0-9]{40}$/);
 assert.equal(f.carpeta,CARPETA);
 assert.ok(f.publicId.startsWith(CARPETA+'/'),'la firma decide el identificador del archivo');
 assert.deepEqual(f.formatos,FORMATOS.image);
 assert.equal(f.maxBytes,LIMITES.image);
 assert.equal(f.vigenciaSegundos,VIGENCIA_SEGUNDOS);
 assert.ok(!JSON.stringify(f).includes(SECRETO),'la respuesta de la firma no debe incluir el secreto');
 assert.equal(emitirFirma({tipo:'video',apiKey:'k',cloudName:'n',apiSecret:SECRETO,uploadUrl:'u',ahora:AHORA}).maxBytes,LIMITES.video);
 assert.throws(()=>emitirFirma({tipo:'audio',apiKey:'k',cloudName:'n',apiSecret:SECRETO,uploadUrl:'u'}),Fault);
});
test('un resultado válido del proveedor se convierte en metadatos registrables',()=>{
 const asset=verificarRegistro({entrada:entrada(),tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA});
 assert.equal(asset.provider,'QA_DIRECT_FIXTURE');
 assert.equal(asset.publicId,publicId);
 assert.equal(asset.url,resultadoPNG.secure_url);
 assert.equal(asset.bytes,2048);
 assert.equal(asset.procesamiento,'LISTO');
 assert.equal(asset.origen,'SUBIDA_DIRECTA');
 assert.equal(asset.width,64);
 assert.equal(asset.height,64);
});
test('la firma de otro secreto no vale',()=>{
 const e=entrada({secreto:'otro-secreto-distinto-000000000000'});
 assert.throws(()=>verificarRegistro({entrada:e,tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault);
});
test('una firma vencida no se acepta',()=>{
 const e=entrada();
 assert.throws(()=>verificarRegistro({entrada:e,tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA+(VIGENCIA_SEGUNDOS+1)*1000}),Fault);
});
test('una firma del futuro no se acepta',()=>{
 const e=entrada();
 assert.throws(()=>verificarRegistro({entrada:e,tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA-120000}),Fault);
});
test('no se registra un archivo fuera de la carpeta autorizada',()=>{
 for(const malo of ['otra-carpeta/x','redcalinet/admin/','redcalinet/admin/sub/x','redcalinet/adminx/y','']){
  const e=entrada({resultado:{...resultadoPNG,public_id:malo}});
  assert.throws(()=>verificarRegistro({entrada:e,tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault,malo);
 }
});
test('no se registra un public_id distinto del firmado',()=>{
 const otro='redcalinet/admin/otro-identificador-no-firmado';
 const e=entrada({resultado:{...resultadoPNG,public_id:otro,secure_url:'/admin/test-media/otro-identificador-no-firmado.png'}});
 assert.throws(()=>verificarRegistro({entrada:e,tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault);
});
test('el formato y el tipo deben coincidir con la firma',()=>{
 assert.throws(()=>verificarRegistro({entrada:entrada({resultado:{...resultadoPNG,format:'gif'}}),tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault);
 assert.throws(()=>verificarRegistro({entrada:entrada({resultado:{...resultadoPNG,resource_type:'video'}}),tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault);
 assert.throws(()=>verificarRegistro({entrada:entrada({resultado:{...resultadoPNG,format:'mp4'}}),tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault);
});
test('un tamaño declarado fuera de límite se rechaza',()=>{
 for(const bytes of [0,-1,1.5,Number.NaN,LIMITES.image+1]){
  assert.throws(()=>verificarRegistro({entrada:entrada({resultado:{...resultadoPNG,bytes}}),tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault,String(bytes));
 }
});
test('la URL debe pertenecer al proveedor autorizado',()=>{
 const qa=entrada();
 assert.throws(()=>verificarRegistro({entrada:qa,tipo:'image',apiSecret:SECRETO,fixture:false,cloudName:'nube-demo',ahora:AHORA}),Fault);
 const real=entrada({resultado:{...resultadoPNG,secure_url:'https://res.cloudinary.com/otra-nube/image/upload/v1/a.png'}});
 assert.throws(()=>verificarRegistro({entrada:real,tipo:'image',apiSecret:SECRETO,cloudName:'nube-demo',ahora:AHORA}),Fault);
 const buena=entrada({resultado:{...resultadoPNG,secure_url:'https://res.cloudinary.com/nube-demo/image/upload/v1/a.png'}});
 const asset=verificarRegistro({entrada:buena,tipo:'image',apiSecret:SECRETO,cloudName:'nube-demo',ahora:AHORA});
 assert.equal(asset.provider,'CLOUDINARY');
 assert.match(asset.optimizedUrl,/f_auto,q_auto/);
 assert.equal(asset.url,'https://res.cloudinary.com/nube-demo/image/upload/v1/a.png');
});
test('sin resultado del proveedor no hay registro',()=>{
 for(const malo of [undefined,null,[],'texto'])assert.throws(()=>verificarRegistro({entrada:{...entrada(),resultado:malo},tipo:'image',apiSecret:SECRETO,fixture:true,ahora:AHORA}),Fault,String(malo));
});
test('el adaptador QA exige secreto efímero y verifica como el real',async()=>{
 assert.throws(()=>new ProveedorDirectoQA({secreto:'corto'}),Error);
 const proveedor=new ProveedorDirectoQA({secreto:SECRETO});
 const f=proveedor.firma('image');
 assert.equal(f.fixture,true);
 assert.equal(f.proveedor,'QA_DIRECT_FIXTURE');
 assert.match(f.uploadUrl,/^\/admin\/test-cloudinary\/v1_1\/.+\/auto\/upload$/);
 assert.equal(proveedor.verificar(entrada(),AHORA).bytes,2048);
 const ahora=Math.floor(Date.now()/1000);
 await assert.rejects(recibirCargaQA(proveedor,{campos:{api_key:'otra',timestamp:String(ahora),folder:CARPETA,public_id:f.publicId,allowed_formats:'jpg,jpeg,png,webp',signature:'x'.repeat(40)},buffer:Buffer.alloc(10),mimeType:'image/png',filename:'a.png'}),Fault);
 await assert.rejects(recibirCargaQA(proveedor,{campos:{api_key:'qa-directo',timestamp:String(ahora),folder:'otra/carpeta',public_id:f.publicId,allowed_formats:'jpg,jpeg,png,webp',signature:firma({timestamp:ahora,folder:'otra/carpeta',public_id:f.publicId,allowed_formats:'jpg,jpeg,png,webp'},SECRETO)},buffer:Buffer.alloc(10),mimeType:'image/png',filename:'a.png'}),Fault);
 await assert.rejects(recibirCargaQA(proveedor,{campos:{api_key:'qa-directo',timestamp:String(ahora),folder:CARPETA,public_id:f.publicId,allowed_formats:'jpg,jpeg,png,webp',signature:firma({timestamp:ahora,folder:CARPETA,public_id:'redcalinet/admin/otro-no-firmado',allowed_formats:'jpg,jpeg,png,webp'},SECRETO)},buffer:Buffer.alloc(10),mimeType:'image/png',filename:'a.png'}),Fault,'un public_id distinto del firmado tampoco pasa por el proveedor');
});
test('el transporte real nunca se habilita solo con credenciales',()=>{
 const keys=['RCL_MEDIA_MODE','RCL_TEST_MEDIA','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','RCL_CLOUDINARY_QUOTA_REVIEWED'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const k of keys)delete process.env[k];
  Object.assign(process.env,{CLOUDINARY_CLOUD_NAME:'nube-no-real',CLOUDINARY_API_KEY:'clave-no-real',CLOUDINARY_API_SECRET:'secreto-no-real',RCL_CLOUDINARY_QUOTA_REVIEWED:'yes'});
  const cerrado=proveedorDirecto({local:false});
  assert.equal(cerrado.enabled,false);
  assert.equal(cerrado.mode,'REAL_UPLOADS_DISABLED_ADMIN_003');
  assert.throws(()=>cerrado.firma('image'),Fault);
  // El adaptador QA tampoco puede activarse en producción.
  process.env.RCL_TEST_MEDIA='direct';
  assert.equal(proveedorDirecto({local:false}).enabled,false);
  assert.equal(proveedorDirecto({local:true}).mode,'QA_DIRECT_FIXTURE');
  // La habilitación real exige además una decisión explícita de configuración.
  process.env.RCL_MEDIA_MODE='cloudinary';
  assert.equal(proveedorDirecto({local:false}).mode,'CLOUDINARY_DIRECT');
 }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
});
test('la eliminación real se firma y se interpreta correctamente',async()=>{
 const proveedor=new ProveedorCloudinaryDirecto({cloudName:'nube-demo',apiKey:'clave-publica',apiSecret:SECRETO});
 let visto;
 const ok=async(url,opciones)=>{visto={url,opciones};return{ok:true,json:async()=>({result:'ok'})}};
 await proveedor.remove({provider:'CLOUDINARY',publicId,tipo:'image'},ok);
 assert.match(visto.url,/^https:\/\/api\.cloudinary\.com\/v1_1\/nube-demo\/image\/destroy$/);
 const cuerpo=new URLSearchParams(visto.opciones.body.toString());
 assert.equal(cuerpo.get('public_id'),publicId);
 assert.equal(cuerpo.get('api_key'),'clave-publica');
 assert.equal(cuerpo.get('signature'),firma({public_id:publicId,timestamp:Number(cuerpo.get('timestamp'))},SECRETO));
 assert.ok(!visto.opciones.body.toString().includes(SECRETO),'el secreto no viaja en el cuerpo');
 await assert.rejects(proveedor.remove({provider:'CLOUDINARY',publicId,tipo:'image'},async()=>({ok:false,status:400,json:async()=>({result:'error'})})),Fault);
 await assert.rejects(proveedor.remove({provider:'QA_DIRECT_FIXTURE',publicId,tipo:'image'},ok),Fault);
});
