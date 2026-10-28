// KZ-REDCALINET-023 — Subida directa firmada contra emuladores reales.
// Todo ocurre en loopback: Firebase Emulator + adaptador QA que imita el
// endpoint de carga firmada del proveedor. Sin cuenta, sin cuota y sin una sola
// petición a Cloudinary.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const BASE='http://127.0.0.1:5176',MEDIA=new URL('../.runtime/media/',import.meta.url),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
async function login(email){const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'RCL-Only-QA-2026!',returnSecureToken:true})});assert.equal(r.status,200,'login '+email);return(await r.json()).idToken}
const superadmin=await login('superadmin@rcl.example.test'),propietario=await login('admin@rcl.example.test'),sinRol=await login('sin-rol@rcl.example.test');
async function api(path,{token=superadmin,method='GET',body,origin=BASE}={}){const r=await fetch(BASE+'/admin/api/'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json().catch(()=>null)}}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
const firma=async(tipo='image',token=superadmin)=>api('multimedia/firma',{token,method:'POST',body:{tipo}});
const ficheros=async()=>{try{return(await fs.readdir(MEDIA)).sort()}catch{return[]}};

/* Carga directa = exactamente lo que hace el navegador: pide la firma, envía el
   archivo al proveedor con esa firma y devuelve el resultado del proveedor. */
async function cargarDirecto(buffer,mime,nombre,tipo='image'){
 const f=ok(await firma(tipo));
 const form=new FormData();
 form.append('file',new Blob([buffer],{type:mime}),nombre);
 form.append('api_key',f.apiKey);
 form.append('timestamp',String(f.timestamp));
 form.append('signature',f.signature);
 form.append('folder',f.carpeta);
 form.append('public_id',f.publicId);
 form.append('allowed_formats',f.formatos.join(','));
 const r=await fetch(BASE+f.uploadUrl,{method:'POST',body:form});
 return{firma:f,status:r.status,resultado:await r.json().catch(()=>null)};
}
const registrar=(firma,resultado,extra={})=>api('multimedia/registrar',{method:'POST',body:{tipo:firma.tipo,timestamp:firma.timestamp,signature:firma.signature,resultado,titulo:'QA subida directa',alt:'Imagen ficticia de QA',...extra}});

const png=await fs.readFile(new URL('../.runtime/fixtures/test.png',import.meta.url));
const video=await fs.readFile(new URL('../.runtime/fixtures/test.mp4',import.meta.url));

