-- The harvest job (scripts/harvest, harvest/ Docker job on the NAS): a work queue, a heartbeat, a per-request log, and the legacy tables
-- it fills from English Wikipedia (CC BY-SA 4.0) and Wikidata (CC0). Add-only and rerunnable. DS1 only: schema ingest and the legacy_*
-- schemas are never released to production (AGENTS.md section 8). Core rows are NOT built by the job; see harvest/README.md for the
-- db/build steps that read these tables and the ones still missing.

create schema if not exists ingest;
create schema if not exists legacy_files;
create table if not exists legacy_files.raw_archive (name text primary key, saved_on date not null, sha256 text not null, data bytea not null);

-- ---------------------------------------------------------------- the queue

-- One row per thing to read. kind: wd_team_members (target a team's Q-number), wp_team_season, wp_league_season, wp_draft (target an
-- English Wikipedia title), wd_person, wd_label (target a Q-number). gap: DS1 held nothing for it when the planner enqueued it; the
-- worker drains every gap job before it re-reads anything it has. priority: higher first (scripts/harvest/tiers.py).
create table if not exists ingest.harvest_job (
  job_id          bigint generated always as identity primary key,
  kind            text        not null,
  league          text,
  season          smallint,                                  -- start year of the season (or the draft year for wp_draft)
  target          text        not null,
  priority        integer     not null default 0,
  gap             boolean     not null default false,
  state           text        not null default 'queued' check (state in ('queued', 'running', 'done', 'failed', 'gone')),
  attempts        smallint    not null default 0,
  last_revision   bigint,                                    -- Wikipedia revision id, or Wikidata lastrevid, as last read
  last_sha256     text,                                      -- of the archived answer (queries have no revision id)
  last_fetched_at timestamptz,
  next_check_at   timestamptz not null default now(),        -- queued: not before; done/gone/failed: when to look again
  lease_until     timestamptz,                               -- a running job whose lease has passed is taken again (a crash loses nothing)
  refresh_days    smallint    not null default 120,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (kind, target)
);
comment on table ingest.harvest_job is 'Work queue of the harvest job (scripts/harvest). DS1 only.';
create index if not exists harvest_job_due_idx on ingest.harvest_job (priority desc, next_check_at) where state <> 'running';
create index if not exists harvest_job_state_idx on ingest.harvest_job (kind, state);

-- The heartbeat: one row per worker process (the container restarts it about hourly), like ingest.daily_run.
create table if not exists ingest.harvest_run (
  run_id       bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  last_beat_at timestamptz not null default now(),
  finished_at  timestamptz,
  outcome      text not null default 'running' check (outcome in ('running', 'ok', 'failed')),
  host         text,
  git_sha      text,
  summary      jsonb not null default '{}'::jsonb         -- counts per kind: done, unchanged, gone, errors, requests, bytes; paused seconds
);
create index if not exists harvest_run_started_idx on ingest.harvest_run (started_at desc);

-- One row per request sent (not per page): the numbers status.py and the growth estimate come from. Rows older than 90 days are removed by the worker.
create table if not exists ingest.harvest_fetch (
  fetch_id  bigint generated always as identity primary key,
  run_id    bigint references ingest.harvest_run on delete set null,
  at        timestamptz not null default now(),
  kind      text not null,
  items     integer not null default 1,                   -- titles or Q-numbers asked for
  http      smallint,
  bytes     integer not null default 0,                   -- the answer as received
  new_items integer not null default 0,                   -- archived (a revision DS1 did not hold)
  note      text
);
create index if not exists harvest_fetch_at_idx on ingest.harvest_fetch (at desc);

create table if not exists ingest.harvest_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- English Wikipedia (CC BY-SA 4.0)

create schema if not exists legacy_wikipedia_harvest;
comment on schema legacy_wikipedia_harvest is 'Team-season, league-season and draft articles of en.wikipedia.org as parsed by scripts/harvest. CC BY-SA 4.0; authors are each article''s history. Raw answers: legacy_files.raw_archive, names harvest/wikipedia/...';

-- One row per page revision read. The exact answer is legacy_files.raw_archive.data under archive_name (a JSON object holding the page).
create table if not exists legacy_wikipedia_harvest.page (
  page_id        integer generated always as identity primary key,
  kind           text     not null,                       -- wp_team_season | wp_league_season | wp_draft
  league         text     not null,
  season         smallint,
  title          text     not null,                       -- the title asked for
  resolved_title text,                                    -- after redirects
  revision       bigint   not null,
  revision_at    timestamptz,
  sha256         text     not null,
  bytes          integer  not null,
  archive_name   text     not null references legacy_files.raw_archive (name),
  fetched_at     timestamptz not null,
  parser_version smallint not null,
  parse_status   text     not null check (parse_status in ('ok', 'no_data', 'error')),
  parse_error    text,
  loaded_at      timestamptz not null default now(),
  unique (title, revision)
);
create index if not exists page_kind_idx on legacy_wikipedia_harvest.page (kind, league, season);

create table if not exists legacy_wikipedia_harvest.infobox_field (
  page_id integer not null references legacy_wikipedia_harvest.page on delete cascade,
  n       smallint not null,
  field   text not null,
  value   text,                                            -- markup removed
  raw     text,                                            -- as written
  links   text[] not null default '{}',                    -- article titles linked in the value
  primary key (page_id, n)
);

