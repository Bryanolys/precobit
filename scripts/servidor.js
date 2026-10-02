// Servidor local simples para testar o site em http://localhost:3000
//
// Como usar:  npm run dev
//
// Por segurança ele:
// - só entrega os arquivos do site (index.html, css/, js/, img/, pages/),
//   nunca o .env, os scripts ou o SQL;
// - só aceita conexões deste computador (não aparece para a rede/Wi-Fi).

const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PORTA = 3000;
const PASTAS_LIBERADAS = ["css", "js", "img", "pages"];

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function liberado(caminhoRelativo) {
  if (caminhoRelativo === "index.html") return true;
  const pasta = caminhoRelativo.split(path.sep)[0];
  return PASTAS_LIBERADAS.includes(pasta);
}

const servidor = http.createServer(function (pedido, resposta) {
  let endereco;
  try {
    endereco = decodeURIComponent(new URL(pedido.url, "http://localhost").pathname);
  } catch (erro) {
    resposta.writeHead(400).end("Endereço inválido");
    return;
  }

  if (endereco.endsWith("/")) endereco += "index.html";

  const arquivo = path.normalize(path.join(RAIZ, endereco));
  const relativo = path.relative(RAIZ, arquivo);

  // Bloqueia "../" e qualquer coisa fora das pastas do site
  if (relativo.startsWith("..") || path.isAbsolute(relativo) || !liberado(relativo)) {
    resposta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
    return;
  }

  fs.readFile(arquivo, function (erro, conteudo) {
    if (erro) {
      resposta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
      return;
    }
    const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream";
    resposta.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-cache" }).end(conteudo);
  });
});

servidor.listen(PORTA, "localhost", function () {
  console.log("Site rodando em http://localhost:" + PORTA + "  (Ctrl+C para parar)");
});
