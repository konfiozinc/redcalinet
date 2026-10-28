// Fictitious QA accounts/data ONLY. Never imports personal data or writes production.
import {initFirebase,Store} from '../server/store.mjs';import crypto from 'node:crypto';
const runtime=initFirebase(),{db,auth,local}=runtime;if(!local)throw Error('Bootstrap de QA prohibido fuera de emuladores.');const store=new Store(runtime),actor={uid:'qa-super',rol:'SUPERADMIN'};
for(const [uid,email,rol] of [['qa-super','superadmin@rcl.example.test','SUPERADMIN'],['qa-admin','admin@rcl.example.test','PROPIETARIO'],['qa-denied','sin-rol@rcl.example.test',null]]){
 try{await auth.getUser(uid)}catch{await auth.createUser({uid,email,password:'RCL-Only-QA-2026!',emailVerified:true})}
 if(rol){const ref=db.doc('usuarios/'+uid);if(!(await ref.get()).exists)await ref.set({nombre:rol==='SUPERADMIN'?'Superadmin de prueba':'Propietario de prueba',email,rol,activo:true,revision:1});}
}
async function seed(c,rid,values){if(!(await db.doc(store.physical(c)+'/'+rid).get()).exists){if(['categorias','productos','servicios'].includes(c)){
 // Pre-create canonical-only draft to use the existing-ID edit path, strictly local QA.
 await db.doc(store.physical(c)+'/'+rid).set(c==='categorias'?{nombre:values.nombre,icono:values.icono,tipo:values.tipo,orden:0,visible:true}:{nombre:values.nombre,categoriaId:values.categoriaId,estado:'BORRADOR',precio:null,imagen:null,orden:0,tipo:c==='productos'?'producto':'servicio'});
 }await store.save(c,rid,values,0,actor,crypto.randomUUID());}}
for(const [rid,nombre,tipo,icono] of [['tecnologia','Tecnología','producto','i-tech'],['entretenimiento','Entretenimiento','servicio','i-streaming'],['seguros','Seguros','servicio','i-seguros'],['tramites','Trámites','servicio','i-tramites']])await seed('categorias',rid,{nombre,tipo,icono,visible:true,orden:0,descripcion:'Referencia QA; sin oferta validada',nota:''});
for(const [rid,nombre,categoriaId,c] of [['iphone16','iPhone 16, 128 GB','tecnologia','productos'],['iphone17-anuncio','Referencia anunciada de iPhone 17 Pro Max','tecnologia','productos'],['iphone18-anuncio','Referencia anunciada de iPhone 18 Pro Max','tecnologia','productos'],['cargador-awx','Cargador universal AWX-1209A','tecnologia','productos'],['suscripciones','Suscripciones digitales','entretenimiento','servicios'],['streaming','Servicios de streaming','entretenimiento','servicios'],['tv-app','TV por aplicación','entretenimiento','servicios'],['soat','SOAT','seguros','servicios'],['pasaporte','Asesoría para citas de pasaporte','tramites','servicios']])await seed(c,rid,{nombre,categoriaId,estado:'BORRADOR',precio:null,imagen:null,descripcion:'Referencia del encargo original, no una oferta validada. Solo QA local.'});
await seed('configuracion','empresa',{nombre:'Red CaliNet — QA',eslogan:'',descripcion:'',ciudad:'',direccion:'',direccionNota:'',esloganHistorico:'',promesa:''});
await seed('configuracion','contacto',{whatsapp:'',telefono:'',correo:'',facebook:'',instagram:'',tiktok:'',horarios:[]});
console.log('QA creado en contrato Harness: nueve referencias BORRADOR, cuatro categorías, dos documentos de configuración, solo cuentas ficticias.');await db.terminate();
