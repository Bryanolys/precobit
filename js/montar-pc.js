// ===== Monte seu PC =====
// O usuário escolhe uma peça de cada tipo; a página soma o menor preço,
// estima o consumo e confere se as peças combinam entre si.
// As especificações (soquete, DDR4/DDR5, watts) são lidas do nome das peças.

// Tipos de peça, na ordem em que aparecem na tela
const PECAS = [
  { categoria: "Processadores", nome: "Processador" },
  { categoria: "Placas-mãe", nome: "Placa-mãe" },
  { categoria: "Memória RAM", nome: "Memória RAM" },
  { categoria: "Placas de vídeo", nome: "Placa de vídeo" },
  { categoria: "Armazenamento", nome: "Armazenamento" },
  { categoria: "Fontes", nome: "Fonte" }
];

const CHAVE_SALVA = "precobit-montagem";

let produtosPorSlug = new Map(); // slug -> produto (com o resumo de preços)
let escolhas = {};               // categoria -> produto escolhido
let categoriaEscolhendo = null;  // tipo de peça aberto na janela de escolha

const listaPecas = document.getElementById("lista-pecas");
const janela = document.getElementById("janela-escolha");
const buscaEscolha = document.getElementById("busca-escolha");
const opcoesEscolha = document.getElementById("opcoes-escolha");
const mensagemPc = document.getElementById("mensagem-pc");

// ===== Especificações lidas do nome =====

// Chipsets de placa-mãe e o soquete de cada um
const CHIPSETS = {
  "AM4": ["A320", "B350", "X370", "B450", "X470", "A520", "B550", "X570"],
  "AM5": ["A620", "B650", "X670", "B840", "B850", "X870"],
  "LGA 1700": ["H610", "B660", "H670", "Z690", "B760", "H770", "Z790"],
  "LGA 1851": ["H810", "B860", "Z890"]
};

// Consumo máximo aproximado dos processadores (watts)
const CONSUMO_PROCESSADOR = [
  [/9950X3D/i, 230],
  [/9900X/i, 162],
  [/[79]800X3D/i, 162],
  [/9600X/i, 88],
  [/5900XT/i, 142],
  [/5800X3D/i, 142],
  [/5700X|5700G|5600|5500/i, 88],
  [/Ultra\s*7\s*265K/i, 250],
  [/14400/i, 148],
  [/12400/i, 117]
];

// Consumo das placas de vídeo (watts, segundo os fabricantes)
const CONSUMO_PLACA_VIDEO = [
  [/RTX\s?5090/i, 575],
  [/RTX\s?5080/i, 360],
  [/RTX\s?5070\s?Ti/i, 300],
  [/RTX\s?5070/i, 250],
  [/RTX\s?5060\s?Ti/i, 180],
  [/RTX\s?5060/i, 145],
  [/RTX\s?5050/i, 130],
  [/RTX\s?3050.*6\s?GB/i, 70],
  [/RTX\s?3050/i, 130],
  [/RX\s?9070\s?XT/i, 304],
  [/RX\s?9070/i, 220],
  [/RX\s?9060\s?XT/i, 160],
  [/RX\s?7600/i, 165],
  [/RX\s?580/i, 185]
];

// Placa-mãe, memória, SSD e ventoinhas juntos
const CONSUMO_RESTO = 60;

function buscarNaTabela(tabela, texto, padrao) {
  const linha = tabela.find(([regra]) => regra.test(texto));
  return linha ? linha[1] : padrao;
}

// Nome + títulos dos anúncios: os títulos costumam trazer mais detalhes
function textoCompleto(produto) {
  return produto.nome + " " + produto.ofertas.map((o) => o.titulo || "").join(" ");
}

function soqueteNoTexto(texto) {
  if (/\bAM5\b/i.test(texto)) return "AM5";
  if (/\bAM4\b/i.test(texto)) return "AM4";
  if (/LGA\s?1851/i.test(texto)) return "LGA 1851";
  if (/LGA\s?1700/i.test(texto)) return "LGA 1700";
  return null;
}

function ddrNoTexto(texto) {
  if (/DDR5/i.test(texto)) return "DDR5";
  if (/DDR4|\bD4\b/i.test(texto)) return "DDR4";
  return null;
}

