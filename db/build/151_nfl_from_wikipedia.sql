-- NFL before 1999 from English Wikipedia (CC BY-SA 4.0): every game its clubs' season articles log (regular
-- season and playoffs), each season's published standings, and every franchise's names by season, parsed
-- by scripts/nfl/ into legacy_wikipedia_nfl, season by season. nflverse (150) starts in 1999 and SPX in 2002,
-- so these seasons have no other source: Wikipedia's games are added as they are, a published standing is
-- kept only where it agrees with the games, and a season where another source already holds NFL games is
-- left alone (that would be a cross-check, not a fill).
-- Why Wikipedia: the NFL's own site and Pro-Football-Reference / ESPN are excluded by their terms (no
-- automated collection); nflverse's schedules start in 1999. Each log also names a "recap" link to
-- Pro-Football-Reference; those links are not followed and are not stored.
-- Runs after 150, before 155. Safe to rerun as seasons arrive (load them first with scripts/nfl/season.py):
-- it rebuilds only what Wikipedia supplied for the NFL.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'NFL season and club-season articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '1946-11-01', current_date,
        'NFL results before 1999 from the "<year> NFL season" standings templates and each "<year> <club> season" article''s schedule tables (regular season and playoffs), raw wikitext fetched 2026-10-12. The NFL''s own site, Pro-Football-Reference and ESPN were not used.')
on conflict (code) do update set
  retrieved_on = current_date,
  covers_from = least(meta.source.covers_from, excluded.covers_from),
  attribution = case when meta.source.attribution like '%NFL season and club-season%' then meta.source.attribution else meta.source.attribution || ' ' || excluded.attribution end,
  notes = case when meta.source.notes like '%NFL results before 1999%' then meta.source.notes else coalesce(meta.source.notes || ' ', '') || excluded.notes end;
create temp table src as select source_id from meta.source where code = 'wikipedia';

-- Take back what an earlier run wrote.
delete from core.standing where source_id = (select source_id from src) and source_key like 'wpnfl:%';
delete from meta.data_issue where source_id = (select source_id from src) and issue like 'NFL:%';
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and external_key like 'wpnfl:%';
delete from core.game g using core.season s where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code = 'nfl';

-- Club names (lower case, as the article titles give them, "(NFL)" dropped) -> franchise, by the year a season starts.
-- spx_team_id is SPX's number for the franchise (the same table nflverse's step 150 uses).
create temp table amap (nm text not null, y0 integer not null, y1 integer not null, spx_team_id integer not null);
insert into amap values
  ('buffalo bills',1960,9999,130),('miami dolphins',1966,9999,131),('boston patriots',1960,1970,132),('new england patriots',1971,9999,132),
  ('new york jets',1963,9999,133),('cincinnati bengals',1968,9999,134),('cleveland browns',1950,1995,135),('cleveland browns',1999,9999,135),
  ('pittsburgh steelers',1933,9999,136),('baltimore ravens',1996,9999,137),
  ('houston oilers',1960,1996,138),('tennessee oilers',1997,1998,138),('tennessee titans',1999,9999,138),
  ('baltimore colts',1953,1983,139),('indianapolis colts',1984,9999,139),('jacksonville jaguars',1995,9999,140),('houston texans',2002,9999,141),
  ('denver broncos',1960,9999,142),('kansas city chiefs',1963,9999,143),('dallas texans',1960,1962,143),
  ('oakland raiders',1960,1981,144),('los angeles raiders',1982,1994,144),('oakland raiders',1995,2019,144),('las vegas raiders',2020,9999,144),
  ('san diego chargers',1961,2016,145),('los angeles chargers',2017,9999,145),
  ('dallas cowboys',1960,9999,146),('new york giants',1925,9999,147),('philadelphia eagles',1933,9999,148),
  ('washington redskins',1937,2019,149),('washington football team',2020,2021,149),('washington commanders',2022,9999,149),
  ('chicago bears',1920,9999,150),('detroit lions',1934,9999,151),('green bay packers',1921,9999,152),('minnesota vikings',1961,9999,153),
  ('atlanta falcons',1966,9999,154),('new orleans saints',1967,9999,155),('tampa bay buccaneers',1976,9999,156),('carolina panthers',1995,9999,157),
  ('los angeles rams',1946,1994,158),('st. louis rams',1995,2015,158),('los angeles rams',2016,9999,158),
  ('st. louis cardinals',1960,1987,159),('phoenix cardinals',1988,1993,159),('arizona cardinals',1994,9999,159),
  ('san francisco 49ers',1946,9999,160),('seattle seahawks',1976,9999,161);
create temp table am as
select a.nm, a.y0, a.y1, e.entity_id::integer as franchise_id
from amap a join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || a.spx_team_id
     and e.source_id = (select source_id from meta.source where code = 'spx_database');

-- Seasons to build: Wikipedia's, except one another source already holds NFL games for.
create temp table seasons as
select s.season as yr from legacy_wikipedia_nfl.season s
where not exists (select 1 from core.game g join core.season cs using (season_id)
                  where cs.league_code = 'nfl' and cs.start_year = s.season and g.source_id <> (select source_id from src));

