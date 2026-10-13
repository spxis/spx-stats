-- Daily scores from English Wikipedia (CC BY-SA 4.0) with nflverse as the NFL's second check: seasons, team seasons and
-- games for the season in progress, built from legacy_wikipedia_daily (migration 043, loaded by scripts/daily/run.py --apply).
-- Source code 'wikipedia_daily'. Runs after 150, before 155 so duplicate games are still removed.
--   * A season or team season DS1 lacks (MLB 2026, CFL 2026, NBA 2026-27) is created, here and not by a one-off update,
--     because step 100 recreates franchises and team seasons.
--   * A staged game is matched to a game DS1 already holds (same two franchises; the same date, then a day either side, then
--     up to 3 days for a game DS1 has no result for). A game with no match is added: results always, scheduled games only
--     in a season no other source holds (so a moved date never doubles a schedule), cancelled games always.
--   * A match that DS1 lists with no result and Wikipedia has as final is filled ("No result in DS1"). A match DS1 already
--     holds as final is NEVER overwritten: the same score is verified 'confirmed', a different one 'disputed' and logged
--     ("Kept DS1's; needs a third source"). A result this step filled earlier is its own, and follows Wikipedia.
--   * Two sources that disagree (the clubs' pages, no nflverse to settle it) mark nothing final: the game is only logged
--     (a result this step filled earlier is taken back to "no result").
--     A postponed or suspended game is logged and not added as a game.
--   * Nothing is deleted except what this step owns (source wikipedia_daily), and only for the league-seasons staged.
--   * Safe to rerun: rows are added, changed or removed only where they differ, so a second run changes nothing. A summary
--     of what changed is the last result ("daily changes").
begin;
set local client_min_messages = warning;

-- (a second pass in one session, as the rehearsal does, starts clean)
drop table if exists src, chg, club, want_issue, want_ver, sg0, sg, scope, cg, og, owned_season, cand, matched, mm, own, gone, want_ext, my_ext, my_ver, my_issue;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
select 'wikipedia_daily', 'Wikipedia (daily scores)', 'website', 'CC BY-SA 4.0',
       'Game scores from the clubs'' season articles on English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history. NFL scores are cross-checked with nflverse (github.com/nflverse), CC BY 4.0.',
       'https://en.wikipedia.org', date '2026-09-01', coalesce((select max(fetched_at)::date from legacy_wikipedia_daily.page), current_date),
       'Scores of the season in progress, read each day from the "<season> <club> season" articles (and the MLB postseason article) by scripts/daily; the exact wikitext of every revision used is in legacy_files.raw_archive under wikipedia/<day>/<league>/.'
on conflict (code) do update set retrieved_on = excluded.retrieved_on
where meta.source.retrieved_on is distinct from excluded.retrieved_on;
create temp table src as select source_id from meta.source where code = 'wikipedia_daily';
create temp table chg (what text not null, n bigint not null);

-- ------------------------------------------------------------------ clubs, seasons, team seasons
-- A club's current full name -> franchise (the identity valid today, else the latest one of that name).
create temp table club as
select distinct on (fl.league_code, fi.full_name) fl.league_code as league, fi.full_name as name, fi.franchise_id
from core.franchise_league fl join core.franchise_identity fi using (franchise_id)
order by fl.league_code, fi.full_name,
         (fi.valid_during @> current_date and fl.valid_during @> current_date) desc,
         coalesce(upper(fi.valid_during), 'infinity'::date) desc, fi.franchise_id;

create temp table want_issue (kind text not null, key text not null, issue text not null, resolution text, primary key (kind, key, issue));
create temp table want_ver (game_id bigint primary key, status meta.verification_status not null, their_value text not null);

-- The staged games with their franchises and what to do with each: result (final, not disputed), hold (final but the
-- sources disagree), schedule, cancel, note (postponed or suspended).
create temp table sg0 as
select g.*, h.franchise_id as hf, a.franchise_id as af,
       case when g.status = 'final' and g.confidence in ('confirmed', 'single', 'resolved') then 'result'
            when g.status = 'final' then 'hold'
            when g.status = 'scheduled' then 'schedule'
            when g.status = 'cancelled' then 'cancel'
            else 'note' end as act
from legacy_wikipedia_daily.game g
left join club h on h.league = g.league and h.name = g.home_name
left join club a on a.league = g.league and a.name = g.away_name;
insert into want_issue
select 'game', source_key, format('Club not matched to a franchise: %s / %s in %s', away_name, home_name, season), 'Game left out'
from sg0 where hf is null or af is null or hf = af
on conflict do nothing;
create temp table sg as select * from sg0 where hf is not null and af is not null and hf <> af;
create temp table scope as select distinct league, season from legacy_wikipedia_daily.game;

-- Seasons (a calendar-year league's season is one year; the NHL's and NBA's start in the autumn).
insert into core.season (league_code, start_year, end_year, label, games_per_team, source_id)
select w.league, w.season, case when w.league in ('nhl', 'nba') then w.season + 1 else w.season end,
       case when w.league in ('nhl', 'nba') then w.season || '-' || right((w.season + 1)::text, 2) else w.season::text end,
       case w.league when 'nhl' then 82 when 'nba' then 82 when 'mlb' then 162 when 'nfl' then 17 when 'cfl' then 18 end,
       (select source_id from src)
from (select distinct league, season from legacy_wikipedia_daily.page where kind = 'team'
      union select league, season from scope) w
on conflict (league_code, start_year) do nothing;
with u as (
  update core.season s set regular_starts_on = d.rs, regular_ends_on = d.re, playoffs_end_on = d.pe
  from (select league, season, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
               max(game_date) filter (where phase = 'playoffs') pe
        from sg where status in ('final', 'scheduled') group by 1, 2) d
  where s.league_code = d.league and s.start_year = d.season and s.source_id = (select source_id from src)
    and (s.regular_starts_on, s.regular_ends_on, s.playoffs_end_on) is distinct from (d.rs, d.re, d.pe)
  returning 1)
insert into chg select 'season dates set', count(*) from u;

-- Team seasons: every club that has a season article, and every club in a staged game.
insert into core.team_season (franchise_id, season_id, source_id)
select distinct c.franchise_id, s.season_id, (select source_id from src)
from (select league, season, club as name from legacy_wikipedia_daily.page where kind = 'team' and club is not null
      union select league, season, home_name from sg union select league, season, away_name from sg) x
join club c on c.league = x.league and c.name = x.name
join core.season s on s.league_code = x.league and s.start_year = x.season
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id
    and i.valid_during @> case s.league_code when 'mlb' then make_date(s.start_year, 7, 1) when 'cfl' then make_date(s.start_year, 9, 15)
                                             when 'nfl' then make_date(s.start_year, 10, 1) else make_date(s.start_year, 10, 15) end
  order by lower(i.valid_during) desc limit 1)
where ts.franchise_identity_id is null and ts.source_id = (select source_id from src);

-- ------------------------------------------------------------------ games held by DS1 already, and our own
create temp table cg as
select g.game_id, g.game_date, g.status, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout, g.source_key,
       s.league_code as league, s.start_year as season, h.franchise_id hf, a.franchise_id af
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id
join core.team_season a on a.team_season_id = g.away_team_season_id
where g.source_id <> (select source_id from src) and g.status <> 'cancelled' and g.phase in ('regular', 'playoffs')
  and (s.league_code, s.start_year) in (select league, season from scope);
create temp table og as
select g.game_id, g.source_key, s.league_code as league, s.start_year as season
from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src);
create temp table owned_season as
select league, season from scope s
where not exists (select 1 from core.game g join core.season x using (season_id)
                  where x.league_code = s.league and x.start_year = s.season and g.source_id <> (select source_id from src));

