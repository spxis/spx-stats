-- The rival and predecessor hockey leagues from English Wikipedia (CC BY-SA 4.0): the National Hockey Association (1909-10 to 1916-17), the Pacific Coast
-- Hockey Association (1911-12 to 1923-24), the Western Canada Hockey League and its last season as the Western Hockey League (1921-22 to 1925-26) and the
-- World Hockey Association (1972-73 to 1978-79), parsed by scripts/hockey/ into legacy_wikipedia_hockey (migration 113). Each is a league of its own
-- ('nha', 'pcha', 'wchl', 'wha'; the NHL's parent: its records are never added to the NHL's, db/build/151 does the same for the AFL and the AAFC).
-- Runs after 145 (the NHL), before 165. Run from the repo root (it reads db/seed/hockey_club.csv). Rerunnable: it rebuilds only what Wikipedia supplied here.
--
-- What each league holds: the final standings of every season, the champion (166), every game the NHA and PCHA articles tabulate (their regular
-- seasons and the playoffs between two clubs of the league), the WCHL's playoff games where the article tabulates them, the WHA's games (its season
-- articles hold standings only, so the loader reads each club's game log in the club-season article, merges the two clubs' copies of a game and keeps
-- a regular season only when the games add up exactly to every club's published line, a playoff series only when they give the bracket's result), and the playoff series a season
-- tells as a result only (the WHA's brackets, a prose "won the two-game total-goals series 5-3"): core.series, the two clubs of a series in the
-- higher and lower seed columns in no order of merit (the archive holds no seeds), the winner in winner_team_season_id. What is not here, and why:
--   * the Stanley Cup challenges and finals: core.cup_series (210) holds the series, and the games of a final against an NHL club are in the NHL's own
--     season (145); a game between a club of one of these leagues and one of another (a PCHA-WCHL interlocking game, a league champions' playoff for the
--     right to challenge) is not a game of either league's season here, so no game is counted twice. Wikipedia's PCHA standings of 1922-23 and 1923-24
--     do count the interlocking games, so a PCHA club's published record has more games than its games here (the loader checked each club's line against
--     the games including those; `agrees` in the legacy table says the result);
--   * a protested game the league voided (the NHA's) is a game with status 'cancelled' and its result kept, so the records skip it and the game stays;
--   * exhibition games (the NHA's New York series); the WHA's games against touring national teams (the Soviet, Czechoslovak and Finnish sides, which its
--     1977-78 and 1978-79 standings count: they are not in the league's games, so a club's games here are fewer than its published gp by those); the WCHL's
--     regular season (the articles hold standings only and no club article tabulates a game); a WHA playoff series whose logs contradict the bracket.
-- A club's standing is kept only where it agrees with the games (or where the article has no games to check against); a line that does not is
-- logged in meta.data_issue and the site shows the games' sum, as for the NFL (151).
--
-- Franchises: db/seed/hockey_club.csv says which club name is which franchise in which years ('spx:N' = a franchise SPX already has, 'nhl_api:KEY' =
-- one the NHL build (145) made for the clubs of the NHL's early years and its Stanley Cup finals, 'new:KEY' = a franchise of Wikipedia's own), from the
-- league articles' own histories. A club that played on in the NHL (the Canadiens, Wanderers, Senators, Bulldogs; the WHA's Oilers, Whalers,
-- Nordiques and Jets) is one franchise with a league membership for each period (core.franchise_league), and the clubs of the PCHA and WCHL that met the
-- NHL's clubs in Cup play (the Millionaires/Maroons, the Aristocrats/Cougars, the Metropolitans, the Tigers, the Eskimos) get their league memberships
-- and pages. English Wikipedia's Vancouver Maroons are the Millionaires renamed (one article), and the NHL API's two franchises for them (VMI, VMA)
-- are merged here into VMI; a rerun of 145 makes VMA again, so run this step again after 145.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'Season and club-season articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '1909-11-01', current_date, '')
on conflict (code) do update set retrieved_on = current_date, covers_from = least(meta.source.covers_from, excluded.covers_from);
update meta.source set notes = coalesce(notes || ' ', '') || 'The NHA, PCHA, WCHL/WHL and WHA seasons (standings, results, champions) were read from the "<year> <league> season" articles, the leagues'' own articles and a few club articles, fetched 2026-10-15.'
where code = 'wikipedia' and coalesce(notes, '') not like '%NHA, PCHA, WCHL/WHL and WHA seasons%';
create temp table src as select source_id from meta.source where code = 'wikipedia';

-- The leagues, their names and their championships.
insert into ref.league (league_code, sport_code, country_code, founded_on, dissolved_on, notes) values
  ('nha', 'hockey', 'CA', date '1909-12-03', date '1917-07-01', 'National Hockey Association, 1909-10 to 1916-17; its clubs'' successor league is the NHL (formed in 1917 by the Canadiens, Wanderers, Senators and Bulldogs, and a new Toronto club)'),
  ('pcha', 'hockey', 'CA', date '1911-12-07', date '1924-07-01', 'Pacific Coast Hockey Association, 1911-12 to 1923-24; its Vancouver and Victoria clubs joined the Western Canada Hockey League for 1924-25'),
  ('wchl', 'hockey', 'CA', null, date '1926-07-01', 'Western Canada Hockey League, 1921-22 to 1924-25, the Western Hockey League in 1925-26; folded in 1926 when the NHL bought its players'),
  ('wha', 'hockey', 'US', null, date '1979-07-01', 'World Hockey Association, 1972-73 to 1978-79; four clubs (the Oilers, Whalers, Nordiques and Jets) joined the NHL for 1979-80')
on conflict (league_code) do nothing;
insert into ref.league_name (league_code, valid_during, name, short_name) values
  ('nha', daterange(null, null), 'National Hockey Association', 'NHA'),
  ('pcha', daterange(null, null), 'Pacific Coast Hockey Association', 'PCHA'),
  ('wchl', daterange(null, date '1925-07-01'), 'Western Canada Hockey League', 'WCHL'),
  ('wchl', daterange(date '1925-07-01', null), 'Western Hockey League', 'WHL'),
  ('wha', daterange(null, null), 'World Hockey Association', 'WHA')
on conflict do nothing;
insert into core.award (league_code, code, name, kind, description, first_season, source_id) values
  ('nha', 'nha_championship', 'O''Brien Cup', 'championship', 'The NHA''s championship trophy (1909-10 to 1916-17); its winner was the league''s champion.', 1909, (select source_id from src)),
  ('pcha', 'pcha_championship', 'PCHA Championship', 'championship', 'The PCHA''s championship (1911-12 to 1923-24): the regular-season leader, or the winner of the playoff the league held.', 1911, (select source_id from src)),
  ('wchl', 'wchl_championship', 'WCHL Championship', 'championship', 'The WCHL''s (the WHL''s in 1925-26) playoff championship (1921-22 to 1925-26).', 1921, (select source_id from src)),
  ('wha', 'wha_championship', 'Avco World Trophy', 'championship', 'The WHA''s championship trophy (1972-73 to 1978-79).', 1972, (select source_id from src))
on conflict (code) do nothing;

-- English Wikipedia's Vancouver Maroons are the Millionaires renamed: one franchise (the NHL API made two, VMI and VMA).
create temp table vm as
select (select franchise_id from core.franchise where source_id = (select source_id from meta.source where code = 'nhl_api') and source_key = 'VMI') as vmi,
       (select franchise_id from core.franchise where source_id = (select source_id from meta.source where code = 'nhl_api') and source_key = 'VMA') as vma;
-- A rerun of 145 after an earlier merge leaves both clubs with a team season in the same year (the NHL's 1922 and 1923): fold VMA's into VMI's first,
-- pointing everything that references it (games, standings, series, rosters, ...) at VMI's; a child row that would then collide with VMI's own is dropped.
do $fold$
declare d record; fk record; vmi int; vma int;
begin
  select franchise_id into vmi from core.franchise where source_id = (select source_id from meta.source where code = 'nhl_api') and source_key = 'VMI';
  select franchise_id into vma from core.franchise where source_id = (select source_id from meta.source where code = 'nhl_api') and source_key = 'VMA';
  if vmi is null or vma is null then return; end if;
  for d in select a.team_season_id as old_id, b.team_season_id as keep_id
           from core.team_season a join core.team_season b on b.season_id = a.season_id and b.franchise_id = vmi
           where a.franchise_id = vma loop
    for fk in select c.conrelid::regclass as tbl, a2.attname as col
              from pg_constraint c join pg_attribute a2 on a2.attrelid = c.conrelid and a2.attnum = c.conkey[1]
              where c.contype = 'f' and c.confrelid = 'core.team_season'::regclass and array_length(c.conkey, 1) = 1 loop
      begin
        execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using d.keep_id, d.old_id;
      exception when unique_violation then
        execute format('delete from %s where %I = $1', fk.tbl, fk.col) using d.old_id;
      end;
    end loop;
    delete from core.team_season where team_season_id = d.old_id;
  end loop;
end
$fold$;
update core.team_season set franchise_id = vm.vmi from vm where vm.vma is not null and vm.vmi is not null and franchise_id = vm.vma;
update core.franchise_identity set franchise_id = vm.vmi from vm where vm.vma is not null and vm.vmi is not null and franchise_id = vm.vma;
delete from core.external_id e using vm where vm.vma is not null and e.entity_kind = 'franchise' and e.entity_id = vm.vma;
delete from core.franchise f using vm where vm.vma is not null and vm.vmi is not null and f.franchise_id = vm.vma;

-- Take back what an earlier run wrote.
delete from core.standing where source_id = (select source_id from src) and source_key like 'wph:%';
delete from core.series where source_id = (select source_id from src) and source_key like 'wph:%';
delete from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NHA|PCHA|WCHL|WHA)[: ]';
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and external_key like 'wph:%';
-- (games are not deleted wholesale: a game keeps its id from run to run, see below)

-- Club names (as the season articles' standings give them, lower case) -> franchise, by league and the year a season starts.
create temp table seed_club (club text, league text, first_year int, last_year int, franchise text, country text, display text, note text);
\copy seed_club from 'db/seed/hockey_club.csv' with (format csv, header true)
insert into core.franchise (sport_code, source_id, source_key)
select 'hockey', (select source_id from src), 'hockey:' || k
from (select distinct substring(franchise from 5) k from seed_club where franchise like 'new:%') x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'hockey:' || x.k);
create temp table am as
select lower(s.club) as nm, s.league, s.first_year as y0, s.last_year as y1, s.club, nullif(s.display, '') as display, s.country,
       coalesce(f1.entity_id::integer, f2.franchise_id, f3.franchise_id) as franchise_id
from seed_club s
left join core.external_id f1 on s.franchise like 'spx:%' and f1.entity_kind = 'franchise' and f1.external_key = 'team:' || substring(s.franchise from 5)
     and f1.source_id = (select source_id from meta.source where code = 'spx_database')
left join core.franchise f2 on s.franchise like 'nhl_api:%' and f2.source_id = (select source_id from meta.source where code = 'nhl_api') and f2.source_key = substring(s.franchise from 9)
left join core.franchise f3 on s.franchise like 'new:%' and f3.source_id = (select source_id from src) and f3.source_key = 'hockey:' || substring(s.franchise from 5);
do $$
declare bad text;
begin
  select string_agg(distinct a.nm || ' ' || a.league || ' ' || a.y0, ', ') into bad from am a join am b on a.nm = b.nm and a.league = b.league and a.ctid < b.ctid and a.y0 <= b.y1 and b.y0 <= a.y1;
  if bad is not null then raise exception 'club name fits two rows in one year: %', bad; end if;
  select string_agg(distinct nm || ' ' || y0, ', ') into bad from am where franchise_id is null;
  if bad is not null then raise exception 'club row with no franchise: %', bad; end if;
end $$;

-- Wikipedia's rows.
create temp table wss as select * from legacy_wikipedia_hockey.season;
create temp table wgm as select * from legacy_wikipedia_hockey.game;
create temp table wsd as select * from legacy_wikipedia_hockey.standing;
create temp table wts as select * from legacy_wikipedia_hockey.team_season;
create temp table wse as select * from legacy_wikipedia_hockey.series;

create temp table seasons as select league as lg, season as yr from wss;

create temp table ng as
select row_number() over (order by g.league, g.season, g.game_date, g.phase, g.home_team, g.away_team, g.game_seq) as gid, g.league as lg, g.season as yr,
       g.phase::core.season_phase as phase, g.game_date, g.round_name, g.home_pts, g.away_pts, g.overtime, g.neutral_site, g.counts, g.note,
       g.home_team, g.away_team, h.franchise_id home_f, a.franchise_id away_f,
       'wph:' || g.league || ':' || g.season || ':' || g.phase || ':' || g.game_date || ':' || g.home_team || ':' || g.away_team || ':' || g.game_seq as key
from wgm g
left join am h on h.league = g.league and h.nm = lower(g.home_team) and g.season between h.y0 and h.y1
left join am a on a.league = g.league and a.nm = lower(g.away_team) and g.season between a.y0 and a.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', key, format('%s: club name not matched to a franchise: %s / %s in %s', upper(lg), away_team, home_team, yr), 'Game left out'
from ng where home_f is null or away_f is null;
delete from ng where home_f is null or away_f is null or home_f = away_f;
delete from core.game g using core.season s
where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code in ('nha', 'pcha', 'wchl', 'wha')
  and g.source_key like 'wph:%' and not exists (select 1 from ng n where n.key = g.source_key);

create temp table nst as
select s.*, s.season as yr, s.league as lg, m.franchise_id from wsd s
left join am m on m.league = s.league and m.nm = lower(s.team) and s.season between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', lg || ':' || season || ':' || team, upper(lg) || ': club name not matched to a franchise', 'Standing left out'
from nst where franchise_id is null;
delete from nst where franchise_id is null;

create temp table nts as
select t.league as lg, t.season yr, t.team_name, m.franchise_id from wts t
join am m on m.league = t.league and m.nm = lower(t.team_name) and t.season between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', t.league || ':' || t.season || ':' || t.team_name, upper(t.league) || ': club name not matched to a franchise', 'Club left out'
from wts t where not exists (select 1 from am m where m.league = t.league and m.nm = lower(t.team_name) and t.season between m.y0 and m.y1);

-- Seasons (named like the NHL's: 1909-10).
insert into core.season (league_code, start_year, end_year, label, source_id)
select lg, yr, yr + 1, yr || '-' || right((yr + 1)::text, 2), (select source_id from src)
from (select lg, yr from seasons) x on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs), regular_ends_on = coalesce(s.regular_ends_on, d.re), playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select lg, yr, min(game_date) filter (where phase = 'regular' and counts) rs, max(game_date) filter (where phase = 'regular' and counts) re,
             max(game_date) filter (where phase = 'playoffs') pe from ng group by lg, yr) d