create temp table ng as
select row_number() over (order by g.season, g.game_date, g.phase, g.home_team, g.away_team, g.game_seq) as gid,
       g.season as yr, g.phase::core.season_phase as phase, g.game_date, g.week, g.round_name, g.home_pts, g.away_pts, g.overtime, g.neutral_site,
       g.views, g.conflict, g.home_team, g.away_team, h.franchise_id home_f, a.franchise_id away_f,
       'wpnfl:' || g.season || ':' || g.phase || ':' || g.game_date || ':' || g.home_team || ':' || g.away_team || ':' || g.game_seq as key
from legacy_wikipedia_nfl.game g
left join am h on h.nm = lower(g.home_team) and g.season between h.y0 and h.y1
left join am a on a.nm = lower(g.away_team) and g.season between a.y0 and a.y1
where g.season in (select yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', key, format('NFL: club name not matched to a franchise: %s / %s in %s', away_team, home_team, yr), 'Game left out'
from ng where home_f is null or away_f is null;
delete from ng where home_f is null or away_f is null or home_f = away_f;

create temp table nst as
select s.*, s.season as yr, m.franchise_id from legacy_wikipedia_nfl.standing s
left join am m on m.nm = lower(s.team) and s.season between m.y0 and m.y1
where s.season in (select yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', season || ':' || team, 'NFL: club name not matched to a franchise', 'Standing left out'
from nst where franchise_id is null;
delete from nst where franchise_id is null;

create temp table nts as
select t.season yr, t.team_name, t.log_games, m.franchise_id from legacy_wikipedia_nfl.team_season t
join am m on m.nm = lower(t.team_name) and t.season between m.y0 and m.y1
where t.season in (select yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', t.season || ':' || t.team_name, 'NFL: club name not matched to a franchise', 'Club left out'
from legacy_wikipedia_nfl.team_season t
where t.season in (select yr from seasons) and not exists (select 1 from am m where m.nm = lower(t.team_name) and t.season between m.y0 and m.y1);

-- Seasons.
insert into core.season (league_code, start_year, end_year, label, source_id)
select 'nfl', yr, yr + 1, yr::text, (select source_id from src)
from (select yr from ng union select yr from nst union select yr from nts) x on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs), regular_ends_on = coalesce(s.regular_ends_on, d.re),
  playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select yr, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
             max(game_date) filter (where phase = 'playoffs') pe from ng group by yr) d
where s.league_code = 'nfl' and s.start_year = d.yr;
-- Scheduled games per team: the most the published standings count, else the most any club's log shows (a season cut short keeps its real length).
update core.season s set games_per_team = x.gp
from (select yr, coalesce((select max(coalesce(w, 0) + coalesce(l, 0) + coalesce(t, 0)) from nst where nst.yr = y.yr),
                          (select max(n) from (select count(*) n from (select home_f f from ng where ng.yr = y.yr and phase = 'regular'
                                                                       union all select away_f from ng where ng.yr = y.yr and phase = 'regular') z group by f) q)) gp
      from (select distinct yr from ng) y) x
where s.league_code = 'nfl' and s.start_year = x.yr and s.games_per_team is null and x.gp > 0;

-- Names by season: the article titles'. Consecutive seasons under one name are one identity.
create temp table nm as
select distinct on (yr, franchise_id) yr, franchise_id, team_name as full_name
from nts order by yr, franchise_id, team_name;
create temp table nflfr as
select franchise_id from core.franchise_league where league_code = 'nfl'
union select franchise_id from am;
update core.team_season ts set franchise_identity_id = null
where franchise_identity_id in (select franchise_identity_id from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from nflfr));
delete from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from nflfr);
delete from core.franchise_league l where l.source_id = (select source_id from src) and l.league_code = 'nfl';

create temp table isl as
select franchise_id, full_name, min(yr) first_yr, max(yr) last_yr
from (select nm.*, yr - row_number() over (partition by franchise_id, full_name order by yr) as island from nm) x
group by franchise_id, full_name, island;
-- Wikipedia fills the periods nflverse's (and SPX's) own identities leave uncovered, never overlapping them. Seasons start on 1 March, as in 150.
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
select p.franchise_id, p.rng, btrim(left(p.full_name, length(p.full_name) - length(split_part(p.full_name, ' ', array_length(string_to_array(p.full_name, ' '), 1))))),
       split_part(p.full_name, ' ', array_length(string_to_array(p.full_name, ' '), 1)), p.full_name, 'US', (select source_id from src)
