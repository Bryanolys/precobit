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

// Consumo e força em jogos de processadores e placas de vídeo ficam em js/desempenho.js

// Placa-mãe, memória, SSD e ventoinhas juntos
const CONSUMO_RESTO = 60;

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

  const dados = dadosDoProcessador(nome);
  return {
    soquete: soquete,
    videoIntegrado: videoIntegrado,
    watts: dados ? dados.watts : 120,
    indice: dados ? dados.indice : null,
    // Força do vídeo integrado em jogos (usada quando não tem placa de vídeo)
    indiceVideo: videoIntegrado ? (dados && dados.videoIntegrado) || 7 : 0,
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

// Primeiro número com GB/TB no nome, em GB: "16GB (2x8)" -> 16, "SSD 1TB" -> 1000
function capacidadeEmGB(nome) {
  const m = nome.match(/(\d+)\s?(GB|TB)\b/i);
  if (!m) return null;
  return Number(m[1]) * (m[2].toUpperCase() === "TB" ? 1000 : 1);
}

function specsMemoria(produto) {
  return {
    ddr: ddrNoTexto(produto.nome) || ddrNoTexto(textoCompleto(produto)),
    gb: capacidadeEmGB(produto.nome)
  };
}

function specsPlacaVideo(produto) {
  const chip = chipDaPlaca(produto.nome);
  return {
    chip: chip ? chip.chip : null,
    watts: chip ? chip.watts : 200,
    indice: chip ? chip.indice : null
  };
}

function specsFonte(produto) {
  // Alguns nomes não trazem o "W" (ex.: "MWE Gold 750"); aí procura nos títulos dos anúncios
  const potencia = produto.nome.match(/(\d{3,4})\s?W\b/i) || textoCompleto(produto).match(/(\d{3,4})\s?W\b/i);
  return { potencia: potencia ? Number(potencia[1]) : null };
}

function specsArmazenamento(produto) {
  return {
    externo: /\bUSB\b|portátil/i.test(textoCompleto(produto)),
    gb: capacidadeEmGB(produto.nome)
  };
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

// ===== Desempenho em jogos =====

// FPS estimado da montagem (null se ainda não dá para calcular)
function desempenhoDaMontagem(pecas) {
  const cpu = pecas["Processadores"];
  const gpu = pecas["Placas de vídeo"];
  if (!cpu && !gpu) return null;

  if (gpu) {
    if (!gpu.specs.indice) return { semDados: true };
    return {
      fps: estimarFps(gpu.specs.indice, cpu && cpu.specs.indice),
      fonte: gpu.specs.chip,
      semProcessador: !cpu
    };
  }

  // Sem placa de vídeo: usa o vídeo integrado do processador (se tiver)
  if (!cpu.specs.indiceVideo) return null;
  return { fps: estimarFps(cpu.specs.indiceVideo, cpu.specs.indice), fonte: "vídeo integrado", integrado: true };
}

function mostrarDesempenho() {
  const caixa = document.getElementById("desempenho-pc");
  const d = desempenhoDaMontagem(escolhas);

  if (!d) {
    caixa.innerHTML = '<p class="desempenho-vazio">Escolha o processador e a placa de vídeo para ver quantos FPS o PC roda.</p>';
    return;
  }
  if (d.semDados) {
    caixa.innerHTML = '<p class="desempenho-vazio">Ainda não temos dados de desempenho dessa placa de vídeo.</p>';
    return;
  }

  const linhas = d.fps.map((j) => `
    <tr>
      <th scope="row">${j.jogo}</th>
      <td><strong>${j.fps1080}</strong> <span class="nivel ${j.nivel.classe}">${j.nivel.texto}</span></td>
      <td>${j.fps1440}</td>
    </tr>`).join("");

  const notas = [];
  if (d.integrado) notas.push("Sem placa de vídeo: usando o vídeo do processador.");
  if (d.semProcessador) notas.push("Considerando um processador à altura da placa.");

  caixa.innerHTML = `
    <table class="tabela-fps">
      <thead><tr><th scope="col">Jogo</th><th scope="col">1080p</th><th scope="col">1440p</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="desempenho-nota">${notas.concat("FPS médio estimado, gráficos no alto, sem ray tracing.").join(" ")}</p>`;
}

// ===== PCs prontos =====
// Cada PC pronto diz o que procura; as outras peças são escolhidas sozinhas:
// a placa-mãe, a memória e a fonte compatíveis mais baratas do dia.
// maisBarato: true = testa todos os processadores/placas da lista e fica com o PC de menor total;
// sem isso, vale a ordem da lista (a primeira peça que existir).
const PCS_PRONTOS = [
  { id: "estudo", nome: "PC para estudo e trabalho", jogos: "Navegar, estudar e jogos leves", maisBarato: true,
    processadores: [/5700G/i, /8500G/i, /i3-12100(?!F)/i, /i5-12400(?!F)/i], placas: [], ramGB: 16, ssdGB: 480 },
  { id: "entrada", nome: "PC gamer de entrada", jogos: "Valorant, CS2 e Fortnite", maisBarato: true,
    processadores: [/Ryzen 5 5500/i, /Ryzen 5 5600\b/i, /i3-12100/i], placas: [/RTX\s?3050/i, /RX\s?7600/i, /RTX\s?3060/i], ramGB: 16, ssdGB: 480 },
  { id: "1080p", nome: "PC gamer 1080p", jogos: "Jogos atuais em 1080p no alto",
    processadores: [/Ryzen 5 5600\b/i, /Ryzen 7 5700X\b/i, /12400F/i], placas: [/RTX\s?5060(?!\s?Ti)/i, /RX\s?7600/i, /RTX\s?5060\s?Ti/i], ramGB: 16, ssdGB: 1000 },
  { id: "1440p", nome: "PC gamer 1440p", jogos: "Jogos pesados em 1440p",
    processadores: [/7800X3D/i, /9600X/i, /5800X3D/i], placas: [/RTX\s?5070(?!\s?Ti)/i, /RX\s?9070/i], ramGB: 32, ssdGB: 1000 },
  { id: "topo", nome: "PC topo de linha", jogos: "Tudo no máximo e stream",
    processadores: [/9800X3D/i, /7800X3D/i], placas: [/RX\s?9070\s?XT/i, /RTX\s?5070/i], ramGB: 32, ssdGB: 2000 }
];

// Fontes com selo de eficiência (80 Plus / Cybenetics) são preferidas
const FONTE_CERTIFICADA = /80\s?plus|cybenetics|bronze|gold|platinum/i;

function maisBarato(lista) {
  return lista.sort((a, b) => a.melhor.preco - b.melhor.preco)[0] || null;
}

function produtosDa(categoria) {
  return [...produtosPorSlug.values()].filter((p) => p.categoria === categoria);
}

// Primeira regra da lista que encontra algum produto (o mais barato dela)
function primeiroQueExiste(categoria, regras) {
  for (const regra of regras) {
    const achado = maisBarato(produtosDa(categoria).filter((p) => regra.test(p.nome)));
    if (achado) return achado;
  }
  return null;
}

function totalDas(pecas) {
  return Object.values(pecas).reduce((soma, p) => soma + p.melhor.preco, 0);
}

// Monta as peças de um PC pronto (null se faltar alguma peça essencial)
function montarPcPronto(pronto) {
  if (!pronto.maisBarato) {
    const cpu = primeiroQueExiste("Processadores", pronto.processadores);
    const gpu = pronto.placas.length ? primeiroQueExiste("Placas de vídeo", pronto.placas) : null;
    return montarComPecas(pronto, cpu, gpu);
  }

  // Testa cada processador x cada placa de vídeo da lista e fica com o PC mais barato
  const cpus = pronto.processadores.map((r) => primeiroQueExiste("Processadores", [r])).filter(Boolean);
  const gpus = pronto.placas.length
    ? pronto.placas.map((r) => primeiroQueExiste("Placas de vídeo", [r])).filter(Boolean)
    : [null];
  let melhor = null;
  for (const cpu of cpus) {
    for (const gpu of gpus) {
      const pecas = montarComPecas(pronto, cpu, gpu);
      if (pecas && (!melhor || totalDas(pecas) < totalDas(melhor))) melhor = pecas;
    }
  }
  return melhor;
}

// Completa o PC com a placa-mãe, a memória, o SSD e a fonte compatíveis mais baratos
function montarComPecas(pronto, cpu, gpu) {
  if (!cpu) return null;
  if (pronto.placas.length && !gpu) return null;

  const placa = maisBarato(produtosDa("Placas-mãe").filter((p) =>
    p.specs.soquete === cpu.specs.soquete && (!cpu.specs.ddr || p.specs.ddr === cpu.specs.ddr)));
  if (!placa) return null;

  const memorias = produtosDa("Memória RAM").filter((p) => p.specs.ddr === placa.specs.ddr);
  const ram = maisBarato(memorias.filter((p) => p.specs.gb === pronto.ramGB)) ||
              maisBarato(memorias.filter((p) => p.specs.gb > pronto.ramGB));

  const disco = maisBarato(produtosDa("Armazenamento").filter((p) => !p.specs.externo && p.specs.gb >= pronto.ssdGB)) ||
                maisBarato(produtosDa("Armazenamento").filter((p) => !p.specs.externo));

  const pecas = { "Processadores": cpu, "Placas-mãe": placa };
  if (ram) pecas["Memória RAM"] = ram;
  if (gpu) pecas["Placas de vídeo"] = gpu;
  if (disco) pecas["Armazenamento"] = disco;

  const consumo = calcularConsumo(pecas);
  const fontes = produtosDa("Fontes").filter((p) => p.specs.potencia >= consumo.recomendada);
  const fonte = maisBarato(fontes.filter((p) => FONTE_CERTIFICADA.test(p.nome))) || maisBarato(fontes);
  if (fonte) pecas["Fontes"] = fonte;

  return pecas;
}

function mostrarPcsProntos() {
  const lista = document.getElementById("pcs-prontos");

  lista.innerHTML = PCS_PRONTOS.map(function (pronto) {
    const pecas = montarPcPronto(pronto);
    if (!pecas) return "";

    const total = totalDas(pecas);
    const d = desempenhoDaMontagem(pecas);
    // Destaque: FPS no Fortnite (o jogo mais conhecido da lista)
    const fortnite = d && d.fps ? d.fps.find((j) => j.jogo === "Fortnite") : null;
    const destaque = fortnite && pecas["Placas de vídeo"] ? `<span class="pronto-fps">~${fortnite.fps1080} FPS no Fortnite</span>` : "";
    const resumo = [pecas["Processadores"], pecas["Placas de vídeo"]].filter(Boolean)
      .map((p) => escapar(p.specs.chip || p.nome.replace(/^Processador\s+/i, ""))).join(" + ");

    return `
      <button type="button" class="pc-pronto" data-pronto="${pronto.id}">
        <span class="pronto-nome">${pronto.nome}</span>
        <span class="pronto-jogos">${pronto.jogos}</span>
        <span class="pronto-pecas">${resumo}</span>
        ${destaque}
        <span class="pronto-preco">${formatarPreco(total)}</span>
      </button>`;
  }).join("");
}

function usarPcPronto(id, rolar) {
  const pronto = PCS_PRONTOS.find((p) => p.id === id);
  const pecas = pronto && montarPcPronto(pronto);
  if (!pecas) return;
  escolhas = pecas;
  salvarMontagem();
  mostrarPecas();
  if (rolar) document.getElementById("lista-pecas").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("pcs-prontos").addEventListener("click", function (evento) {
  const botao = evento.target.closest(".pc-pronto");
  if (botao) usarPcPronto(botao.dataset.pronto, true);
});

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
  mostrarDesempenho();
  atualizarCompartilhar();
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
  url.searchParams.delete("pronto"); // depois de mexer, vale a montagem do link
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

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    mensagemPc.textContent = "Link copiado! É só colar e enviar.";
  } catch (erro) {
    window.prompt("Copie o link da montagem:", window.location.href);
  }
}

// Texto que vai junto com o link: "Montei um PC no PreçoBit por R$ 4.500 (~140 FPS no Fortnite)"
function textoParaCompartilhar() {
  const total = Object.values(escolhas).reduce((soma, p) => soma + p.melhor.preco, 0);
  const d = desempenhoDaMontagem(escolhas);
  const fortnite = d && d.fps ? d.fps.find((j) => j.jogo === "Fortnite") : null;
  return "Montei um PC no PreçoBit por " + formatarPreco(total) +
    (fortnite ? " (~" + fortnite.fps1080 + " FPS no Fortnite)" : "") + ". Olha as peças:";
}

function atualizarCompartilhar() {
  const temPecas = Object.keys(escolhas).length > 0;
  const whatsapp = document.getElementById("whatsapp-pc");
  whatsapp.hidden = !temPecas;
  whatsapp.href = "https://wa.me/?text=" + encodeURIComponent(textoParaCompartilhar() + " " + window.location.href);
  document.getElementById("compartilhar-pc").disabled = !temPecas;
}

// No celular abre o menu de compartilhar do sistema; no computador copia o link
document.getElementById("compartilhar-pc").addEventListener("click", async function () {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Meu PC no PreçoBit", text: textoParaCompartilhar(), url: window.location.href });
    } catch (erro) {
      // a pessoa fechou o menu de compartilhar: nada a fazer
    }
    return;
  }
  copiarLink();
});

document.getElementById("copiar-link").addEventListener("click", copiarLink);

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

  mostrarPcsProntos();

  // Link de um PC pronto (?pronto=1080p) abre com as peças do dia
  const pronto = new URL(window.location.href).searchParams.get("pronto");
  if (pronto && PCS_PRONTOS.some((p) => p.id === pronto)) {
    usarPcPronto(pronto);
  } else {
    carregarMontagemSalva();
    mostrarPecas();
  }
}

iniciar();