function specsProcessador(produto) {
  const nome = produto.nome;
  let soquete = null;

  const ryzen = nome.match(/Ryzen\s+\d\s+(\d)\d{3}/i);
  if (ryzen) soquete = ryzen[1] === "5" ? "AM4" : "AM5";       // Ryzen 5000 = AM4; 7000/9000 = AM5
  else if (/Core\s+Ultra/i.test(nome)) soquete = "LGA 1851";
  else if (/i\d-1[234]\d{3}/i.test(nome)) soquete = "LGA 1700"; // Intel de 12ª a 14ª geração
  else soquete = soqueteNoTexto(textoCompleto(produto));

  // Vídeo integrado: Ryzen AM5 sempre tem; Ryzen AM4 só os "G"; Intel só sem "F"
  let videoIntegrado;
  if (ryzen) videoIntegrado = soquete === "AM5" || /\d{4}G\b/i.test(nome);
  else videoIntegrado = !/\d+K?F\b/i.test(nome);

  return {
    soquete: soquete,
    videoIntegrado: videoIntegrado,
    watts: buscarNaTabela(CONSUMO_PROCESSADOR, nome, 120),
    // Memória que o soquete aceita (LGA 1700 aceita as duas, depende da placa)
    ddr: soquete === "AM4" ? "DDR4" : soquete === "AM5" || soquete === "LGA 1851" ? "DDR5" : null
  };
}

function specsPlacaMae(produto) {
  const chipset = (produto.nome.match(/\b[ABHXZ]\d{3}/i) || [""])[0].toUpperCase();
  let soquete = Object.keys(CHIPSETS).find((s) => CHIPSETS[s].includes(chipset)) || null;
  if (!soquete) soquete = soqueteNoTexto(textoCompleto(produto));

  let ddr = ddrNoTexto(produto.nome);
  if (!ddr && soquete === "AM5") ddr = "DDR5";
  if (!ddr && soquete === "AM4") ddr = "DDR4";
  if (!ddr) ddr = ddrNoTexto(textoCompleto(produto));

  return { chipset: chipset, soquete: soquete, ddr: ddr };
}

function specsMemoria(produto) {
  return { ddr: ddrNoTexto(produto.nome) || ddrNoTexto(textoCompleto(produto)) };
}

function specsPlacaVideo(produto) {
  return { watts: buscarNaTabela(CONSUMO_PLACA_VIDEO, produto.nome, 200) };
}

function specsFonte(produto) {
  // Alguns nomes não trazem o "W" (ex.: "MWE Gold 750"); aí procura nos títulos dos anúncios
  const potencia = produto.nome.match(/(\d{3,4})\s?W\b/i) || textoCompleto(produto).match(/(\d{3,4})\s?W\b/i);
  return { potencia: potencia ? Number(potencia[1]) : null };
}

function specsArmazenamento(produto) {
  return { externo: /\bUSB\b|portátil/i.test(textoCompleto(produto)) };
}

const LER_SPECS = {
  "Processadores": specsProcessador,
  "Placas-mãe": specsPlacaMae,
  "Memória RAM": specsMemoria,
  "Placas de vídeo": specsPlacaVideo,
  "Fontes": specsFonte,
  "Armazenamento": specsArmazenamento
};

// ===== Consumo e compatibilidade =====

function calcularConsumo(pecas) {
  const cpu = pecas["Processadores"];
  const gpu = pecas["Placas de vídeo"];
  if (!cpu && !gpu) return null;

  const total = (cpu ? cpu.specs.watts : 0) + (gpu ? gpu.specs.watts : 0) + CONSUMO_RESTO;
  // 40% de folga, arredondado para cima no próximo múltiplo de 50 W
  return { total: total, recomendada: Math.ceil((total * 1.4) / 50) * 50 };
}

