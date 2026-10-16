-- =====================================================================
-- PreçoBit - estrutura do banco no Supabase
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================


-- ---------- Perfis (dados do "Meu cadastro") ----------
create table if not exists public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text,
  telefone      text,
  cidade        text,
  alertas       boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

drop policy if exists "perfil: ver o proprio" on public.perfis;
create policy "perfil: ver o proprio" on public.perfis
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "perfil: criar o proprio" on public.perfis;
create policy "perfil: criar o proprio" on public.perfis
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "perfil: editar o proprio" on public.perfis;
create policy "perfil: editar o proprio" on public.perfis
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Cria o perfil automaticamente quando alguém cria uma conta
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, new.raw_user_meta_data ->> 'nome')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();


-- ---------- Produtos ----------
create table if not exists public.produtos (
  slug          text primary key,           -- ex: "nvidia-geforce-rtx-5060-8gb"
  nome          text not null,
  categoria     text not null,
  imagem        text,                        -- nome do arquivo em img/produtos/
  atualizado_em timestamptz not null default now()
);

-- Ranking de mais vendidos / mais procurados (migração 002)
alter table public.produtos add column if not exists popularidade integer;
alter table public.produtos add column if not exists selo text;
create index if not exists produtos_popularidade_idx on public.produtos (popularidade);

alter table public.produtos enable row level security;

-- Qualquer um pode ver os produtos; só o script (chave service_role) grava
drop policy if exists "produtos: leitura publica" on public.produtos;
create policy "produtos: leitura publica" on public.produtos
  for select to anon, authenticated using (true);


-- ---------- Ofertas (preço de cada loja) ----------
create table if not exists public.ofertas (
  id            bigint generated always as identity primary key,
  produto_slug  text not null references public.produtos (slug) on delete cascade,
  loja          text not null,
  titulo        text,
  preco         numeric(10, 2) not null,
  preco_normal  numeric(10, 2),
  link          text not null,
  atualizado_em timestamptz not null default now(),
  unique (produto_slug, loja)
);

create index if not exists ofertas_produto_slug_idx on public.ofertas (produto_slug);

alter table public.ofertas enable row level security;

drop policy if exists "ofertas: leitura publica" on public.ofertas;
create policy "ofertas: leitura publica" on public.ofertas
  for select to anon, authenticated using (true);


-- ---------- Favoritos ----------
create table if not exists public.favoritos (
  usuario_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  produto_slug  text not null references public.produtos (slug) on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (usuario_id, produto_slug)
);

alter table public.favoritos enable row level security;

drop policy if exists "favoritos: ver os proprios" on public.favoritos;
create policy "favoritos: ver os proprios" on public.favoritos
  for select to authenticated using ((select auth.uid()) = usuario_id);

drop policy if exists "favoritos: adicionar os proprios" on public.favoritos;
create policy "favoritos: adicionar os proprios" on public.favoritos
  for insert to authenticated with check ((select auth.uid()) = usuario_id);

drop policy if exists "favoritos: remover os proprios" on public.favoritos;
create policy "favoritos: remover os proprios" on public.favoritos
  for delete to authenticated using ((select auth.uid()) = usuario_id);


-- ---------- Histórico de preços (migração 003) ----------
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
