-- A reported start time. core.game.starts_at has been there since migration 001. The daily report was not copying one onto it:
-- balldontlie's clock (NBA datetime, MLB and NFL date) and nflverse's Eastern gametime were used to pick the day, then dropped.
--
-- starts_at on an observation is the scheduled start in UTC when a source recorded a clock, and null when none did.
-- It is never inferred from game_date. A report that carries one writes it onto a game that is not final, forfeit or cancelled.
-- A report that carries none leaves a time already stored (the NHL times come from an older load this report does not carry).
-- A null starts_at does not change content_hash, so a game with no clock is still the same observation.
--
-- On DS1: apply this file. No data release of its own: the next daily run writes the times, and that run's release carries them.
-- Production has no ingest schema. The scoreboard reads api.games.starts_at (migration 112).

begin;

alter table ingest.game_observation add column if not exists starts_at timestamptz;
comment on column ingest.game_observation.starts_at is 'The scheduled start in UTC when a source recorded a clock. Null when none did. Never inferred from game_date. A later report with no clock does not clear one already stored.';

create or replace function ingest.content_hash(r ingest.game_observation) returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select md5(concat_ws('|', r.game_ref, r.league, r.season, r.phase, coalesce(r.round, ''), r.game_date, r.game_no, r.home_key, r.away_key,
                           r.home_known, r.neutral, r.status, coalesce(r.home_score::text, ''), coalesce(r.away_score::text, ''),
                           coalesce(r.overtime::text, ''), coalesce(r.shootout::text, ''), coalesce(r.ot_periods::text, ''),
                           r.verdict, r.source, (select coalesce(string_agg(x, '; ' order by x), '') from unnest(r.dissent) x))
                  || case when r.starts_at is null then '' else '|' || to_char(r.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end) $$;

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
  n_ot boolean; n_so boolean; n_date date; n_orig date; n_hs smallint; n_as smallint; n_start timestamptz;
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
         x.source_id, x.source_key, x.starts_at, h.franchise_id as gh
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
    n_date := g.game_date; n_orig := g.original_date; n_hs := g.home_score; n_as := g.away_score; n_ot := g.went_to_overtime; n_so := g.decided_by_shootout; n_start := g.starts_at;
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

    if v_outcome = 'unchanged' and o.starts_at is not null then n_start := o.starts_at; end if;
    if v_outcome = 'unchanged'
       and (v_to, n_date, n_orig, n_hs, n_as, n_ot, n_so, n_start) is distinct from
           (g.status, g.game_date, g.original_date, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout, g.starts_at) then
      update core.game set status = v_to::core.game_status, game_date = n_date, original_date = n_orig, home_score = n_hs, away_score = n_as,
                           went_to_overtime = n_ot, decided_by_shootout = n_so, starts_at = n_start, updated_at = now()
       where game_id = gid;
      v_changed := true; v_outcome := 'applied';
      v_reason := case when v_to = 'final' then format('final %s-%s%s', n_hs, n_as, case when o.verdict = 'single' then ' (single source)' else '' end)
                       when n_date <> g.game_date then format('%s, date moved from %s', v_to, g.game_date)
                       when (v_to, n_date, n_orig, n_hs, n_as, n_ot, n_so) is not distinct from
                            (g.status, g.game_date, g.original_date, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout) then 'start time'
                       else v_to end;
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
                                             status, home_score, away_score, overtime, shootout, ot_periods, verdict, source, ref, agree, conflict, dissent, notes, content_hash, starts_at)
        values (r.game_ref, r.league, r.season, r.phase, r.round, r.game_date, r.game_no, r.home_key, r.away_key, r.home_name, r.away_name, r.home_known, r.neutral,
                r.status, r.home_score, r.away_score, r.overtime, r.shootout, r.ot_periods, r.verdict, r.source, r.ref, r.agree, r.conflict, r.dissent, r.notes, r.content_hash, r.starts_at)
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
comment on function ingest.report_results(jsonb) is 'The only way a daily or live writer changes game results. Migration 114 also writes a reported start onto a game that is not final. See db/migrations/044_ingest_report_results.sql for the contract.';

commit;