// Devolve a lista de checagens: { tipo: "ok" | "aviso" | "erro" | "info", texto, pecas }
// "pecas" diz quais tipos de peça estão envolvidos (usado para marcar as opções incompatíveis)
function verificar(pecas) {
  const itens = [];
  const cpu = pecas["Processadores"];
  const placa = pecas["Placas-mãe"];
  const ram = pecas["Memória RAM"];
  const gpu = pecas["Placas de vídeo"];
  const fonte = pecas["Fontes"];
  const disco = pecas["Armazenamento"];

  // Soquete: processador x placa-mãe
  if (cpu && placa) {
    const a = cpu.specs.soquete;
    const b = placa.specs.soquete;
    if (!a || !b) {
      itens.push({ tipo: "aviso", texto: "Não deu para identificar o soquete. Confira se o processador encaixa na placa-mãe.", pecas: ["Processadores", "Placas-mãe"] });
    } else if (a === b) {
      itens.push({ tipo: "ok", texto: `Processador e placa-mãe usam o mesmo soquete (${a}).`, pecas: ["Processadores", "Placas-mãe"] });
    } else {
      itens.push({ tipo: "erro", texto: `O processador é ${a} e a placa-mãe é ${b}: eles não encaixam.`, pecas: ["Processadores", "Placas-mãe"] });
    }
  }

  // Memória: placa-mãe x RAM (ou processador x RAM, se ainda não tem placa)
  const quemDefineDdr = placa ? placa : cpu;
  const categoriaDdr = placa ? "Placas-mãe" : "Processadores";
  if (ram && quemDefineDdr && quemDefineDdr.specs.ddr && ram.specs.ddr) {
    const aceita = quemDefineDdr.specs.ddr;
    const nomeQuem = placa ? "A placa-mãe" : "O processador";
    if (aceita === ram.specs.ddr) {
      itens.push({ tipo: "ok", texto: `${nomeQuem} aceita ${aceita}, igual à memória.`, pecas: [categoriaDdr, "Memória RAM"] });
    } else {
      itens.push({ tipo: "erro", texto: `${nomeQuem} aceita ${aceita}, mas a memória é ${ram.specs.ddr}.`, pecas: [categoriaDdr, "Memória RAM"] });
    }
  }

  // Vídeo: sem placa de vídeo, o processador precisa ter vídeo integrado
  if (cpu && !gpu) {
    if (cpu.specs.videoIntegrado) {
      itens.push({ tipo: "info", texto: "Sem placa de vídeo: o PC usa o vídeo do processador. Serve para estudo e trabalho, mas é fraco para jogos.", pecas: ["Processadores", "Placas de vídeo"] });
    } else {
      // "faltaPeca": o problema some quando a peça que falta for escolhida
      itens.push({ tipo: "erro", texto: "Esse processador não tem vídeo integrado: sem placa de vídeo, o PC não mostra imagem.", pecas: ["Processadores", "Placas de vídeo"], faltaPeca: true });
    }
  }

  // Fonte: potência x consumo
  const consumo = calcularConsumo(pecas);
  if (fonte && consumo && fonte.specs.potencia) {
    const w = fonte.specs.potencia;
    const envolvidas = ["Fontes", "Processadores", "Placas de vídeo"];
    if (w < consumo.total) {
      itens.push({ tipo: "erro", texto: `A fonte de ${w} W é fraca: as peças consomem cerca de ${consumo.total} W.`, pecas: envolvidas });
    } else if (w < consumo.recomendada) {
      itens.push({ tipo: "aviso", texto: `A fonte de ${w} W funciona, mas fica no limite. O ideal é ${consumo.recomendada} W ou mais.`, pecas: envolvidas });
    } else {
      itens.push({ tipo: "ok", texto: `A fonte de ${w} W dá conta dos ~${consumo.total} W com folga.`, pecas: envolvidas });
    }
  }

  if (disco && disco.specs.externo) {
    itens.push({ tipo: "aviso", texto: "Esse SSD é externo (USB): ele não é instalado dentro do PC.", pecas: ["Armazenamento"] });
  }

  // Peças que faltam (a placa de vídeo só é obrigatória sem vídeo integrado)
  const faltando = PECAS
    .filter((p) => !pecas[p.categoria])
    .filter((p) => p.categoria !== "Placas de vídeo" || (cpu && !cpu.specs.videoIntegrado))
    .map((p) => p.nome.toLowerCase().replace("ram", "RAM"));
  if (faltando.length > 0 && Object.keys(pecas).length > 0) {
    itens.push({ tipo: "info", texto: "Ainda falta escolher: " + faltando.join(", ") + ".", pecas: [] });
  }

  return itens;
}

// Problemas que uma opção traria se fosse escolhida para o tipo "categoria"
function problemasDaOpcao(categoria, produto) {
  const hipotese = { ...escolhas, [categoria]: produto };
  return verificar(hipotese).filter((i) => (i.tipo === "erro" || i.tipo === "aviso") && i.pecas.includes(categoria) && !i.faltaPeca);
}

// ===== Tela =====