// --- Control de acceso y forma de la firma ---------------------------------
check('la firma exige sesión',(await firma('image',null)).status===401);
check('la firma exige rol administrativo',(await firma('image',sinRol)).status===403);
check('la firma rechaza un tipo no admitido',(await firma('audio')).status===400);
check('la firma rechaza origen no autorizado',(await api('multimedia/firma',{method:'POST',body:{tipo:'image'},origin:'https://invalid.test'})).status===403);
const firmado=ok(await firma('image'));
check('la firma tiene 40 hex y carpeta autorizada',/^[a-f0-9]{40}$/.test(firmado.signature)&&firmado.carpeta==='redcalinet/admin');
check('la firma declara formatos y tamaño permitido',firmado.formatos.includes('png')&&firmado.maxBytes===10*1024*1024);
check('la firma usa el adaptador QA y no un servicio real',firmado.proveedor==='QA_DIRECT_FIXTURE'&&firmado.fixture===true&&/^\/admin\/test-cloudinary\//.test(firmado.uploadUrl));
check('la firma nunca devuelve el secreto',!('apiSecret'in firmado)&&!('secret'in firmado)&&!JSON.stringify(firmado).toLowerCase().includes('secret'));
check('el bootstrap anuncia subida directa sin credenciales',(await(await fetch(BASE+'/admin/api/bootstrap')).json()).media.subidaDirecta===true&&!JSON.stringify(await(await fetch(BASE+'/admin/api/bootstrap')).json()).toLowerCase().includes('secret'));

// --- El proveedor QA verifica como el real ---------------------------------
const antes=await ficheros();
const firmaMala=ok(await firma('image'));
const cargarCon=async(extra,{buffer=png,mime='image/png',nombre='test.png'}={})=>{
 const form=new FormData();
 form.append('file',new Blob([buffer],{type:mime}),nombre);
 const campos={api_key:firmaMala.apiKey,timestamp:String(firmaMala.timestamp),signature:firmaMala.signature,folder:firmaMala.carpeta,public_id:firmaMala.publicId,allowed_formats:firmaMala.formatos.join(','),...extra};
 for(const [k,v] of Object.entries(campos))form.append(k,v);
 const r=await fetch(BASE+firmaMala.uploadUrl,{method:'POST',body:form});
 return{status:r.status,data:await r.json().catch(()=>null)};
};
check('la carga con clave de API incorrecta se rechaza',(await cargarCon({api_key:'otra-clave'})).status===401);
check('la carga con firma falsificada se rechaza',(await cargarCon({signature:'f'.repeat(40)})).status===403);
check('la carga con formato no firmado se rechaza',(await cargarCon({allowed_formats:'gif'})).status===403);
check('la carga con extensión no permitida se rechaza',(await cargarCon({}, {nombre:'test.gif'})).status===415);
check('la carga con contenido que no es imagen se rechaza',(await cargarCon({}, {buffer:Buffer.from('<script>alert(1)</script>'),mime:'image/png'})).status===415);
const firmaVideo=ok(await firma('video'));
check('la carga con firma vencida se rechaza',(await cargarCon({timestamp:String(Math.floor(Date.now()/1000)-3600)})).status===403);
check('ninguna carga rechazada deja archivo en el proveedor',(await ficheros()).length===antes.length);

// --- Carga válida ----------------------------------------------------------
const carga=await cargarDirecto(png,'image/png','test.png');
check('la carga directa válida devuelve el resultado del proveedor',carga.status===200&&typeof carga.resultado?.public_id==='string');
const r=carga.resultado;
check('el archivo queda en la carpeta autorizada',r.public_id===`redcalinet/admin/${r.public_id.split('/')[2]}`);
check('el resultado declara formato, tipo y bytes',r.format==='png'&&r.resource_type==='image'&&r.bytes===png.length);
check('el resultado trae dimensiones del archivo real',r.width>0&&r.height>0);
check('el archivo es recuperable y conserva los bytes',Buffer.from(await(await fetch(BASE+r.secure_url)).arrayBuffer()).equals(png));

// --- Validación del registro ----------------------------------------------
check('el registro exige sesión',(await api('multimedia/registrar',{token:null,method:'POST',body:{tipo:'image'}})).status===401);
const otra=await cargarDirecto(png,'image/png','test.png');
check('el registro con firma de otro tipo se rechaza',(await registrar(otra.firma,otra.resultado,{signature:firmaVideo.signature})).status===403);
check('el registro con archivo fuera de carpeta se rechaza',(await registrar(otra.firma,{...otra.resultado,public_id:'otra-carpeta/x'})).status===400);
check('el registro con formato no firmado se rechaza',(await registrar(otra.firma,{...otra.resultado,format:'gif'})).status===400);
check('el registro con tamaño fuera de límite se rechaza',(await registrar(otra.firma,{...otra.resultado,bytes:10*1024*1024+1})).status===413);
check('el registro con URL de otro proveedor se rechaza',(await registrar(otra.firma,{...otra.resultado,secure_url:'https://res.cloudinary.com/otra/image/upload/v1/x.png'})).status===400);
const restoOtra=otra.resultado.public_id.split('/')[2];
check('un registro inválido no crea ficha ni deja archivo huérfano',!(await ok(await api('multimedia'))).items.some(m=>m.publicId===otra.resultado.public_id)&&!(await ficheros()).some(n=>n.startsWith(restoOtra)));

// --- Registro correcto -----------------------------------------------------
const primera=await cargarDirecto(png,'image/png','test.png');
const creado=ok(await registrar(primera.firma,primera.resultado,{sha256Cliente:sha256(png)}));
const id=creado.id;
check('el registro devuelve el identificador del archivo',typeof id==='string'&&id.length>0);
const ficha=(await ok(await api('multimedia'))).items.find(m=>m.id===id);
check('la ficha guarda el proveedor del adaptador QA',ficha.provider==='QA_DIRECT_FIXTURE');
check('la ficha guarda los metadatos del proveedor',ficha.publicId===primera.resultado.public_id&&ficha.bytes===png.length&&ficha.extension==='png');
check('la ficha guarda la ruta de la subida directa',ficha.origen==='SUBIDA_DIRECTA'&&ficha.procesamiento==='LISTO');
check('la huella la calcula el servidor sobre los bytes reales',ficha.sha256===sha256(png)&&ficha.sha256Origen==='SERVIDOR_LOCAL');
const auditoria=(await api('auditoria')).data.items.filter(a=>a.registro===id);
check('la carga directa queda en la auditoría con su vía',auditoria.some(a=>a.accion==='SUBIR_MULTIMEDIA'&&a.via==='SUBIDA_DIRECTA'));
check('un reintento del navegador no duplica la ficha',(await registrar(primera.firma,primera.resultado)).status===409);
check('el archivo del reintento sigue disponible tras el duplicado',(await fetch(BASE+primera.resultado.secure_url)).status===200);

// --- La API ya no recibe bytes --------------------------------------------
const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'test.png');form.append('titulo','QA');
const antiguo=await fetch(BASE+'/admin/api/multimedia',{method:'POST',headers:{Origin:BASE,Authorization:'Bearer '+superadmin},body:form});
check('la carga de bytes por la API está retirada',antiguo.status===410);
check('la API retirada no deja registro',!(await ok(await api('multimedia'))).items.some(m=>m.titulo==='QA'));

