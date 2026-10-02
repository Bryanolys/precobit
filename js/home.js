// ===== Estado da página =====
let usuario = null;          // usuário logado no Supabase
let produtosBase = [];       // produtos carregados (do Supabase ou do arquivo local)
let dadosDoBanco = false;    // true quando os produtos vieram do Supabase
let favoritos = new Set();   // slugs dos produtos favoritos do usuário
let categoriaAtual = "Todos";

const campoBusca = document.getElementById("campo-busca");
const formBusca = document.getElementById("form-busca");
const selectOrdenacao = document.getElementById("ordenacao");
const divCategorias = document.getElementById("categorias");
const listaProdutos = document.getElementById("lista-produtos");
const contador = document.getElementById("contador");

// Ilustração padrão de cada categoria (usada quando o produto não tem foto)
const IMAGENS_CATEGORIA = {
  "Processadores": "../img/categorias/processador.svg",
  "Placas de vídeo": "../img/categorias/placa-de-video.svg",
  "Memória RAM": "../img/categorias/memoria-ram.svg",
  "Armazenamento": "../img/categorias/armazenamento.svg",
  "Placas-mãe": "../img/categorias/placa-mae.svg",
  "Fontes": "../img/categorias/fontes.svg"
};

// Lojas que bloqueiam a busca automática: mostramos só um link de pesquisa
const OUTRAS_LOJAS = [
  { nome: "Pichau", url: (t) => "https://www.pichau.com.br/search?q=" + encodeURIComponent(t) },
  { nome: "Terabyte", url: (t) => "https://www.terabyteshop.com.br/busca?str=" + encodeURIComponent(t) },
  { nome: "Mercado Livre", url: (t) => "https://lista.mercadolivre.com.br/" + encodeURIComponent(t.replace(/\s+/g, "-")) }
];

// ===== Funções de apoio =====

