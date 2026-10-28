// Schema compatibility checks against all eight sanitized official examples, without importing them.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {validate,PUBLIC_FIELDS} from '../server/schema.mjs';
const source='/workspace/work/redcalinet-admin-003/harness/EJEMPLOS-DOCUMENTOS.json',sample=JSON.parse(await fs.readFile(process.env.RCL_HARNESS_EXAMPLES||source)),checks=[];
for(const e of sample.ejemplos){const [collection,rid]=e.ruta.split('/'),r=structuredClone(e.documento);if(collection==='usuarios'){assert.ok(['PROPIETARIO','SUPERADMIN'].includes(r.rol));assert.equal(typeof r.activo,'boolean');assert.equal(typeof r.email,'string');}else{
 if(collection==='configuracion'){for(const k of ['whatsapp','telefono'])if(r[k]?.startsWith('<'))r[k]='570000000000';assert.ok(Object.keys(r).every(k=>PUBLIC_FIELDS[rid].includes(k)));validate(collection,r,r);}
 else{if(r.imagen?.includes('<'))r.imagen='https://res.cloudinary.com/qa-example/image/upload/qa.webp';assert.ok(Object.keys(r).every(k=>(collection==='categorias'?PUBLIC_FIELDS.categorias:PUBLIC_FIELDS.catalogo).includes(k)));validate(collection,r,r);}
 }checks.push('Official example accepted (markers replaced by QA-only values, no import): '+e.ruta);}
assert.equal(checks.length,8);await fs.writeFile(new URL('../.runtime/harness-examples-results.json',import.meta.url),JSON.stringify({passed:checks.length,checks,scope:'Official sanitized examples only, no production data or writes'},null,2));console.log('PASS:',checks.length,'official example compatibility checks');
