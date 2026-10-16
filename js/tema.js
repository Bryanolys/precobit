// Modo gamer (tema escuro com neon). Carregado no <head> para aplicar o tema
// antes da página aparecer, sem piscar o tema claro.
// A escolha fica guardada neste navegador; sem escolha, segue o modo escuro do sistema.

(function () {
  const CHAVE = "precobit-tema";
  const raiz = document.documentElement;

  function lerEscolha() {
    try {
      return localStorage.getItem(CHAVE);
    } catch (erro) {
      return null; // navegador sem armazenamento: segue o sistema
    }
  }

  function aplicar(tema) {
    if (tema === "gamer") raiz.dataset.tema = "gamer";
    else delete raiz.dataset.tema;

    document.querySelectorAll(".botao-tema").forEach(function (botao) {
      const gamer = tema === "gamer";
      botao.setAttribute("aria-pressed", String(gamer));
      botao.title = gamer ? "Voltar ao tema claro" : "Ligar o modo gamer";
      botao.querySelector("span").textContent = gamer ? "☀️" : "🎮";
    });
  }

  const escolha = lerEscolha();
  const sistemaEscuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  let temaAtual = escolha || (sistemaEscuro ? "gamer" : "claro");
  aplicar(temaAtual);

  document.addEventListener("DOMContentLoaded", function () {
    aplicar(temaAtual); // agora os botões já existem na página

    document.querySelectorAll(".botao-tema").forEach(function (botao) {
      botao.addEventListener("click", function () {
        temaAtual = temaAtual === "gamer" ? "claro" : "gamer";
        aplicar(temaAtual);
        try {
          localStorage.setItem(CHAVE, temaAtual);
        } catch (erro) {
          // sem armazenamento: vale só até fechar a página
        }
      });
    });
  });
})();
