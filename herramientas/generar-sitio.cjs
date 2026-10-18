"use strict";
const fs = require("node:fs"), path = require("node:path");
const {contenido, render} = require("./contenido.cjs");
const ROOT = path.resolve(__dirname, "..");
function generar(root = ROOT, check = false) {
  // Se validan datos y se preparan ambas páginas antes de escribir cualquier archivo.
  const values = contenido(JSON.parse(fs.readFileSync(path.join(root,"data.json"),"utf8")));
  const outputs = ["index.html","privacidad.html"].map(name => ({name, body:render(fs.readFileSync(path.join(root,"plantillas",name),"utf8"),values)}));
  if (check) {
    for (const o of outputs) if (fs.readFileSync(path.join(root,o.name),"utf8") !== o.body) throw Error("Archivo generado desactualizado: " + o.name);
  } else {
    const staged = [];
    try {
      for (const o of outputs) {
        const temp = path.join(root,"."+o.name+"."+process.pid+".tmp");
        fs.writeFileSync(temp,o.body,{flag:"wx"}); staged.push({...o,temp});
      }
      for (const o of staged) fs.renameSync(o.temp,path.join(root,o.name));
    } finally { for (const o of staged) if (fs.existsSync(o.temp)) fs.unlinkSync(o.temp); }
  }
  return outputs.map(o=>o.name);
}
if (require.main === module) {
  try { console.log((process.argv.includes("--check") ? "Verificados: " : "Generados: ")+generar(ROOT,process.argv.includes("--check")).join(", ")); }
  catch { console.error("Configuración o artefactos inválidos. Ejecute las pruebas y revise data.json/plantillas; no publique."); process.exitCode=1; }
}
module.exports = {generar};