function mostrarPecas() {
  const checagens = verificar(escolhas);

  listaPecas.innerHTML = PECAS.map(function (peca) {
    const produto = escolhas[peca.categoria];
    const temErro = checagens.some((i) => i.tipo === "erro" && !i.faltaPeca && i.pecas.includes(peca.categoria) && produto);
    const opcional = peca.categoria === "Placas de vídeo" ? ' <em class="peca-opcional">opcional se o processador tiver vídeo</em>' : "";

    if (!produto) {
      return `
        <article class="peca vazia">
          <img class="peca-foto" src="${IMAGENS_CATEGORIA[peca.categoria]}" alt="">
          <div class="peca-info">
            <span class="peca-tipo">${peca.nome}${opcional}</span>
            <strong>Nenhuma escolhida</strong>
          </div>
          <div class="peca-acoes">
            <button type="button" class="botao-escolher" data-categoria="${peca.categoria}">Escolher</button>
          </div>
        </article>`;
    }

    return `
      <article class="peca${temErro ? " com-erro" : ""}">
        <img class="peca-foto" src="${imagemDoProduto(produto)}" alt=""
             onerror="this.onerror=null; this.src='${IMAGENS_CATEGORIA[peca.categoria]}'">
        <div class="peca-info">
          <span class="peca-tipo">${peca.nome}</span>
          <strong>${escapar(produto.nome)}</strong>
          <span class="na-loja">${formatarPreco(produto.melhor.preco)} na <strong>${escapar(produto.melhor.loja)}</strong></span>
        </div>
        <div class="peca-acoes">
          <a class="botao-ver" href="${escapar(produto.melhor.link)}" target="_blank" rel="noopener">Ver oferta ↗</a>
          <button type="button" class="botao-escolher secundario" data-categoria="${peca.categoria}">Trocar</button>
        </div>
      </article>`;
  }).join("");

  mostrarResumo(checagens);
}

function mostrarResumo(checagens) {
  const escolhidas = Object.values(escolhas);
  const total = escolhidas.reduce((soma, p) => soma + p.melhor.preco, 0);

  document.getElementById("total-pc").textContent = formatarPreco(total);
  document.getElementById("pecas-escolhidas").textContent = escolhidas.length === 0
    ? "Nenhuma peça escolhida"
    : escolhidas.length + " de " + PECAS.length + " peças escolhidas";

  const consumo = calcularConsumo(escolhas);
  document.getElementById("consumo-estimado").textContent = consumo ? "~" + consumo.total + " W" : "-";
  document.getElementById("fonte-recomendada").textContent = consumo ? consumo.recomendada + " W ou mais" : "-";

  const icones = { ok: "✓", aviso: "!", erro: "✕", info: "i" };
  document.getElementById("checagens").innerHTML = checagens.length === 0
    ? '<li class="checagem checagem-info"><span>i</span>Escolha as peças para ver se elas combinam.</li>'
    : checagens.map((i) => `<li class="checagem checagem-${i.tipo}"><span>${icones[i.tipo]}</span>${escapar(i.texto)}</li>`).join("");

  document.getElementById("copiar-link").disabled = escolhidas.length === 0;
  document.getElementById("limpar-pc").disabled = escolhidas.length === 0;
}

// ===== Janela de escolha =====

function abrirEscolha(categoria) {
  categoriaEscolhendo = categoria;
  const peca = PECAS.find((p) => p.categoria === categoria);
  document.getElementById("titulo-escolha").textContent = "Escolher " + peca.nome.toLowerCase();
  buscaEscolha.value = "";
  mostrarOpcoes();
  janela.showModal();
  buscaEscolha.focus();
}

