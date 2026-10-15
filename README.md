# PreçoBit

Comparador de preços de hardware (processadores, placas de vídeo, placas-mãe, memória RAM, SSDs e fontes) com preços reais da KaBuM e da Amazon.

**Site no ar:** https://joyful-capybara-d345ff.netlify.app

## Funcionalidades

- Login, cadastro e recuperação de senha (Supabase Auth), com tela em efeito de vidro
- Busca, filtros por categoria e favoritos
- Ranking dos produtos mais vendidos e mais procurados
- Layout adaptado para celular

## Tecnologias

- HTML, CSS e JavaScript puro (sem framework)
- [Supabase](https://supabase.com) para banco de dados e autenticação
- Node.js para os scripts de atualização de preços e o servidor local
- Netlify para hospedagem

## Estrutura

```
index.html          tela de login
pages/              home e página de nova senha
css/                estilos
js/                 lógica do site (login, home, produtos, config do Supabase)
img/                ícones, formas e fotos dos produtos
scripts/            servidor local, atualização de preços e preparação para publicar
supabase/           SQL das tabelas do banco
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