from (select i.franchise_id, i.full_name, u.rng
      from isl i
      cross join lateral unnest(datemultirange(daterange(make_date(i.first_yr, 3, 1), make_date(i.last_yr + 1, 3, 1))) -
            coalesce((select range_agg(x.valid_during) from core.franchise_identity x where x.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, 'nfl', p.rng, (select source_id from src)
from (select i.franchise_id, u.rng
      from (select franchise_id, range_agg(valid_during) as spans from core.franchise_identity
            where source_id = (select source_id from src) and franchise_id in (select franchise_id from nflfr) group by franchise_id) i
      cross join lateral unnest(i.spans -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);

insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select yr, home_f f from ng union select yr, away_f from ng union select yr, franchise_id from nst union select yr, franchise_id from nts) x
join core.season s on s.league_code = 'nfl' and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 10, 1) limit 1)
where ts.franchise_identity_id is null and ts.season_id in (select season_id from core.season where league_code = 'nfl' and start_year in (select yr from seasons));

-- Wikipedia's two logs that disagree on a game are flagged on the game they made (the log that agrees with the season's published
-- standings is kept, else the home club's; the loader writes which, after ' | kept: ').
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, round_label, source_id, source_key, notes)
select s.season_id, n.phase, n.game_date, hts.team_season_id, ats.team_season_id, n.neutral_site, 'final',
       n.home_pts, n.away_pts, n.overtime, n.round_name, (select source_id from src), n.key,
       case when n.conflict is not null then 'Wikipedia logs disagree: ' || split_part(n.conflict, ' | kept: ', 1) end
from ng n join core.season s on s.league_code = 'nfl' and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', n.key, 'NFL: Wikipedia''s two logs disagree: ' || split_part(n.conflict, ' | kept: ', 1),
       coalesce(nullif('Kept ' || split_part(n.conflict, ' | kept: ', 2), 'Kept '), 'Kept the home club''s log')
from ng n where n.conflict is not null;
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, source_key from core.game where source_id = (select source_id from src) and source_key like 'wpnfl:%';

-- Final standings as the season's standings templates publish them, kept only where they agree with the games
-- (wins, losses, ties, points for and against); a line that does not is logged and the site shows the games' sum.
create temp table gsum as
select yr, fid, count(*) filter (where pf > pa) w, count(*) filter (where pf < pa) l, count(*) filter (where pf = pa) t, sum(pf) pf, sum(pa) pa
from (select yr, home_f fid, home_pts pf, away_pts pa from ng where phase = 'regular'
      union all select yr, away_f, away_pts, home_pts from ng where phase = 'regular') z group by yr, fid;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', n.season || ':' || n.team,
       format('NFL: Wikipedia''s standings give %s-%s-%s, %s-%s; its games add up to %s', n.w, n.l, n.t, n.pf, n.pa,
              coalesce(g.w || '-' || g.l || '-' || g.t || ', ' || g.pf || '-' || g.pa, 'no games')),
       'Standing left out; the site shows the games'' sum'
from nst n left join gsum g on g.yr = n.yr and g.fid = n.franchise_id
where n.w is not null and n.l is not null
  and (g.fid is null or (g.w, g.l, g.t, g.pf, g.pa) is distinct from (n.w, n.l, coalesce(n.t, 0), n.pf, n.pa));
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, points_for, points_against,
                           win_pct, division_rank, conference_rank, seed, conference_record, division_record,
                           streak, streak_kind, streak_length, is_final, source_key)
select ts.team_season_id, 'regular', coalesce(s.regular_ends_on, make_date(n.season + 1, 1, 1)), (select source_id from src),
       n.w + n.l + coalesce(n.t, 0), n.w, n.l, coalesce(n.t, 0), n.pf, n.pa,
       case when n.pct ~ '^[01]?\.\d+$' then n.pct::numeric(5,4) else round((n.w + 0.5 * coalesce(n.t, 0))::numeric / nullif(n.w + n.l + coalesce(n.t, 0), 0), 4) end,
       case when n.division ~ '(East|West|Central|North|South)' then n.rank_in_template end,
       case when n.division !~ '(East|West|Central|North|South)' then n.rank_in_template end,
       n.seed,
       case when n.conf_record ~ '^\d+[–-]\d+([–-]\d+)?$' then n.conf_record end,
       case when n.div_record ~ '^\d+[–-]\d+([–-]\d+)?$' then n.div_record end,
       case when n.streak ~ '^[WLT]\d+$' then n.streak end,
       case when n.streak ~ '^[WLT]\d+$' then left(n.streak, 1) end,
       case when n.streak ~ '^[WLT]\d+$' then substring(n.streak from 2)::smallint end,
       true, 'wpnfl:' || n.season || ':' || n.team
from nst n
join core.season s on s.league_code = 'nfl' and s.start_year = n.season
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
join gsum g on g.yr = n.yr and g.fid = n.franchise_id and (g.w, g.l, g.t, g.pf, g.pa) = (n.w, n.l, coalesce(n.t, 0), n.pf, n.pa)
where n.w is not null and n.l is not null
on conflict do nothing;

select 'seasons' k, count(*) n from seasons
union all select 'games added', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'nfl'
union all select 'regular', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'nfl' and g.phase = 'regular'
union all select 'playoffs', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'nfl' and g.phase = 'playoffs'
union all select 'standings', count(*) from core.standing where source_id = (select source_id from src) and source_key like 'wpnfl:%'
union all select 'standings left out', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'NFL: Wikipedia''s standings%'
union all select 'log conflicts', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'NFL: Wikipedia''s two logs%'
union all select 'unmatched name', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'NFL: club name not matched%';
commit;
