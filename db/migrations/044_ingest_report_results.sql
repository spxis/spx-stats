-- The narrow database API for incremental game results: ingest.report_results(observations jsonb).
--
-- DESIGN (the longer version, with the numbers, is in scripts/daily/README.md "The ingest API")
--
--   History stays bulk (loads, db/build steps). Daily and live results are REPORTED: a writer calls ONE function and has no
--   table privileges at all. The function (SECURITY DEFINER, fixed search_path) owns the invariants:
--     1. appends each observation to ingest.game_observation (insert-only; the same observation again only bumps
--        last_seen / seen_count and adds no row);
--     2. matches it to a core.game (franchise keys + date, never database ids) and applies the game STATE MACHINE below;
--     3. writes meta.verification (confirmed / disputed) and meta.data_issue;
--     4. returns what changed (games, with league and date) so a caller can log it or refresh pages.
--   New games and seasons are NOT made here: they stay on the bulk path (db/build/152 and the insert-only loads). An
--   observation with no game in core is stored with outcome 'unmatched' and a data issue, and is applied when the game arrives
--   (the same observation reported again, or ingest.replay()).
--
--   The ingest schema is not exposed through PostgREST (production exposes only api); every grant is to ingest_writer
--   (migration 045), a NOLOGIN role that can execute report_results and nothing else.
--
-- GAME KEY. A game in an observation is identified by league, season, phase, date, the two clubs as FRANCHISE KEYS
--   ('<meta.source code>:<core.franchise.source_key>', e.g. 'spx_database:26' for the Maple Leafs; immutable provenance that
--   a rebuild and production both keep, unlike franchise_id) and game_no (the second game of a doubleheader is 1). game_ref is
--   the reporter's own key for that tuple ('wpdaily:<league>:<season>:<phase>:<date>:<home>:<away>:<n>'). A core.game is found by
--   (pass 0) its source_key or external id = game_ref, else (pass 1-5) the same two clubs on the same day, a day either side,
--   up to 3 days apart for a game without a result, or a postponed game waiting for a new date.
--
-- STATE MACHINE (core.game.status; o = the observation)
--     now \ o        scheduled      in_progress    final                postponed     suspended     cancelled
--     scheduled      same (move*)   -> in_progress -> final             -> postponed  -> suspended  -> cancelled
--     in_progress    ignored        same (scores)  -> final             -> postponed  -> suspended  -> cancelled
--     postponed      -> scheduled*  -> in_progress -> final*            same          ignored       -> cancelled
--     suspended      ignored        -> in_progress -> final             ignored       same          -> cancelled
--     cancelled      terminal: everything else is rejected
--     final/forfeit  TERMINAL. o=final: same score -> verification 'confirmed'; other score -> REJECTED: verification 'disputed' +
--                    data issue "Kept existing; needs a third source"; anything else -> ignored (the report is behind).
--   * a date change is recorded in original_date (postponed -> scheduled/final always; scheduled/final when more than a day).
--   * o=final needs both scores (a table check) and a verdict that is not 'disputed' (the reporter's cross-check found the
--     sources disagreeing: nothing finalizes, a data issue says so). verdict 'single' finals are allowed and flagged.
--   * SPX-era and other sources' FINAL games are never changed, only confirmed or disputed.
--
-- STORAGE. One row per CHANGE of a game's reported state (about 400 bytes with its indexes), not one per sighting: a game costs
--   2-3 rows over its life (scheduled, final, a single-source -> confirmed upgrade). Daily: about 4,200 rows for the first
--   sighting of a season's games, then roughly 60 rows a day across the five leagues, about 25,000 a year (about 10 MB). A 5-minute
--   live poll adds one row per score change per game while it is on: roughly 700 rows a day in season, 250,000 a year (about 100 MB)
--   unless superseded in_progress rows are pruned (documented in the README; nothing prunes them yet).
--
-- Rerunnable (create ... if not exists / create or replace). Apply with scripts/mac/ds1-apply.sh.
begin;

create schema if not exists ingest;
comment on schema ingest is 'Incremental game results reported through ingest.report_results(). Not exposed through PostgREST; no role but ingest_writer (execute on that one function) and the owner touches it.';
revoke all on schema ingest from public;

