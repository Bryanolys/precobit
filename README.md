# PreçoBit

Comparador de preços de hardware (processadores, placas de vídeo, placas-mãe, memória RAM, SSDs e fontes) com preços reais da KaBuM e da Amazon.

**Site no ar:** https://joyful-capybara-d345ff.netlify.app

## Funcionalidades

- Busca, filtros por categoria e ranking dos mais vendidos, abertos para qualquer visitante
- **Monte seu PC**: escolha as peças e veja o total pelo menor preço e se elas combinam
  (soquete, DDR4/DDR5, potência da fonte, vídeo integrado)
- **PCs prontos** (estudo, entrada, 1080p, 1440p e topo de linha) montados com o preço do dia
- **FPS estimado** em Valorant, CS2, Fortnite, GTA V e Cyberpunk, e custo por FPS das placas de vídeo
- **Histórico de preços** com gráfico de 30 dias e selo "Menor preço em 30 dias"
- Compartilhar a montagem (link, WhatsApp) com card de preview
- **Modo gamer** (tema escuro com neon)
- Conta (Supabase Auth) para favoritos e cadastro
- Preços atualizados todo dia por um GitHub Action
- Layout adaptado para celular

## Tecnologias

- HTML, CSS e JavaScript puro (sem framework)
- [Supabase](https://supabase.com) para banco de dados e autenticação
- Node.js para os scripts de atualização de preços e o servidor local
- Netlify para hospedagem

## Estrutura

```
index.html          abre a lista de preços (e o card de compartilhamento)
pages/              home, Monte seu PC, login (entrar.html) e nova senha
css/                estilos
js/                 lógica do site (home, Monte seu PC, desempenho, histórico, tema, login)
img/                ícones, formas e fotos dos produtos
scripts/            servidor local, atualização de preços e preparação para publicar
supabase/           SQL das tabelas do banco (schema.sql + migrações)
.github/workflows/  atualização diária dos preços
```

## Como rodar localmente

Requer [Node.js](https://nodejs.org) instalado.

```bash
npm run dev
```

Depois abra http://localhost:3000 no navegador.

## Atualizar os preços

1. Copie `.env.example` para `.env` e preencha com os dados do projeto Supabase.
2. Rode:

```bash
npm run precos
```

O arquivo `.env` guarda a chave secreta e não é enviado para o GitHub.