// --- Vídeo y ciclo completo con la ficha ----------------------------------
const cv=await cargarDirecto(video,'video/mp4','test.mp4','video');
check('la subida directa de vídeo usa su propio límite',cv.status===200&&cv.firma.maxBytes===25*1024*1024&&cv.resultado.resource_type==='video');
const vid=ok(await registrar(cv.firma,cv.resultado,{titulo:'QA video directo',alt:''})).id;
check('el vídeo se registra como tal',(await ok(await api('multimedia'))).items.find(m=>m.id===vid).tipo==='video');

const cat=ok(await api('categorias',{method:'POST',body:{values:{nombre:'QA 023 '+Date.now(),descripcion:'Categoría ficticia',tipo:'producto',icono:'i-tech',orden:9,visible:true}}})).id;
const producto=ok(await api('productos',{method:'POST',body:{values:{nombre:'QA 023 producto '+Date.now(),descripcion:'Producto ficticio de certificación',categoriaId:cat,precio:null,stock:null,disponibilidad:'DESCONOCIDA',imagenes:[id]}}})).id;
ok(await api('multimedia/'+id,{method:'PATCH',body:{values:{estado:'PUBLICADO',alt:'Cuadro azul de la ficha'},revision:(await ok(await api('multimedia'))).items.find(m=>m.id===id).revision}}));
ok(await api('productos/'+producto,{method:'PATCH',body:{values:{estado:'PUBLICADO',validado:true,fuenteValidacion:'Validación ficticia de QA'},revision:(await ok(await api('productos'))).items.find(m=>m.id===producto).revision}}));
const publico=(await api('public/catalogo',{token:null})).data;
check('el catálogo público sirve la imagen subida por vía directa',publico.productos.some(p=>p.id===producto&&p.imagenes.includes(id))&&publico.multimedia.some(m=>m.id===id&&m.url===primera.resultado.secure_url));
check('la imagen en uso no se puede eliminar',(await api('multimedia/'+id,{method:'DELETE',body:{confirm:'ELIMINAR ARCHIVO'}})).status===409);

const descartable=await cargarDirecto(png,'image/png','test.png');
const borrado=ok(await registrar(descartable.firma,descartable.resultado,{titulo:'QA descartable 023'})).id;
ok(await api('multimedia/'+borrado,{method:'DELETE',body:{confirm:'ELIMINAR ARCHIVO'}}));
check('eliminar borra el archivo del proveedor y deja lápida',(await ok(await api('multimedia'))).items.find(m=>m.id===borrado).eliminado===true&&!(await ficheros()).some(n=>n.startsWith(descartable.resultado.public_id.split('/')[2])));

const resumen={passed:checks.length,checks,multimedia:[id,vid],producto,mode:'SUBIDA_DIRECTA_FIRMADA_CON_ADAPTADOR_QA_LOCAL'};
await fs.writeFile(new URL('../.runtime/subida-directa-023-results.json',import.meta.url),JSON.stringify(resumen,null,2));
console.log('PASS:',checks.length,'comprobaciones de subida directa firmada');
