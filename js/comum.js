// Funções usadas por mais de uma página (home e Monte seu PC).
// Precisa ser carregado depois do supabase-config.js e do produtos.js.

// Ilustração padrão de cada categoria (usada quando o produto não tem foto)
const IMAGENS_CATEGORIA = {
  "Processadores": "../img/categorias/processador.svg",
  "Placas de vídeo": "../img/categorias/placa-de-video.svg",
  "Memória RAM": "../img/categorias/memoria-ram.svg",
  "Armazenamento": "../img/categorias/armazenamento.svg",
  "Placas-mãe": "../img/categorias/placa-mae.svg",
  "Fontes": "../img/categorias/fontes.svg"
};

// ===== Login obrigatório =====
// As páginas do site só abrem para quem está logado. Sem sessão, vai para o login
// levando junto a página atual (?voltar=...), para voltar a ela depois de entrar.
// Devolve o usuário logado (ou null enquanto o navegador já está indo para o login).
async function exigirLogin() {
  let sessao = null;
  if (SUPABASE_CONFIGURADO) {
    const { data } = await supabaseClient.auth.getSession();
    sessao = data.session;
  }

  if (!sessao) {
    const pagina = window.location.pathname.split("/").pop() + window.location.search;
    window.location.replace("entrar.html?voltar=" + encodeURIComponent(pagina));
    return null;
  }

  // Sessão confirmada: libera a página (ela fica escondida até aqui, sem piscar o conteúdo)
  document.documentElement.classList.remove("precisa-login");

  // Se a pessoa sair em outra aba, esta também volta para o login
  supabaseClient.auth.onAuthStateChange(function (evento) {
    if (evento === "SIGNED_OUT") window.location.replace("entrar.html");
  });

  return sessao.user;
}

async function sairDaConta() {
  await supabaseClient.auth.signOut();
  window.location.replace("entrar.html");
}

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

// Caminho da foto do produto (ou da ilustração da categoria, se não tiver foto)
function imagemDoProduto(produto) {
  return produto.imagem ? "../img/produtos/" + escapar(produto.imagem) : IMAGENS_CATEGORIA[produto.categoria];
}

// Busca produtos + ofertas no Supabase. Se o banco estiver vazio ou der erro,
// usa o arquivo js/produtos.js como reserva.
// Devolve { produtos, doBanco, atualizadoEm }.
async function buscarProdutos() {
  let data = null;
  let error = null;

  if (SUPABASE_CONFIGURADO) {
    const colunasOfertas = "ofertas (loja, titulo, preco, preco_normal, link)";
    ({ data, error } = await supabaseClient
      .from("produtos")
      .select("slug, nome, categoria, imagem, atualizado_em, popularidade, selo, " + colunasOfertas));

    // Banco sem as colunas de ranking (migração 002 ainda não rodada): busca sem elas
    if (error && error.code === "42703") {
      ({ data, error } = await supabaseClient
        .from("produtos")
        .select("slug, nome, categoria, imagem, atualizado_em, " + colunasOfertas));
    }
  }

  const comOfertas = (data || []).filter((p) => p.ofertas && p.ofertas.length > 0);

  if (error || comOfertas.length === 0) {
    if (error) console.warn("Supabase: não foi possível ler os produtos.", error.message);
    return {
      produtos: PRODUTOS.map((p) => ({ ...p, slug: p.slug || criarSlug(p.nome) })),
      doBanco: false,
      atualizadoEm: ATUALIZADO_EM
    };
  }

  return {
    produtos: comOfertas.map(function (p) {
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
    }),
    doBanco: true,
    atualizadoEm: comOfertas.map((p) => p.atualizado_em).sort().pop()
  };
}