-- Staged games to match with DS1's (the ones we already own are matched by key).
create temp table cand as
select * from sg where act in ('result', 'schedule', 'hold', 'cancel') and source_key not in (select source_key from og);
create temp table matched (wid text primary key, game_id bigint unique not null, swapped boolean not null, dd integer not null, pass smallint not null);
-- pass 0: the match made on an earlier run (the external id)
insert into matched
select c.source_key, cg.game_id, cg.hf <> c.hf, abs(cg.game_date - c.game_date), 0
from cand c join core.external_id e on e.source_id = (select source_id from src) and e.entity_kind = 'game' and e.external_key = c.source_key
join cg on cg.game_id = e.entity_id and ((cg.hf = c.hf and cg.af = c.af) or (cg.hf = c.af and cg.af = c.hf))
on conflict do nothing;
-- pass 1: same date, same sides
insert into matched
select distinct on (game_id) wid, game_id, swapped, dd, 1 from (
  select distinct on (c.source_key) c.source_key wid, cg.game_id, false swapped, 0 dd
  from cand c join cg on cg.league = c.league and cg.season = c.season and cg.hf = c.hf and cg.af = c.af and cg.game_date = c.game_date
  where c.source_key not in (select wid from matched) and cg.game_id not in (select game_id from matched)
  order by c.source_key, (cg.status = 'final') desc, cg.game_id) a
