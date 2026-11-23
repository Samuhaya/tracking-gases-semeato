-- Tracking Gases Semeato: armazenamento de documentos com regras por papel
create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
create table if not exists public.donos (
  email text primary key,
  criado_em timestamptz not null default now()
);
alter table public.docs enable row level security;
alter table public.donos enable row level security;

create or replace function public.meu_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

create or replace function public.eh_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.donos where email = public.meu_email() and public.meu_email() <> '')
$$;

create or replace function public.tem_dono() returns boolean
language sql stable security definer set search_path = public as $$ select exists(select 1 from public.donos) $$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_dono() or exists(
    select 1 from public.docs d, jsonb_array_elements(coalesce(d.data->'lista','[]'::jsonb)) u
    where d.col = 'config' and d.id = 'usuarios'
      and u->>'papel' = 'adm'
      and coalesce((u->>'ativo')::boolean, true)
      and lower(u->>'email') = public.meu_email()
      and public.meu_email() <> '')
$$;

-- Horário de uso (Brasília), lido de config/horario; padrão 07:30–18:00
create or replace function public.dentro_horario() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ini time := '07:30'; fim time := '18:00'; agora time := (now() at time zone 'America/Sao_Paulo')::time; d jsonb;
begin
  select data into d from public.docs where col = 'config' and id = 'horario';
  if d is not null then
    begin ini := coalesce(nullif(d->>'inicio','')::time, ini); fim := coalesce(nullif(d->>'fim','')::time, fim);
    exception when others then null; end;
  end if;
  if ini <= fim then return agora >= ini and agora < fim; end if;
  return agora >= ini or agora < fim;
end $$;

create or replace function public.minha_pasta(c text, i text) returns boolean
language sql stable as $$
  select auth.uid() is not null and (
    (c = 'registros' and i = auth.uid()::text) or c like 'registros/' || auth.uid()::text || '/%')
$$;

drop policy if exists docs_ler on public.docs;
drop policy if exists docs_adm on public.docs;
drop policy if exists docs_op_inserir on public.docs;
drop policy if exists docs_op_alterar on public.docs;
drop policy if exists docs_op_apagar on public.docs;
create policy docs_ler on public.docs for select to authenticated
  using (public.eh_admin() or public.minha_pasta(col, id));
create policy docs_adm on public.docs for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy docs_op_inserir on public.docs for insert to authenticated
  with check (public.minha_pasta(col, id) and public.dentro_horario());
create policy docs_op_alterar on public.docs for update to authenticated
  using (public.minha_pasta(col, id)) with check (public.minha_pasta(col, id) and public.dentro_horario());
create policy docs_op_apagar on public.docs for delete to authenticated
  using (public.minha_pasta(col, id));

create or replace function public.tocar_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists docs_updated on public.docs;
create trigger docs_updated before update on public.docs for each row execute function public.tocar_updated_at();

-- Nomes e e-mails das pessoas (só para ADM)
create or replace function public.perfis(ids uuid[]) returns table(id uuid, email text, nome text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, coalesce(u.raw_user_meta_data->>'nome','')
  from auth.users u where u.id = any(ids) and public.eh_admin()
$$;

grant execute on function public.meu_email(), public.eh_dono(), public.tem_dono(), public.eh_admin(), public.dentro_horario(), public.perfis(uuid[]) to authenticated;
grant execute on function public.tem_dono() to anon;
grant select, insert, update, delete on public.docs to authenticated;
revoke all on public.donos from anon, authenticated;

-- Tempo real
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- Fotos e arquivos (privados)
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 20971520)
on conflict (id) do nothing;
drop policy if exists arq_ler on storage.objects;
drop policy if exists arq_enviar on storage.objects;
drop policy if exists arq_apagar on storage.objects;
create policy arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and (public.eh_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and (public.eh_admin() or (storage.foldername(name))[1] = auth.uid()::text));
