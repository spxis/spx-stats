-- The NFL before 1999 (1920 on, when it was the APFA) and the AFL (1960-1969) from English Wikipedia (CC BY-SA 4.0): every game its
-- clubs' season articles log (regular season and playoffs), each season's published standings, and every franchise's names by
-- season, parsed by scripts/nfl/ into legacy_wikipedia_nfl and legacy_wikipedia_afl, season by season. nflverse (150) starts in
-- 1999 and SPX in 2002, so these seasons have no other source: Wikipedia's games are added as they are, a published standing is
-- kept only where it agrees with the games, and a season where another source already holds games for that league is left alone
-- (that would be a cross-check, not a fill).
-- Why Wikipedia: the NFL's own site and Pro-Football-Reference / ESPN are excluded by their terms (no
-- automated collection); nflverse's schedules start in 1999. Each log also names a "recap" link to
-- Pro-Football-Reference; those links are not followed and are not stored.
--
-- The AFL is its own league ('afl'), not NFL seasons: core.season is one row per league and year, and the NFL played 1960-1969 too.
-- Its clubs are the same franchises as today's Bills, Jets, Patriots, Dolphins, Bengals, Oilers/Titans, Broncos, Chiefs, Raiders and
-- Chargers: core.franchise_league gives each of them 'afl' until 1970-03-01 and 'nfl' from then on, and one franchise_identity
-- history (Dallas Texans, Kansas City Chiefs). Every other club that existed only before today's 32 (the Akron Pros, the Frankford
-- Yellow Jackets, the Boston Yanks, ...) is a franchise of its own (source_key 'nfl:<KEY>'), and a club that only changed its name or
-- city keeps the franchise (Decatur Staleys, Chicago Staleys and Bears; Chicago and St. Louis Cardinals; Portsmouth Spartans and
-- Lions; the NFL's own continuity as English Wikipedia gives it). Which name belongs to which franchise in which years is
-- db/seed/nfl_club.csv (the clubs after 1960 that are still in the league are the amap rows below).
-- The first two seasons were played as the American Professional Football Association; the league is one league ('nfl') under both
-- names (ref.league_name). Pro Football's 1966-1969 Super Bowls are games between the two leagues and are not loaded: each league's
-- last playoff game is its own championship game, and its champion is the winner of that.
-- A Playoff Bowl (1960-1969, the runners-up's game) and a post-season exhibition (the Lions and Packers of 1935) are not playoff games of the title: phase 'exhibition'.
--
-- Run from the repo root (it reads db/seed/nfl_club.csv). Runs after 150, before 155. Safe to rerun as seasons arrive (load them
-- first with scripts/nfl/season.py): it rebuilds only what Wikipedia supplied for the NFL and the AFL.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'NFL season and club-season articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '1920-09-26', current_date,
        'NFL results before 1999 from the "<year> NFL season" standings templates and each "<year> <club> season" article''s schedule tables (regular season and playoffs), raw wikitext fetched 2026-10-12. The NFL''s own site, Pro-Football-Reference and ESPN were not used.')
on conflict (code) do update set
  retrieved_on = current_date,
  covers_from = least(meta.source.covers_from, excluded.covers_from),
  attribution = case when meta.source.attribution like '%NFL season and club-season%' then meta.source.attribution else meta.source.attribution || ' ' || excluded.attribution end,
  notes = case when meta.source.notes like '%NFL results before 1999%' then meta.source.notes else coalesce(meta.source.notes || ' ', '') || excluded.notes end;
update meta.source set notes = notes || ' The NFL''s 1920-1971 seasons and the AFL''s 1960-1969 seasons were read the same way (the "<year> APFA season", "<year> AFL season" and club-season articles), fetched 2026-10-15.'
where code = 'wikipedia' and notes not like '%AFL''s 1960-1969%';
create temp table src as select source_id from meta.source where code = 'wikipedia';

-- The AFL, its award and the APFA name of the NFL's first seasons.
insert into ref.league (league_code, sport_code, country_code, founded_on, dissolved_on, notes)
values ('afl', 'american_football', 'US', date '1959-08-14', date '1970-03-01',
        'American Football League, 1960-1969; merged into the NFL for the 1970 season (its ten clubs became the NFL''s AFC)')
on conflict (league_code) do nothing;
insert into ref.league_name (league_code, valid_during, name, short_name)
values ('afl', daterange(null, null), 'American Football League', 'AFL') on conflict do nothing;
update ref.league_name set valid_during = daterange(date '1922-06-24', null) where league_code = 'nfl' and valid_during = daterange(null, null);
insert into ref.league_name (league_code, valid_during, name, short_name)
values ('nfl', daterange(null, date '1922-06-24'), 'American Professional Football Association', 'APFA') on conflict do nothing;
insert into core.award (league_code, code, name, kind, description, first_season, source_id)
values ('afl', 'afl_championship', 'AFL Championship', 'championship', 'The AFL championship game; its winner was the league''s champion (1960-1969).', 1960, (select source_id from src))
on conflict (code) do nothing;

-- Take back what an earlier run wrote.
delete from core.standing where source_id = (select source_id from src) and (source_key like 'wpnfl:%' or source_key like 'wpafl:%');
delete from meta.data_issue where source_id = (select source_id from src) and (issue like 'NFL:%' or issue like 'AFL:%');
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and (external_key like 'wpnfl:%' or external_key like 'wpafl:%');
delete from core.game g using core.season s where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code in ('nfl', 'afl');

-- Club names (lower case, as the article titles give them, "(NFL)" dropped) -> franchise, by the year a season starts.
-- spx_team_id is SPX's number for the franchise (the same table nflverse's step 150 uses).
create temp table amap (nm text not null, y0 integer not null, y1 integer not null, spx_team_id integer not null);
insert into amap values
  ('buffalo bills',1960,9999,130),('miami dolphins',1966,9999,131),('boston patriots',1960,1970,132),('new england patriots',1971,9999,132),
  ('new york jets',1963,9999,133),('new york titans',1960,1962,133),('cincinnati bengals',1968,9999,134),('cleveland browns',1950,1995,135),('cleveland browns',1999,9999,135),
  ('pittsburgh pirates',1933,1939,136),('pittsburgh steelers',1940,9999,136),('baltimore ravens',1996,9999,137),
  ('houston oilers',1960,1996,138),('tennessee oilers',1997,1998,138),('tennessee titans',1999,9999,138),
  ('baltimore colts',1953,1983,139),('indianapolis colts',1984,9999,139),('jacksonville jaguars',1995,9999,140),('houston texans',2002,9999,141),
  ('denver broncos',1960,9999,142),('kansas city chiefs',1963,9999,143),('dallas texans',1960,1962,143),
  ('oakland raiders',1960,1981,144),('los angeles raiders',1982,1994,144),('oakland raiders',1995,2019,144),('las vegas raiders',2020,9999,144),
  ('los angeles chargers',1960,1960,145),('san diego chargers',1961,2016,145),('los angeles chargers',2017,9999,145),
  ('dallas cowboys',1960,9999,146),('new york giants',1925,9999,147),('philadelphia eagles',1933,9999,148),
  ('boston braves',1932,1932,149),('boston redskins',1933,1936,149),
  ('washington redskins',1937,2019,149),('washington football team',2020,2021,149),('washington commanders',2022,9999,149),
  ('chicago bears',1922,9999,150),('decatur staleys',1920,1920,150),('chicago staleys',1921,1921,150),
  ('portsmouth spartans',1930,1933,151),('detroit lions',1934,9999,151),('green bay packers',1921,9999,152),('minnesota vikings',1961,9999,153),
  ('atlanta falcons',1966,9999,154),('new orleans saints',1967,9999,155),('tampa bay buccaneers',1976,9999,156),('carolina panthers',1995,9999,157),
  ('cleveland rams',1937,1945,158),('los angeles rams',1946,1994,158),('st. louis rams',1995,2015,158),('los angeles rams',2016,9999,158),
  ('chicago cardinals',1920,1943,159),('chicago cardinals',1945,1959,159),
  ('st. louis cardinals',1960,1987,159),('phoenix cardinals',1988,1993,159),('arizona cardinals',1994,9999,159),
  ('san francisco 49ers',1946,9999,160),('seattle seahawks',1976,9999,161);
