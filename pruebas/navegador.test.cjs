"use strict";
const {test,before,after} = require("node:test"), assert = require("node:assert/strict");
const {chromium} = require("playwright"); // Herramienta QA existente; no dependencia del sitio.
const fs = require("node:fs"),path = require("node:path"),http = require("node:http"), {execFileSync} = require("node:child_process");
const ROOT = path.resolve(__dirname,".."), OUT = path.resolve(process.env.RCL_EVIDENCIAS || path.join(ROOT,"..","validacion-saneamiento"));
const {contenido,render} = require("../herramientas/contenido.cjs");
let server,browser,origin;
const requests = [], observations = [];
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".txt":"text/plain",".xml":"application/xml"};
before(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  server=http.createServer((req,res)=>{
    requests.push({method:req.method,url:req.url,referer:req.headers.referer||null});
    const url=new URL(req.url,"http://localhost"),prefix="/redcalinet/";
    if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
    const rel=decodeURIComponent(url.pathname.slice(prefix.length))||"index.html";
    const file=path.resolve(ROOT,rel);
    if(!file.startsWith(ROOT+path.sep)||!(rel.startsWith("assets/")||["index.html","privacidad.html","script.js","styles.css","data.json","robots.txt","sitemap.xml"].includes(rel))){res.writeHead(404);res.end();return;}
    fs.readFile(file,(error,body)=>{res.writeHead(error?404:200,{"Content-Type":types[path.extname(file)]||"application/octet-stream"});res.end(error?"404":body);});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({executablePath:process.env.RCL_CHROMIUM||"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-background-networking","--disable-sync","--disable-component-update","--disable-quic","--proxy-server=127.0.0.1:9","--proxy-bypass-list=127.0.0.1;localhost"]});
});
after(async()=>{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(OUT,"navegador.json"),JSON.stringify({time:new Date().toISOString(),runtime:process.version,requests,observations},null,2));
});
async function fixture(options={},init) {
  const ctx=await browser.newContext({viewport:{width:375,height:667},serviceWorkers:"block",reducedMotion:"reduce",...options});
  const external=[],violations=[],errors=[];
  await ctx.route("**/*",route=>{if(route.request().url().startsWith(origin+"/"))return route.continue();external.push(route.request().url());return route.abort("blockedbyclient");});
  await ctx.addInitScript(()=>{
    window.__opened=[];window.__violations=[];
    window.open=(...args)=>{window.__opened.push(args);return null;};
    document.addEventListener("securitypolicyviolation",e=>window.__violations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
  });
  if(init)await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
  const originalClose=ctx.close.bind(ctx);
  async function close(){
    if(options.javaScriptEnabled!==false)violations.push(...await page.evaluate(()=>window.__violations));
    observations.push({test:options.label||"funcional",external,violations,errors});
    try {assert.deepEqual(external,[],"No debe haber solicitudes externas");assert.deepEqual(errors,[],"Sin excepciones del sitio");}finally{await originalClose();}
  }
  return{ctx,page,close,external,violations,errors};
}
async function ready(page){await page.goto(origin+"/redcalinet/");await page.waitForFunction(()=>!document.querySelector("#prepararMensaje").disabled);}
async function fill(page){await page.locator("#fNombre").fill("AUDITORIA FICTICIA");await page.locator("#fCorreo").fill("qa@example.invalid");await page.locator("#fMensaje").fill("CONSULTA FICTICIA <b>INOCUA</b>");}

test("Sin JavaScript: contenido, navegación y contacto; formulario cerrado y sin transmisión",async()=>{
 const f=await fixture({javaScriptEnabled:false,label:"sin-js"});try{
  await f.page.goto(origin+"/redcalinet/");assert.equal(await f.page.locator(".servicio").count(),4);assert.equal(await f.page.locator(".beneficio").count(),3);assert.ok(await f.page.locator("#prepararMensaje").isDisabled());assert.ok(await f.page.locator("#fNombre").isDisabled());
  assert.equal(await f.page.locator("#nav").evaluate(e=>getComputedStyle(e).visibility),"visible");assert.equal(await f.page.locator(".revelar").evaluateAll(es=>es.every(e=>getComputedStyle(e).opacity==="1")),true);assert.match(await f.page.locator("#waDirecto").getAttribute("href"),/^https:\/\/wa.me\/\d+$/);
  const before=requests.length;await f.page.evaluate(()=>{document.querySelector("#camposFormulario").disabled=false;document.querySelector("#fNombre").value="FICTICIO";document.querySelector("#fCorreo").value="qa@example.invalid";});await f.page.locator("#fNombre").press("Enter");await f.page.waitForTimeout(150);assert.equal(requests.slice(before).some(r=>r.url.includes("FICTICIO")||r.url.includes("example.invalid")),false);
  await f.page.screenshot({path:path.join(OUT,"sin-js.png"),fullPage:true});
 }finally{await f.close();}
});
test("Script ausente: contacto estático y controles seguros",async()=>{
 const f=await fixture({label:"script-ausente"});try{await f.ctx.route("**/script.js",r=>r.abort());await f.page.goto(origin+"/redcalinet/");assert.ok(await f.page.locator("#prepararMensaje").isDisabled());assert.equal(await f.page.locator(".servicio").count(),4);assert.ok(await f.page.locator("#waDirecto").isVisible());}finally{await f.close();}
});
test("CSP bloquea submit nativo; FormData no contiene datos incluso habilitado",async()=>{
 const f=await fixture({label:"envio-nativo"});try{await ready(f.page);await fill(f.page);assert.deepEqual(await f.page.locator("form").evaluate(e=>[...new FormData(e)]),[]);const before=requests.length;await f.page.locator("form").evaluate(e=>e.submit());await f.page.waitForFunction(()=>window.__violations.some(v=>v.directive==="form-action"));assert.equal(requests.slice(before).filter(r=>r.method!=="GET"||r.url.includes("?")).length,0);}finally{await f.close();}
});
test("Enter y clic preparan enlace ficticio sin datos al alojamiento ni almacenamiento",async()=>{
 const f=await fixture({label:"formulario-valido"});try{await ready(f.page);await fill(f.page);const before=requests.length;await f.page.locator("#fCorreo").press("Enter");assert.equal(await f.page.evaluate(()=>window.__opened.length),1);let url=new URL(await f.page.locator("#waContinuar").getAttribute("href"));assert.equal(url.host,"wa.me");assert.ok(url.searchParams.get("text").includes("qa@example.invalid"));assert.ok(url.searchParams.get("text").includes("<b>INOCUA</b>"));assert.match(await f.page.locator("#formAviso").innerText(),/No se ha enviado/);assert.equal(await f.page.evaluate(()=>localStorage.getItem("redcalinet-contacto")),null);assert.equal(requests.slice(before).some(r=>r.url.includes("?")||r.method!=="GET"),false);
 await f.page.locator("#fNombre").fill("OTRO FICTICIO");assert.ok(await f.page.locator("#waResultado").isHidden());assert.equal(await f.page.locator("#waContinuar").getAttribute("href"),null);await f.page.locator("#prepararMensaje").click();assert.equal(await f.page.evaluate(()=>window.__opened.length),2);
 }finally{await f.close();}
});
test("Errores asociados al campo, foco y limpieza del estado",async()=>{
 const f=await fixture({label:"validacion-accesible"});try{await ready(f.page);await f.page.locator("#prepararMensaje").click();assert.equal(await f.page.locator("#fNombre").getAttribute("aria-invalid"),"true");assert.equal(await f.page.locator("#fNombre").evaluate(e=>e===document.activeElement),true);assert.ok((await f.page.locator("#errorNombre").innerText()).length>0);await f.page.locator("#fNombre").fill("NOMBRE FICTICIO");assert.equal(await f.page.locator("#fNombre").getAttribute("aria-invalid"),"false");await f.page.locator("#fCorreo").fill("correo-invalido");await f.page.locator("#prepararMensaje").click();assert.equal(await f.page.locator("#fCorreo").getAttribute("aria-invalid"),"true");assert.equal(await f.page.locator("#fCorreo").getAttribute("aria-describedby"),"errorCorreo");assert.equal(await f.page.evaluate(()=>window.__opened.length),0);await f.page.screenshot({path:path.join(OUT,"errores.png")});}finally{await f.close();}
});
for(const mode of ["null","excepcion","ausente"])test("WhatsApp no disponible: "+mode+", continuación recuperable",async()=>{
 const f=await fixture({label:"whatsapp-"+mode});try{await ready(f.page);await f.page.evaluate(mode=>{if(mode==="excepcion")window.open=()=>{throw Error("BLOQUEO FICTICIO");};if(mode==="ausente")window.open=undefined;},mode);await fill(f.page);await f.page.locator("#prepararMensaje").click();assert.ok(await f.page.locator("#waContinuar").isVisible());assert.match(await f.page.locator("#waContinuar").getAttribute("href"),/^https:\/\/wa.me\//);assert.match(await f.page.locator("#formAviso").innerText(),/preparado|preparada/);assert.ok(!(await f.page.locator("#formAviso").innerText()).includes("enviado correctamente"));}finally{await f.close();}
});
test("Limpia solo el borrador antiguo sin leerlo; no escribe datos",async()=>{
 const f=await fixture({label:"migracion-borrador"},()=>{
   localStorage.setItem("redcalinet-contacto",JSON.stringify({nombre:"FICTICIO",correo:"qa@example.invalid"}));localStorage.setItem("otra-aplicacion-ficticia","conservar");
   window.__storageCalls=[];for(const m of ["getItem","setItem","removeItem"]){const fn=Storage.prototype[m];Storage.prototype[m]=function(...args){window.__storageCalls.push([m,args[0]]);return fn.apply(this,args);};}
 });try{await ready(f.page);await fill(f.page);await f.page.locator("#prepararMensaje").click();assert.deepEqual(await f.page.evaluate(()=>window.__storageCalls),[["removeItem","redcalinet-contacto"]]);assert.equal(await f.page.locator("#fNombre").inputValue(),"AUDITORIA FICTICIA");assert.equal(await f.page.evaluate(()=>Object.hasOwn(localStorage,"otra-aplicacion-ficticia")),true);await f.page.reload();assert.equal(await f.page.locator("#fNombre").inputValue(),"");}finally{await f.close();}
});
test("Almacenamiento inaccesible no impide el formulario",async()=>{
 const f=await fixture({label:"almacenamiento-bloqueado"},()=>{for(const m of ["getItem","setItem","removeItem"])Storage.prototype[m]=()=>{throw Error("Almacenamiento bloqueado ficticio");};});try{await ready(f.page);await fill(f.page);await f.page.locator("#prepararMensaje").click();assert.ok(await f.page.locator("#waContinuar").isVisible());}finally{await f.close();}
});
for(const mode of ["ausente","pendiente","lento","invalido","incompatible"])test("data.json "+mode+" no bloquea la página: no se consulta en runtime",async()=>{
 const f=await fixture({label:"data-"+mode});try{let calls=0;await f.ctx.route("**/data.json",r=>{calls++;if(mode==="pendiente"||mode==="lento")return;r.fulfill({status:mode==="ausente"?404:200,body:mode==="invalido"?"{":"null"});});await ready(f.page);assert.equal(await f.page.locator(".servicio").count(),4);await f.page.locator("#menuBtn").click();assert.equal(await f.page.locator("#menuBtn").getAttribute("aria-expanded"),"true");await f.page.keyboard.press("Escape");await fill(f.page);await f.page.locator("#prepararMensaje").click();assert.ok(await f.page.locator("#waContinuar").isVisible());assert.equal(calls,0);}finally{await f.close();}
});
for(const width of [320,375,420,768,900,1024,1440])test("Reflow, recursos y CSP en "+width+" px",async()=>{
 const f=await fixture({viewport:{width,height:800},label:"viewport-"+width});try{await ready(f.page);for(const id of ["servicios","nosotros","galeria","contacto"])await f.page.locator("#"+id).scrollIntoViewIfNeeded();assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await f.page.locator(".servicio").count(),4);for(const img of await f.page.locator("img").all()) await img.scrollIntoViewIfNeeded();await f.page.waitForFunction(()=>[...document.images].every(e=>e.complete&&e.naturalWidth>0));assert.deepEqual(await f.page.evaluate(()=>window.__violations),[]);if(width===375||width===1440){await f.page.evaluate(()=>scrollTo(0,0));await f.page.screenshot({path:path.join(OUT,"normal-"+width+".png"),fullPage:true});}}finally{await f.close();}
});
for(const width of [320,375,1024])test("Texto al 200% y viewport "+width+" sin recorte",async()=>{
 const f=await fixture({viewport:{width,height:800},label:"texto-200-"+width});try{await ready(f.page);await f.page.evaluate(()=>document.documentElement.style.fontSize="32px");await f.page.locator("#formContacto").scrollIntoViewIfNeeded();const metrics=await f.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,form:document.querySelector("#formContacto").getBoundingClientRect().right}));observations.push({test:"texto-200-medidas",...metrics});assert.ok(metrics.scroll<=width,JSON.stringify(metrics));assert.ok(metrics.form<=width);if(width===320)await f.page.screenshot({path:path.join(OUT,"texto-200.png"),fullPage:true});}finally{await f.close();}
});
test("Reflow equivalente al zoom 200%: viewport CSS 640 px y DPR 2",async()=>{
 const f=await fixture({viewport:{width:640,height:450},deviceScaleFactor:2,label:"zoom-200"});try{await ready(f.page);assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await f.page.locator("#menuBtn").isVisible());await f.page.screenshot({path:path.join(OUT,"zoom-equivalente-200.png"),fullPage:true});}finally{await f.close();}
});
test("Chromium permite zoom visual al 200% y el formulario conserva foco",async()=>{
 const f=await fixture({label:"zoom-visual-real"});try{await ready(f.page);const session=await f.ctx.newCDPSession(f.page);await session.send("Emulation.setPageScaleFactor",{pageScaleFactor:2});assert.equal(await f.page.evaluate(()=>visualViewport.scale),2);await f.page.locator("#fCorreo").focus();assert.equal(await f.page.locator("#fCorreo").evaluate(e=>e===document.activeElement),true);observations.push({test:"zoom-visual",...(await f.page.evaluate(()=>({scale:visualViewport.scale,visualWidth:visualViewport.width,layoutWidth:innerWidth})))});}finally{await f.close();}
});
test("Teclado: enlace oculto fuera de Tab, foco actual preservado y Escape devuelve foco",async()=>{
 const f=await fixture({label:"teclado"});try{await ready(f.page);await f.page.locator("#contacto").scrollIntoViewIfNeeded();await f.page.waitForFunction(()=>document.querySelector("#waFloat").hidden);await f.page.locator('a[href="privacidad.html"]').evaluate(e=>e.focus({preventScroll:true}));await f.page.keyboard.press("Tab");assert.equal(await f.page.evaluate(()=>document.activeElement.id==="waFloat"),false);
 await f.page.locator("#inicio").scrollIntoViewIfNeeded();await f.page.waitForFunction(()=>!document.querySelector("#waFloat").hidden);await f.page.locator("#waFloat").focus();await f.page.locator("#contacto").evaluate(e=>e.scrollIntoView());await f.page.waitForTimeout(100);assert.equal(await f.page.locator("#waFloat").evaluate(e=>e.hidden),false);await f.page.locator("#fNombre").focus();await f.page.waitForFunction(()=>document.querySelector("#waFloat").hidden);
 await f.page.locator("#menuBtn").click();await f.page.locator('#nav a[href="#inicio"]').focus();await f.page.keyboard.press("Escape");assert.equal(await f.page.locator("#menuBtn").evaluate(e=>e===document.activeElement),true);await f.page.locator("#menuBtn").click();await f.page.screenshot({path:path.join(OUT,"menu.png")});}finally{await f.close();}
});
test("Anclas de escritorio mantienen navegación",async()=>{
 const f=await fixture({viewport:{width:1440,height:900},label:"anclas-escritorio"});try{await ready(f.page);for(const id of ["servicios","nosotros","contacto","inicio"]){await f.page.locator('#nav a[href="#'+id+'"]').click();assert.equal(new URL(f.page.url()).hash,"#"+id);}}finally{await f.close();}
});
test("Impresión contiene servicios y beneficios sin scroll previo",async()=>{
 const f=await fixture({label:"impresion"});try{await ready(f.page);await f.page.emulateMedia({media:"print"});assert.ok(await f.page.locator(".revelar").evaluateAll(es=>es.every(e=>getComputedStyle(e).opacity==="1")));const pdf=path.join(OUT,"impresion.pdf");await f.page.pdf({path:pdf,format:"A4",printBackground:true});const text=execFileSync("pdftotext",["-raw",pdf,"-"],{encoding:"utf8"}).replace(/\s+/g," ");for(const expected of ["Streaming","Tecnología","Seguros","Trámites","Atención personalizada"])assert.ok(text.includes(expected),expected);}finally{await f.close();}
});
test("SEO generado y contenido HTML inocuo son coherentes y no insertan etiquetas",async()=>{
 const f=await fixture({label:"seo-ficticio"});try{
 const d=JSON.parse(fs.readFileSync(path.join(ROOT,"data.json"),"utf8"));d.marca.nombre='MARCA FICTICIA <b>QA</b> & "equipo"';d.servicios[0].nombre="<b>SERVICIO FICTICIO</b>";const html=render(fs.readFileSync(path.join(ROOT,"plantillas/index.html"),"utf8"),contenido(d));await f.ctx.route(origin+"/redcalinet/",r=>r.fulfill({contentType:"text/html",body:html}));await ready(f.page);assert.ok((await f.page.title()).includes(d.marca.nombre));for(const selector of [".marca strong",".pie__marca strong"]){assert.equal(await f.page.locator(selector).textContent(),d.marca.nombre);}assert.equal(await f.page.locator(".servicio b,.marca b").count(),0);assert.ok((await f.page.locator('meta[property="og:title"]').getAttribute("content")).includes(d.marca.nombre));const schema=await f.page.locator('script[type="application/ld+json"]').evaluate(e=>JSON.parse(e.textContent));assert.equal(schema.name,d.marca.nombre);assert.equal(schema.hasOfferCatalog.itemListElement[0].itemOffered.name,d.servicios[0].nombre);assert.deepEqual(await f.page.evaluate(()=>window.__violations),[]);
 }finally{await f.close();}
});
test("CSP impide ejecución inline y conexiones no autorizadas",async()=>{
 const f=await fixture({label:"csp-negativa"});try{await ready(f.page);await f.page.evaluate(()=>{const s=document.createElement("script");s.textContent="window.__scriptInocuoEjecutado = true";document.head.append(s);fetch("https://example.invalid/diagnostico-inocuo").catch(()=>{});});await f.page.waitForFunction(()=>window.__violations.some(e=>e.directive==="connect-src")&&window.__violations.some(e=>e.directive==="script-src-elem"));assert.equal(await f.page.evaluate(()=>window.__scriptInocuoEjecutado),undefined);assert.deepEqual(f.external,[]);}finally{await f.close();}
});
test("Contraste de ambos iconos WhatsApp supera 3:1",async()=>{
 const f=await fixture({label:"contraste"});try{await ready(f.page);const values=await f.page.locator(".wa-float,.social-btn.whatsapp").evaluateAll(es=>es.map(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor})));const lum=s=>{const a=s.match(/\d+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};for(const v of values){const ratio=(Math.max(lum(v.fg),lum(v.bg))+.05)/(Math.min(lum(v.fg),lum(v.bg))+.05);assert.ok(ratio>=3);observations.push({test:"contraste",ratio});}}finally{await f.close();}
});
test("Privacidad sin estilos inline, sin fuente externa y con retorno",async()=>{
 const f=await fixture({label:"privacidad"});try{await f.page.goto(origin+"/redcalinet/privacidad.html");assert.equal(await f.page.locator("style").count(),0);assert.equal(await f.page.locator("h1").innerText(),"Política de privacidad");assert.ok((await f.page.locator("main").innerText()).includes("proveedor recibe la URL"));assert.equal(await f.page.locator('meta[name="referrer"]').getAttribute("content"),"no-referrer");assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await f.page.screenshot({path:path.join(OUT,"privacidad.png"),fullPage:true});await f.page.locator(".privacidad__volver").click();assert.equal(new URL(f.page.url()).pathname,"/redcalinet/index.html");assert.equal(await f.page.evaluate(()=>document.referrer),"");assert.equal(requests.filter(r=>r.url==="/redcalinet/index.html").at(-1).referer,null);assert.deepEqual(await f.page.evaluate(()=>window.__violations),[]);}finally{await f.close();}
});