-- Every row of every wikitable of the page, as printed (markup removed), with the section it sat in. Standings, playoff results, award
-- tables and anything else tabular; nothing is interpreted here.
create table if not exists legacy_wikipedia_harvest.wikitable_row (
  page_id  integer  not null references legacy_wikipedia_harvest.page on delete cascade,
  table_no smallint not null,
  row_no   integer  not null,
  section  text,
  caption  text,
  header   text[]   not null default '{}',
  cells    jsonb    not null,                              -- [{"t": text, "l": [linked titles]}, ...]
  primary key (page_id, table_no, row_no)
);

create table if not exists legacy_wikipedia_harvest.roster_row (
  page_id     integer not null references legacy_wikipedia_harvest.page on delete cascade,
  row_no      integer not null,
  src         text    not null default 'roster',           -- roster: the article's roster list or table; stats: its player statistics table (when it has no roster)
  group_label text,                                        -- Quarterbacks, Reserve Lists, ...
  number      text,
  name        text    not null,
  link_title  text,
  position    text,
  height_in   smallint,
  weight_lb   smallint,
  born        date,
  school      text,
  nationality text,
  note        text,
  raw         text,
  primary key (page_id, row_no)
);

create table if not exists legacy_wikipedia_harvest.draft_pick (
  page_id     integer  not null references legacy_wikipedia_harvest.page on delete cascade,
  row_no      integer  not null,
  draft_year  smallint,
  round       smallint,
  overall     smallint,
  team        text,
  player      text     not null,
  link_title  text,
  position    text,
  school      text,
  nationality text,
  note        text,
  raw         jsonb,
  primary key (page_id, row_no)
);

-- ---------------------------------------------------------------- Wikidata (CC0)

create schema if not exists legacy_wikidata_harvest;
comment on schema legacy_wikidata_harvest is 'Team memberships (P54), personal facts and labels from Wikidata, as scripts/harvest read them. CC0. Raw answers: legacy_files.raw_archive, names harvest/wikidata/...';

-- Who played for a team item, with the dates Wikidata gives (precision 9 = year, 10 = month, 11 = day). Replaced whole per team on each read.
create table if not exists legacy_wikidata_harvest.team_member (
  team_qid     text    not null,
  row_no       integer not null,
  person_qid   text    not null,
  person_label text,
  rank         text,
  start_on     date, start_prec smallint,
  end_on       date, end_prec   smallint,
  archive_name text    not null references legacy_files.raw_archive (name),
  fetched_at   timestamptz not null,
  primary key (team_qid, row_no)
);
create index if not exists team_member_person_idx on legacy_wikidata_harvest.team_member (person_qid);

create table if not exists legacy_wikidata_harvest.item (
  qid          text primary key,
  label        text,
  enwiki_title text,
  lastrevid    bigint,
  missing      boolean not null default false,
  redirect_to  text,
  archive_name text,
  fetched_at   timestamptz not null
);

-- Birth (P569) and death (P570) dates, birth place (P19), citizenship (P27), position (P413), height (P2048), mass (P2067) of people; ISO codes (P297, P298),
-- country (P17) and kind (P31) of the places and countries they name. Nothing about ethnicity, religion, health, sex or gender, family or politics is
-- fetched into a table or archived.
create table if not exists legacy_wikidata_harvest.claim (
  qid        text     not null,
  prop       text     not null,
  n          smallint not null,
  rank       text,
  value_qid  text,
  value_on   date,
  value_prec smallint,
  value_num  numeric,
  unit_qid   text,
  value_text text,
  primary key (qid, prop, n)
);
create index if not exists claim_prop_idx on legacy_wikidata_harvest.claim (prop, value_qid);

-- ---------------------------------------------------------------- lock-down and a short summary

do $$
declare r text; t text;
begin
  for r in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'ingest_writer') loop
    for t in select format('%I.%I', schemaname, tablename) from pg_tables
             where (schemaname = 'ingest' and tablename like 'harvest\_%') or schemaname in ('legacy_wikipedia_harvest', 'legacy_wikidata_harvest') loop
      execute format('revoke all on %s from %I', t, r);
    end loop;
  end loop;
end $$;

-- The summary status.py prints, also fine to run by hand: select ingest.harvest_progress();
create or replace function ingest.harvest_progress() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'queue', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'state', state, 'n', n) order by kind, state)
                       from (select kind, state, count(*) n from ingest.harvest_job group by 1, 2) q), '[]'),
    'gap_left', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'league', coalesce(league, '-'), 'n', n) order by kind, league)
                          from (select kind, league, count(*) n from ingest.harvest_job
                                where gap and state in ('queued', 'running', 'failed') group by 1, 2) g), '[]'),
    'today', (select jsonb_build_object('requests', count(*), 'bytes', coalesce(sum(bytes), 0), 'archived', coalesce(sum(new_items), 0))
              from ingest.harvest_fetch where at >= date_trunc('day', now())),
    'per_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'requests', r, 'bytes', b, 'archived', a) order by d desc)
                         from (select at::date d, count(*) r, sum(bytes) b, sum(new_items) a from ingest.harvest_fetch
                               where at >= now() - interval '7 days' group by 1) x), '[]'),
    'last_run', (select to_jsonb(r) from (select run_id, started_at, last_beat_at, finished_at, outcome, host, git_sha, summary
                                          from ingest.harvest_run order by started_at desc limit 1) r),
    'last_error', (select jsonb_build_object('kind', kind, 'target', target, 'error', error, 'at', updated_at)
                   from ingest.harvest_job where error is not null and state <> 'gone' order by updated_at desc limit 1),
    'archive_rows', (select count(*) from legacy_wikipedia_harvest.page) + (select count(*) from legacy_wikidata_harvest.item)
  )
$$;