order by game_id, wid;
-- pass 2: a day either side, same sides
insert into matched
select distinct on (game_id) wid, game_id, swapped, dd, 2 from (
  select distinct on (c.source_key) c.source_key wid, cg.game_id, false swapped, abs(cg.game_date - c.game_date) dd
  from cand c join cg on cg.league = c.league and cg.season = c.season and cg.hf = c.hf and cg.af = c.af and abs(cg.game_date - c.game_date) <= 1
  where c.source_key not in (select wid from matched) and cg.game_id not in (select game_id from matched)
  order by c.source_key, abs(cg.game_date - c.game_date), cg.game_id) a
order by game_id, dd, wid;
-- pass 3: a day either side, the sides reversed (a page that put the home club on the road)
insert into matched
select distinct on (game_id) wid, game_id, swapped, dd, 3 from (
  select distinct on (c.source_key) c.source_key wid, cg.game_id, true swapped, abs(cg.game_date - c.game_date) dd
  from cand c join cg on cg.league = c.league and cg.season = c.season and cg.hf = c.af and cg.af = c.hf and abs(cg.game_date - c.game_date) <= 1
  where c.source_key not in (select wid from matched) and cg.game_id not in (select game_id from matched)
  order by c.source_key, abs(cg.game_date - c.game_date), cg.game_id) a
order by game_id, dd, wid;
-- pass 4: up to 3 days apart, for a game DS1 has no result for (moved)
insert into matched
select distinct on (game_id) wid, game_id, swapped, dd, 4 from (
  select distinct on (c.source_key) c.source_key wid, cg.game_id, cg.hf <> c.hf swapped, abs(cg.game_date - c.game_date) dd
  from cand c join cg on cg.league = c.league and cg.season = c.season and cg.status <> 'final'
       and ((cg.hf = c.hf and cg.af = c.af) or (cg.hf = c.af and cg.af = c.hf)) and abs(cg.game_date - c.game_date) <= 3
  where c.source_key not in (select wid from matched) and cg.game_id not in (select game_id from matched)
  order by c.source_key, abs(cg.game_date - c.game_date), cg.game_id) a
order by game_id, dd, wid;

-- What each match is.
create temp table mm as
select c.*, m.game_id, m.swapped, m.pass, cg.status ds_status, cg.home_score ds_h, cg.away_score ds_a, cg.source_key ds_key, cg.game_date ds_date,
       cg.went_to_overtime ds_ot, cg.decided_by_shootout ds_so,
       case when c.hf = cg.hf then c.home_score else c.away_score end r_h,
       case when c.hf = cg.hf then c.away_score else c.home_score end r_a,
       exists (select 1 from meta.data_issue d
               where d.source_id = (select source_id from src) and d.entity_kind = 'game' and d.entity_key = cg.source_key
                 and d.issue = 'No result in DS1' and d.resolution like format('Filled from Wikipedia: %s-%s%%', cg.home_score, cg.away_score)) as ours
from cand c join matched m on m.wid = c.source_key join cg on cg.game_id = m.game_id;
alter table mm add column kind text, add column n_ot boolean, add column n_so boolean, add column n_date date, add column n_orig date;
update mm set kind = case
      when act = 'result' and ds_status <> 'final' then 'fill'
      when act = 'result' and ours then 'refill'
      when act = 'result' and (r_h, r_a) = (ds_h, ds_a) then 'confirm'
      when act = 'result' then 'dispute'
      else act end;