where s.league_code = d.lg and s.start_year = d.yr;
-- Scheduled games per team: the most the published standings count (an unfinished season of a club that folded keeps its own count).
update core.season s set games_per_team = x.gp
from (select lg, yr, max(coalesce(gp, coalesce(w, 0) + coalesce(l, 0) + coalesce(t, 0))) gp from nst group by lg, yr) x
where s.league_code = x.lg and s.start_year = x.yr and s.games_per_team is null and x.gp > 0;

-- Names by season. Consecutive seasons under one name are one identity (July 1, as in the NHL's 145); Wikipedia fills the periods the franchise's other
-- identities (the NHL's, SPX's) leave uncovered, never overlapping them.
create temp table nm as
select distinct on (x.yr, x.franchise_id) x.yr, x.franchise_id, coalesce(m.display, x.team_name) as full_name, m.country
from nts x join am m on m.league = x.lg and m.nm = lower(x.team_name) and x.yr between m.y0 and m.y1
order by x.yr, x.franchise_id, x.team_name;
create temp table hockfr as
select franchise_id from am union select franchise_id from core.franchise_league where league_code in ('nha', 'pcha', 'wchl', 'wha');
update core.team_season ts set franchise_identity_id = null
where franchise_identity_id in (select franchise_identity_id from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from hockfr));
delete from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from hockfr);
delete from core.franchise_league l where l.source_id = (select source_id from src) and l.league_code in ('nha', 'pcha', 'wchl', 'wha');

