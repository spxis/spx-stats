-- NBA team season totals from the "Player statistics" tables of the club-season articles on
-- English Wikipedia (CC BY-SA 4.0; legacy_wikipedia_stats, migration 100). Regular season only.
-- Same articles and revisions as db/build/181_stats_nba_wikipedia.sql; columns through
-- db/seed/nba_team_stat_column.csv. Rerunnable: the Wikipedia rows of NBA team seasons are
-- deleted and written again. Run after 181_stats_nba_wikipedia (the lines are already loaded).
--  * A club is the franchise identity whose full_name is the article's club that season (the
--    same match 181 uses). A line that does not match is counted, never matched on a close name.
--  * Count columns (reb pts min fg fga fg3 fg3a ft fta) are summed across player rows of the
--    first regular-season table. A count the table does not give but its per-game average does
--    is average × that player's games, rounded (same derivation as 181).
--  * Team per-game rates (a_reb a_pts) are those sums divided by the team's regular-season
--    games (final games in core.game, else season.games_per_team). Never divided by a player's
--    max GP: a star who sat out would inflate the rate.
--  * Shooting percentages (p_fg p_3p p_ft) are summed makes / summed attempts. Player FG%
--    values are never averaged. A table with only FG% and no FGA leaves shooting empty.
--  * A table whose summed minutes are under 85% of 5 × 48 × team games is left out (an
--    incomplete roster table) and counted in meta.data_issue. No minutes: left out the same way.
-- Provenance: source wikipedia; the article revision is on legacy_wikipedia_stats.nba_article
-- (page_title, revid), the same one 181 wrote as player source_key.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'dataset', 'CC BY-SA 4.0', 'Text and tables from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; see each article''s history for its authors.',
        'https://en.wikipedia.org', null, current_date, null)
on conflict (code) do nothing;
update meta.source set
  notes = coalesce(notes, '') || ' NBA team season totals (rebounds, points, shooting when attempts are published) derived from the player statistics tables of the club-season articles, read 2026-10-14; archived in legacy_files.raw_archive under wikipedia_nba_stats/.'
where code = 'wikipedia' and coalesce(notes, '') not like '%NBA team season totals%';
create temp table wsrc on commit drop as select source_id from meta.source where code = 'wikipedia';

delete from core.team_season_stat t
using core.team_season ts, core.season s
where t.team_season_id = ts.team_season_id and ts.season_id = s.season_id
  and t.source_id = (select source_id from wsrc)
  and s.league_code = 'nba';

drop table if exists pg_temp.seed_col;
create temp table seed_col (header text, key text, kind text);
\copy seed_col from 'db/seed/nba_team_stat_column.csv' with (format csv, header true)

-- ---- 1. First regular-season table of each article, with its team season --------------------------------
create temp table ln on commit drop as
select l.*, a.page_title, a.revid, ts.team_season_id,
       coalesce(nullif(g.n, 0), ts.games_per_team) as team_gp,
       case when ts.team_season_id is null then 'no_team_season'
            when coalesce(nullif(g.n, 0), ts.games_per_team) is null then 'no_team_gp'
       end as why
from legacy_wikipedia_stats.nba_line l
join legacy_wikipedia_stats.nba_article a using (season, club)
left join lateral (
  select ts.team_season_id, s.games_per_team, s.season_id
  from core.season s
  join core.team_season ts on ts.season_id = s.season_id
  join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id
  where s.league_code = 'nba' and s.start_year = l.season and fi.full_name = l.club
  limit 1) ts on true
left join lateral (
  select count(*)::int as n
  from core.game g
  where g.phase = 'regular' and g.status = 'final'
    and (g.home_team_season_id = ts.team_season_id or g.away_team_season_id = ts.team_season_id)
) g on true
where l.phase = 'regular' and l.tbl = 1;

-- ---- 2. Cells through the team column map --------------------------------------------------------------
create temp table kv_all on commit drop as
select ln.team_season_id, ln.team_gp, ln.season, ln.club, ln.page_title, ln.revid, ln.ord,
       case when dec.per_game then 'a_' || m.key else m.key end as key,
       case when dec.per_game then 'avg' else m.kind end as kind,
       case when m.kind = 'pct' and v.n > 1 then v.n / 100 else v.n end as val
from ln
cross join lateral jsonb_each_text(ln.cells) c(h, cell)
join seed_col m on m.header = c.h and m.kind <> 'skip' and (m.kind <> 'avg_if_pts' or jsonb_exists(ln.cells, 'PTS'))
cross join lateral (select m.kind = 'count' and m.key not in ('gp') and c.cell ~ '\.' as per_game) dec
cross join lateral (select case when cleaned ~ '^-?[0-9]*\.?[0-9]+$' then cleaned::numeric end as n
                    from (select regexp_replace(replace(replace(c.cell, ',', ''), '%', ''), '[^0-9.\-]', '', 'g') as cleaned) z) v
where ln.why is null and c.h !~ '#' and v.n is not null;

create temp table kv on commit drop as
select * from kv_all
where val >= 0 and (kind <> 'pct' or val <= 1)
  and case key when 'gp' then val <= 120 when 'a_pts' then val <= 60 when 'a_reb' then val <= 40
               when 'a_min' then val <= 60 when 'pts' then val <= 4500 when 'reb' then val <= 2500
               when 'min' then val <= 4000 when 'fg' then val <= 2000 when 'fga' then val <= 4000
               when 'fg3' then val <= 800 when 'fg3a' then val <= 2000 when 'ft' then val <= 1200
               when 'fta' then val <= 1600 else true end;

