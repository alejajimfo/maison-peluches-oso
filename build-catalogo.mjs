// Se ejecuta en Netlify cada vez que se publica la tienda.
// Lee los 3 catálogos de Google Sites y guarda todo en catalogo.json
// (fotos, tamaños y precios), para que la página cargue rápido y sin depender de terceros.
import fs from "node:fs";

const CATALOGOS = {
  nacional: "https://sites.google.com/view/catalogopeluchesoso",
  imp1: "https://sites.google.com/view/catalogoimportadosu/p%C3%A1gina-principal",
  imp2: "https://sites.google.com/view/catalogopeluches"
};

const decode = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&aacute;/g,"á").replace(/&ntilde;/g,"ñ").replace(/&Ntilde;/g,"Ñ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

function tallaDesdeTexto(txt){
  const m = String(txt).replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(cm|m\b|metro)/i);
  if(!m) return null;
  let v = parseFloat(m[1]);
  if(/metro|^m$/i.test(m[2]) || v < 3) v = v * 100;
  return Math.round(v);
}
function precioDesdeTexto(txt){
  const m = String(txt).replace(/\./g, "").match(/(\d{2,3})\s*mil/i);
  return m ? parseInt(m[1], 10) * 1000 : null;
}

// Recorre el HTML en orden y devuelve textos e imágenes
function eventos(html){
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
             .replace(/<noscript[\s\S]*?<\/noscript>/gi, "").replace(/<header[\s\S]*?<\/header>/gi, "")
             .replace(/<nav[\s\S]*?<\/nav>/gi, "").replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const out = [], vistos = new Set();
  const re = /<img\b[^>]*>|>([^<]+)</gi;
  let m;
  while((m = re.exec(html))){
    if(m[0].startsWith("<img")){
      const s = (m[0].match(/\b(?:data-src|src)\s*=\s*"([^"]+)"/i) || [])[1];
      if(!s || !/sitesv-images-rt|googleusercontent/.test(s)) continue;
      let src = decode(s); if(src.startsWith("//")) src = "https:" + src;
      const base = src.split("=")[0];
      if(vistos.has(base)) continue; vistos.add(base);
      out.push({ k: "i", v: base + "=w1000" });
    } else {
      const t = decode(m[1]).replace(/\s+/g, " ").trim();
      if(t.length > 1) out.push({ k: "t", v: t });
    }
  }
  return out;
}

function parseNacional(html){
  const grupos = {}; let actual = null;
  for(const e of eventos(html)){
    if(e.k === "t" && /tama[ñn]o/i.test(e.v)){ const cm = tallaDesdeTexto(e.v); if(cm) actual = cm; }
    else if(e.k === "i" && actual) (grupos[actual] ||= []).push(e.v);
  }
  return grupos;
}
function parseImportado(html, col){
  const items = []; let last = null;
  for(const e of eventos(html)){
    if(e.k === "i"){ last = { img: e.v, col, cm: null, precio: null }; items.push(last); }
    else if(last){
      const cm = tallaDesdeTexto(e.v), p = precioDesdeTexto(e.v);
      if(cm && !last.cm) last.cm = cm;
      if(p && !last.precio) last.precio = p;
      if(/maleta|cobija/i.test(e.v)) last.extra = "Maleta-cobija";
    }
  }
  return items;
}

async function traer(url){
  try{
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    if(!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  }catch(e){ console.log("No se pudo leer", url, e.message); return null; }
}

const [hN, h1, h2] = await Promise.all([traer(CATALOGOS.nacional), traer(CATALOGOS.imp1), traer(CATALOGOS.imp2)]);
const data = {
  actualizado: new Date().toISOString(),
  nac: hN ? parseNacional(hN) : {},
  imp: [].concat(h1 ? parseImportado(h1, 1) : [], h2 ? parseImportado(h2, 2) : [])
};
const total = Object.values(data.nac).flat().length + data.imp.length;
if(total > 0){
  fs.writeFileSync("catalogo.json", JSON.stringify(data));
  console.log(`catalogo.json listo: ${Object.values(data.nac).flat().length} osos nacionales, ${data.imp.length} importados`);
} else {
  console.log("No se encontraron fotos; la página usará la lectura en vivo.");
}