// Formata número como dinheiro: 1234.5 -> "R$ 1.234,50"
function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Evita que textos vindos das lojas ou do banco quebrem o HTML
function escapar(texto) {
  return String(texto)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Mesmo slug que o script de preços gera: "Placa-mãe ASUS" -> "placa-mae-asus"
function criarSlug(texto) {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Calcula menor preço e a economia de cada produto
function calcularResumo(produto) {
  const ofertasOrdenadas = [...produto.ofertas].sort((a, b) => a.preco - b.preco);
  const melhor = ofertasOrdenadas[0];
  const pior = ofertasOrdenadas[ofertasOrdenadas.length - 1];

  return {
    ...produto,
    ofertas: ofertasOrdenadas,
    melhor: melhor,
    economia: pior.preco - melhor.preco
  };
}

// ===== Sessão =====
async function carregarUsuario() {
  if (!SUPABASE_CONFIGURADO) {
    window.location.href = "../index.html";
    return false;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = "../index.html";
    return false;
  }

  usuario = data.session.user;
  return true;
}

async function sair() {
  await supabaseClient.auth.signOut();
  window.location.href = "../index.html";
}

document.getElementById("botao-sair").addEventListener("click", sair);
document.getElementById("menu-sair").addEventListener("click", sair);

// Se a sessão acabar em outra aba, volta para o login
if (SUPABASE_CONFIGURADO) {
  supabaseClient.auth.onAuthStateChange(function (evento) {
    if (evento === "SIGNED_OUT") window.location.href = "../index.html";
  });
}

// ===== Produtos =====

// Busca produtos + ofertas no Supabase. Se o banco estiver vazio ou der erro,
// usa o arquivo js/produtos.js como reserva.
async function carregarProdutos() {
  const colunasOfertas = "ofertas (loja, titulo, preco, preco_normal, link)";
  let { data, error } = await supabaseClient
    .from("produtos")
    .select("slug, nome, categoria, imagem, atualizado_em, popularidade, selo, " + colunasOfertas);

  // Banco sem as colunas de ranking (migração 002 ainda não rodada): busca sem elas
  if (error && error.code === "42703") {
    ({ data, error } = await supabaseClient
      .from("produtos")
      .select("slug, nome, categoria, imagem, atualizado_em, " + colunasOfertas));
  }

  const comOfertas = (data || []).filter((p) => p.ofertas && p.ofertas.length > 0);

  if (error || comOfertas.length === 0) {
    if (error) console.warn("Supabase: não foi possível ler os produtos.", error.message);
    dadosDoBanco = false;
    produtosBase = PRODUTOS.map((p) => ({ ...p, slug: p.slug || criarSlug(p.nome) }));
    mostrarDataAtualizacao(ATUALIZADO_EM, " (arquivo local)");
    return;
  }

  dadosDoBanco = true;
  produtosBase = comOfertas.map(function (p) {
    return {
      slug: p.slug,
      nome: p.nome,
      categoria: p.categoria,
      imagem: p.imagem,
      popularidade: p.popularidade ?? null,
      selo: p.selo ?? null,
      ofertas: p.ofertas.map((o) => ({
        loja: o.loja,
        titulo: o.titulo,
        preco: Number(o.preco),
        precoNormal: o.preco_normal ? Number(o.preco_normal) : null,
        link: o.link
      }))
    };
  });

  const maisRecente = comOfertas.map((p) => p.atualizado_em).sort().pop();
  mostrarDataAtualizacao(maisRecente, "");
}

function mostrarDataAtualizacao(dataIso, sufixo) {
  const texto = new Date(dataIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + sufixo;
  document.getElementById("atualizado-em").textContent = texto;
  document.getElementById("menu-atualizado-em").textContent = texto;
}

// ===== Favoritos =====
async function carregarFavoritos() {
  if (!dadosDoBanco) return; // favoritos só funcionam com os produtos do banco

  const { data, error } = await supabaseClient.from("favoritos").select("produto_slug");
  if (error) {
    console.warn("Supabase: não foi possível ler os favoritos.", error.message);
    return;
  }
  favoritos = new Set(data.map((f) => f.produto_slug));
}

async function alternarFavorito(slug, botao) {
  const eraFavorito = favoritos.has(slug);
  botao.disabled = true;

  const { error } = eraFavorito
    ? await supabaseClient.from("favoritos").delete().eq("produto_slug", slug)
    : await supabaseClient.from("favoritos").insert({ produto_slug: slug });

  botao.disabled = false;

  if (error) {
    alert("Não foi possível salvar o favorito: " + error.message);
    return;
  }

  if (eraFavorito) favoritos.delete(slug);
  else favoritos.add(slug);

  // Se o filtro "só favoritos" estiver ligado, a lista muda; senão só troca o coração
  if (filtroFavoritos.checked) {
    mostrarProdutos();
  } else {
    botao.classList.toggle("ativo", !eraFavorito);
    botao.setAttribute("aria-pressed", String(!eraFavorito));
    botao.title = eraFavorito ? "Adicionar aos favoritos" : "Remover dos favoritos";
  }
}

listaProdutos.addEventListener("click", function (evento) {
  const botao = evento.target.closest(".botao-favorito");
  if (botao) alternarFavorito(botao.dataset.slug, botao);
});

// ===== Filtros do menu =====
const filtroMin = document.getElementById("filtro-min");
const filtroMax = document.getElementById("filtro-max");
const filtroLojas = document.querySelectorAll(".filtro-loja");
const filtroDesconto = document.getElementById("filtro-desconto");
const filtroVariasLojas = document.getElementById("filtro-varias-lojas");
const filtroFavoritos = document.getElementById("filtro-favoritos");

function lojasSelecionadas() {
  return [...filtroLojas].filter((c) => c.checked).map((c) => c.value);
}

// Aplica os filtros do menu e devolve os produtos já com o resumo de preços
function produtosFiltradosPeloMenu() {
  const lojas = lojasSelecionadas();
  const minimo = Number(filtroMin.value) || 0;
  const maximo = Number(filtroMax.value) || Infinity;

  return produtosBase
    .map(function (produto) {
      // Considera só as ofertas das lojas marcadas
      const ofertas = produto.ofertas.filter((o) => lojas.includes(o.loja));
      return ofertas.length ? calcularResumo({ ...produto, ofertas: ofertas }) : null;
    })
    .filter(function (produto) {
      if (!produto) return false;
      if (produto.melhor.preco < minimo || produto.melhor.preco > maximo) return false;
      if (filtroDesconto.checked && !(produto.melhor.precoNormal > produto.melhor.preco)) return false;
      if (filtroVariasLojas.checked && produto.ofertas.length < 2) return false;
      if (filtroFavoritos.checked && !favoritos.has(produto.slug)) return false;
      return true;
    });
}

// Mostra no botão do menu quantos filtros estão ligados
function atualizarContadorFiltros() {
  let ativos = 0;
  if (filtroMin.value) ativos++;
  if (filtroMax.value) ativos++;
  if (lojasSelecionadas().length < filtroLojas.length) ativos++;
  if (filtroDesconto.checked) ativos++;
  if (filtroVariasLojas.checked) ativos++;
  if (filtroFavoritos.checked) ativos++;

  const selo = document.getElementById("contador-filtros");
  selo.textContent = ativos;
  selo.hidden = ativos === 0;
}

[filtroMin, filtroMax, filtroDesconto, filtroVariasLojas, filtroFavoritos, ...filtroLojas].forEach(function (campo) {
  campo.addEventListener("input", mostrarProdutos);
});

document.getElementById("limpar-filtros").addEventListener("click", function () {
  filtroMin.value = "";
  filtroMax.value = "";
  filtroLojas.forEach((c) => (c.checked = true));
  filtroDesconto.checked = false;
  filtroVariasLojas.checked = false;
  filtroFavoritos.checked = false;
  mostrarProdutos();
});

// ===== Lista de produtos =====

// Cria os botões de categoria
function montarCategorias() {
  const categorias = ["Todos", ...new Set(produtosBase.map((p) => p.categoria))];
  divCategorias.innerHTML = "";

  categorias.forEach(function (categoria) {
    const botao = document.createElement("button");
    botao.textContent = categoria;
    botao.className = "chip" + (categoria === categoriaAtual ? " ativo" : "");

    botao.addEventListener("click", function () {
      categoriaAtual = categoria;
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("ativo"));
      botao.classList.add("ativo");
      mostrarProdutos();
    });

    divCategorias.appendChild(botao);
  });
}

// Filtra, ordena e desenha os produtos na tela
function mostrarProdutos() {
  const termo = campoBusca.value.trim().toLowerCase();

  atualizarContadorFiltros();

  let resultado = produtosFiltradosPeloMenu().filter(function (produto) {
    const bateCategoria = categoriaAtual === "Todos" || produto.categoria === categoriaAtual;
    const bateBusca = produto.nome.toLowerCase().includes(termo);
    return bateCategoria && bateBusca;
  });

  const ordem = selectOrdenacao.value;
  resultado.sort(function (a, b) {
    if (ordem === "menor") return a.melhor.preco - b.melhor.preco;
    if (ordem === "maior") return b.melhor.preco - a.melhor.preco;
    if (ordem === "economia") return b.economia - a.economia;
    if (ordem === "populares") {
      // Quem está no ranking vem primeiro (número menor = mais popular); o resto por menor preço
      const pa = a.popularidade ?? Infinity;
      const pb = b.popularidade ?? Infinity;
      return pa !== pb ? pa - pb : a.melhor.preco - b.melhor.preco;
    }
    return a.nome.localeCompare(b.nome);
  });

  contador.textContent = resultado.length + " produto(s) encontrado(s)";

  if (resultado.length === 0) {
    const dica = filtroFavoritos.checked
      ? "Você ainda não tem favoritos aqui. Clique no ♥ de um produto para salvar."
      : "Nenhum produto encontrado. Tente outra busca.";
    listaProdutos.innerHTML = `<p class="vazio">${dica}</p>`;
    return;
  }

  listaProdutos.innerHTML = resultado.map(criarCard).join("");
}

// Monta o HTML de um card de produto
function criarCard(produto) {
  const linhasOfertas = produto.ofertas
    .map(function (oferta, indice) {
      const classe = indice === 0 ? "oferta melhor" : "oferta";
      const riscado = oferta.precoNormal && oferta.precoNormal > oferta.preco
        ? `<s>${formatarPreco(oferta.precoNormal)}</s>`
        : "";
      return `
        <li>
          <a class="${classe}" href="${escapar(oferta.link)}" target="_blank" rel="noopener" title="${escapar(oferta.titulo || "")}">
            <span>${escapar(oferta.loja)}</span>
            <span class="oferta-preco">${riscado}${formatarPreco(oferta.preco)} ↗</span>
          </a>
        </li>`;
    })
    .join("");

  const linksOutras = OUTRAS_LOJAS
    .map((loja) => `<a href="${loja.url(produto.nome)}" target="_blank" rel="noopener">${loja.nome}</a>`)
    .join(" · ");

  const selo = produto.economia > 0
    ? `<span class="selo">Economize ${formatarPreco(produto.economia)}</span>`
    : "";

  // Coração de favorito (só aparece quando os produtos vêm do banco)
  const ehFavorito = favoritos.has(produto.slug);
  const botaoFavorito = dadosDoBanco
    ? `<button class="botao-favorito${ehFavorito ? " ativo" : ""}" data-slug="${escapar(produto.slug)}"
         aria-pressed="${ehFavorito}" title="${ehFavorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}">♥</button>`
    : "";

  // Usa a foto do produto (se tiver); se falhar, cai na ilustração da categoria
  const imagemCategoria = IMAGENS_CATEGORIA[produto.categoria];
  const imagem = produto.imagem ? "../img/produtos/" + escapar(produto.imagem) : imagemCategoria;

  return `
    <article class="produto">
      <div class="produto-imagem">
        <img src="${imagem}" alt="${escapar(produto.nome)}" loading="lazy"
             onerror="this.onerror=null; this.src='${imagemCategoria}'">
        <span class="produto-categoria">${escapar(produto.categoria)}</span>
        ${produto.selo ? `<span class="selo-destaque">🔥 ${escapar(produto.selo)}</span>` : ""}
        ${botaoFavorito}
      </div>

      <h2>${escapar(produto.nome)}</h2>

      <p class="rotulo-preco">Menor preço</p>
      <p class="preco">${formatarPreco(produto.melhor.preco)}</p>
      <p class="na-loja">na <strong>${escapar(produto.melhor.loja)}</strong> ${produto.melhor.precoNormal ? "(no PIX)" : ""}</p>
      ${selo}

      <a class="botao-oferta" href="${escapar(produto.melhor.link)}" target="_blank" rel="noopener">Ver oferta ↗</a>

      <details>
        <summary>Comparar lojas (${produto.ofertas.length})</summary>
        <ul>${linhasOfertas}</ul>
        <p class="outras-lojas">Procurar também na ${linksOutras}</p>
      </details>
    </article>`;
}

formBusca.addEventListener("submit", function (evento) {
  evento.preventDefault();
  mostrarProdutos();
});

campoBusca.addEventListener("input", mostrarProdutos);
selectOrdenacao.addEventListener("change", mostrarProdutos);

// ===== Menu lateral =====
const botaoMenu = document.getElementById("botao-menu");
const menuLateral = document.getElementById("menu-lateral");
const fundoMenu = document.getElementById("fundo-menu");

function abrirMenu() {
  menuLateral.classList.add("aberto");
  menuLateral.setAttribute("aria-hidden", "false");
  botaoMenu.setAttribute("aria-expanded", "true");
  fundoMenu.hidden = false;
  document.body.classList.add("menu-aberto"); // impede a página de rolar por trás do menu
}

function fecharMenu() {
  menuLateral.classList.remove("aberto");
  menuLateral.setAttribute("aria-hidden", "true");
  botaoMenu.setAttribute("aria-expanded", "false");
  fundoMenu.hidden = true;
  document.body.classList.remove("menu-aberto");
}

botaoMenu.addEventListener("click", abrirMenu);
document.getElementById("fechar-menu").addEventListener("click", fecharMenu);
fundoMenu.addEventListener("click", fecharMenu);
document.addEventListener("keydown", function (evento) {
  if (evento.key === "Escape") fecharMenu();
});

// ===== Cadastro (tabela "perfis" no Supabase) =====
const formCadastro = document.getElementById("form-cadastro");
const camposCadastro = {
  nome: document.getElementById("cad-nome"),
  telefone: document.getElementById("cad-telefone"),
  cidade: document.getElementById("cad-cidade")
};
const caixaAlertas = document.getElementById("cad-alertas");
const mensagemCadastro = document.getElementById("cadastro-mensagem");

function mostrarPerfil(nome) {
  const exibir = nome || usuario.email.split("@")[0];
  document.getElementById("avatar").textContent = exibir.charAt(0).toUpperCase();
  document.getElementById("perfil-usuario").textContent = exibir;
  document.getElementById("perfil-email").textContent = usuario.email;
  document.getElementById("nome-usuario").textContent = exibir;
}

async function carregarCadastro() {
  document.getElementById("cad-email").value = usuario.email;

  const { data, error } = await supabaseClient
    .from("perfis")
    .select("nome, telefone, cidade, alertas")
    .eq("id", usuario.id)
    .maybeSingle();

  if (error) console.warn("Supabase: não foi possível ler o perfil.", error.message);

  const perfil = data || {};
  for (const campo in camposCadastro) {
    camposCadastro[campo].value = perfil[campo] || "";
  }
  caixaAlertas.checked = Boolean(perfil.alertas);
  mostrarPerfil(perfil.nome);
}

formCadastro.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  const botao = formCadastro.querySelector("button[type=submit]");

  const perfil = {
    id: usuario.id,
    nome: camposCadastro.nome.value.trim(),
    telefone: camposCadastro.telefone.value.trim(),
    cidade: camposCadastro.cidade.value.trim(),
    alertas: caixaAlertas.checked,
    atualizado_em: new Date().toISOString()
  };

  botao.disabled = true;
  const { error } = await supabaseClient.from("perfis").upsert(perfil);
  botao.disabled = false;

  if (error) {
    mensagemCadastro.textContent = "Não foi possível salvar: " + error.message;
    mensagemCadastro.className = "menu-mensagem erro";
    return;
  }

  mostrarPerfil(perfil.nome);
  mensagemCadastro.textContent = "Cadastro salvo!";
  mensagemCadastro.className = "menu-mensagem sucesso";
});

// ===== Início =====
async function iniciar() {
  const logado = await carregarUsuario();
  if (!logado) return;

  listaProdutos.innerHTML = '<p class="vazio">Carregando produtos...</p>';

  await Promise.all([carregarCadastro(), carregarProdutos()]);
  await carregarFavoritos();

  // Favoritos só aparecem no filtro quando os produtos vêm do banco
  document.getElementById("opcao-favoritos").hidden = !dadosDoBanco;

  montarCategorias();
  mostrarProdutos();
}

iniciar();