create temp table am as
select a.nm, a.y0, a.y1, e.entity_id::integer as franchise_id
from amap a join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || a.spx_team_id
     and e.source_id = (select source_id from meta.source where code = 'spx_database');

-- Clubs that are not one of today's 32, or that played under another name before: the seed (franchise 'spx:<SPX team id>' = a franchise
-- SPX already has; 'new:<KEY>' = a franchise of Wikipedia's own, made here).
create temp table seed_club (club text, first_year int, last_year int, franchise text, note text);
\copy seed_club from 'db/seed/nfl_club.csv' with (format csv, header true)
insert into core.franchise (sport_code, source_id, source_key)
select 'american_football', (select source_id from src), 'nfl:' || k
from (select distinct substring(franchise from 5) k from seed_club where franchise like 'new:%') x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'nfl:' || x.k);
insert into am
select lower(s.club), s.first_year, s.last_year, coalesce(f1.entity_id::integer, f2.franchise_id)
from seed_club s
left join core.external_id f1 on s.franchise like 'spx:%' and f1.entity_kind = 'franchise' and f1.external_key = 'team:' || substring(s.franchise from 5)
     and f1.source_id = (select source_id from meta.source where code = 'spx_database')
left join core.franchise f2 on s.franchise like 'new:%' and f2.source_id = (select source_id from src) and f2.source_key = 'nfl:' || substring(s.franchise from 5);
-- a name must fit one franchise in a year, and every row must find its franchise (a mistake in the seed stops the step)
do $$
declare bad text;
begin
  select string_agg(distinct a.nm || ' ' || a.y0, ', ') into bad from am a join am b on a.nm = b.nm and a.ctid < b.ctid and a.y0 <= b.y1 and b.y0 <= a.y1;
  if bad is not null then raise exception 'club name fits two rows in one year: %', bad; end if;
  select string_agg(distinct nm || ' ' || y0, ', ') into bad from am where franchise_id is null;
  if bad is not null then raise exception 'club row with no franchise: %', bad; end if;
