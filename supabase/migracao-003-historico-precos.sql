-- =====================================================================
-- PreçoBit - migração 003: histórico de preços
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- Um preço por produto, loja e dia (o script de preços grava a cada execução)
create table if not exists public.historico_precos (
  produto_slug  text not null references public.produtos (slug) on delete cascade,
  loja          text not null,
  dia           date not null,
  preco         numeric(10, 2) not null,
  primary key (produto_slug, loja, dia)
);

create index if not exists historico_precos_dia_idx on public.historico_precos (dia);

alter table public.historico_precos enable row level security;

-- Qualquer um pode ver o histórico; só o script (chave service_role) grava
drop policy if exists "historico: leitura publica" on public.historico_precos;
create policy "historico: leitura publica" on public.historico_precos
  for select to anon, authenticated using (true);

-- Resumo por produto: menor preço dos últimos 30 dias e quantos dias de histórico existem.
-- security_invoker: a visão respeita as regras de segurança de quem consulta.
create or replace view public.historico_resumo
with (security_invoker = true) as
select
  produto_slug,
  min(preco) filter (where dia >= current_date - 30) as menor_30_dias,
  count(distinct dia) as dias
from public.historico_precos
group by produto_slug;

grant select on public.historico_resumo to anon, authenticated;