create table if not exists ingest.game_observation (
  observation_id bigint generated always as identity primary key,
  game_ref       text not null,                       -- the reporter's key for this game; one chain of observations per game_ref
  league         text not null check (league in ('nhl', 'nba', 'mlb', 'nfl', 'cfl')),
  season         smallint not null,
  phase          text not null check (phase in ('regular', 'playoffs')),
  round          text,
  game_date      date not null,
  game_no        smallint not null default 0 check (game_no >= 0),   -- order within the day for the same two clubs
  home_key       text not null,                       -- franchise keys, '<source code>:<source key>'
  away_key       text not null,
  home_name      text,                                -- display only, for messages
  away_name      text,
  home_known     boolean not null default true,       -- false: the sources do not say who is home (neutral site); sides are arbitrary
  neutral        boolean not null default false,
  status         text not null check (status in ('scheduled', 'in_progress', 'final', 'postponed', 'suspended', 'cancelled')),
  home_score     smallint check (home_score >= 0),
  away_score     smallint check (away_score >= 0),
  overtime       boolean,
  shootout       boolean,
  ot_periods     smallint,
  verdict        text not null default 'none' check (verdict in ('none', 'single', 'confirmed', 'resolved', 'disputed')),   -- the reporter's cross-check
  source         text not null,                       -- the best-ranked source behind the score ('wikipedia', 'nflverse', ...)
  ref            text,                                -- that source's reference (page@revision, file sha256)
  agree          text[] not null default '{}',        -- references of every source that gave the reported score
  conflict       jsonb not null default '[]',         -- [{ref, source, home_score, away_score}] of sources that gave another score
  dissent        text[] not null default '{}',        -- the same, as sentences ("A page + nflverse say X 3, Y 2")
  notes          text[] not null default '{}',
  content_hash   text not null,                       -- md5 of everything above that is not a reference or a display name
  reporter       text not null default session_user,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  seen_count     integer not null default 1,
  outcome        text check (outcome in ('applied', 'unchanged', 'confirmed', 'rejected', 'held', 'ignored', 'unmatched')),
  outcome_detail text,
  game_id        bigint,                              -- the core.game it was applied to (informational: ids are not stable across a rebuild)
  applied_at     timestamptz,
  check (status <> 'final' or (home_score is not null and away_score is not null)),
  check (home_key <> away_key)
);
comment on table ingest.game_observation is 'Append-only log of reported game states (one row per change of a game''s reported state). The outcome columns say what applying it did. Replayed by ingest.replay() after a rebuild.';
create index if not exists game_observation_ref_idx on ingest.game_observation (game_ref, observation_id desc);
create index if not exists game_observation_day_idx on ingest.game_observation (league, season, game_date);
create index if not exists game_observation_unmatched_idx on ingest.game_observation (observation_id) where outcome = 'unmatched';
alter table ingest.game_observation enable row level security;      -- no policies: nothing but the owner reads it
revoke all on ingest.game_observation from public;

-- ------------------------------------------------------------------------------------------------ keys

create or replace function ingest.daily_source() returns smallint
language sql stable set search_path = pg_catalog, pg_temp
as $$ select source_id from meta.source where code = 'wikipedia_daily' $$;

create or replace function ingest.franchise_key(p_franchise_id integer) returns text
language sql stable set search_path = pg_catalog, pg_temp
as $$ select s.code || ':' || f.source_key from core.franchise f join meta.source s on s.source_id = f.source_id
      where f.franchise_id = p_franchise_id and f.source_key is not null $$;

create or replace function ingest.franchise_id(p_key text) returns integer
language sql stable set search_path = pg_catalog, pg_temp
as $$ select f.franchise_id from core.franchise f join meta.source s on s.source_id = f.source_id
      where strpos(p_key, ':') > 1 and s.code = split_part(p_key, ':', 1) and f.source_key = substr(p_key, strpos(p_key, ':') + 1) $$;

create or replace function ingest.content_hash(r ingest.game_observation) returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select md5(concat_ws('|', r.game_ref, r.league, r.season, r.phase, coalesce(r.round, ''), r.game_date, r.game_no, r.home_key, r.away_key,
                           r.home_known, r.neutral, r.status, coalesce(r.home_score::text, ''), coalesce(r.away_score::text, ''),
                           coalesce(r.overtime::text, ''), coalesce(r.shootout::text, ''), coalesce(r.ot_periods::text, ''),
                           r.verdict, r.source, (select coalesce(string_agg(x, '; ' order by x), '') from unnest(r.dissent) x))) $$;

-- ------------------------------------------------------------------------------------------------ issues and verifications