-- totals the table does not give but its average does: average × that player's games, rounded
create temp table row_gp on commit drop as
select team_season_id, team_gp, season, club, page_title, revid, ord,
       max(val) filter (where key = 'gp') as gp
from kv group by 1, 2, 3, 4, 5, 6, 7;

create temp table pair (cnt_key text, avg_key text);
insert into pair values
  ('reb', 'a_reb'), ('pts', 'a_pts'), ('min', 'a_min'),
  ('fg', 'a_fg'), ('fga', 'a_fga'), ('fg3', 'a_fg3'), ('fg3a', 'a_fg3a'),
  ('ft', 'a_ft'), ('fta', 'a_fta');

create temp table derived on commit drop as
select w.team_season_id, w.team_gp, w.season, w.club, w.page_title, w.revid, w.ord,
       p.cnt_key as key, 'count'::text as kind, round(av.val * w.gp) as val
from row_gp w
join pair p on true
join kv av on av.team_season_id = w.team_season_id and av.ord = w.ord and av.key = p.avg_key and av.kind = 'avg'
where w.gp is not null
  and not exists (
    select 1 from kv c
    where c.team_season_id = w.team_season_id and c.ord = w.ord and c.key = p.cnt_key);

create temp table counts on commit drop as
select team_season_id, team_gp, season, club, page_title, revid, key, val
from kv where kind = 'count' and key <> 'gp'
union all
select team_season_id, team_gp, season, club, page_title, revid, key, val from derived;

-- ---- 3. One row per team season ------------------------------------------------------------------------
create temp table summed on commit drop as
select team_season_id, team_gp, season, club,
       (array_agg(page_title))[1] as page_title, (array_agg(revid))[1] as revid,
       sum(val) filter (where key = 'reb') as reb,
       sum(val) filter (where key = 'pts') as pts,
       sum(val) filter (where key = 'min') as minutes,
       sum(val) filter (where key = 'fg') as fg,
       sum(val) filter (where key = 'fga') as fga,
       sum(val) filter (where key = 'fg3') as fg3,
       sum(val) filter (where key = 'fg3a') as fg3a,
       sum(val) filter (where key = 'ft') as ft,
       sum(val) filter (where key = 'fta') as fta
from counts
group by team_season_id, team_gp, season, club;

create temp table judged on commit drop as
select s.*,
       case when s.minutes is null or s.minutes < 0.85 * 5 * 48 * s.team_gp then 'incomplete'
            when s.reb is null and s.fga is null then 'no_stat'
       end as why
from summed s;

create temp table ok on commit drop as
select j.*,
       case when j.reb is not null and j.team_gp > 0 then round(j.reb / j.team_gp, 1) end as a_reb,
       case when j.pts is not null and j.team_gp > 0 then round(j.pts / j.team_gp, 1) end as a_pts,
       case when j.fg is not null and j.fga > 0 then round(j.fg / j.fga, 3) end as p_fg,
       case when j.fg3 is not null and j.fg3a > 0 then round(j.fg3 / j.fg3a, 3) end as p_3p,
       case when j.ft is not null and j.fta > 0 then round(j.ft / j.fta, 3) end as p_ft
from judged j
where j.why is null
  and (j.reb is null or j.reb / j.team_gp <= 80)
  and (j.pts is null or j.pts / j.team_gp <= 150);

insert into core.team_season_stat (team_season_id, phase, games_played, stats, source_id)
select team_season_id, 'regular', team_gp::smallint,
       jsonb_strip_nulls(jsonb_build_object(
         'reb', reb, 'a_reb', a_reb,
         'pts', pts, 'a_pts', a_pts,
         'p_fg', p_fg, 'p_3p', p_3p, 'p_ft', p_ft,
         'fg', fg, 'fga', fga, 'fg3', fg3, 'fg3a', fg3a, 'ft', ft, 'fta', fta)),
       (select source_id from wsrc)
from ok
on conflict do nothing;

-- ---- 4. What could not be placed -----------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from wsrc) and entity_kind = 'stat_team' and entity_key like 'wikipedia_nba_team:%';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_team', 'wikipedia_nba_team:' || why,
       format('%s NBA club-season player-statistics tables left out of team totals (%s)%s', count(*), why,
              case when count(*) > 0 then '; first: ' || (array_agg(season || ' ' || club order by season, club))[1] else '' end),
       case why when 'no_team_season' then 'Left out: the club name is not a franchise identity that season'
                when 'no_team_gp' then 'Left out: the season has no games_per_team and no final regular games'
                when 'incomplete' then 'Left out: summed minutes under 85 percent of 5×48×team games (incomplete table)'
                else 'Left out: the table has no rebound totals or field-goal attempts' end
from (
  select season, club, why from ln where why is not null
  union all
  select season, club, why from judged where why is not null
) x
group by why;

select (select count(*) from core.team_season_stat t join core.team_season ts using (team_season_id) join core.season s using (season_id)
        where t.source_id = (select source_id from wsrc) and s.league_code = 'nba') as nba_team_stat_rows,
       (select count(*) from ok where a_reb is not null) as with_rebounds,
       (select count(*) from ok where p_fg is not null) as with_fg_pct,
       (select count(*) from judged where why = 'incomplete') as incomplete_tables;
commit;
