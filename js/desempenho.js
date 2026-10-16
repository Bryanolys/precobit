// Desempenho estimado em jogos (usado na home e no Monte seu PC).
//
// Cada placa de vídeo e processador tem um "índice" de força em jogos, onde a
// RTX 5060 (placa) e o Ryzen 7 5800X3D (processador) valem 100. O FPS de um jogo é
// o menor entre o que a placa consegue e o que o processador consegue entregar.
// São estimativas aproximadas (1080p e 1440p, gráficos no alto, sem ray tracing),
// feitas a partir de testes publicados; o FPS real muda com a versão do jogo e o resto do PC.

// Placas de vídeo: regra para achar o chip no nome, consumo (W) e índice
const PLACAS_DE_VIDEO = [
  { regra: /RTX\s?5090/i, chip: "RTX 5090", watts: 575, indice: 330 },
  { regra: /RTX\s?5080/i, chip: "RTX 5080", watts: 360, indice: 255 },
  { regra: /RTX\s?5070\s?Ti/i, chip: "RTX 5070 Ti", watts: 300, indice: 215 },
  { regra: /RTX\s?5070/i, chip: "RTX 5070", watts: 250, indice: 160 },
  { regra: /RTX\s?5060\s?Ti/i, chip: "RTX 5060 Ti", watts: 180, indice: 117 },
  { regra: /RTX\s?5060/i, chip: "RTX 5060", watts: 145, indice: 100 },
  { regra: /RTX\s?5050/i, chip: "RTX 5050", watts: 130, indice: 80 },
  { regra: /RTX\s?4060/i, chip: "RTX 4060", watts: 115, indice: 88 },
  { regra: /RTX\s?3060/i, chip: "RTX 3060", watts: 170, indice: 72 },
  { regra: /RTX\s?3050.*6\s?GB/i, chip: "RTX 3050 6GB", watts: 70, indice: 42 },
  { regra: /RTX\s?3050/i, chip: "RTX 3050", watts: 130, indice: 55 },
  { regra: /RX\s?9070\s?XT/i, chip: "RX 9070 XT", watts: 304, indice: 195 },
  { regra: /RX\s?9070/i, chip: "RX 9070", watts: 220, indice: 170 },
  { regra: /RX\s?9060\s?XT/i, chip: "RX 9060 XT", watts: 160, indice: 118 },
  { regra: /RX\s?7600/i, chip: "RX 7600", watts: 165, indice: 85 },
  { regra: /RX\s?6600/i, chip: "RX 6600", watts: 132, indice: 70 },
  { regra: /RX\s?580/i, chip: "RX 580", watts: 185, indice: 45 }
];

// Processadores: consumo máximo aproximado (W), índice em jogos e índice do vídeo integrado
// (videoIntegrado: 0 = não tem)
const PROCESSADORES = [
  { regra: /9950X3D/i, watts: 230, indice: 135, videoIntegrado: 7 },
  { regra: /9900X/i, watts: 162, indice: 110, videoIntegrado: 7 },
  { regra: /9800X3D/i, watts: 162, indice: 135, videoIntegrado: 7 },
  { regra: /7800X3D/i, watts: 162, indice: 122, videoIntegrado: 7 },
  { regra: /9600X/i, watts: 88, indice: 105, videoIntegrado: 7 },
  { regra: /8700G/i, watts: 88, indice: 88, videoIntegrado: 30 },
  { regra: /8600G/i, watts: 88, indice: 82, videoIntegrado: 22 },
  { regra: /8500G/i, watts: 88, indice: 78, videoIntegrado: 18 },
  { regra: /5900XT/i, watts: 142, indice: 85, videoIntegrado: 0 },
  { regra: /5800X3D/i, watts: 142, indice: 100, videoIntegrado: 0 },
  { regra: /5700X3D/i, watts: 142, indice: 95, videoIntegrado: 0 },
  { regra: /5700G/i, watts: 88, indice: 70, videoIntegrado: 15 },
  { regra: /5700X/i, watts: 88, indice: 80, videoIntegrado: 0 },
  { regra: /5600G/i, watts: 88, indice: 66, videoIntegrado: 13 },
  { regra: /5600/i, watts: 88, indice: 75, videoIntegrado: 0 },
  { regra: /5500/i, watts: 88, indice: 68, videoIntegrado: 0 },
  { regra: /Ultra\s*7\s*265K/i, watts: 250, indice: 110, videoIntegrado: 20 },
  { regra: /14400F/i, watts: 148, indice: 90, videoIntegrado: 0 },
  { regra: /14400/i, watts: 148, indice: 90, videoIntegrado: 8 },
  { regra: /12400F/i, watts: 117, indice: 80, videoIntegrado: 0 },
  { regra: /12400/i, watts: 117, indice: 80, videoIntegrado: 8 },
  { regra: /12100F/i, watts: 89, indice: 70, videoIntegrado: 0 },
  { regra: /12100/i, watts: 89, indice: 70, videoIntegrado: 8 }
];

// Jogos: FPS com a placa de índice 100, limite do processador de índice 100
// e quanto do FPS sobra em 1440p
const JOGOS = [
  { nome: "Valorant", fpsPlaca: 420, fpsProcessador: 550, fator1440: 0.8 },
  { nome: "Counter-Strike 2", fpsPlaca: 260, fpsProcessador: 380, fator1440: 0.72 },
  { nome: "Fortnite", fpsPlaca: 135, fpsProcessador: 230, fator1440: 0.7 },
  { nome: "GTA V", fpsPlaca: 165, fpsProcessador: 170, fator1440: 0.75 },
  { nome: "Cyberpunk 2077", fpsPlaca: 78, fpsProcessador: 150, fator1440: 0.65 }
];

// Processador "à altura" usado quando só a placa de vídeo é conhecida (cards da home)
const INDICE_PROCESSADOR_FORTE = 125;

function chipDaPlaca(nome) {
  return PLACAS_DE_VIDEO.find((p) => p.regra.test(nome)) || null;
}

function dadosDoProcessador(nome) {
  return PROCESSADORES.find((p) => p.regra.test(nome)) || null;
}

// FPS estimado em cada jogo. indicePlaca pode ser o do vídeo integrado.
// Devolve [{ jogo, fps1080, fps1440, nivel }]
function estimarFps(indicePlaca, indiceProcessador) {
  const processador = indiceProcessador || INDICE_PROCESSADOR_FORTE;
  return JOGOS.map(function (jogo) {
    const limiteProcessador = (jogo.fpsProcessador * processador) / 100;
    const placa1080 = (jogo.fpsPlaca * indicePlaca) / 100;
    const fps1080 = Math.round(Math.min(placa1080, limiteProcessador));
    const fps1440 = Math.round(Math.min(placa1080 * jogo.fator1440, limiteProcessador));
    return { jogo: jogo.nome, fps1080: fps1080, fps1440: fps1440, nivel: nivelDoFps(fps1080) };
  });
}

// Como fica a experiência com esse FPS
function nivelDoFps(fps) {
  if (fps >= 144) return { classe: "nivel-top", texto: "Competitivo" };
  if (fps >= 60) return { classe: "nivel-bom", texto: "Liso" };
  if (fps >= 30) return { classe: "nivel-ok", texto: "Jogável" };
  return { classe: "nivel-fraco", texto: "Fraco" };
}
