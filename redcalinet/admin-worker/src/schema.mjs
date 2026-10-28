import crypto from 'node:crypto';
export class Fault extends Error{constructor(status,message){super(message);this.status=status}}
export const STATES=['BORRADOR','PUBLICADO','OCULTO'];
export const EXT_STATES=[...STATES,'ARCHIVADO'];
export const PUBLIC_FIELDS={catalogo:['categoriaId','nombre','descripcion','precio','detalles','imagen','estado','orden','destacado','agotado','tipo'],categorias:['nombre','icono','descripcion','nota','orden','visible','tipo'],empresa:['nombre','eslogan','esloganHistorico','promesa','ciudad','direccion','direccionNota','descripcion'],contacto:['whatsapp','telefono','correo','facebook','instagram','tiktok','horarios']};
export const catalogType=(r,category)=>r.tipo||category?.tipo||(category?.icono==='i-tech'?'producto':'servicio');
export const imageUrl=v=>{if(v===null||v==='')return null;const x=text(v,1500);if(/^https:\/\//.test(x))return url(x);if(/^(?!\/\/)(?:\.?\.?\/)?[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9]+)?$/.test(x)&&!x.split('/').includes('..'))return x;throw new Fault(400,'Imagen: usa HTTPS o una ruta relativa segura.');};
export const CATALOG=['productos','servicios','categorias','promociones','multimedia'];
export const fields={
 productos:['nombre','categoriaId','descripcion','especificaciones','precio','disponibilidad','stock','imagenes','videos','variantes','destacado','estado','validado','fuenteValidacion','detalles','imagen','orden','agotado','tipo'],
 servicios:['nombre','categoriaId','descripcion','requisitos','condiciones','precio','imagenes','videos','estado','validado','fuenteValidacion','detalles','imagen','orden','agotado','tipo','destacado'],
 categorias:PUBLIC_FIELDS.categorias,
 promociones:['nombre','descripcion','productos','servicios','descuentoPorcentaje','inicio','fin','imagenes','estado','validado','fuenteValidacion'],
 multimedia:['titulo','descripcion','alt','estado'],
 configuracion:[...new Set([...PUBLIC_FIELDS.empresa,...PUBLIC_FIELDS.contacto])]
};
export function text(v,max=3000){if(typeof v!=='string'||v.length>max||/[\u0000-\u0008]/.test(v))throw new Fault(400,'Texto inválido o demasiado largo.');return v.trim()}
const option=(v,list)=>{if(!list.includes(v))throw new Fault(400,'Opción no permitida.');return v};
const number=(v,min,max,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isSafeInteger(v))throw new Fault(400,'Valor numérico inválido.');return v};
export const id=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(v))throw new Fault(400,'Identificador inválido.');return v};
const list=(v,limit=30)=>{if(!Array.isArray(v)||v.length>limit)throw new Fault(400,'Lista inválida.');return v};
const bool=v=>{if(typeof v!=='boolean')throw new Fault(400,'Valor booleano inválido.');return v};
export function url(v,hosts){if(!v)return '';const value=text(v,1500);try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||hosts&&!hosts.includes(u.hostname))throw 0;return u.href}catch{throw new Fault(400,'Enlace HTTPS inválido o dominio no permitido.')}}
export function validate(collection,input,previous={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields[collection]?.includes(k)))throw new Fault(400,'Campos no permitidos.');
 const row={...previous,...input};delete row.id;
 for(const [k,v] of Object.entries(input)){
  if(['nombre','titulo','alt','fuenteValidacion'].includes(k))row[k]=text(v,k==='fuenteValidacion'?1500:200);
  else if(['descripcion','condiciones','requisitos','especificaciones'].includes(k))row[k]=text(v,8000);
  else if(k==='estado')row[k]=option(v,['productos','servicios'].includes(collection)?STATES:EXT_STATES);
  else if(k==='categoriaId')row[k]=v? id(v):null;
  else if(['imagenes','videos','productos','servicios'].includes(k))row[k]=[...new Set(list(v).map(id))];
  else if(['validado','destacado','visible','agotado'].includes(k))row[k]=bool(v);
  else if(k==='stock')row[k]=v===null?null:number(v,0,10000000,true);
  else if(k==='precio'){row[k]=v===null?null:number(v,0,1000000000,true);}
  else if(k==='disponibilidad')row[k]=option(v,['DESCONOCIDA','DISPONIBLE','AGOTADO','POR_ENCARGO']);
  else if(k==='variantes')row[k]=list(v,20).map(x=>({nombre:text(x.nombre,100),valor:text(x.valor,200)}));
  else if(k==='tipo')row[k]=option(v,['producto','servicio']);
  else if(k==='imagen')row[k]=imageUrl(v);
  else if(k==='detalles')row[k]=list(v,30).map(x=>text(x,500));
  else if(k==='icono'){row[k]=text(v,50);if(!/^i-[a-z]+$/.test(row[k]))throw new Fault(400,'Icono inválido.');}
  else if(k==='nota')row[k]=text(v,3000);
  else if(k==='orden')row[k]=number(v,0,10000,true);
  else if(k==='descuentoPorcentaje')row[k]=number(v,0.01,100);
  else if(['inicio','fin'].includes(k)){if(typeof v!=='string'||!/Z$/.test(v)||!Number.isFinite(Date.parse(v)))throw new Fault(400,'Fecha UTC inválida.');row[k]=v;}
 }
 if(collection==='configuracion'){
  for(const [k,v] of Object.entries(input)){
   if(k==='horarios')row[k]=list(v,14).map(x=>({dia:text(x.dia,100),hora:text(x.hora,100)}));
   else if(['facebook','instagram','tiktok'].includes(k))row[k]=url(v,({facebook:['www.facebook.com','facebook.com','fb.com'],instagram:['www.instagram.com','instagram.com'],tiktok:['www.tiktok.com','tiktok.com']})[k]);
   else {row[k]=text(v,8000);if(['whatsapp','telefono'].includes(k)&&row[k]&&!/^\d{7,15}$/.test(row[k]))throw new Fault(400,'Teléfono: solo dígitos con indicativo.');if(k==='correo'&&row[k]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[k]))throw new Fault(400,'Correo inválido.');}
  }
 }
 if(collection!=='multimedia'&&!row.nombre&&collection!=='configuracion')throw new Fault(400,'Nombre obligatorio.');
 if(['productos','servicios','promociones'].includes(collection)&&row.estado==='PUBLICADO'){
  if(previous.estado!=='PUBLICADO'&&(row.validado!==true||!row.fuenteValidacion?.trim()))throw new Fault(400,'Publicar requiere validación comercial y su fuente.');
  if(collection==='promociones'&&!row.descripcion?.trim())throw new Fault(400,'Completa la descripción de la promoción.');
 }
 if(collection==='promociones'&&(!row.inicio||!row.fin||Date.parse(row.fin)<=Date.parse(row.inicio)||!(row.productos?.length||row.servicios?.length)))throw new Fault(400,'La promoción requiere referencias y fechas válidas.');
 return row;
}
export function defaults(c){if(c==='configuracion')return{};if(c==='categorias')return{nombre:'',descripcion:'',nota:'',icono:'i-check',tipo:'servicio',orden:0,visible:true};if(c==='promociones')return{nombre:'',descripcion:'',productos:[],servicios:[],descuentoPorcentaje:10,inicio:'',fin:'',imagenes:[],estado:'BORRADOR',validado:false,fuenteValidacion:''};if(c==='multimedia')return{titulo:'',descripcion:'',alt:'',estado:'BORRADOR'};return{nombre:'',categoriaId:null,descripcion:'',precio:null,detalles:[],imagen:null,orden:0,agotado:false,tipo:c==='productos'?'producto':'servicio',imagenes:[],videos:[],estado:'BORRADOR',validado:false,fuenteValidacion:'',...(c==='productos'?{especificaciones:'',disponibilidad:'DESCONOCIDA',stock:null,variantes:[],destacado:false}:{requisitos:'',condiciones:''})}}
export function activePromotion(r,now=Date.now()){return r.estado==='PUBLICADO'&&r.validado===true&&Date.parse(r.inicio)<=now&&Date.parse(r.fin)>now}
export const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function publicItem(r){const allowed=['id','nombre','categoriaId','descripcion','especificaciones','precio','disponibilidad','stock','imagenes','videos','variantes','destacado','requisitos','condiciones'];return Object.fromEntries(allowed.filter(k=>r[k]!==undefined).map(k=>[k,r[k]]))}
