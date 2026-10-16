// Histórico de preços (tabela historico_precos, criada pela migração 003).
// Se a tabela ainda não existir, o site funciona normalmente, só sem o histórico.

let resumoHistorico = new Map(); // slug -> { menor30: número, dias: número }

// Dias de histórico necessários para afirmar "menor preço em 30 dias"
const DIAS_MINIMOS_PARA_SELO = 7;

async function carregarResumoHistorico() {
  if (!SUPABASE_CONFIGURADO) return;
  const { data, error } = await supabaseClient.from("historico_resumo").select("produto_slug, menor_30_dias, dias");
  if (error) return; // sem a migração 003: segue sem histórico
  resumoHistorico = new Map(data.map((r) => [r.produto_slug, { menor30: Number(r.menor_30_dias), dias: r.dias }]));
}

// O preço de hoje é o menor dos últimos 30 dias?
function ehMenorPreco30Dias(produto) {
  const r = resumoHistorico.get(produto.slug);
  return Boolean(r && r.dias >= DIAS_MINIMOS_PARA_SELO && r.menor30 && produto.melhor.preco <= r.menor30 + 0.01);
}

// Menor preço de cada dia dos últimos 30 dias: [{ dia: "2026-10-16", preco }]
async function buscarHistorico(slug) {
  const inicio = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabaseClient
    .from("historico_precos")
    .select("dia, preco")
    .eq("produto_slug", slug)
    .gte("dia", inicio)
    .order("dia");
  if (error) return null;

  const porDia = new Map();
  for (const linha of data) {
    const preco = Number(linha.preco);
    if (!porDia.has(linha.dia) || preco < porDia.get(linha.dia)) porDia.set(linha.dia, preco);
  }
  return [...porDia].map(([dia, preco]) => ({ dia, preco }));
}

function formatarDia(dia) {
  const [ano, mes, d] = dia.split("-");
  return d + "/" + mes;
}

// Desenha o gráfico de linha do histórico dentro de "caixa"
async function desenharHistorico(caixa, slug) {
  caixa.innerHTML = '<p class="historico-texto">Carregando histórico...</p>';
  const pontos = await buscarHistorico(slug);

  if (!pontos) {
    caixa.innerHTML = "";
    return;
  }
  if (pontos.length < 2) {
    caixa.innerHTML = '<p class="historico-texto">📈 O histórico de preços deste produto começou agora. Volte em alguns dias para ver o gráfico.</p>';
    return;
  }

  const L = 260, A = 96;                       // tamanho do desenho (o SVG estica na largura)
  const M = { esq: 4, dir: 84, cima: 10, baixo: 18 };
  const precos = pontos.map((p) => p.preco);
  let min = Math.min(...precos), max = Math.max(...precos);
  if (max - min < 1) { min -= 10; max += 10; }  // preço parado: deixa uma folga para a linha não colar

  const x = (i) => M.esq + (i / (pontos.length - 1)) * (L - M.esq - M.dir);
  const y = (v) => M.cima + (1 - (v - min) / (max - min)) * (A - M.cima - M.baixo);

  const linha = pontos.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.preco).toFixed(1)).join(" ");
  const area = linha + ` L${x(pontos.length - 1).toFixed(1)} ${A - M.baixo} L${x(0).toFixed(1)} ${A - M.baixo} Z`;
  const ultimo = pontos[pontos.length - 1];
  const menor = Math.min(...precos), maior = Math.max(...precos);

  const descricao = `Histórico de ${pontos.length} dias: menor ${formatarPreco(menor)}, maior ${formatarPreco(maior)}, hoje ${formatarPreco(ultimo.preco)}.`;

  caixa.innerHTML = `
    <p class="historico-titulo">Menor preço por dia (30 dias)</p>
    <div class="grafico-historico">
      <svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="${escapar(descricao)}">
        <line class="grafico-eixo" x1="${M.esq}" x2="${L - M.dir}" y1="${A - M.baixo}" y2="${A - M.baixo}"></line>
        <path class="grafico-area" d="${area}"></path>
        <path class="grafico-linha" d="${linha}"></path>
        <line class="grafico-mira" y1="${M.cima}" y2="${A - M.baixo}" x1="0" x2="0" visibility="hidden"></line>
      </svg>
      <span class="grafico-ponto" style="left:${(x(pontos.length - 1) / L) * 100}%; top:${(y(ultimo.preco) / A) * 100}%"></span>
      <span class="grafico-rotulo-fim" style="left:calc(${(x(pontos.length - 1) / L) * 100}% + 10px); top:${(y(ultimo.preco) / A) * 100}%">${formatarPreco(ultimo.preco)}</span>
      <span class="grafico-data inicio">${formatarDia(pontos[0].dia)}</span>
      <span class="grafico-data fim" style="left:${(x(pontos.length - 1) / L) * 100}%">hoje</span>
      <div class="grafico-dica" hidden></div>
    </div>
    <p class="historico-texto">Menor: <strong>${formatarPreco(menor)}</strong> · Maior: <strong>${formatarPreco(maior)}</strong></p>`;

  // Passar o mouse/dedo: uma linha vertical vai para o dia mais próximo e mostra o preço
  const grafico = caixa.querySelector(".grafico-historico");
  const mira = caixa.querySelector(".grafico-mira");
  const dica = caixa.querySelector(".grafico-dica");
  const ponto = caixa.querySelector(".grafico-ponto");

  function mostrar(evento) {
    const r = grafico.getBoundingClientRect();
    const xSvg = ((evento.clientX - r.left) / r.width) * L;
    const passo = (L - M.esq - M.dir) / (pontos.length - 1);
    const i = Math.max(0, Math.min(pontos.length - 1, Math.round((xSvg - M.esq) / passo)));
    const p = pontos[i];

    mira.setAttribute("x1", x(i));
    mira.setAttribute("x2", x(i));
    mira.setAttribute("visibility", "visible");
    ponto.style.left = (x(i) / L) * 100 + "%";
    ponto.style.top = (y(p.preco) / A) * 100 + "%";

    dica.textContent = "";
    const valor = document.createElement("strong");
    valor.textContent = formatarPreco(p.preco);
    dica.append(valor, " " + formatarDia(p.dia));
    dica.hidden = false;
    dica.style.left = Math.min(Math.max((x(i) / L) * 100, 18), 70) + "%";
  }

  function esconder() {
    mira.setAttribute("visibility", "hidden");
    dica.hidden = true;
    ponto.style.left = (x(pontos.length - 1) / L) * 100 + "%";
    ponto.style.top = (y(ultimo.preco) / A) * 100 + "%";
  }

  grafico.addEventListener("pointermove", mostrar);
  grafico.addEventListener("pointerdown", mostrar);
  grafico.addEventListener("pointerleave", esconder);
}