-- Opens (or updates, or reopens) a data issue of the daily source. -> true when a row was added or changed.
create or replace function ingest.raise_issue(p_key text, p_issue text, p_resolution text) returns boolean
language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare d smallint := ingest.daily_source(); n integer;
begin
  update meta.data_issue i set resolution = p_resolution, resolved_at = null
   where i.source_id = d and i.entity_kind = 'game' and i.entity_key = p_key and i.issue = p_issue
     and (i.resolution is distinct from p_resolution or i.resolved_at is not null);
  get diagnostics n = row_count;
  if n > 0 then return true; end if;
  if exists (select 1 from meta.data_issue i where i.source_id = d and i.entity_kind = 'game' and i.entity_key = p_key and i.issue = p_issue) then return false; end if;
  insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution) values (d, 'game', p_key, p_issue, p_resolution);
  return true;
end $$;

-- Closes the open issues of the daily source for a game whose text starts with p_prefix.
create or replace function ingest.resolve_issue(p_key text, p_prefix text) returns integer
language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare n integer;
begin
  update meta.data_issue i set resolved_at = now()
   where i.source_id = ingest.daily_source() and i.entity_kind = 'game' and i.entity_key = p_key and i.resolved_at is null
     and left(i.issue, length(p_prefix)) = p_prefix;
  get diagnostics n = row_count;
  return n;
end $$;

-- A 'disputed' verification is sticky: only a person clears it.
create or replace function ingest.set_verification(p_game bigint, p_status meta.verification_status, p_value text) returns boolean
language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare n integer;
begin
  insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
  values ('game', p_game, 'score', p_status, ingest.daily_source(), p_value)
  on conflict (entity_kind, entity_id, field, source_id) do update
    set status = excluded.status, their_value = excluded.their_value, checked_at = now()
    where (meta.verification.status, meta.verification.their_value) is distinct from (excluded.status, excluded.their_value)
      and (excluded.status = 'disputed' or meta.verification.status <> 'disputed');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ------------------------------------------------------------------------------------------------ matching