update mm set n_ot = coalesce(overtime, ds_ot), n_so = coalesce(case when league = 'nhl' then shootout end, ds_so),
              n_date = case when abs(ds_date - game_date) > 1 then game_date else ds_date end,
              n_orig = case when abs(ds_date - game_date) > 1 then ds_date end
where kind in ('fill', 'refill');

-- DS1 had no result: fill it. A result this step filled before follows Wikipedia's latest.
with u as (
  update core.game g set status = 'final', home_score = m.r_h, away_score = m.r_a, went_to_overtime = m.n_ot, decided_by_shootout = m.n_so,
         original_date = coalesce(g.original_date, m.n_orig), game_date = m.n_date, updated_at = now()
  from mm m
  where g.game_id = m.game_id and m.kind in ('fill', 'refill')
    and (g.status, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout, g.game_date)
        is distinct from ('final'::core.game_status, m.r_h, m.r_a, m.n_ot, m.n_so, m.n_date)
  returning m.kind)
insert into chg select 'DS1 games filled or refilled: ' || kind, count(*) from u group by kind;
-- A result this step filled, whose sources now disagree, is taken back: the game goes back to how DS1 had it (no result).
with u as (
  update core.game g set status = 'scheduled', home_score = null, away_score = null, went_to_overtime = null, decided_by_shootout = null,
         game_date = coalesce(g.original_date, g.game_date), original_date = null, updated_at = now()
  from mm m
  where g.game_id = m.game_id and m.kind = 'hold' and m.ours
  returning 1)
insert into chg select 'own fills taken back (sources now disagree)', count(*) from u;
insert into want_issue
select 'game', ds_key, 'No result in DS1', format('Filled from Wikipedia: %s-%s%s', r_h, r_a, case when confidence = 'single' then ' (one club page so far)' else '' end)
from mm where kind in ('fill', 'refill')
on conflict do nothing;
insert into want_issue
select 'game', ds_key, 'Wikipedia sources disagree: ' || array_to_string(dissent, '; '), 'Score settled by nflverse'
from mm where kind in ('fill', 'refill', 'confirm', 'dispute') and confidence = 'resolved'
on conflict do nothing;
-- A result DS1 holds is never overwritten.
insert into want_ver
select game_id, case when kind = 'dispute' then 'disputed' else 'confirmed' end::meta.verification_status, r_h || '-' || r_a
from mm where kind in ('confirm', 'dispute') or (kind in ('fill', 'refill') and confidence in ('confirmed', 'resolved'))
on conflict do nothing;
insert into want_issue
select 'game', ds_key, format('DS1 has %s-%s, Wikipedia %s-%s', ds_h, ds_a, r_h, r_a), 'Kept DS1''s; needs a third source'
from mm where kind = 'dispute'
on conflict do nothing;
-- The sources disagree among themselves: nothing is applied.
insert into want_issue
select 'game', coalesce(x.ds_key, c.source_key),
       format('Wikipedia sources disagree on %s at %s on %s: %s%s', c.away_name, c.home_name, c.game_date, array_to_string(c.dissent, '; '),
              case when x.ds_status = 'final' and not x.ours then format(' (DS1 has %s-%s)', x.ds_h, x.ds_a) else '' end),
       'Not applied; needs a third source'
from cand c left join mm x on x.source_key = c.source_key
where c.act = 'hold'
on conflict do nothing;

-- ------------------------------------------------------------------ games this step owns
create temp table own as
select s.*, o.game_id from sg s join og o on o.source_key = s.source_key;

-- Removed: a game no longer staged (its date or sides moved on Wikipedia), or now postponed.
create temp table gone as
select o.game_id, o.source_key from og o
where (o.league, o.season) in (select league, season from scope)
  and (not exists (select 1 from legacy_wikipedia_daily.game g where g.source_key = o.source_key)
       or exists (select 1 from sg s where s.source_key = o.source_key and s.act = 'note'));
with d as (delete from core.game g using gone x where g.game_id = x.game_id returning 1)
insert into chg select 'own games removed', count(*) from d;