create temp table isl as
select franchise_id, full_name, min(country) country, min(yr) first_yr, max(yr) last_yr
from (select nm.*, yr - row_number() over (partition by franchise_id, full_name order by yr) as island from nm) x
group by franchise_id, full_name, island;
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
select p.franchise_id, p.rng, btrim(left(p.full_name, length(p.full_name) - length(split_part(p.full_name, ' ', array_length(string_to_array(p.full_name, ' '), 1))))),
       split_part(p.full_name, ' ', array_length(string_to_array(p.full_name, ' '), 1)), p.full_name, p.country, (select source_id from src)
from (select i.franchise_id, i.full_name, i.country, u.rng
      from isl i
      cross join lateral unnest(datemultirange(daterange(make_date(i.first_yr, 7, 1), make_date(i.last_yr + 1, 7, 1))) -
            coalesce((select range_agg(x.valid_during) from core.franchise_identity x where x.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);

insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select lg, yr, home_f f from ng union select lg, yr, away_f from ng union select lg, yr, franchise_id from nst union select lg, yr, franchise_id from nts) x
join core.season s on s.league_code = x.lg and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 11, 15) limit 1)
where ts.franchise_identity_id is null
  and ts.season_id in (select s.season_id from core.season s join seasons z on z.lg = s.league_code and z.yr = s.start_year);