-- Which core.game is this? -> (game_id, pass) or nulls. Never creates anything.
--   pass 0 its key; 1 same day, same sides; 2 a day either side, same sides; 3 a day either side, sides reversed;
--   4 up to 3 days apart for a game with no result; 5 a postponed game waiting for a new date (the nearest earlier one).
-- A game another observation chain already holds (its key or external id belongs to another game_ref whose latest observation is
-- on the game's own date and is not 'postponed': a postponed game waits for a new date) is not available; from pass 2 on neither is a game that another chain's latest observation names by date.
create or replace function ingest.match_game(p_league text, p_season integer, p_hf integer, p_af integer, p_date date, p_ref text, p_status text,
                                             out o_game_id bigint, out o_pass smallint)
language plpgsql stable set search_path = pg_catalog, pg_temp
as $$
declare sid integer; d smallint := ingest.daily_source(); hk text := ingest.franchise_key(p_hf); ak text := ingest.franchise_key(p_af);
begin
  select season_id into sid from core.season where league_code = p_league and start_year = p_season;
  if sid is null then return; end if;
  select g.game_id into o_game_id from core.game g where g.season_id = sid and g.source_id = d and g.source_key = p_ref;
  if found then o_pass := 0; return; end if;
  select g.game_id into o_game_id from core.external_id e join core.game g on g.game_id = e.entity_id
   where e.source_id = d and e.entity_kind = 'game' and e.external_key = p_ref and g.season_id = sid;
  if found then o_pass := 0; return; end if;
  select c.game_id, c.p into o_game_id, o_pass
  from (
    select g.game_id, g.game_date, g.status,
           case when g.game_date = p_date and h.franchise_id = p_hf then 1
                when abs(g.game_date - p_date) <= 1 and h.franchise_id = p_hf and g.status <> 'cancelled' then 2
                when abs(g.game_date - p_date) <= 1 and g.status <> 'cancelled' then 3
                when g.status not in ('final', 'forfeit', 'cancelled') and abs(g.game_date - p_date) <= 3 then 4
                when g.status = 'postponed' and p_status in ('scheduled', 'in_progress', 'final') and g.game_date <= p_date then 5
           end::smallint as p
    from core.game g
    join core.team_season h on h.team_season_id = g.home_team_season_id
    join core.team_season a on a.team_season_id = g.away_team_season_id
    where g.season_id = sid and g.phase in ('regular', 'playoffs')
      and ((h.franchise_id = p_hf and a.franchise_id = p_af) or (h.franchise_id = p_af and a.franchise_id = p_hf))
  ) c
  where c.p is not null
    -- held by another chain of observations
    and not exists (
      select 1 from ingest.game_observation o
      where o.league = p_league and o.season = p_season and o.game_date = c.game_date and o.game_ref <> p_ref and o.status <> 'postponed'
        and o.observation_id = (select max(o2.observation_id) from ingest.game_observation o2 where o2.game_ref = o.game_ref)
        and (   exists (select 1 from core.game g2 where g2.game_id = c.game_id and g2.source_id = d and g2.source_key = o.game_ref)
             or exists (select 1 from core.external_id e2 where e2.source_id = d and e2.entity_kind = 'game' and e2.entity_id = c.game_id and e2.external_key = o.game_ref)
             or (c.p >= 2 and ((o.home_key = hk and o.away_key = ak) or (o.home_key = ak and o.away_key = hk)))))
  order by c.p, case when c.p = 1 then (c.status = 'final')::int * -1 end, abs(c.game_date - p_date), c.game_id
  limit 1;
end $$;

-- Is a game that has no match worth making? Used by db/build/152 (staged games) and ingest.replay() (observations).
-- Finals (not disputed), cancelled and live games always; scheduled games only in a season no other source holds.
create or replace function ingest.shell_wanted(p_league text, p_season integer, p_status text, p_verdict text) returns boolean
language sql stable set search_path = pg_catalog, pg_temp
as $$ select case when p_status = 'final' then p_verdict <> 'disputed'
                  when p_status in ('cancelled', 'in_progress') then true
                  when p_status = 'scheduled' then not exists (select 1 from core.game g join core.season s using (season_id)
                                                               where s.league_code = p_league and s.start_year = p_season and g.source_id <> ingest.daily_source())
                  else false end $$;

-- A game the bulk path would add: scheduled, no score, source wikipedia_daily; the function then moves it through the state machine.
create or replace function ingest.create_shell(p_league text, p_season integer, p_phase text, p_date date, p_hf integer, p_af integer, p_neutral boolean, p_ref text) returns bigint
language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare d smallint := ingest.daily_source(); sid integer; hts integer; ats integer; gid bigint;
begin
  select season_id into sid from core.season where league_code = p_league and start_year = p_season;
  select team_season_id into hts from core.team_season where franchise_id = p_hf and season_id = sid;
  select team_season_id into ats from core.team_season where franchise_id = p_af and season_id = sid;
  if sid is null or hts is null or ats is null then return null; end if;
  insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status, source_id, source_key)
  values (sid, p_phase::core.season_phase, p_date, hts, ats, p_neutral, 'scheduled', d, p_ref)
  on conflict (source_id, source_key) do nothing returning game_id into gid;
  if gid is not null then
    insert into core.external_id (entity_kind, entity_id, source_id, external_key) values ('game', gid, d, p_ref) on conflict do nothing;
  end if;
  return gid;
end $$;

-- ------------------------------------------------------------------------------------------------ the state machine

-- Applies one stored observation. Internal: called by report_results and replay, which run as the owner.
-- p_create: make the game when there is none and shell_wanted (replay only: the live path leaves that to the bulk step).
-- -> {outcome, detail, game_id, changed:{...}|null, issues:n}
create or replace function ingest.apply_observation(p_id bigint, p_create boolean default false) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare
  o ingest.game_observation%rowtype;
  d smallint := ingest.daily_source();
  hf integer; af integer; m record; gid bigint;
  g record;
  issues integer := 0;
  v_outcome text := 'unchanged'; v_detail text; v_to text; v_changed boolean := false; v_reason text;
  nh smallint; na smallint;           -- the observation's score in the GAME's orientation
  n_ot boolean; n_so boolean; n_date date; n_orig date; n_hs smallint; n_as smallint;
  ours boolean; one_page text := 'Only one club''s Wikipedia page lists this result';
  disagree text;
  created boolean := false;