end $$;

-- Wikipedia's rows, both leagues.
create temp table wss as select 'nfl' lg, s.* from legacy_wikipedia_nfl.season s union all select 'afl', s.* from legacy_wikipedia_afl.season s;
create temp table wgm as select 'nfl' lg, g.* from legacy_wikipedia_nfl.game g union all select 'afl', g.* from legacy_wikipedia_afl.game g;
create temp table wsd as select 'nfl' lg, g.* from legacy_wikipedia_nfl.standing g union all select 'afl', g.* from legacy_wikipedia_afl.standing g;
create temp table wts as select 'nfl' lg, g.* from legacy_wikipedia_nfl.team_season g union all select 'afl', g.* from legacy_wikipedia_afl.team_season g;

-- Seasons to build: Wikipedia's, except one another source already holds games of that league for.
create temp table seasons as
select s.lg, s.season as yr from wss s
where not exists (select 1 from core.game g join core.season cs using (season_id)
                  where cs.league_code = s.lg and cs.start_year = s.season and g.source_id <> (select source_id from src));

create temp table ng as
select row_number() over (order by g.lg, g.season, g.game_date, g.phase, g.home_team, g.away_team, g.game_seq) as gid, g.lg,
       g.season as yr,
       (case when g.round_name ~* 'playoff bowl|rematch|exhibition|charity|all-star' then 'exhibition' else g.phase end)::core.season_phase as phase,
       g.game_date, g.week, g.round_name, g.home_pts, g.away_pts, g.overtime, g.neutral_site,
       g.views, g.conflict, g.home_team, g.away_team, h.franchise_id home_f, a.franchise_id away_f,
       'wp' || g.lg || ':' || g.season || ':' || g.phase || ':' || g.game_date || ':' || g.home_team || ':' || g.away_team || ':' || g.game_seq as key
