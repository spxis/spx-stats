-- Data releases: production changes only through numbered, validated, logged releases that John approves at /admin/data.
-- DS1 holds the full content of every release; production holds the same row plus John's approval. Nothing in these
-- tables is readable or writable by the public API roles. The site reaches them through the three api functions below,
-- each of which needs the approval secret (a long random string kept in the site's environment; only its sha256 is stored).
-- Apply on DS1 and on production. Then, on production only, store the secret's hash (the hash is not secret):
--   insert into meta.release_secret (secret_hash) values ('<sha256 hex of the secret>')
--     on conflict (id) do update set secret_hash = excluded.secret_hash;

create table if not exists meta.data_release (
  id           bigint primary key,
  number       text not null unique check (number ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$'),
  kind         text not null check (kind in ('publish', 'ds1_step', 'rollback')),
  title        text not null check (length(title) between 3 and 200),
  notes        text,
  ticket       text,
  tables       text[] not null default '{}',
  options      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected', 'running', 'done', 'failed', 'rolled_back')),
  digest       text not null,
  preview      jsonb,
  checks       jsonb,
  result       jsonb,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  approved_by  text,
  approved_at  timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  git_sha      text,
  error        text
);
comment on table meta.data_release is 'One numbered data release. options: replace (a table may shrink), file (ds1_step), rollback_of (release number). digest pins what was previewed.';
comment on column meta.data_release.digest is 'sha256 of kind, tables, options, git_sha and the preview fingerprints; the runner refuses an approved release whose production row does not match DS1''s copy.';

create table if not exists meta.sync_status (
  table_name  text primary key,
  ds1_rows    bigint,
  prod_rows   bigint,
  state       text not null check (state in ('same', 'differs')),
  checked_at  timestamptz not null default now(),
  detail      text
);
comment on table meta.sync_status is 'Result of the last DS1 versus production comparison, one row per table (written by release.py drift).';

create table if not exists meta.release_secret (
  id           boolean primary key default true check (id),
  secret_hash  text not null
);
comment on table meta.release_secret is 'sha256 (hex) of the approval secret. Production only. One row.';

alter table meta.data_release enable row level security;
alter table meta.sync_status enable row level security;
alter table meta.release_secret enable row level security;
revoke all on meta.data_release, meta.sync_status, meta.release_secret from public, anon, authenticated;

-- helper: is this the approval secret? Not callable through the API.
create or replace function api.release_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_secret is not null and length(p_secret) >= 32
     and exists (select 1 from meta.release_secret s
                 where s.secret_hash = encode(sha256(convert_to(p_secret, 'utf8')), 'hex'));
$$;
revoke all on function api.release_secret_ok(text) from public, anon, authenticated;

-- the only write the site can make: pending -> approved or rejected, never on a release with blockers
create or replace function api.approve_release(p_secret text, p_id bigint, p_approve boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_number text;
  v_actor text := btrim(coalesce(p_actor, ''));
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_actor) < 1 or length(v_actor) > 80 or p_approve is null then
    raise exception 'bad request' using errcode = '22023';
  end if;
  update meta.data_release
     set status = case when p_approve then 'approved' else 'rejected' end,
         approved_by = v_actor,
         approved_at = now()
   where id = p_id
     and status = 'pending'
     and (not p_approve or coalesce(jsonb_array_length(preview -> 'blockers'), 0) = 0)
  returning number into v_number;
  if v_number is null then
    raise exception 'release is not pending, or it has blockers' using errcode = '22023';
  end if;
  return jsonb_build_object('number', v_number, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;
revoke all on function api.approve_release(text, bigint, boolean, text) from public;
grant execute on function api.approve_release(text, bigint, boolean, text) to anon, authenticated;

-- everything /admin/data shows, in one call
create or replace function api.release_dashboard(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not api.release_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pending', (select coalesce(jsonb_agg(to_jsonb(r) - 'digest' order by r.id), '[]'::jsonb)
                from meta.data_release r where r.status = 'pending'),
    'approved', (select coalesce(jsonb_agg(to_jsonb(r) - 'digest' - 'preview' - 'checks' order by r.id), '[]'::jsonb)
                 from meta.data_release r where r.status in ('approved', 'running')),
    'recent', (select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint desc), '[]'::jsonb)
               from (select to_jsonb(r) - 'digest' - 'preview' - 'checks' as x
                     from meta.data_release r where r.status not in ('pending', 'approved', 'running')
                     order by r.id desc limit 30) q),
    'sync', (select coalesce(jsonb_agg(to_jsonb(s) order by s.table_name), '[]'::jsonb) from meta.sync_status s),
    'space', (select coalesce(jsonb_agg(jsonb_build_object('table', t.name, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb)
              from (select c.relnamespace::regnamespace::text || '.' || c.relname as name, pg_total_relation_size(c.oid) as bytes
                    from pg_class c
                    where c.relkind in ('r', 'p') and not c.relispartition
                      and c.relnamespace::regnamespace::text in ('core', 'meta', 'ref')) t),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;
revoke all on function api.release_dashboard(text) from public;
grant execute on function api.release_dashboard(text) to anon, authenticated;

-- the footer: the newest finished release that changed production data
create or replace view api.data_version as
select number, finished_at
from meta.data_release
where status = 'done' and kind in ('publish', 'rollback')
order by finished_at desc nulls last, id desc
limit 1;
grant select on api.data_version to anon, authenticated;

notify pgrst, 'reload schema';