begin
  select * into o from ingest.game_observation where observation_id = p_id;
  if not found then raise exception 'no observation %', p_id; end if;
  if d is null then raise exception 'meta.source wikipedia_daily is missing: load it (db/build/152 or the bulk copy) before reporting results'; end if;
  disagree := format('Wikipedia sources disagree on %s at %s on %s: %s', o.away_name, o.home_name, o.game_date, array_to_string(o.dissent, '; '));

  hf := ingest.franchise_id(o.home_key); af := ingest.franchise_id(o.away_key);
  if hf is null or af is null or hf = af then
    if ingest.raise_issue(o.game_ref, format('Club not matched to a franchise: %s / %s in %s', o.away_name, o.home_name, o.season), 'Game left out') then issues := issues + 1; end if;
    update ingest.game_observation set outcome = 'unmatched', outcome_detail = 'club not matched to a franchise', game_id = null, applied_at = now() where observation_id = p_id;
    return jsonb_build_object('outcome', 'unmatched', 'detail', 'club not matched to a franchise', 'game_id', null, 'changed', null, 'issues', issues);
  end if;

  select * into m from ingest.match_game(o.league, o.season, hf, af, o.game_date, o.game_ref, o.status);
  gid := m.o_game_id;
  if gid is null and p_create and ingest.shell_wanted(o.league, o.season, o.status, o.verdict) then
    gid := ingest.create_shell(o.league, o.season, o.phase, o.game_date, hf, af, o.neutral, o.game_ref);
    created := gid is not null;
  end if;

  if gid is null then
    -- no game in core: say so, once, and apply when the bulk path has added it
    v_detail := 'no game in core';
    if o.status in ('postponed', 'suspended') then
      if ingest.raise_issue(o.game_ref, format('%s per Wikipedia: %s at %s on %s', initcap(o.status), o.away_name, o.home_name, o.game_date), 'Not added as a game') then issues := issues + 1; end if;
    elsif o.status = 'final' and o.verdict = 'disputed' then
      if ingest.raise_issue(o.game_ref, disagree, 'Not applied; needs a third source') then issues := issues + 1; end if;
    elsif o.status <> 'scheduled' then
      if ingest.raise_issue(o.game_ref, format('No game in core for %s at %s on %s (%s)', o.away_name, o.home_name, o.game_date, o.status), 'Result reported; waiting for the bulk path to add the game') then issues := issues + 1; end if;
    end if;
    update ingest.game_observation set outcome = 'unmatched', outcome_detail = v_detail, game_id = null, applied_at = now() where observation_id = p_id;
    return jsonb_build_object('outcome', 'unmatched', 'detail', v_detail, 'game_id', null, 'changed', null, 'issues', issues);
  end if;

  select x.game_id, x.status::text as status, x.game_date, x.home_score, x.away_score, x.went_to_overtime, x.decided_by_shootout, x.original_date,
         x.source_id, x.source_key, h.franchise_id as gh
    into g
    from core.game x join core.team_season h on h.team_season_id = x.home_team_season_id where x.game_id = gid;
  -- the match is an external id from now on, whatever key the game came with
  if g.source_key <> o.game_ref or g.source_id <> d then
    insert into core.external_id (entity_kind, entity_id, source_id, external_key) values ('game', gid, d, o.game_ref) on conflict do nothing;
  end if;
  nh := case when g.gh = hf then o.home_score else o.away_score end;
  na := case when g.gh = hf then o.away_score else o.home_score end;
  ours := g.source_id = d or exists (select 1 from meta.data_issue i where i.source_id = d and i.entity_kind = 'game' and i.entity_key = g.source_key
                                       and i.issue = 'No result in DS1' and i.resolution like 'Filled from Wikipedia:%');
  v_to := g.status;

  if g.status in ('final', 'forfeit') then
    -- ---------------------------------------------------------------- terminal
    if o.status <> 'final' then
      v_outcome := 'ignored'; v_detail := 'the game is already final';
    elsif o.verdict = 'disputed' then
      v_outcome := 'held'; v_detail := 'sources disagree; the existing result is kept';
      if ingest.raise_issue(g.source_key, disagree || case when not ours then format(' (DS1 has %s-%s)', g.home_score, g.away_score) else '' end, 'Not applied; needs a third source') then issues := issues + 1; end if;
      if ours then perform ingest.set_verification(gid, 'disputed', coalesce(nh::text, '?') || '-' || coalesce(na::text, '?')); end if;
    elsif (nh, na) = (g.home_score, g.away_score) then
      v_outcome := 'confirmed'; v_detail := 'same result';
      if not ours then
        perform ingest.set_verification(gid, 'confirmed', nh || '-' || na);
      elsif o.verdict in ('confirmed', 'resolved') then
        perform ingest.set_verification(gid, 'confirmed', nh || '-' || na);
        issues := issues + ingest.resolve_issue(g.source_key, one_page);
        update meta.data_issue i set resolution = format('Filled from Wikipedia: %s-%s', nh, na)
         where i.source_id = d and i.entity_kind = 'game' and i.entity_key = g.source_key and i.issue = 'No result in DS1'
           and i.resolution = format('Filled from Wikipedia: %s-%s (one club page so far)', nh, na);
        if o.verdict = 'resolved' and ingest.raise_issue(g.source_key, 'Wikipedia sources disagree: ' || array_to_string(o.dissent, '; '), 'Score settled by nflverse') then issues := issues + 1; end if;
      else
        v_outcome := 'unchanged'; v_detail := 'same result from the same single source';
      end if;
    else
      v_outcome := 'rejected'; v_detail := format('final is terminal: existing %s-%s, reported %s-%s', g.home_score, g.away_score, nh, na);
      perform ingest.set_verification(gid, 'disputed', nh || '-' || na);
      if ingest.raise_issue(g.source_key, format('Existing result %s-%s, reported %s-%s', g.home_score, g.away_score, nh, na), 'Kept existing; needs a third source') then issues := issues + 1; end if;
    end if;

  elsif g.status = 'cancelled' then
    if o.status = 'cancelled' then v_detail := 'already cancelled';
    else v_outcome := 'rejected'; v_detail := 'cancelled is terminal'; end if;

  else
    -- ---------------------------------------------------------------- scheduled, in_progress, postponed, suspended
    n_date := g.game_date; n_orig := g.original_date; n_hs := g.home_score; n_as := g.away_score; n_ot := g.went_to_overtime; n_so := g.decided_by_shootout;
    if o.status = 'final' and o.verdict = 'disputed' then
      v_outcome := 'held'; v_detail := 'sources disagree; nothing is finalized';
      if ingest.raise_issue(g.source_key, disagree, 'Not applied; needs a third source') then issues := issues + 1; end if;
    elsif o.status = 'scheduled' then
      if g.status in ('scheduled', 'postponed') then
        v_to := 'scheduled';
        if abs(g.game_date - o.game_date) > 1 or (g.status = 'postponed' and g.game_date <> o.game_date) then n_date := o.game_date; n_orig := coalesce(g.original_date, g.game_date); end if;
      else v_outcome := 'ignored'; v_detail := format('a scheduled report is behind a %s game', g.status); end if;
    elsif o.status = 'in_progress' then
      v_to := 'in_progress';
      if g.status = 'postponed' or abs(g.game_date - o.game_date) > 1 then n_date := o.game_date; n_orig := coalesce(g.original_date, g.game_date); end if;
      if o.home_score is not null and o.away_score is not null then n_hs := nh; n_as := na; end if;
      n_ot := coalesce(o.overtime, g.went_to_overtime);
    elsif o.status = 'final' then
      v_to := 'final'; n_hs := nh; n_as := na;
      n_ot := coalesce(o.overtime, g.went_to_overtime);
      n_so := coalesce(case when o.league = 'nhl' then o.shootout end, g.decided_by_shootout);
      if g.status = 'postponed' or abs(g.game_date - o.game_date) > 1 then n_date := o.game_date; n_orig := coalesce(g.original_date, g.game_date); end if;
    elsif o.status = 'postponed' then
      if g.status in ('scheduled', 'in_progress') then v_to := 'postponed';
      elsif g.status = 'postponed' then v_detail := 'already postponed';
      else v_outcome := 'ignored'; v_detail := format('a postponed report is behind a %s game', g.status); end if;
    elsif o.status = 'suspended' then
      if g.status in ('scheduled', 'in_progress') then v_to := 'suspended';
      elsif g.status = 'suspended' then v_detail := 'already suspended';
      else v_outcome := 'ignored'; v_detail := 'a suspended report for a postponed game'; end if;
    elsif o.status = 'cancelled' then
      v_to := 'cancelled'; n_hs := null; n_as := null; n_ot := null; n_so := null;
    end if;

    if v_outcome = 'unchanged'
       and (v_to, n_date, n_orig, n_hs, n_as, n_ot, n_so) is distinct from (g.status, g.game_date, g.original_date, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout) then
      update core.game set status = v_to::core.game_status, game_date = n_date, original_date = n_orig, home_score = n_hs, away_score = n_as,
                           went_to_overtime = n_ot, decided_by_shootout = n_so, updated_at = now()
       where game_id = gid;
      v_changed := true; v_outcome := 'applied';
      v_reason := case when v_to = 'final' then format('final %s-%s%s', n_hs, n_as, case when o.verdict = 'single' then ' (single source)' else '' end)
                       when n_date <> g.game_date then format('%s, date moved from %s', v_to, g.game_date) else v_to end;
      v_detail := format('%s -> %s', g.status, v_to);
      if v_to = 'final' then
        -- flag and verify exactly as the first daily load did
        if g.source_id <> d then
          if ingest.raise_issue(g.source_key, 'No result in DS1', format('Filled from Wikipedia: %s-%s%s', n_hs, n_as, case when o.verdict = 'single' then ' (one club page so far)' else '' end)) then issues := issues + 1; end if;
        elsif o.verdict = 'single' then
          if ingest.raise_issue(g.source_key, one_page, 'Added; confirmed when the other club''s page agrees') then issues := issues + 1; end if;
        end if;
        if o.verdict in ('confirmed', 'resolved') then perform ingest.set_verification(gid, 'confirmed', n_hs || '-' || n_as); end if;
        if o.verdict = 'resolved' and ingest.raise_issue(g.source_key, 'Wikipedia sources disagree: ' || array_to_string(o.dissent, '; '), 'Score settled by nflverse') then issues := issues + 1; end if;
      end if;
    end if;
  end if;

  -- a game now found, or sources now agreeing, closes what was open about it
  if v_outcome <> 'held' then
    issues := issues + ingest.resolve_issue(o.game_ref, 'No game in core for ');
    if o.status = 'final' and o.verdict <> 'disputed' then
      issues := issues + ingest.resolve_issue(g.source_key, 'Wikipedia sources disagree on ') + ingest.resolve_issue(o.game_ref, 'Wikipedia sources disagree on ');
    end if;
  end if;

  update ingest.game_observation set outcome = v_outcome, outcome_detail = v_detail, game_id = gid, applied_at = now() where observation_id = p_id;
  return jsonb_build_object('outcome', v_outcome, 'detail', v_detail, 'game_id', gid, 'issues', issues,
    'created', created,
    'changed', case when v_changed or created then jsonb_build_object('game_id', gid, 'game_ref', o.game_ref, 'league', o.league, 'season', o.season,
                       'game_date', (select game_date from core.game where game_id = gid), 'from', case when created then null else g.status end, 'to', v_to,
                       'home_score', (select home_score from core.game where game_id = gid), 'away_score', (select away_score from core.game where game_id = gid),
                       'reason', coalesce(v_reason, case when created then 'game added' end)) end);