from wgm g
left join am h on h.nm = lower(g.home_team) and g.season between h.y0 and h.y1
left join am a on a.nm = lower(g.away_team) and g.season between a.y0 and a.y1
where (g.lg, g.season) in (select lg, yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', key, format('%s: club name not matched to a franchise: %s / %s in %s', upper(lg), away_team, home_team, yr), 'Game left out'
from ng where home_f is null or away_f is null;
delete from ng where home_f is null or away_f is null or home_f = away_f;

create temp table nst as
select s.*, s.season as yr, m.franchise_id from wsd s
left join am m on m.nm = lower(s.team) and s.season between m.y0 and m.y1
where (s.lg, s.season) in (select lg, yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', (case when lg = 'nfl' then '' else lg || ':' end) || season || ':' || team, upper(lg) || ': club name not matched to a franchise', 'Standing left out'
from nst where franchise_id is null;
delete from nst where franchise_id is null;

create temp table nts as
select t.lg, t.season yr, t.team_name, t.log_games, m.franchise_id from wts t
join am m on m.nm = lower(t.team_name) and t.season between m.y0 and m.y1
where (t.lg, t.season) in (select lg, yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', (case when t.lg = 'nfl' then '' else t.lg || ':' end) || t.season || ':' || t.team_name, upper(t.lg) || ': club name not matched to a franchise', 'Club left out'
from wts t
where (t.lg, t.season) in (select lg, yr from seasons) and not exists (select 1 from am m where m.nm = lower(t.team_name) and t.season between m.y0 and m.y1);

-- Seasons.
insert into core.season (league_code, start_year, end_year, label, source_id)
select lg, yr, yr + 1, yr::text, (select source_id from src)
from (select lg, yr from ng union select lg, yr from nst union select lg, yr from nts) x on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs), regular_ends_on = coalesce(s.regular_ends_on, d.re),
  playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select lg, yr, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
             max(game_date) filter (where phase = 'playoffs') pe from ng group by lg, yr) d
where s.league_code = d.lg and s.start_year = d.yr;
-- Scheduled games per team: the most the published standings count, else the most any club's log shows (a season cut short keeps its real length).
update core.season s set games_per_team = x.gp
from (select lg, yr, coalesce((select max(coalesce(w, 0) + coalesce(l, 0) + coalesce(t, 0)) from nst where nst.lg = y.lg and nst.yr = y.yr),
                          (select max(n) from (select count(*) n from (select home_f f from ng where ng.lg = y.lg and ng.yr = y.yr and phase = 'regular'
                                                                       union all select away_f from ng where ng.lg = y.lg and ng.yr = y.yr and phase = 'regular') z group by f) q)) gp
      from (select distinct lg, yr from ng) y) x
where s.league_code = x.lg and s.start_year = x.yr and s.games_per_team is null and x.gp > 0;

-- Names by season: the article titles'. Consecutive seasons under one name are one identity.
create temp table nm as
select distinct on (yr, franchise_id) yr, franchise_id, team_name as full_name
from nts order by yr, franchise_id, team_name;
create temp table nflfr as
select franchise_id from core.franchise_league where league_code in ('nfl', 'afl')
union select franchise_id from am;
update core.team_season ts set franchise_identity_id = null
where franchise_identity_id in (select franchise_identity_id from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from nflfr));
delete from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from nflfr);
delete from core.franchise_league l where l.source_id = (select source_id from src) and l.league_code in ('nfl', 'afl');

create temp table isl as
select franchise_id, full_name, min(yr) first_yr, max(yr) last_yr
from (select nm.*, yr - row_number() over (partition by franchise_id, full_name order by yr) as island from nm) x
group by franchise_id, full_name, island;
-- Wikipedia fills the periods nflverse's (and SPX's) own identities leave uncovered, never overlapping them. Seasons start on 1 March, as in 150.
-- A club that skipped a season (a gap of a year or more between two runs under one name) keeps one identity per run.
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
select p.franchise_id, p.rng, btrim(left(p.full_name, length(p.full_name) - length(split_part(p.full_name, ' ', array_length(string_to_array(p.full_name, ' '), 1))))),
       split_part(p.full_name, ' ', array_length(string_to_array(p.full_name, ' '), 1)), p.full_name, 'US', (select source_id from src)