-- League membership: a franchise is in each league from its first season there to the July after its last, never overlapping a membership another source wrote.
create temp table clspan as
select ts.franchise_id, s.league_code as lg, daterange(make_date(min(s.start_year), 7, 1), make_date(max(s.start_year) + 1, 7, 1)) as rng
from core.team_season ts join core.season s using (season_id)
where s.league_code in ('nha', 'pcha', 'wchl', 'wha') group by ts.franchise_id, s.league_code;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, p.lg, p.rng, (select source_id from src)
from (select a.franchise_id, a.lg, u.rng
      from clspan a
      cross join lateral unnest(datemultirange(a.rng) -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = a.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);
-- When a franchise began and ended: for Wikipedia's own franchises, and for the six the NHL build made from Stanley Cup finals alone (their dates there are
-- the finals'), the first and last season they played in these leagues.
update core.franchise f set founded_on = x.d0, folded_on = x.d1
from (select ts.franchise_id, make_date(min(s.start_year), 7, 1) d0, make_date(max(s.start_year) + 1, 7, 1) d1
      from core.team_season ts join core.season s using (season_id) where s.league_code in ('nha', 'pcha', 'wchl', 'wha') group by ts.franchise_id) x
where f.franchise_id = x.franchise_id
  and ((f.source_id = (select source_id from src) and f.source_key like 'hockey:%')
       or (f.source_id = (select source_id from meta.source where code = 'nhl_api') and f.source_key in ('CAT', 'EDE', 'SMT', 'VIC', 'VMI')));
-- The NHL build gave these clubs' identities a US country; they are Canadian (Vancouver, Victoria, Calgary, Edmonton).
update core.franchise_identity set country_code = 'CA'
where country_code <> 'CA' and franchise_id in (select franchise_id from core.franchise where source_id = (select source_id from meta.source where code = 'nhl_api') and source_key in ('CAT', 'EDE', 'VIC', 'VMI'));
update core.franchise set notes = 'Not an NHL member; played in the PCHA and WCHL and met NHL clubs in Stanley Cup play'
where source_id = (select source_id from meta.source where code = 'nhl_api') and source_key in ('CAT', 'EDE', 'SMT', 'VIC', 'VMI')
  and notes = 'Not an NHL member; met NHL clubs in Stanley Cup play';

-- Games. An update and an insert (as in 151), so a game keeps its id from run to run.
create temp table game_new as
select s.season_id, n.phase, n.game_date, hts.team_season_id home_ts, ats.team_season_id away_ts, n.neutral_site, n.home_pts, n.away_pts, n.overtime,
       n.round_name, n.key, case when n.counts then 'final' else 'cancelled' end::core.game_status as status,
       nullif(case when n.counts then n.note else coalesce(n.note || '; ', '') || 'not counted in the standings, result kept' end, '') as notes
from ng n join core.season s on s.league_code = n.lg and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id;
update core.game g set season_id = x.season_id, phase = x.phase, game_date = x.game_date, home_team_season_id = x.home_ts, away_team_season_id = x.away_ts,
       is_neutral_site = x.neutral_site, status = x.status, home_score = x.home_pts, away_score = x.away_pts, went_to_overtime = x.overtime, round_label = x.round_name,
       notes = x.notes, updated_at = now()
from game_new x
where g.source_id = (select source_id from src) and g.source_key = x.key
  and (g.season_id, g.phase, g.game_date, g.home_team_season_id, g.away_team_season_id, g.is_neutral_site, g.status, g.home_score, g.away_score, g.went_to_overtime, g.round_label, g.notes)
      is distinct from (x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, x.neutral_site, x.status, x.home_pts, x.away_pts, x.overtime, x.round_name, x.notes);
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status, home_score, away_score, went_to_overtime,
                       round_label, source_id, source_key, notes)
