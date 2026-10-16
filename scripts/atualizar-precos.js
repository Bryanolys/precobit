// Atualiza os preços, links e fotos dos produtos buscando na KaBuM e na Amazon.
//
// Como usar (na pasta do projeto):
//   node scripts/atualizar-precos.js             -> busca nas lojas e envia ao Supabase
//   node scripts/atualizar-precos.js --so-enviar -> só envia o js/produtos.js atual ao Supabase
//
// O resultado é gravado no Supabase (tabelas produtos e ofertas), em js/produtos.js
// (cópia de reserva) e as fotos em img/produtos/.
// O navegador não consegue buscar direto nas lojas (elas bloqueiam), por isso
// rodamos este script no computador e o site lê os dados salvos.
//
// Para enviar ao Supabase, crie um arquivo .env na pasta do projeto (veja .env.example).

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PASTA_FOTOS = path.join(RAIZ, "img", "produtos");
const ARQUIVO_SAIDA = path.join(RAIZ, "js", "produtos.js");

// Lê o arquivo .env (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY), se existir
try {
  process.loadEnvFile(path.join(RAIZ, ".env"));
} catch (erro) {
  // sem .env: os dados ficam só no js/produtos.js
}

const NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

// Palavras que indicam que o anúncio não é a peça sozinha
// ("cooler master" é marca de fonte, então não conta como cooler)
const EXCLUIR_SEMPRE = /\b(combo|computador|pc gamer|notebook|cooler(?! ?master)|suporte|cabo|adaptador|usado|seminovo|recondicionado|open ?box|vitrine)\b/i;

// "Kit" só é problema fora da memória RAM (memória costuma vir em kit 2x8, 2x16...)
const EXCLUIR_KIT = /\bkit\b/i;