from (select i.franchise_id, i.full_name, u.rng
      from isl i
      cross join lateral unnest(datemultirange(daterange(make_date(i.first_yr, 3, 1), make_date(i.last_yr + 1, 3, 1))) -
            coalesce((select range_agg(x.valid_during) from core.franchise_identity x where x.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);

insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select lg, yr, home_f f from ng union select lg, yr, away_f from ng union select lg, yr, franchise_id from nst union select lg, yr, franchise_id from nts) x
join core.season s on s.league_code = x.lg and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 10, 1) limit 1)
where ts.franchise_identity_id is null
  and ts.season_id in (select s.season_id from core.season s join seasons z on z.lg = s.league_code and z.yr = s.start_year);

-- League membership: a franchise with AFL seasons is in the 'afl' from its first AFL season to 1970-03-01 and in the 'nfl' for the rest of
-- its identity (the merger), never overlapping a membership another source wrote.
create temp table aflspan as
select ts.franchise_id, daterange(make_date(min(s.start_year), 3, 1), make_date(max(s.start_year) + 1, 3, 1)) as rng
from core.team_season ts join core.season s using (season_id) where s.league_code = 'afl' group by ts.franchise_id;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, 'afl', p.rng, (select source_id from src)
from (select a.franchise_id, u.rng
      from aflspan a
      cross join lateral unnest(datemultirange(a.rng) -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = a.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, 'nfl', p.rng, (select source_id from src)
from (select i.franchise_id, u.rng
      from (select franchise_id, range_agg(valid_during) as spans from core.franchise_identity
            where source_id = (select source_id from src) and franchise_id in (select franchise_id from nflfr) group by franchise_id) i
      cross join lateral unnest(i.spans -
            coalesce((select range_agg(a.rng) from aflspan a where a.franchise_id = i.franchise_id), '{}'::datemultirange) -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);
-- A franchise of Wikipedia's own: when it began and ended (the first and last season it played, as a March date).
update core.franchise f set founded_on = x.d0, folded_on = x.d1
from (select ts.franchise_id, make_date(min(s.start_year), 3, 1) d0, make_date(max(s.start_year) + 1, 3, 1) d1
      from core.team_season ts join core.season s using (season_id) group by ts.franchise_id) x
where f.franchise_id = x.franchise_id and f.source_id = (select source_id from src) and f.source_key like 'nfl:%';

-- Wikipedia's two logs that disagree on a game are flagged on the game they made (the log that agrees with the season's published
-- standings is kept, else the home club's; the loader writes which, after ' | kept: ').
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, round_label, source_id, source_key, notes)
select s.season_id, n.phase, n.game_date, hts.team_season_id, ats.team_season_id, n.neutral_site, 'final',
       n.home_pts, n.away_pts, n.overtime, n.round_name, (select source_id from src), n.key,
       case when n.conflict is not null then 'Wikipedia logs disagree: ' || split_part(n.conflict, ' | kept: ', 1) end
from ng n join core.season s on s.league_code = n.lg and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', n.key, upper(n.lg) || ': Wikipedia''s two logs disagree: ' || split_part(n.conflict, ' | kept: ', 1),
       coalesce(nullif('Kept ' || split_part(n.conflict, ' | kept: ', 2), 'Kept '), 'Kept the home club''s log')
from ng n where n.conflict is not null;
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, source_key from core.game
where source_id = (select source_id from src) and (source_key like 'wpnfl:%' or source_key like 'wpafl:%');

-- Final standings as the season's standings templates publish them, kept only where they agree with the games
-- (wins, losses, ties, points for and against); a line that does not is logged and the site shows the games' sum.
create temp table gsum as
select lg, yr, fid, count(*) filter (where pf > pa) w, count(*) filter (where pf < pa) l, count(*) filter (where pf = pa) t, sum(pf) pf, sum(pa) pa
from (select lg, yr, home_f fid, home_pts pf, away_pts pa from ng where phase = 'regular'
      union all select lg, yr, away_f, away_pts, home_pts from ng where phase = 'regular') z group by lg, yr, fid;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', (case when n.lg = 'nfl' then '' else n.lg || ':' end) || n.season || ':' || n.team,
       format('%s: Wikipedia''s standings give %s-%s-%s, %s-%s; its games add up to %s', upper(n.lg), n.w, n.l, n.t, n.pf, n.pa,
              coalesce(g.w || '-' || g.l || '-' || g.t || ', ' || g.pf || '-' || g.pa, 'no games')),
       'Standing left out; the site shows the games'' sum'
from nst n left join gsum g on g.lg = n.lg and g.yr = n.yr and g.fid = n.franchise_id
where n.w is not null and n.l is not null
  and (g.fid is null or (g.w, g.l, g.t, g.pf, g.pa) is distinct from (n.w, n.l, coalesce(n.t, 0), n.pf, n.pa));
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, points_for, points_against,
                           win_pct, division_rank, conference_rank, seed, conference_record, division_record,
                           streak, streak_kind, streak_length, is_final, source_key)
select ts.team_season_id, 'regular', coalesce(s.regular_ends_on, make_date(n.season + 1, 1, 1)), (select source_id from src),
       n.w + n.l + coalesce(n.t, 0), n.w, n.l, coalesce(n.t, 0), n.pf, n.pa,
       case when n.pct ~ '^[01]?\.\d+$' then n.pct::numeric(5,4) else round((n.w + 0.5 * coalesce(n.t, 0))::numeric / nullif(n.w + n.l + coalesce(n.t, 0), 0), 4) end,
       case when n.division ~ '(East|West|Central|North|South|Capitol|Century|Coastal)' then n.rank_in_template end,
       case when n.division !~ '(East|West|Central|North|South|Capitol|Century|Coastal)' then n.rank_in_template end,
       n.seed,
       case when n.conf_record ~ '^\d+[–-]\d+([–-]\d+)?$' then n.conf_record end,
       case when n.div_record ~ '^\d+[–-]\d+([–-]\d+)?$' then n.div_record end,
       case when n.streak ~ '^[WLT]\d+$' then n.streak end,
       case when n.streak ~ '^[WLT]\d+$' then left(n.streak, 1) end,
       case when n.streak ~ '^[WLT]\d+$' then substring(n.streak from 2)::smallint end,
       true, 'wp' || n.lg || ':' || n.season || ':' || n.team
from nst n
join core.season s on s.league_code = n.lg and s.start_year = n.season
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
join gsum g on g.lg = n.lg and g.yr = n.yr and g.fid = n.franchise_id and (g.w, g.l, g.t, g.pf, g.pa) = (n.w, n.l, coalesce(n.t, 0), n.pf, n.pa)
where n.w is not null and n.l is not null
on conflict do nothing;

select 'x'::text lg, 'x'::text k, 0::bigint n where false
union all select lg, 'seasons', count(*) from seasons group by lg
union all select s.league_code, 'games added', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code in ('nfl', 'afl') group by s.league_code
union all select s.league_code, 'regular', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code in ('nfl', 'afl') and g.phase = 'regular' group by s.league_code
union all select s.league_code, 'playoffs', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code in ('nfl', 'afl') and g.phase = 'playoffs' group by s.league_code
union all select split_part(source_key, ':', 1), 'standings', count(*) from core.standing where source_id = (select source_id from src) and (source_key like 'wpnfl:%' or source_key like 'wpafl:%') group by 1
union all select null, 'standings left out', count(*) from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NFL|AFL): Wikipedia''s standings'
union all select null, 'log conflicts', count(*) from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NFL|AFL): Wikipedia''s two logs'
union all select null, 'unmatched name', count(*) from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NFL|AFL): club name not matched';
commit;