select x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, x.neutral_site, x.status, x.home_pts, x.away_pts, x.overtime, x.round_name,
       (select source_id from src), x.key, x.notes
from game_new x
where not exists (select 1 from core.game g where g.source_id = (select source_id from src) and g.source_key = x.key);
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, source_key from core.game where source_id = (select source_id from src) and source_key like 'wph:%';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', n.key, upper(n.lg) || ': ' || n.away_team || ' at ' || n.home_team || ' on ' || n.game_date || ' is not counted: ' || n.note,
       'Kept as a game with status cancelled and its result'
from ng n where not n.counts;

-- Final standings as the articles publish them, kept where the loader found them equal to the games (or where there are no games to compare).
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', n.lg || ':' || n.season || ':' || n.team,
       format('%s: Wikipedia''s standings give %s-%s-%s, %s-%s; its games %s', upper(n.lg), n.w, n.l, coalesce(n.t, 0), n.gf, n.ga, n.note),
       'Standing left out; the site shows the games'' sum'
from nst n where n.agrees is false;
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, points, points_for, points_against,
                           win_pct, division_rank, conference_rank, is_final, source_key)
select ts.team_season_id, 'regular', coalesce(s.regular_ends_on, make_date(n.season + 1, 4, 1)), (select source_id from src),
       n.w + n.l + coalesce(n.t, 0), n.w, n.l, coalesce(n.t, 0), n.pts, n.gf, n.ga,
       round((n.w + 0.5 * coalesce(n.t, 0))::numeric / nullif(n.w + n.l + coalesce(n.t, 0), 0), 4),
       case when n.division ~ '(East|West|Central|North|South|Canadian)' then n.rank_in_table end,
       case when n.division !~ '(East|West|Central|North|South|Canadian)' then n.rank_in_table end,
       true, 'wph:' || n.lg || ':' || n.season || ':' || n.team