with u as (
  update core.game g set
         status = case o.act when 'result' then 'final' when 'cancel' then 'cancelled' else 'scheduled' end::core.game_status,
         home_score = case when o.act = 'result' then o.home_score end, away_score = case when o.act = 'result' then o.away_score end,
         went_to_overtime = case when o.act = 'result' then o.overtime end,
         decided_by_shootout = case when o.act = 'result' and o.league = 'nhl' then o.shootout end, updated_at = now()
  from own o
  where g.game_id = o.game_id and o.act in ('result', 'schedule', 'cancel')
    and (g.status, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout) is distinct from
        (case o.act when 'result' then 'final' when 'cancel' then 'cancelled' else 'scheduled' end::core.game_status,
         case when o.act = 'result' then o.home_score end, case when o.act = 'result' then o.away_score end,
         case when o.act = 'result' then o.overtime end, case when o.act = 'result' and o.league = 'nhl' then o.shootout end)
  returning 1)
insert into chg select 'own games updated', count(*) from u;

-- Added: a staged game DS1 does not hold.
with i as (
  insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                         home_score, away_score, went_to_overtime, decided_by_shootout, source_id, source_key)
  select s.season_id, c.phase::core.season_phase, c.game_date, hts.team_season_id, ats.team_season_id, c.neutral,
         case c.act when 'result' then 'final' when 'cancel' then 'cancelled' else 'scheduled' end::core.game_status,
         case when c.act = 'result' then c.home_score end, case when c.act = 'result' then c.away_score end,
         case when c.act = 'result' then c.overtime end, case when c.act = 'result' and c.league = 'nhl' then c.shootout end,
         (select source_id from src), c.source_key
  from cand c join core.season s on s.league_code = c.league and s.start_year = c.season
  join core.team_season hts on hts.franchise_id = c.hf and hts.season_id = s.season_id
  join core.team_season ats on ats.franchise_id = c.af and ats.season_id = s.season_id
  where c.source_key not in (select wid from matched)
    and (c.act in ('result', 'cancel') or (c.act = 'schedule' and (c.league, c.season) in (select league, season from owned_season)))
  on conflict (source_id, source_key) do nothing
  returning 1)
insert into chg select 'games added', count(*) from i;

-- Verification and issues for the games we own and added.
insert into want_ver
select g.game_id, 'confirmed', g.home_score || '-' || g.away_score
from sg s join core.game g on g.source_id = (select source_id from src) and g.source_key = s.source_key
where s.act = 'result' and s.confidence in ('confirmed', 'resolved') and g.status = 'final'
on conflict do nothing;
insert into want_issue
select 'game', source_key, 'Only one club''s Wikipedia page lists this result', 'Added; confirmed when the other club''s page agrees'
from sg where act = 'result' and confidence = 'single' and source_key in (select source_key from core.game where source_id = (select source_id from src))
on conflict do nothing;
insert into want_issue
select 'game', source_key, 'Wikipedia sources disagree: ' || array_to_string(dissent, '; '), 'Score settled by nflverse'
from sg where act = 'result' and confidence = 'resolved' and source_key in (select source_key from core.game where source_id = (select source_id from src))
on conflict do nothing;
-- Own game whose sources now disagree: left as it was, flagged.
insert into want_issue
select 'game', source_key, format('Wikipedia sources disagree on %s at %s on %s: %s', away_name, home_name, game_date, array_to_string(dissent, '; ')), 'Not applied; needs a third source'
from sg where act = 'hold' and source_key in (select source_key from og)
on conflict do nothing;
-- Postponed and suspended: logged, not added as games.
insert into want_issue
select 'game', source_key, format('%s per Wikipedia: %s at %s on %s', initcap(status), away_name, home_name, game_date), 'Not added as a game'
from sg where act = 'note'
on conflict do nothing;

-- ------------------------------------------------------------------ external ids, verification, issues: only differences
create temp table want_ext as
select game_id, key from (
  select m.game_id, m.wid as key from matched m
  union select g.game_id, g.source_key from core.game g where g.source_id = (select source_id from src)) x;

