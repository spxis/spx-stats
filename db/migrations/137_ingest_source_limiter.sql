-- The shared rate limiter and short cache for requests to score sources (scripts/daily/limiter.py). DS1 only, like the rest of schema
-- ingest: not in a release, never on production, nothing the site reads. The scheduled daily job and the release runner's on-demand
-- runs are separate containers on the NAS; this is the one place both can see, so a click can never push a source past its terms.
-- source_limiter: one row per source (sources.py): the token bucket, who holds the source now, and the queue of callers.
-- source_cache: the last answer per source and key (a game, a page, a request), kept about a minute and deleted after an hour.
-- Rerunnable.
begin;
create table if not exists ingest.source_limiter (
  source      text primary key,
  state       jsonb not null default '{}'::jsonb,
  version     bigint not null default 0,
  updated_at  timestamptz not null default now()
);
comment on table ingest.source_limiter is 'Token bucket, holder and queue per score source (scripts/daily/limiter.py). Updated by compare-and-swap on version. DS1 only.';
create table if not exists ingest.source_cache (
  source      text not null,
  key         text not null,
  fetched_at  timestamptz not null default now(),
  value       jsonb not null,
  primary key (source, key)
);
comment on table ingest.source_cache is 'The last answer per score source and key, reused for about a minute (scripts/daily/limiter.py). DS1 only.';
create index if not exists source_cache_fetched_idx on ingest.source_cache (fetched_at);
revoke all on ingest.source_limiter, ingest.source_cache from public;
do $$
declare r text;
begin
  for r in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'ingest_writer') loop
    execute format('revoke all on ingest.source_limiter, ingest.source_cache from %I', r);
  end loop;
end $$;
commit;