// Lista de produtos acompanhados.
// - busca: o que digitar na loja
// - precisa: todas essas expressões têm que aparecer no título do anúncio
// - naoPode: se alguma aparecer, o anúncio é ignorado
// - minimo: preço mínimo aceito (evita pegar acessórios baratos)
const PRODUTOS = [
  { nome: "AMD Ryzen 5 9600X", categoria: "Processadores", busca: "processador ryzen 5 9600x",
    precisa: [/9600x/i], minimo: 800 },
  { nome: "AMD Ryzen 7 9800X3D", categoria: "Processadores", busca: "processador ryzen 7 9800x3d",
    precisa: [/9800x3d/i], minimo: 1800 },
  { nome: "AMD Ryzen 5 5600", categoria: "Processadores", busca: "processador ryzen 5 5600",
    precisa: [/ryzen 5 5600\b/i], naoPode: [/5600(x|g|gt|xt|t)\b/i], minimo: 350 },
  { nome: "Intel Core Ultra 7 265K", categoria: "Processadores", busca: "processador intel core ultra 7 265k",
    precisa: [/265k\b/i], minimo: 1200 },
  { nome: "Intel Core i5-12400F", categoria: "Processadores", busca: "processador intel core i5 12400f",
    precisa: [/12400f/i], minimo: 400 },

  { nome: "NVIDIA GeForce RTX 5060 8GB", categoria: "Placas de vídeo", busca: "placa de video rtx 5060",
    precisa: [/rtx\s?5060\b/i], naoPode: [/5060\s?ti/i], minimo: 1300 },
  { nome: "NVIDIA GeForce RTX 5070 12GB", categoria: "Placas de vídeo", busca: "placa de video rtx 5070",
    precisa: [/rtx\s?5070\b/i], naoPode: [/5070\s?ti/i], minimo: 2500 },
  { nome: "AMD Radeon RX 9070 XT 16GB", categoria: "Placas de vídeo", busca: "placa de video rx 9070 xt",
    precisa: [/9070\s?xt/i], minimo: 3000 },
  { nome: "AMD Radeon RX 9060 XT 16GB", categoria: "Placas de vídeo", busca: "placa de video rx 9060 xt 16gb",
    precisa: [/9060\s?xt/i, /16\s?gb/i], minimo: 1500 },

  { nome: "Kingston Fury Beast 8GB DDR4 3200MHz", categoria: "Memória RAM", busca: "memoria kingston fury beast 8gb ddr4 3200",
    precisa: [/fury beast/i, /ddr4/i, /\b8\s?gb/i, /3200/], naoPode: [/2\s?x\s?8|16\s?gb/i], minimo: 60 },
  { nome: "Kingston Fury Beast 16GB (2x8) DDR4 3200MHz", categoria: "Memória RAM", busca: "memoria kingston fury beast 16gb 2x8 ddr4 3200",
    precisa: [/fury beast/i, /ddr4/i, /2\s?x\s?8/i, /3200/], minimo: 120 },
  { nome: "Corsair Vengeance LPX 16GB (2x8) DDR4 3200MHz", categoria: "Memória RAM", busca: "memoria corsair vengeance lpx 16gb 2x8 ddr4 3200",
    precisa: [/vengeance lpx/i, /2\s?x\s?8/i, /3200/], minimo: 120 },
  { nome: "Kingston Fury Beast 16GB DDR5 5600MHz", categoria: "Memória RAM", busca: "memoria kingston fury beast 16gb ddr5 5600",
    precisa: [/fury beast/i, /ddr5/i, /16\s?gb/i, /5600/], naoPode: [/2\s?x|32\s?gb/i], minimo: 150 },
  { nome: "Kingston Fury Beast 32GB (2x16) DDR5", categoria: "Memória RAM", busca: "memoria kingston fury beast ddr5 32gb 2x16",
    precisa: [/fury beast/i, /ddr5/i, /2\s?x\s?16|32\s?gb \(2x16/i], minimo: 300 },
  { nome: "Corsair Vengeance 32GB (2x16) DDR5", categoria: "Memória RAM", busca: "memoria corsair vengeance ddr5 32gb 2x16",
    precisa: [/vengeance/i, /ddr5/i, /2\s?x\s?16/i], naoPode: [/rgb/i], minimo: 300 },
  { nome: "Corsair Vengeance RGB 32GB (2x16) DDR5 6000MHz", categoria: "Memória RAM", busca: "memoria corsair vengeance rgb ddr5 32gb 2x16 6000",
    precisa: [/vengeance rgb/i, /ddr5/i, /2\s?x\s?16/i, /6000/], minimo: 300 },
  { nome: "XPG Lancer 32GB (2x16) DDR5 6000MHz", categoria: "Memória RAM", busca: "memoria xpg lancer ddr5 32gb 2x16",
    precisa: [/lancer/i, /ddr5/i, /2\s?x\s?16/i], minimo: 300 },
  { nome: "TeamGroup T-Force Delta RGB 32GB (2x16) DDR5", categoria: "Memória RAM", busca: "memoria t-force delta rgb ddr5 32gb 2x16",
    precisa: [/delta/i, /ddr5/i, /2\s?x\s?16/i], minimo: 300 },

  { nome: "SSD Kingston NV3 1TB NVMe", categoria: "Armazenamento", busca: "ssd kingston nv3 1tb",
    precisa: [/nv3/i, /1\s?tb/i], minimo: 200 },
  { nome: "SSD Samsung 990 EVO Plus 2TB", categoria: "Armazenamento", busca: "ssd samsung 990 evo plus 2tb",
    precisa: [/990 evo plus/i, /2\s?tb/i], minimo: 500 },

  { nome: "Placa-mãe ASUS TUF Gaming B650M-Plus", categoria: "Placas-mãe", busca: "placa mae asus tuf gaming b650m-plus",
    precisa: [/tuf/i, /b650m-?\s?plus/i], minimo: 700 },
  { nome: "Placa-mãe Gigabyte B650M Gaming X AX", categoria: "Placas-mãe", busca: "placa mae gigabyte b650m gaming x ax",
    precisa: [/b650m gaming x ax/i], minimo: 700 },
  { nome: "Placa-mãe Gigabyte B650M Gaming Plus WiFi", categoria: "Placas-mãe", busca: "placa mae gigabyte b650m gaming plus wifi",
    precisa: [/b650m gaming plus/i], minimo: 700 },
  { nome: "Placa-mãe Gigabyte B650M Aorus Elite", categoria: "Placas-mãe", busca: "placa mae gigabyte b650m aorus elite ax",
    precisa: [/b650m aorus elite/i], minimo: 800 },
  { nome: "Placa-mãe ASRock B650M PG Lightning", categoria: "Placas-mãe", busca: "placa mae asrock b650m pg lightning",
    precisa: [/b650m pg lightning/i], minimo: 600 },
  { nome: "Placa-mãe MSI MAG B850 Tomahawk MAX WiFi", categoria: "Placas-mãe", busca: "placa mae msi mag b850 tomahawk max wifi",
    precisa: [/b850 tomahawk max/i], minimo: 1200 },
  { nome: "Placa-mãe ASUS TUF Gaming B550M-Plus", categoria: "Placas-mãe", busca: "placa mae asus tuf gaming b550m-plus",
    precisa: [/tuf/i, /b550m-?\s?plus/i], naoPode: [/wi-?fi/i], minimo: 500 },
  { nome: "Placa-mãe MSI B550M PRO-VDH WiFi", categoria: "Placas-mãe", busca: "placa mae msi b550m pro-vdh wifi",
    precisa: [/b550m pro-?\s?vdh/i, /wi-?fi/i], minimo: 400 },
  { nome: "Placa-mãe Gigabyte B760M Gaming X Gen5", categoria: "Placas-mãe", busca: "placa mae gigabyte b760m gaming x gen5",
    precisa: [/b760m gaming x/i], minimo: 500 },
  { nome: "Placa-mãe ASUS Prime H610M-E D4", categoria: "Placas-mãe", busca: "placa mae asus prime h610m-e",
    precisa: [/prime/i, /h610m-?\s?e\b/i], minimo: 300 },

  { nome: "Fonte Corsair CX650 650W 80 Plus Bronze", categoria: "Fontes", busca: "fonte corsair cx650",
    precisa: [/cx650/i], minimo: 250 },
  { nome: "Fonte MSI MAG A650BN 650W 80 Plus Bronze", categoria: "Fontes", busca: "fonte msi mag a650bn",
    precisa: [/a650bn/i], minimo: 200 },
  { nome: "Fonte Corsair RM750e 750W 80 Plus Gold", categoria: "Fontes", busca: "fonte corsair rm750e",
    precisa: [/rm750e/i], minimo: 350 },
  { nome: "Fonte MSI MAG A750GL 750W 80 Plus Gold", categoria: "Fontes", busca: "fonte msi mag a750gl",
    precisa: [/a750gl/i], minimo: 350 },
  { nome: "Fonte Cooler Master MWE Gold 750 V3", categoria: "Fontes", busca: "fonte cooler master mwe gold 750 v3",
    precisa: [/mwe/i, /750/, /gold/i, /v3/i], minimo: 350 },
  { nome: "Fonte XPG Core Reactor II VE 750W 80 Plus Gold", categoria: "Fontes", busca: "fonte xpg core reactor ii 750w",
    precisa: [/core reactor/i, /750/], minimo: 400 },
  { nome: "Fonte Corsair RM850e 850W 80 Plus Gold", categoria: "Fontes", busca: "fonte corsair rm850e",
    precisa: [/rm850e/i], minimo: 450 }
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixarTexto(url) {
  const resposta = await fetch(url, { headers: { "User-Agent": NAVEGADOR, "Accept-Language": "pt-BR,pt;q=0.9" } });
  if (!resposta.ok) throw new Error("HTTP " + resposta.status + " em " + url);
  return resposta.text();
}

function anuncioServe(titulo, preco, produto) {
  if (!titulo || !preco || preco < produto.minimo) return false;
  if (EXCLUIR_SEMPRE.test(titulo)) return false;
  if (produto.categoria !== "Memória RAM" && EXCLUIR_KIT.test(titulo)) return false;
  if (!produto.precisa.every((re) => re.test(titulo))) return false;
  if ((produto.naoPode || []).some((re) => re.test(titulo))) return false;
  return true;
}

// ----- KaBuM -----

// Procura a lista de produtos dentro do JSON da página da KaBuM.
// Em algumas páginas a lista vem como texto JSON dentro do JSON, por isso o JSON.parse extra.
function acharListaKabum(obj) {
  if (typeof obj === "string" && obj.includes('"code"') && /^[\[{]/.test(obj)) {
    try {
      obj = JSON.parse(obj);
    } catch (erro) {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj.data) && obj.data[0] && obj.data[0].code) return obj.data;
  if (Array.isArray(obj) && obj[0] && obj[0].code && obj[0].name) return obj;
  for (const chave in obj) {
    const achou = acharListaKabum(obj[chave]);
    if (achou) return achou;
  }
  return null;
}

async function listarKabum(url) {
  const html = await baixarTexto(url);
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return json ? acharListaKabum(JSON.parse(json[1])) || [] : [];
}

// Preço do produto na KaBuM. Quando ele está numa campanha ("OFERTAS KABUM"), o preço
// de verdade fica em p.offer; os campos de fora continuam com o preço antigo (bem mais alto).
function precoKabum(p) {
  const agora = Date.now() / 1000;
  const o = p.offer;
  const ofertaValendo = o && o.priceWithDiscount > 0 &&
    (!o.startsAt || o.startsAt <= agora) && (!o.endsAt || agora < o.endsAt) &&
    (o.quantityAvailable == null || o.quantityAvailable > 0);

  if (ofertaValendo) return { preco: o.priceWithDiscount, precoNormal: o.price || null };
  return { preco: p.priceWithDiscount || p.price, precoNormal: p.price };
}

function kabumParaOferta(p) {
  const { preco, precoNormal } = precoKabum(p);
  return {
    loja: "KaBuM!",
    codigo: p.code,
    titulo: p.name,
    preco: preco,
    precoNormal: precoNormal,
    link: "https://www.kabum.com.br/produto/" + p.code + "/" + p.friendlyName,
    foto: p.image
  };
}

async function buscarKabum(produto) {
  const termo = produto.busca.trim().replace(/\s+/g, "-");
  const lista = await listarKabum("https://www.kabum.com.br/busca/" + encodeURIComponent(termo));
  const ofertas = lista
    .filter((p) => p.available)
    .map(kabumParaOferta)
    .filter((o) => anuncioServe(o.titulo, o.preco, produto));

  ofertas.sort((a, b) => a.preco - b.preco);
  return ofertas[0] || null;
}

// ----- Mais vendidos e mais procurados da KaBuM -----
// Categorias da KaBuM que viram categorias do site (minimo = preço mínimo aceito)
const CATEGORIAS_KABUM = [
  { caminho: "processadores", nomeKabum: "Processadores", categoria: "Processadores", minimo: 300 },
  { caminho: "placa-de-video-vga", nomeKabum: "Placa de vídeo (VGA)", categoria: "Placas de vídeo", minimo: 800 },
  { caminho: "memoria-ram", nomeKabum: "Memória RAM", categoria: "Memória RAM", minimo: 60 },
  { caminho: "ssd-2-5", nomeKabum: "SSD", categoria: "Armazenamento", minimo: 100 },
  { caminho: "placas-mae", nomeKabum: "Placas-mãe", categoria: "Placas-mãe", minimo: 300 },
  { caminho: "fontes", nomeKabum: "Fontes", categoria: "Fontes", minimo: 150 }
];
const MAIS_PROCURADOS_POR_CATEGORIA = 10;

// Produto da KaBuM serve? (vendido pela própria KaBuM, disponível, sem kit/combo/notebook...)
function kabumServe(p, categoriaKabum) {
  const preco = precoKabum(p).preco;
  if (!p.available || p.sellerName !== "KaBuM!" || !preco || preco < categoriaKabum.minimo) return false;
  if (EXCLUIR_SEMPRE.test(p.name)) return false;
  if (categoriaKabum.categoria !== "Memória RAM" && EXCLUIR_KIT.test(p.name)) return false;
  return true;
}

// Lê os rankings da KaBuM. Devolve um Map: código do produto -> { popularidade, selo, categoria, p }
// popularidade: número menor = mais popular (mais vendidos vêm primeiro, depois os mais procurados)
async function lerRankingKabum() {
  const ranking = new Map();

  try {
    const lista = await listarKabum("https://www.kabum.com.br/promocao/maisvendidos");
    let posicao = 0;
    for (const p of lista) {
      const segunda = (p.category || "").split("/")[1];
      const categoriaKabum = CATEGORIAS_KABUM.find((c) => c.nomeKabum === segunda);
      if (!categoriaKabum || !kabumServe(p, categoriaKabum)) continue;
      posicao++;
      ranking.set(p.code, { popularidade: posicao, selo: "Mais vendido", categoria: categoriaKabum.categoria, minimo: categoriaKabum.minimo, p });
    }
    console.log("Mais vendidos da KaBuM: " + posicao + " peças de hardware");
  } catch (erro) {
    console.log("Não consegui ler os mais vendidos da KaBuM: " + erro.message);
  }
  await esperar(1500);

  for (const categoriaKabum of CATEGORIAS_KABUM) {
    try {
      const lista = await listarKabum("https://www.kabum.com.br/hardware/" + categoriaKabum.caminho);
      let posicao = 0;
      for (const p of lista) {
        if (posicao >= MAIS_PROCURADOS_POR_CATEGORIA) break;
        if (!kabumServe(p, categoriaKabum)) continue;
        posicao++;
        if (!ranking.has(p.code)) {
          ranking.set(p.code, { popularidade: 100 + posicao, selo: null, categoria: categoriaKabum.categoria, minimo: categoriaKabum.minimo, p });
        }
      }
      console.log("Mais procurados em " + categoriaKabum.categoria + ": " + posicao);
    } catch (erro) {
      console.log("Não consegui ler " + categoriaKabum.categoria + " na KaBuM: " + erro.message);
    }
    await esperar(1500);
  }

  return ranking;
}

// "Memória RAM Kingston Fury Beast, 8GB, 3200MHz, DDR4, CL16, Preto - KF432C16BB/8"
//   -> "Memória RAM Kingston Fury Beast 8GB 3200MHz DDR4"
function nomeCurto(nomeKabum) {
  const partes = nomeKabum.split(" - ")[0].split(",").map((s) => s.trim()).filter(Boolean);
  let nome = partes[0];
  for (const parte of partes.slice(1)) {
    if (nome.length < 70 && /^\d+\s?(gb|tb|w)\b|^\d{4}\s?mhz|^ddr\d|^80 plus/i.test(parte)) nome += " " + parte;
  }
  nome = nome
    .replace(/\s+/g, " ")
    .replace(/^Memoria /i, "Memória ")
    .replace(/^Placa[- ]M[ãa]e /i, "Placa-mãe ")
    .replace(/^Placa de V[íi]deo /i, "Placa de vídeo ")
    // "RTX 5060 ... NVIDIA GeForce" / "RX 9070 XT ... WITH AMD Radeon": a marca do chip já está implícita
    .replace(/\s+(with\s+)?(nvidia\s+geforce|amd\s+radeon)\b/gi, "")
    .replace(/\s+(gaming edition|triple fan|dual channel)\b/gi, "")
    .trim();

  // Corta nomes muito longos no fim de uma palavra
  if (nome.length > 60) nome = nome.slice(0, 60).replace(/\s+\S*$/, "");
  return nome;
}

// Código do fabricante no fim do nome da KaBuM ("... - KF432C16BB/8")
function codigoFabricante(nomeKabum) {
  const partes = nomeKabum.split(" - ");
  if (partes.length < 2) return null;
  const codigo = partes[partes.length - 1].trim();
  return codigo.replace(/[^a-z0-9]/gi, "").length >= 5 ? codigo : null;
}

// Expressão que acha o código do fabricante num título, aceitando espaços, hífens ou barras no meio
function regexDoCodigo(codigo) {
  const letras = codigo.replace(/[^a-z0-9]/gi, "").split("");
  return new RegExp(letras.join("[\\s\\-_/.]*"), "i");
}

// ----- Amazon -----
function lerPrecoAmazon(trecho) {
  const m = trecho.match(/class="a-price-whole">([\d.]+)<span class="a-price-decimal">,<\/span><\/span><span class="a-price-fraction">(\d+)/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, "") + "." + m[2]);
}

async function buscarAmazon(produto) {
  const html = await baixarTexto("https://www.amazon.com.br/s?k=" + encodeURIComponent(produto.busca));
  const blocos = html.split('data-component-type="s-search-result"').slice(1);

  const ofertas = blocos
    .map(function (bloco) {
      const asin = (bloco.match(/data-asin="([A-Z0-9]{10})"/) || [])[1];
      const titulo =
        (bloco.match(/<h2[^>]*aria-label="([^"]+)"/) || [])[1] ||
        (bloco.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/) || [])[1];
      const foto = (bloco.match(/class="s-image"[^>]*src="([^"]+)"/) || [])[1];
      return {
        loja: "Amazon",
        titulo: titulo && titulo.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/^Patrocinado[^,]*, /, "").trim(),
        preco: lerPrecoAmazon(bloco),
        link: asin ? "https://www.amazon.com.br/dp/" + asin : null,
        foto: foto
      };
    })
    .filter((o) => o.link && anuncioServe(o.titulo, o.preco, produto));

  ofertas.sort((a, b) => a.preco - b.preco);
  return ofertas[0] || null;
}

// ----- Fotos -----
function criarSlug(texto) {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function baixarFoto(url, nomeArquivo) {
  const resposta = await fetch(url, { headers: { "User-Agent": NAVEGADOR } });
  if (!resposta.ok) throw new Error("HTTP " + resposta.status);
  fs.writeFileSync(path.join(PASTA_FOTOS, nomeArquivo), Buffer.from(await resposta.arrayBuffer()));
}

// ----- Principal -----

// Baixa a foto (prefere a da KaBuM, que tem fundo branco) e devolve o nome do arquivo
async function salvarFoto(nome, ofertas) {
  const comFoto = ofertas.find((o) => o.foto);
  if (!comFoto) return null;
  const extensao = (comFoto.foto.match(/\.(jpe?g|png|webp)(\?|$)/i) || [, "jpg"])[1].toLowerCase();
  const arquivo = criarSlug(nome) + "." + extensao;
  try {
    await baixarFoto(comFoto.foto, arquivo);
    return arquivo;
  } catch (erro) {
    return null;
  }
}

function montarProduto(nome, categoria, imagem, ofertas, rank) {
  return {
    slug: criarSlug(nome),
    nome: nome,
    categoria: categoria,
    imagem: imagem,
    popularidade: rank ? rank.popularidade : null,
    selo: rank ? rank.selo : null,
    ofertas: ofertas.map(({ foto, codigo, ...resto }) => resto)
  };
}

async function principal() {
  fs.mkdirSync(PASTA_FOTOS, { recursive: true });
  const resultado = [];
  const codigosUsados = new Set();
  const slugsUsados = new Set();
  const resultadoDaListaFixa = new Map(); // produto da lista fixa -> item salvo

  // 1) Rankings da KaBuM (mais vendidos + mais procurados de cada categoria)
  const ranking = await lerRankingKabum();

  // 2) Produtos da lista fixa
  for (const produto of PRODUTOS) {
    process.stdout.write("Buscando " + produto.nome + "... ");
    const ofertas = [];

    for (const buscar of [buscarKabum, buscarAmazon]) {
      try {
        const oferta = await buscar(produto);
        if (oferta) ofertas.push(oferta);
      } catch (erro) {
        process.stdout.write("[" + buscar.name + " falhou: " + erro.message + "] ");
      }
      await esperar(1500); // espera um pouco entre as buscas para não sobrecarregar as lojas
    }

    if (ofertas.length === 0) {
      console.log("nenhuma oferta encontrada, produto ignorado.");
      continue;
    }

    const kabum = ofertas.find((o) => o.loja === "KaBuM!");
    if (kabum) codigosUsados.add(kabum.codigo);
    slugsUsados.add(criarSlug(produto.nome));

    const imagem = await salvarFoto(produto.nome, ofertas);
    const salvo = montarProduto(produto.nome, produto.categoria, imagem, ofertas, kabum && ranking.get(kabum.codigo));
    resultado.push(salvo);
    resultadoDaListaFixa.set(produto, salvo);
    console.log(ofertas.map((o) => o.loja + " R$ " + o.preco.toFixed(2)).join(" | "));
  }

  // 3) Produtos descobertos nos rankings da KaBuM (os que ainda não estão na lista fixa)
  for (const [codigo, item] of ranking) {
    if (codigosUsados.has(codigo)) continue;

    // Mesmo modelo de um produto da lista fixa (outro anúncio do mesmo item)?
    // Não duplica: só passa o ranking para o produto da lista fixa.
    const igual = PRODUTOS.find((pf) => pf.categoria === item.categoria && anuncioServe(item.p.name, precoKabum(item.p).preco, pf));
    if (igual) {
      const salvo = resultadoDaListaFixa.get(igual);
      if (salvo && (salvo.popularidade === null || item.popularidade < salvo.popularidade)) {
        salvo.popularidade = item.popularidade;
        salvo.selo = salvo.selo || item.selo;
      }
      continue;
    }

    const nome = nomeCurto(item.p.name);
    const slug = criarSlug(nome);
    if (slugsUsados.has(slug)) continue; // mesmo modelo em outra cor/versão
    slugsUsados.add(slug);

    process.stdout.write("Mais " + (item.selo ? "vendido" : "procurado") + ": " + nome + "... ");
    const ofertas = [kabumParaOferta(item.p)];

    // Na Amazon, só aceita o anúncio se tiver o MESMO código do fabricante
    const codigoFab = codigoFabricante(item.p.name);
    if (codigoFab) {
      try {
        const amazon = await buscarAmazon({ busca: nome, categoria: item.categoria, minimo: item.minimo, precisa: [regexDoCodigo(codigoFab)] });
        if (amazon) ofertas.push(amazon);
      } catch (erro) {
        process.stdout.write("[Amazon falhou: " + erro.message + "] ");
      }
      await esperar(1500);
    }

    const imagem = await salvarFoto(nome, ofertas);
    resultado.push(montarProduto(nome, item.categoria, imagem, ofertas, item));
    console.log(ofertas.map((o) => o.loja + " R$ " + o.preco.toFixed(2)).join(" | "));
  }

  const agora = new Date();
  const conteudo =
    "// Arquivo gerado automaticamente por scripts/atualizar-precos.js\n" +
    "// Para atualizar: node scripts/atualizar-precos.js\n" +
    "const ATUALIZADO_EM = " + JSON.stringify(agora.toISOString()) + ";\n\n" +
    "const PRODUTOS = " + JSON.stringify(resultado, null, 2) + ";\n";

  fs.writeFileSync(ARQUIVO_SAIDA, conteudo, "utf8");
  console.log("\nPronto! " + resultado.length + " produtos salvos em js/produtos.js");

  await enviarParaSupabase(resultado, agora.toISOString());
}

// ----- Supabase -----
// Usa a API REST do Supabase direto, sem precisar instalar nada.
async function chamarSupabase(metodo, caminho, corpo) {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cabecalhos = {
    apikey: chave,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal"
  };
  // Chaves antigas (JWT, começam com "eyJ") também vão no Authorization
  if (chave.startsWith("eyJ")) cabecalhos.Authorization = "Bearer " + chave;

  const url = process.env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + caminho;
  const resposta = await fetch(url, { method: metodo, headers: cabecalhos, body: corpo && JSON.stringify(corpo) });
  const texto = await resposta.text();
  if (!resposta.ok) {
    const erro = new Error(metodo + " " + caminho.split("?")[0] + " -> HTTP " + resposta.status + ": " + texto);
    erro.status = resposta.status;
    throw erro;
  }
  return texto ? JSON.parse(texto) : null;
}

// As colunas "popularidade" e "selo" vêm do supabase/migracao-002-mais-vendidos.sql.
// Se ainda não foram criadas, o script continua funcionando, só sem o selo de mais vendido.
async function bancoTemColunasDeRanking() {
  try {
    await chamarSupabase("GET", "produtos?select=popularidade,selo&limit=1");
    return true;
  } catch (erro) {
    if (erro.status === 400) return false;
    throw erro;
  }
}

// Histórico: um preço por produto, loja e dia (rodar duas vezes no mesmo dia só atualiza).
// A tabela vem do supabase/migracao-003-historico-precos.sql; sem ela, o resto continua funcionando.
async function gravarHistorico(produtos, atualizadoEm) {
  // Dia no horário de Brasília (en-CA formata como AAAA-MM-DD)
  const dia = new Date(atualizadoEm).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  try {
    await chamarSupabase("POST", "historico_precos?on_conflict=produto_slug,loja,dia", produtos.flatMap((p) =>
      p.ofertas.map((o) => ({ produto_slug: p.slug, loja: o.loja, dia: dia, preco: o.preco }))));
    console.log("Histórico de preços de " + dia + " gravado.");
  } catch (erro) {
    if (erro.status === 404) {
      console.log("Aviso: rode o supabase/migracao-003-historico-precos.sql no Supabase para guardar o histórico de preços.");
    } else {
      throw erro;
    }
  }
}

async function enviarParaSupabase(produtos, atualizadoEm) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Supabase não configurado (.env), então nada foi enviado ao banco.");
    return;
  }

  console.log("Enviando " + produtos.length + " produtos ao Supabase...");

  const comRanking = await bancoTemColunasDeRanking();
  if (!comRanking) {
    console.log("Aviso: rode o supabase/migracao-002-mais-vendidos.sql no Supabase para ativar o selo \"Mais vendido\".");
  }

  // 1) Produtos: cria os novos e atualiza os que já existem
  await chamarSupabase("POST", "produtos?on_conflict=slug", produtos.map((p) => ({
    slug: p.slug,
    nome: p.nome,
    categoria: p.categoria,
    imagem: p.imagem,
    atualizado_em: atualizadoEm,
    ...(comRanking ? { popularidade: p.popularidade ?? null, selo: p.selo ?? null } : {})
  })));

  // 2) Ofertas: grava as novas por cima das antigas (mesmo produto + loja = atualiza).
  // Primeiro grava, depois limpa: se algo falhar no meio, o site continua com preço.
  await chamarSupabase("POST", "ofertas?on_conflict=produto_slug,loja", produtos.flatMap((p) => p.ofertas.map((o) => ({
    produto_slug: p.slug,
    loja: o.loja,
    titulo: o.titulo,
    preco: o.preco,
    preco_normal: o.precoNormal || null,
    link: o.link,
    atualizado_em: atualizadoEm
  }))));

  await gravarHistorico(produtos, atualizadoEm);

  // Ofertas de uma loja que não tem mais o produto saem do banco
  const lojasNovas = new Set(produtos.flatMap((p) => p.ofertas.map((o) => p.slug + "|" + o.loja)));
  const slugsNovos = new Set(produtos.map((p) => p.slug));
  const ofertasNoBanco = (await chamarSupabase("GET", "ofertas?select=id,produto_slug,loja")) || [];
  // Se uma loja não devolveu nada hoje (fora do ar ou bloqueou a busca), as ofertas dela ficam
  const lojasQueResponderam = new Set(produtos.flatMap((p) => p.ofertas.map((o) => o.loja)));
  const ofertasVelhas = ofertasNoBanco
    .filter((o) => slugsNovos.has(o.produto_slug) && lojasQueResponderam.has(o.loja) &&
      !lojasNovas.has(o.produto_slug + "|" + o.loja))
    .map((o) => o.id);
  if (ofertasVelhas.length > 0) {
    await chamarSupabase("DELETE", "ofertas?id=in.(" + ofertasVelhas.join(",") + ")");
  }

  // 3) Produtos que saíram da lista (ex.: deixaram de ser mais procurados).
  // Só mexe neles se a busca de hoje veio completa.
  const noBanco = (await chamarSupabase("GET", "produtos?select=slug")) || [];
  const sairam = noBanco.map((p) => p.slug).filter((slug) => !slugsNovos.has(slug));
  if (sairam.length > 0 && produtos.length >= noBanco.length * 0.7) {
    // Quem está nos favoritos de alguém não é apagado (apagar levaria o favorito junto):
    // só perde as ofertas, então some do site e volta com favorito e tudo se entrar na lista de novo.
    const favoritados = new Set(((await chamarSupabase("GET", "favoritos?select=produto_slug")) || []).map((f) => f.produto_slug));
    const guardar = sairam.filter((slug) => favoritados.has(slug));
    const apagar = sairam.filter((slug) => !favoritados.has(slug));

    if (guardar.length > 0) {
      await chamarSupabase("DELETE", "ofertas?produto_slug=in.(" + guardar.join(",") + ")");
    }
    if (apagar.length > 0) {
      await chamarSupabase("DELETE", "produtos?slug=in.(" + apagar.join(",") + ")");
    }
    console.log(sairam.length + " produto(s) saíram da lista: " + apagar.length + " removido(s), " +
      guardar.length + " guardado(s) porque estão nos favoritos de alguém.");
  } else if (sairam.length > 0) {
    console.log("A busca de hoje veio bem menor que o normal; não mexi nos produtos antigos por segurança.");
  }

  console.log("Supabase atualizado!");
}

// Envia o js/produtos.js que já existe, sem buscar nas lojas de novo
async function soEnviar() {
  const codigo = fs.readFileSync(ARQUIVO_SAIDA, "utf8");
  const { PRODUTOS: produtos, ATUALIZADO_EM: data } =
    new Function(codigo + "; return { PRODUTOS, ATUALIZADO_EM };")();
  await enviarParaSupabase(produtos.map((p) => ({ ...p, slug: p.slug || criarSlug(p.nome) })), data);
}

const execucao = process.argv.includes("--so-enviar") ? soEnviar() : principal();
execucao.catch(function (erro) {
  console.error("\nErro: " + erro.message);
  process.exitCode = 1;
});