-- What this step holds today, with the league-season each row belongs to.
create temp table my_ext as
select e.entity_id, e.external_key, s.league_code league, s.start_year season
from core.external_id e left join core.game g on g.game_id = e.entity_id left join core.season s on s.season_id = g.season_id
where e.source_id = (select source_id from src) and e.entity_kind = 'game';
with d as (
  delete from core.external_id e using my_ext x
  where e.source_id = (select source_id from src) and e.entity_kind = 'game' and e.entity_id = x.entity_id and e.external_key = x.external_key
    and not exists (select 1 from want_ext w where w.game_id = x.entity_id and w.key = x.external_key)
    and (x.league is null or (x.league, x.season) in (select league, season from scope))
  returning 1)
insert into chg select 'external ids removed', count(*) from d;
with i as (
  insert into core.external_id (entity_kind, entity_id, source_id, external_key)
  select 'game', game_id, (select source_id from src), key from want_ext
  on conflict do nothing returning 1)
insert into chg select 'external ids added', count(*) from i;

create temp table my_ver as
select v.verification_id, v.entity_id, s.league_code league, s.start_year season
from meta.verification v left join core.game g on v.entity_kind = 'game' and g.game_id = v.entity_id left join core.season s on s.season_id = g.season_id
where v.source_id = (select source_id from src) and v.entity_kind = 'game';
with d as (
  delete from meta.verification v using my_ver x
  where v.verification_id = x.verification_id and v.field = 'score'
    and not exists (select 1 from want_ver w where w.game_id = x.entity_id)
    and (x.league is null or (x.league, x.season) in (select league, season from scope))
  returning 1)
insert into chg select 'verifications removed', count(*) from d;
with u as (
  update meta.verification v set status = w.status, their_value = w.their_value, checked_at = now()
  from want_ver w
  where v.entity_kind = 'game' and v.entity_id = w.game_id and v.field = 'score' and v.source_id = (select source_id from src)
    and (v.status, v.their_value) is distinct from (w.status, w.their_value)
  returning 1)
insert into chg select 'verifications changed', count(*) from u;
with i as (
  insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
  select 'game', game_id, 'score', status, (select source_id from src), their_value from want_ver
  on conflict (entity_kind, entity_id, field, source_id) do nothing returning 1)
insert into chg select 'verifications added', count(*) from i;

create temp table my_issue as
select d.data_issue_id, d.entity_kind, d.entity_key, d.issue,
       coalesce(case when d.entity_key like 'wpdaily:%' then split_part(d.entity_key, ':', 2) end, ls.league_code) league,
       coalesce(case when d.entity_key like 'wpdaily:%' then split_part(d.entity_key, ':', 3)::int end, ls.start_year) season
from meta.data_issue d
left join lateral (select x.league_code, x.start_year from core.game g join core.season x using (season_id)
                   where g.source_key = d.entity_key and d.entity_key not like 'wpdaily:%' order by g.game_id limit 1) ls on true
where d.source_id = (select source_id from src) and d.entity_kind = 'game';
with d as (
  delete from meta.data_issue i using my_issue x
  where i.data_issue_id = x.data_issue_id
    and not exists (select 1 from want_issue w where (w.kind, w.key, w.issue) = (x.entity_kind, x.entity_key, x.issue))
    and (x.league is null or (x.league, x.season) in (select league, season from scope))
  returning 1)
insert into chg select 'issues removed', count(*) from d;
with u as (
  update meta.data_issue i set resolution = w.resolution
  from want_issue w
  where i.source_id = (select source_id from src) and (i.entity_kind, i.entity_key, i.issue) = (w.kind, w.key, w.issue)
    and i.resolution is distinct from w.resolution
  returning 1)
insert into chg select 'issues changed', count(*) from u;
with i as (
  insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
  select (select source_id from src), w.kind, w.key, w.issue, w.resolution from want_issue w
  where not exists (select 1 from meta.data_issue d where d.source_id = (select source_id from src) and (d.entity_kind, d.entity_key, d.issue) = (w.kind, w.key, w.issue))
  returning 1)
insert into chg select 'issues added', count(*) from i;

select 'daily changes' as "daily changes", what, n from chg order by what;
commit;
