// Monta a pasta "publicar/" só com os arquivos do site, pronta para hospedar
// (Netlify, Vercel, GitHub Pages...). O .env, os scripts e o SQL ficam de fora.
//
// Como usar:  npm run publicar

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "publicar");
const ITENS_DO_SITE = ["index.html", "css", "js", "img", "pages"];

// Limpa a pasta antiga (só se for mesmo a pasta "publicar" do projeto)
if (path.basename(DESTINO) === "publicar" && fs.existsSync(DESTINO)) {
  fs.rmSync(DESTINO, { recursive: true });
}
fs.mkdirSync(DESTINO);

for (const item of ITENS_DO_SITE) {
  fs.cpSync(path.join(RAIZ, item), path.join(DESTINO, item), { recursive: true });
}

// Leva só as fotos de produtos que estão em uso (as antigas ficam de fora)
const codigoProdutos = fs.readFileSync(path.join(RAIZ, "js", "produtos.js"), "utf8");
const fotosEmUso = new Set(new Function(codigoProdutos + "; return PRODUTOS;")().map((p) => p.imagem).filter(Boolean));
const pastaFotos = path.join(DESTINO, "img", "produtos");
let fotosRemovidas = 0;
for (const arquivo of fs.readdirSync(pastaFotos)) {
  if (!fotosEmUso.has(arquivo)) {
    fs.rmSync(path.join(pastaFotos, arquivo)); // só apaga dentro da cópia em publicar/
    fotosRemovidas++;
  }
}
console.log(fotosEmUso.size + " fotos de produtos incluídas (" + fotosRemovidas + " sem uso ficaram de fora).");

// Cabeçalhos de segurança para o Netlify (arquivo _headers)
fs.writeFileSync(
  path.join(DESTINO, "_headers"),
  [
    "/*",
    "  X-Frame-Options: DENY",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    // De onde o site pode carregar coisas: dele mesmo, da biblioteca do Supabase (jsDelivr)
    // e só pode conversar com o próprio banco. Formulários só enviam para o próprio site.
    "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
      "connect-src 'self' https://bwthjqlqihncngikojmu.supabase.co; " +
      "frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
    ""
  ].join("\n")
);

// Conferência de segurança: nenhuma chave secreta pode ir junto
function listarArquivos(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = path.join(pasta, item.name);
    return item.isDirectory() ? listarArquivos(caminho) : [caminho];
  });
}

const arquivos = listarArquivos(DESTINO);
const perigosos = arquivos.filter(function (arquivo) {
  if (path.basename(arquivo).startsWith(".env")) return true;
  if (!/\.(html|css|js|json|svg)$/i.test(arquivo)) return false;
  return /sb_secret_|service_role/i.test(fs.readFileSync(arquivo, "utf8").replace(/NUNCA coloque aqui a chave "service_role"/g, ""));
});

if (perigosos.length > 0) {
  console.error("PARE! Encontrei algo que parece chave secreta em:\n" + perigosos.join("\n"));
  process.exit(1);
}

console.log("Pasta publicar/ pronta com " + arquivos.length + " arquivos (sem chaves secretas).");