function mostrarOpcoes() {
  const termo = buscaEscolha.value.trim().toLowerCase();
  const atual = escolhas[categoriaEscolhendo];

  const opcoes = [...produtosPorSlug.values()]
    .filter((p) => p.categoria === categoriaEscolhendo && p.nome.toLowerCase().includes(termo))
    .map((p) => ({ produto: p, problemas: problemasDaOpcao(categoriaEscolhendo, p) }));

  // Compatíveis primeiro; dentro de cada grupo, do mais barato ao mais caro
  const temErro = (o) => o.problemas.some((i) => i.tipo === "erro");
  opcoes.sort((a, b) => temErro(a) - temErro(b) || a.produto.melhor.preco - b.produto.melhor.preco);

  let html = atual
    ? `<li><button type="button" class="opcao opcao-remover" data-slug="">Remover ${escapar(atual.nome)}</button></li>`
    : "";

  if (opcoes.length === 0) {
    html += '<li class="vazio">Nenhuma peça encontrada.</li>';
  }

  html += opcoes.map(function ({ produto, problemas }) {
    const erro = problemas.find((i) => i.tipo === "erro");
    const aviso = problemas.find((i) => i.tipo === "aviso");
    const nota = erro
      ? `<span class="opcao-nota opcao-erro">✕ ${escapar(erro.texto)}</span>`
      : aviso ? `<span class="opcao-nota opcao-aviso">! ${escapar(aviso.texto)}</span>` : "";
    const classes = "opcao" + (erro ? " incompativel" : "") + (atual && atual.slug === produto.slug ? " atual" : "");

    return `
      <li>
        <button type="button" class="${classes}" data-slug="${escapar(produto.slug)}">
          <img src="${imagemDoProduto(produto)}" alt="" loading="lazy"
               onerror="this.onerror=null; this.src='${IMAGENS_CATEGORIA[produto.categoria]}'">
          <span class="opcao-info">
            <strong>${escapar(produto.nome)}</strong>
            ${nota}
          </span>
          <span class="opcao-preco">${formatarPreco(produto.melhor.preco)}<small>${escapar(produto.melhor.loja)}</small></span>
        </button>
      </li>`;
  }).join("");

  opcoesEscolha.innerHTML = html;
}

listaPecas.addEventListener("click", function (evento) {
  const botao = evento.target.closest(".botao-escolher");
  if (botao) abrirEscolha(botao.dataset.categoria);
});

opcoesEscolha.addEventListener("click", function (evento) {
  const botao = evento.target.closest(".opcao");
  if (!botao) return;

  if (botao.dataset.slug) escolhas[categoriaEscolhendo] = produtosPorSlug.get(botao.dataset.slug);
  else delete escolhas[categoriaEscolhendo];

  janela.close();
  salvarMontagem();
  mostrarPecas();
});

buscaEscolha.addEventListener("input", mostrarOpcoes);
document.getElementById("fechar-escolha").addEventListener("click", () => janela.close());

// Clicar fora da janela também fecha
janela.addEventListener("click", function (evento) {
  if (evento.target === janela) janela.close();
});

// ===== Salvar e compartilhar =====
// A montagem fica no endereço da página (?pecas=slug1,slug2...), então o link
// pode ser enviado para outra pessoa. Também fica guardada neste navegador.

function salvarMontagem() {
  const slugs = Object.values(escolhas).map((p) => p.slug);
  const url = new URL(window.location.href);
  if (slugs.length) url.searchParams.set("pecas", slugs.join(","));
  else url.searchParams.delete("pecas");
  history.replaceState(null, "", url);

  try {
    localStorage.setItem(CHAVE_SALVA, slugs.join(","));
  } catch (erro) {
    // navegador sem armazenamento (modo anônimo, por exemplo): o link continua funcionando
  }
}

function carregarMontagemSalva() {
  let texto = new URL(window.location.href).searchParams.get("pecas");
  if (texto === null) {
    try {
      texto = localStorage.getItem(CHAVE_SALVA);
    } catch (erro) {
      texto = null;
    }
  }

  escolhas = {};
  for (const slug of (texto || "").split(",")) {
    const produto = produtosPorSlug.get(slug);
    if (produto) escolhas[produto.categoria] = produto; // ignora peças que saíram do site
  }
}

document.getElementById("copiar-link").addEventListener("click", async function () {
  try {
    await navigator.clipboard.writeText(window.location.href);
    mensagemPc.textContent = "Link copiado! É só colar e enviar.";
  } catch (erro) {
    window.prompt("Copie o link da montagem:", window.location.href);
  }
});

document.getElementById("limpar-pc").addEventListener("click", function () {
  escolhas = {};
  mensagemPc.textContent = "";
  salvarMontagem();
  mostrarPecas();
});

// ===== Início =====
async function iniciar() {
  const resultado = await buscarProdutos();

  produtosPorSlug = new Map();
  for (const produto of resultado.produtos) {
    if (!LER_SPECS[produto.categoria] || produto.ofertas.length === 0) continue;
    const comResumo = calcularResumo(produto);
    comResumo.specs = LER_SPECS[produto.categoria](comResumo);
    produtosPorSlug.set(produto.slug, comResumo);
  }

  const data = new Date(resultado.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  document.getElementById("atualizado-em").textContent = data;

  carregarMontagemSalva();
  mostrarPecas();
}

iniciar();