from nst n
join core.season s on s.league_code = n.lg and s.start_year = n.season
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
where n.w is not null and n.l is not null and n.agrees is not false
on conflict do nothing;

-- Champions: the winner of the league's championship, as the league article's table of seasons (else the season article) names it. Step 165 leaves these
-- leagues alone (a two-game total-goals series is not decided by games won). The club is found through the seed, by the name the standings give it.
delete from core.award_winner where source_id = (select source_id from src) and source_key like 'wphchamp:%';
create temp table wchamp as
select s.lg, s.yr, w.champion, w.champion_basis, m.franchise_id, cs.season_id
from seasons s join wss w on w.league = s.lg and w.season = s.yr
join core.season cs on cs.league_code = s.lg and cs.start_year = s.yr
left join am m on m.league = s.lg and m.nm = lower(w.champion) and s.yr between m.y0 and m.y1
where w.champion is not null;
insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select a.award_id, c.season_id, ts.team_season_id, coalesce(i.full_name, c.champion), 'Champion per ' || c.champion_basis, (select source_id from src), 'wphchamp:' || c.lg || ':' || c.yr
from wchamp c
join core.award a on a.league_code = c.lg and a.kind = 'championship'
left join core.team_season ts on ts.franchise_id = c.franchise_id and ts.season_id = c.season_id
left join core.franchise_identity i on i.franchise_identity_id = ts.franchise_identity_id;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'award_winner', 'wphchamp:' || lg || ':' || yr,
       upper(lg) || ' champion: ' || yr || '-' || right((yr + 1)::text, 2) || ': ' || champion || ', per ' || champion_basis, 'Kept the league article''s champion'
