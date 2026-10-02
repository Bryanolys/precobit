-- =====================================================================
-- PreçoBit - migração 002: ranking de mais vendidos / mais procurados
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- popularidade: posição no ranking (número menor = mais popular; vazio = fora do ranking)
alter table public.produtos add column if not exists popularidade integer;

-- selo: texto do destaque mostrado no card (ex.: "Mais vendido")
alter table public.produtos add column if not exists selo text;

create index if not exists produtos_popularidade_idx on public.produtos (popularidade);