end $$;

-- ------------------------------------------------------------------------------------------------ the API

create or replace function ingest.report_results(observations jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  n integer; i integer; e jsonb; r ingest.game_observation%rowtype; last_row ingest.game_observation%rowtype; new_id bigint;
  ids bigint[] := '{}'; n_new integer := 0; n_repeat integer := 0;
  res jsonb; outcomes jsonb := '{}'::jsonb; changed jsonb := '[]'::jsonb; issues integer := 0; id bigint;
begin
  if observations is null or jsonb_typeof(observations) <> 'array' then raise exception 'observations must be a JSON array' using errcode = '22023'; end if;
  n := jsonb_array_length(observations);
  if n > 20000 then raise exception 'at most 20000 observations per call (got %)', n using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ingest.report_results', 0));     -- one report at a time

  -- 1. record every observation (a repeat of a game's latest state only bumps last_seen / seen_count)
  for i in 0 .. n - 1 loop
    e := observations -> i;
    begin
      if jsonb_typeof(e) <> 'object' then raise exception 'not a JSON object'; end if;
      r := jsonb_populate_record(null::ingest.game_observation, e);
      r.agree := coalesce(r.agree, '{}'); r.conflict := coalesce(r.conflict, '[]'::jsonb); r.dissent := coalesce(r.dissent, '{}'); r.notes := coalesce(r.notes, '{}');
      r.game_no := coalesce(r.game_no, 0); r.home_known := coalesce(r.home_known, true); r.neutral := coalesce(r.neutral, false); r.verdict := coalesce(r.verdict, 'none');
      if r.status = 'final' and r.verdict = 'none' then raise exception 'a final needs a verdict (single, confirmed, resolved or disputed)'; end if;
      r.content_hash := ingest.content_hash(r);
      select * into last_row from ingest.game_observation o where o.game_ref = r.game_ref order by o.observation_id desc limit 1;
      if found and last_row.content_hash = r.content_hash then
        update ingest.game_observation set last_seen = now(), seen_count = seen_count + 1 where observation_id = last_row.observation_id;
        n_repeat := n_repeat + 1;
        if last_row.outcome is null or last_row.outcome = 'unmatched' then ids := ids || last_row.observation_id; end if;     -- the game may have arrived since
      else
        insert into ingest.game_observation (game_ref, league, season, phase, round, game_date, game_no, home_key, away_key, home_name, away_name, home_known, neutral,
                                             status, home_score, away_score, overtime, shootout, ot_periods, verdict, source, ref, agree, conflict, dissent, notes, content_hash)
        values (r.game_ref, r.league, r.season, r.phase, r.round, r.game_date, r.game_no, r.home_key, r.away_key, r.home_name, r.away_name, r.home_known, r.neutral,
                r.status, r.home_score, r.away_score, r.overtime, r.shootout, r.ot_periods, r.verdict, r.source, r.ref, r.agree, r.conflict, r.dissent, r.notes, r.content_hash)
        returning observation_id into new_id;
        ids := ids || new_id; n_new := n_new + 1;
      end if;
    exception when others then
      raise exception 'observation %: %', i, sqlerrm using errcode = '22023';
    end;
  end loop;

  -- 2. apply the new ones, in the order given
  foreach id in array ids loop
    res := ingest.apply_observation(id, false);
    outcomes := jsonb_set(outcomes, array[res ->> 'outcome'], to_jsonb(coalesce((outcomes ->> (res ->> 'outcome'))::integer, 0) + 1));
    issues := issues + coalesce((res ->> 'issues')::integer, 0);
    if res -> 'changed' is not null and res -> 'changed' <> 'null'::jsonb then changed := changed || (res -> 'changed'); end if;
  end loop;

  return jsonb_build_object('observations', n, 'new', n_new, 'repeat', n_repeat, 'applied_now', coalesce(array_length(ids, 1), 0),
                            'outcomes', outcomes, 'issues_touched', issues, 'changed', changed);
end $$;
comment on function ingest.report_results(jsonb) is 'The only way a daily or live writer changes game results. See db/migrations/044_ingest_report_results.sql for the contract.';

-- Applies the whole log again, in order. Owner-only: db/build/153 after a rebuild of core, or after the bulk path added games.
--   p_create: make the games the bulk step would have added (a rebuild has no daily games yet); p_only_unmatched: just the chains whose latest
-- observation is still unmatched (run.py --apply: the games the report found no row for).
create or replace function ingest.replay(p_create boolean default true, p_only_unmatched boolean default false) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare id bigint; res jsonb; outcomes jsonb := '{}'::jsonb; n integer := 0; made integer := 0; nchanged integer := 0; changed jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('ingest.report_results', 0));
  for id in select o.observation_id from ingest.game_observation o
             where not p_only_unmatched
                or ((o.outcome = 'unmatched' or o.outcome is null) and o.observation_id = (select max(o2.observation_id) from ingest.game_observation o2 where o2.game_ref = o.game_ref))
             order by o.observation_id loop
    res := ingest.apply_observation(id, p_create);
    n := n + 1;
    if (res ->> 'created')::boolean then made := made + 1; end if;
    outcomes := jsonb_set(outcomes, array[res ->> 'outcome'], to_jsonb(coalesce((outcomes ->> (res ->> 'outcome'))::integer, 0) + 1));
    if res -> 'changed' is not null and res -> 'changed' <> 'null'::jsonb then
      nchanged := nchanged + 1;
      if p_only_unmatched then changed := changed || (res -> 'changed'); end if;      -- the whole list only for the small daily call
    end if;
  end loop;
  return jsonb_build_object('replayed', n, 'games_made', made, 'games_changed', nchanged, 'outcomes', outcomes, 'changed', changed);
end $$;

-- ------------------------------------------------------------------------------------------------ privileges
-- Postgres grants EXECUTE on new functions to PUBLIC: take it back from every function in the schema. Migration 045 grants
-- ingest_writer the one function it may run. Roles that only exist on a Supabase project are cleaned if they are there.
revoke all on all functions in schema ingest from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema ingest from %I', r);
      execute format('revoke all on all tables in schema ingest from %I', r);
      execute format('revoke all on all functions in schema ingest from %I', r);
    end if;
  end loop;
end $$;
commit;
