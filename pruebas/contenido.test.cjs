"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {validar, contenido, https, render} = require("../herramientas/contenido.cjs");
const {generar} = require("../herramientas/generar-sitio.cjs");
const ROOT = path.resolve(__dirname,"..");
const original = JSON.parse(fs.readFileSync(path.join(ROOT,"data.json"),"utf8"));
const clone = () => structuredClone(original);

test("La configuración actual y sus dos salidas están sincronizadas", () => {
  assert.equal(validar(original),original);
  assert.deepEqual(generar(ROOT,true),["index.html","privacidad.html"]);
});
for (const [name,change] of [
  ["null",()=>null], ["objeto vacío",()=>({})],
  ["marca ausente",d=>{delete d.marca;return d;}],
  ["servicios como cadena",d=>{d.servicios="texto";return d;}],
  ["detalles como cadena",d=>{d.servicios[0].detalles="texto";return d;}],
  ["beneficios nulos",d=>{d.beneficios=null;return d;}],
  ["redes como objeto",d=>{d.redes={};return d;}],
  ["ID duplicado",d=>{d.servicios[1].id=d.servicios[0].id;return d;}],
  ["icono desconocido",d=>{d.servicios[0].icono="i-no-existe";return d;}],
  ["teléfono ambiguo",d=>{d.contacto.whatsapp="+57 000";return d;}],
  ["correo con parámetros",d=>{d.contacto.correo="qa@example.invalid?subject=otro";return d;}],
  ["hora inválida",d=>{d.horarios[0].hora="29:00 – 21:30";return d;}],
  ["día desconocido",d=>{d.horarios[0].dias=["Ficticio"];return d;}],
  ["día duplicado",d=>{d.horarios[1].dias=["Monday"];return d;}],
  ["etiqueta de días divergente",d=>{d.horarios[0].dia="Lunes a viernes";return d;}],
  ["dirección desincronizada",d=>{d.contacto.direccionPostal.streetAddress="OTRA CALLE";return d;}],
  ["WhatsApp social divergente",d=>{d.redes[1].url="https://wa.me/1234567890";return d;}]
]) test("Rechaza " + name, () => assert.throws(()=>validar(change(clone()))));

for (const value of ["http://example.invalid", "mailto:qa@example.invalid", "data:text/plain,INOCUO", "//example.invalid", "https://qa:prueba@example.invalid/", "https://example.invalid:444/", "https://example.invalid/ ruta"]) {
  test("No admite destino configurable: "+value, () => { assert.equal(https(value),false);const data=clone();data.redes[0].url=value;assert.throws(()=>validar(data)); });
}
test("Permite HTTPS válido y redes sin configurar",()=>{
  assert.equal(https("https://example.invalid/ruta?q=consulta"),true);
  const d=clone();d.redes[0].url="";assert.doesNotThrow(()=>validar(d));assert.ok(!contenido(d).NETWORKS.includes('href="#"'));
});
test("Cambio ficticio coherente en HTML, privacidad, metadatos y JSON-LD",()=>{
  const d=clone();d.marca.nombre='MARCA FICTICIA <b>QA</b> & "equipo"';d.marca.nombreLegal="LEGAL FICTICIO";d.contacto.whatsapp="1234567890";d.redes[1].url="https://wa.me/1234567890";d.contacto.correo="qa@example.invalid";d.horarios[0].hora="08:00 – 17:00";
  const c=contenido(d),html=render(fs.readFileSync(path.join(ROOT,"plantillas/index.html"),"utf8"),c),privacy=render(fs.readFileSync(path.join(ROOT,"plantillas/privacidad.html"),"utf8"),c);
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.name,d.marca.nombre);assert.equal(schema.email,d.contacto.correo);assert.equal(schema.telephone,"+1234567890");assert.equal(schema.openingHoursSpecification[0].opens,"08:00");
  assert.ok(html.includes('MARCA FICTICIA &lt;b&gt;QA&lt;/b&gt; &amp; &quot;equipo&quot;'));assert.ok(!html.includes("<b>QA</b>"));assert.ok(!html.includes("Red CaliNet"));assert.ok(privacy.includes("LEGAL FICTICIO"));assert.ok(privacy.includes("qa@example.invalid"));
});
test("Las variables desconocidas detienen la generación",()=>assert.throws(()=>render("{{NO_EXISTE}}",contenido(original))));
test("Una configuración inválida no reemplaza páginas existentes; generación repetible",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"calinet-generador-"));
  try {
    fs.mkdirSync(path.join(root,"plantillas"));for(const name of ["index.html","privacidad.html"])fs.copyFileSync(path.join(ROOT,"plantillas",name),path.join(root,"plantillas",name));
    fs.writeFileSync(path.join(root,"data.json"),JSON.stringify(original));generar(root);const first=fs.readFileSync(path.join(root,"index.html"),"utf8");generar(root);assert.equal(fs.readFileSync(path.join(root,"index.html"),"utf8"),first);
    for(const invalid of ["{","null",JSON.stringify({...original,servicios:[]})]) {
      fs.writeFileSync(path.join(root,"data.json"),invalid);assert.throws(()=>generar(root));assert.equal(fs.readFileSync(path.join(root,"index.html"),"utf8"),first);
    }
    fs.unlinkSync(path.join(root,"data.json"));assert.throws(()=>generar(root));assert.equal(fs.readFileSync(path.join(root,"index.html"),"utf8"),first);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test("Sincronización detecta ediciones manuales antes de publicar",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"calinet-check-"));
  try {
    fs.mkdirSync(path.join(root,"plantillas"));for(const name of ["index.html","privacidad.html"])fs.copyFileSync(path.join(ROOT,"plantillas",name),path.join(root,"plantillas",name));fs.copyFileSync(path.join(ROOT,"data.json"),path.join(root,"data.json"));generar(root);fs.appendFileSync(path.join(root,"index.html"),"CAMBIO FICTICIO");assert.throws(()=>generar(root,true));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test("Pages excluye las plantillas sin resolver y herramientas del sitio publicado",()=>{
  const config=fs.readFileSync(path.join(ROOT,"_config.yml"),"utf8");
  for(const name of ["plantillas/","herramientas/","pruebas/","docs/","README.md"]) assert.ok(config.includes("  - "+name));
  for(const name of ["index.html","privacidad.html","assets/","styles.css","script.js"]) assert.ok(!config.includes("  - "+name));
  assert.equal(fs.existsSync(path.join(ROOT,".nojekyll")),false,"Si cambia el empaquetado de Pages hay que validar las exclusiones");
});
