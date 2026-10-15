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

// Lojas que bloqueiam a busca automática: mostramos só um link de pesquisa
const OUTRAS_LOJAS = [
  { nome: "Pichau", url: (t) => "https://www.pichau.com.br/search?q=" + encodeURIComponent(t) },
  { nome: "Terabyte", url: (t) => "https://www.terabyteshop.com.br/busca?str=" + encodeURIComponent(t) },
  { nome: "Mercado Livre", url: (t) => "https://lista.mercadolivre.com.br/" + encodeURIComponent(t.replace(/\s+/g, "-")) }
];

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

// Carrega os produtos (do Supabase ou, como reserva, do arquivo local)
async function carregarProdutos() {
  const resultado = await buscarProdutos();
  produtosBase = resultado.produtos;
  dadosDoBanco = resultado.doBanco;
  mostrarDataAtualizacao(resultado.atualizadoEm, resultado.doBanco ? "" : " (arquivo local)");
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
  const imagem = imagemDoProduto(produto);

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