from wchamp where champion_basis like '%says%';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'award_winner', 'wphchamp:' || lg || ':' || yr, upper(lg) || ' champion: ' || champion || ' matches no club of the season', 'Kept as the champion''s name, with no club linked'
from wchamp where franchise_id is null;

-- Playoff series told as a result only (the WHA's brackets, the PCHA's and WCHL's prose).
create temp table nse as
select e.*, e.league as lg, e.season as yr, w.franchise_id wf, l.franchise_id lf
from wse e
left join am w on w.league = e.league and w.nm = lower(e.winner) and e.season between w.y0 and w.y1
left join am l on l.league = e.league and l.nm = lower(e.loser) and e.season between l.y0 and l.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'series', lg || ':' || season || ':' || round_name || ':' || winner, upper(lg) || ': club name not matched to a franchise', 'Series left out'
from nse where wf is null or lf is null;
insert into core.series (season_id, round_label, best_of, higher_seed_team_season_id, lower_seed_team_season_id, winner_team_season_id,
                         higher_seed_wins, lower_seed_wins, source_id, source_key)
select s.season_id, n.round_name || coalesce(' (total goals ' || n.winner_goals || '-' || n.loser_goals || ')', ''), null,
       wts.team_season_id, lts.team_season_id, wts.team_season_id, n.winner_wins, n.loser_wins,
       (select source_id from src), 'wph:' || n.lg || ':' || n.season || ':' || n.round_name || ':' || n.winner
from nse n join core.season s on s.league_code = n.lg and s.start_year = n.yr
join core.team_season wts on wts.franchise_id = n.wf and wts.season_id = s.season_id
join core.team_season lts on lts.franchise_id = n.lf and lts.season_id = s.season_id
where n.wf is not null and n.lf is not null
on conflict (source_id, source_key) do update set round_label = excluded.round_label, winner_team_season_id = excluded.winner_team_season_id,
  higher_seed_wins = excluded.higher_seed_wins, lower_seed_wins = excluded.lower_seed_wins;

select lg, k, n from (
  select lg, 'seasons' k, count(*) n from seasons group by lg
  union all select s.league_code, 'games', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code in ('nha', 'pcha', 'wchl', 'wha') group by s.league_code
  union all select s.league_code, 'regular counted', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code in ('nha', 'pcha', 'wchl', 'wha') and g.phase = 'regular' and g.status = 'final' group by s.league_code
  union all select s.league_code, 'playoff games', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code in ('nha', 'pcha', 'wchl', 'wha') and g.phase = 'playoffs' group by s.league_code
  union all select s.league_code, 'not counted', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code in ('nha', 'pcha', 'wchl', 'wha') and g.status = 'cancelled' group by s.league_code
  union all select split_part(source_key, ':', 2), 'standings', count(*) from core.standing where source_id = (select source_id from src) and source_key like 'wph:%' group by 1
  union all select s.league_code, 'series', count(*) from core.series x join core.season s using (season_id) where x.source_id = (select source_id from src) and x.source_key like 'wph:%' group by s.league_code
  union all select s.league_code, 'team seasons', count(*) from core.team_season t join core.season s using (season_id) where s.league_code in ('nha', 'pcha', 'wchl', 'wha') group by s.league_code
  union all select 'all', 'standings left out', count(*) from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NHA|PCHA|WCHL|WHA): Wikipedia''s standings'
  union all select 'all', 'unmatched name', count(*) from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NHA|PCHA|WCHL|WHA): club name not matched') z
order by lg, k;
commit;
