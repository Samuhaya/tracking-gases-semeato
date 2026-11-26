-- Visão de cada responsável recalculada no próprio banco, a cada mudança (não depende do ADM abrir o app)
create or replace function public.rebuild_visoes() returns void
language plpgsql security definer set search_path = public, auth as $$
declare r record; fab text; pay jsonb; hor jsonb; lista jsonb;
begin
  select data into hor from public.docs where col = 'config' and id = 'horario';
  hor := jsonb_build_object('inicio', coalesce(hor->>'inicio', '07:30'), 'fim', coalesce(hor->>'fim', '18:00'));
  select data->'lista' into lista from public.docs where col = 'config' and id = 'usuarios';
  lista := coalesce(lista, '[]'::jsonb);
  for r in
    select u.id as uid, lower(u.email) as email,
           (select e from jsonb_array_elements(lista) e where lower(e->>'email') = lower(u.email) limit 1) as item
    from auth.users u
    where u.email is not null and not exists (select 1 from public.donos d where d.email = lower(u.email))
  loop
    if r.item is not null and r.item->>'papel' = 'adm' then continue; end if;
    if r.item is null then
      pay := jsonb_build_object('fabricaId', '', 'motivo', 'semcadastro', 'email', r.email, 'horario', hor);
    elsif coalesce((r.item->>'ativo')::boolean, true) = false then
      pay := jsonb_build_object('fabricaId', '', 'motivo', 'desativado', 'email', r.email, 'horario', hor);
    elsif coalesce(r.item->>'fabricaId', '') = '' then
      pay := jsonb_build_object('fabricaId', '', 'motivo', 'semfabrica', 'email', r.email, 'horario', hor);
    else
      fab := r.item->>'fabricaId';
      pay := jsonb_build_object(
        'fabricaId', fab,
        'fabrica', (select jsonb_build_object('id', u2.id, 'nome', u2.data->>'nome', 'icone', coalesce(u2.data->>'icone', '')) from public.docs u2 where u2.col = 'unidades' and u2.id = fab),
        'tanques', coalesce((select jsonb_agg(jsonb_build_object(
            'id', t.id, 'gasId', t.data->>'gasId', 'unidadeId', t.data->>'unidadeId',
            'codigo', coalesce(t.data->>'codigo', ''), 'capacidade', coalesce(t.data->>'capacidade', ''), 'modelo', coalesce(t.data->>'modelo', ''),
            'nivel', coalesce(t.data->'nivel', '""'::jsonb), 'nivelPol', coalesce(t.data->'nivelPol', '""'::jsonb),
            'unidadeLeitura', coalesce(t.data->>'unidadeLeitura', ''), 'polCheio', coalesce(t.data->'polCheio', '""'::jsonb), 'tabelaPol', coalesce(t.data->>'tabelaPol', ''),
            'ultimaLeitura', coalesce(t.data->>'ultimaLeitura', ''), 'fotoId', coalesce(t.data->>'fotoId', ''), 'exemplo', coalesce((t.data->>'exemplo')::boolean, false)) order by t.id)
          from public.docs t where t.col = 'tanques' and t.data->>'unidadeId' = fab), '[]'::jsonb),
        'gases', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.data->>'nome', 'medida', coalesce(g.data->>'medida', ''))) from public.docs g
          where g.col = 'gases' and (g.id in (select t.data->>'gasId' from public.docs t where t.col = 'tanques' and t.data->>'unidadeId' = fab)
                                  or g.id in (select s.data->>'gasId' from public.docs s where s.col = 'usos' and s.data->>'unidadeId' = fab))), '[]'::jsonb),
        'leituras', coalesce((select jsonb_agg(x.j order by x.d desc) from (
            select l.data->>'data' as d, jsonb_build_object('id', l.id, 'tanqueId', l.data->>'tanqueId', 'nivel', coalesce(l.data->'nivel', '""'::jsonb),
              'nivelPol', coalesce(l.data->'nivelPol', '""'::jsonb), 'data', l.data->>'data', 'fotoId', coalesce(l.data->>'fotoId', ''), 'exemplo', coalesce((l.data->>'exemplo')::boolean, false)) as j
            from public.docs l where l.col = 'leituras' and l.data->>'tanqueId' in (select t.id from public.docs t where t.col = 'tanques' and t.data->>'unidadeId' = fab)
            order by l.data->>'data' desc limit 60) x), '[]'::jsonb),
        'horario', hor, 'motivo', '', 'email', r.email);
    end if;
    insert into public.docs(col, id, data) values ('registros/' || r.uid::text || '/visao', 'dados', pay)
      on conflict (col, id) do update set data = excluded.data where public.docs.data is distinct from excluded.data;
  end loop;
end $$;

create or replace function public.trg_visoes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform public.rebuild_visoes();
  return null;
end $$;
drop trigger if exists docs_visoes on public.docs;
create trigger docs_visoes after insert or update or delete on public.docs for each statement execute function public.trg_visoes();
select public.rebuild_visoes();
