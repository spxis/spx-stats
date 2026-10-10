-- NBA (and BAA) from English Wikipedia (CC BY-SA 4.0): every game its clubs' season articles log
-- (regular season and playoffs), each season's published standings, and every franchise's names by
-- season, parsed by scripts/nba/ into legacy_wikipedia_nba, season by season, growing outward from
-- SPX's seasons (2002-2012). Where the SPX database holds a game, SPX stays the base: Wikipedia
-- fills a result SPX never entered, confirms one that agrees and flags one that does not. Games SPX
-- lacks are added with source wikipedia. Franchise lineage: SPX's 30 franchises keep their own
-- (a relocated or renamed club joins its current franchise); a club no current franchise descends
-- from gets one of its own (the BAA/NBA's defunct clubs).
-- Why Wikipedia: the NBA's own feeds (stats.nba.com, cdn.nba.com) answered 403 to this project's
-- identified client, and the league's terms of use prohibit automated collection, so they were not
-- used; Basketball-Reference and ESPN are excluded by their terms.
-- Runs after 146, before 150 and 155. Safe to rerun as seasons arrive (load them first with
-- scripts/nba/season.py): it rebuilds only what Wikipedia supplied for the NBA.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'NBA and BAA season and club-season articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '1946-11-01', current_date,
        'NBA/BAA results from the "<year> NBA season" standings templates and each "<year> <club> season" article''s game log (regular season and playoffs), raw wikitext fetched 2026-10-10. Official NBA feeds were not used: their terms forbid automated access.')
on conflict (code) do update set
  retrieved_on = current_date,
  covers_from = least(meta.source.covers_from, excluded.covers_from),
  attribution = case when meta.source.attribution like '%NBA and BAA%' then meta.source.attribution else meta.source.attribution || ' ' || excluded.attribution end,
  notes = case when meta.source.notes like '%NBA/BAA results%' then meta.source.notes else coalesce(meta.source.notes || ' ', '') || excluded.notes end;
create temp table src as select source_id from meta.source where code = 'wikipedia';

-- On a rerun, first take back what an earlier run filled into SPX's games, so they are matched afresh.
update core.game g set status = 'scheduled', home_score = null, away_score = null, went_to_overtime = null,
       game_date = coalesce(g.original_date, g.game_date), original_date = null, updated_at = now()
from meta.data_issue d
where d.source_id = (select source_id from src) and d.issue = 'NBA: no result in SPX' and d.entity_key = g.source_key
  and g.source_id <> (select source_id from src);

delete from core.standing where source_id = (select source_id from src) and source_key like 'wpnba:%';
delete from meta.verification v using core.game g, core.season s
where v.source_id = (select source_id from src) and v.entity_kind = 'game' and v.entity_id = g.game_id and s.season_id = g.season_id and s.league_code = 'nba';
delete from meta.data_issue where source_id = (select source_id from src) and issue like 'NBA:%';
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and external_key like 'wpnba:%';
delete from core.game g using core.season s where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code = 'nba';

-- Club names (lower case, as the article titles give them) -> franchise, by the year a season starts.
-- spx_team_id: SPX's number for the franchise; new_key: a franchise of Wikipedia's own (defunct clubs).
-- Charlotte Hornets 1988-2001 follow the NBA's own records since 2014 (the Bobcats/Hornets franchise, SPX 1036),
-- not the Pelicans (SPX 31) the club moved to by relocation; see notes on the franchise.
create temp table amap (nm text not null, y0 integer not null, y1 integer not null, spx_team_id integer, new_key text);
insert into amap values
  ('boston celtics',1946,9999,30,null),('new york knicks',1946,9999,46,null),
  ('philadelphia warriors',1946,1961,37,null),('san francisco warriors',1962,1970,37,null),('golden state warriors',1971,9999,37,null),
  ('toronto huskies',1946,1946,null,'TOH'),('providence steam rollers',1946,1948,null,'PRO'),('providence steamrollers',1946,1948,null,'PRO'),('pittsburgh ironmen',1946,1946,null,'PIT'),
  ('cleveland rebels',1946,1946,null,'CLR'),('detroit falcons',1946,1946,null,'DTF'),('chicago stags',1946,1949,null,'CHS'),
  ('washington capitols',1946,1950,null,'WSC'),('st. louis bombers',1946,1949,null,'STB'),('indianapolis jets',1948,1948,null,'IJT'),
  ('baltimore bullets',1947,1954,null,'BAL'),
  ('minneapolis lakers',1947,1959,41,null),('los angeles lakers',1960,9999,41,null),
  ('rochester royals',1948,1956,51,null),('cincinnati royals',1957,1971,51,null),('kansas city-omaha kings',1972,1974,51,null),('kansas city–omaha kings',1972,1974,51,null),
  ('kansas city kings',1975,1984,51,null),('sacramento kings',1985,9999,51,null),
  ('fort wayne pistons',1948,1956,36,null),('fort wayne zollner pistons',1948,1956,36,null),('detroit pistons',1957,9999,36,null),
  ('anderson packers',1949,1949,null,'ANP'),('indianapolis olympians',1949,1952,null,'IND'),('sheboygan red skins',1949,1949,null,'SHB'),
  ('waterloo hawks',1949,1949,null,'WAT'),('denver nuggets',1949,1949,null,'DEN'),
  ('tri-cities blackhawks',1949,1950,29,null),('milwaukee hawks',1951,1954,29,null),('st. louis hawks',1955,1967,29,null),('atlanta hawks',1968,9999,29,null),
  ('syracuse nationals',1949,1962,48,null),('philadelphia 76ers',1963,9999,48,null),
  ('chicago packers',1961,1961,57,null),('chicago zephyrs',1962,1962,57,null),('baltimore bullets',1963,1972,57,null),('capital bullets',1973,1973,57,null),
  ('washington bullets',1974,1996,57,null),('washington wizards',1997,9999,57,null),
  ('chicago bulls',1966,9999,32,null),
  ('seattle supersonics',1967,2007,53,null),('oklahoma city thunder',2008,9999,53,null),
  ('san diego rockets',1967,1970,38,null),('houston rockets',1971,9999,38,null),
  ('milwaukee bucks',1968,9999,43,null),('phoenix suns',1968,9999,49,null),('portland trail blazers',1970,9999,50,null),
  ('cleveland cavaliers',1970,9999,33,null),
  ('buffalo braves',1970,1977,40,null),('san diego clippers',1978,1983,40,null),('los angeles clippers',1984,9999,40,null),
  ('new orleans jazz',1974,1978,55,null),('utah jazz',1979,9999,55,null),
  ('denver nuggets',1976,9999,35,null),('indiana pacers',1976,9999,39,null),
  ('new york nets',1976,1976,45,null),('new jersey nets',1977,2011,45,null),('brooklyn nets',2012,9999,45,null),
  ('san antonio spurs',1976,9999,52,null),('dallas mavericks',1980,9999,34,null),
  ('charlotte hornets',1988,2001,1036,null),('charlotte bobcats',2004,2013,1036,null),('charlotte hornets',2014,9999,1036,null),
  ('miami heat',1988,9999,42,null),('orlando magic',1989,9999,47,null),('minnesota timberwolves',1989,9999,44,null),
  ('toronto raptors',1995,9999,54,null),('vancouver grizzlies',1995,2000,56,null),('memphis grizzlies',2001,9999,56,null),
  ('new orleans hornets',2002,2012,31,null),('new orleans/oklahoma city hornets',2005,2006,31,null),('new orleans pelicans',2013,9999,31,null);

insert into core.franchise (sport_code, source_id, source_key)
select 'basketball', (select source_id from src), 'nba:' || k from (select distinct new_key k from amap where new_key is not null) x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'nba:' || x.k);

create temp table am as
select a.nm, a.y0, a.y1, coalesce(e.entity_id, f.franchise_id)::integer as franchise_id
from amap a
left join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || a.spx_team_id
     and e.source_id = (select source_id from meta.source where code = 'spx_database')
left join core.franchise f on f.source_id = (select source_id from src) and f.source_key = 'nba:' || a.new_key;

-- Every Wikipedia game and standing, with franchises.
create temp table ng as
select row_number() over (order by g.season, g.game_date, g.phase, g.home_team, g.away_team, g.game_seq) as gid,
       g.season as yr, g.phase::core.season_phase as phase, g.game_date, g.round_name, g.home_pts, g.away_pts, g.overtime, g.neutral_site,
       g.views, g.conflict, g.home_team, g.away_team, h.franchise_id home_f, a.franchise_id away_f,
       'wpnba:' || g.season || ':' || g.phase || ':' || g.game_date || ':' || g.home_team || ':' || g.away_team || ':' || g.game_seq as key
from legacy_wikipedia_nba.game g
left join am h on h.nm = lower(g.home_team) and g.season between h.y0 and h.y1
left join am a on a.nm = lower(g.away_team) and g.season between a.y0 and a.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', key, format('NBA: club name not matched to a franchise: %s / %s in %s', away_team, home_team, yr), 'Game left out'
from ng where home_f is null or away_f is null;
delete from ng where home_f is null or away_f is null or home_f = away_f;

create temp table nst as
select s.*, s.season as yr, m.franchise_id from legacy_wikipedia_nba.standing s
left join am m on m.nm = lower(s.team) and s.season between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', season || ':' || team, 'NBA: club name not matched to a franchise', 'Standing left out'
from nst where franchise_id is null;
delete from nst where franchise_id is null;

create temp table nts as
select t.season yr, t.team_name, t.log_games, m.franchise_id from legacy_wikipedia_nba.team_season t
join am m on m.nm = lower(t.team_name) and t.season between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', t.season || ':' || t.team_name, 'NBA: club name not matched to a franchise', 'Club left out'
from legacy_wikipedia_nba.team_season t where not exists (select 1 from am m where m.nm = lower(t.team_name) and t.season between m.y0 and m.y1);

-- Seasons (BAA seasons 1946-48 are filed under the NBA).
insert into core.season (league_code, start_year, end_year, label, source_id)
select 'nba', yr, yr + 1, yr || '-' || right((yr + 1)::text, 2), (select source_id from src)
from (select yr from ng union select yr from nst union select yr from nts) x on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs), regular_ends_on = coalesce(s.regular_ends_on, d.re),
  playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select yr, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
             max(game_date) filter (where phase = 'playoffs') pe from ng group by yr) d
where s.league_code = 'nba' and s.start_year = d.yr;
-- Scheduled games per team: the most the published standings count (a season cut short, or clubs of unequal length, keep what SPX says or stay empty).
update core.season s set games_per_team = x.gp
from (select season yr, max(coalesce(gp, w + l)) gp from nst group by season) x
where s.league_code = 'nba' and s.start_year = x.yr and s.games_per_team is null;

-- Names by season: the article titles'. Consecutive seasons under one name are one identity.
create temp table nm as
select distinct on (yr, franchise_id) yr, franchise_id, team_name as full_name,
       case when team_name ~ ' (Trail Blazers|Red Skins|Steam Rollers)$' then substring(team_name from '(Trail Blazers|Red Skins|Steam Rollers)$')
            else regexp_replace(team_name, '^.* ', '') end as nickname
from nts order by yr, franchise_id, team_name;
create temp table fr as select distinct franchise_id from nm;
-- the franchises of this league (SPX's and Wikipedia's): the identities and memberships Wikipedia may have written before
create temp table nbafr as
select franchise_id from core.franchise_league where league_code = 'nba'
union select franchise_id from core.franchise where source_id = (select source_id from src) and source_key like 'nba:%';

update core.team_season ts set franchise_identity_id = null
where franchise_identity_id in (select franchise_identity_id from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from nbafr));
delete from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from nbafr);
delete from core.franchise_league l where l.source_id = (select source_id from src) and l.league_code = 'nba';

create temp table last_season as select max(yr) y from nm;
create temp table isl as
select franchise_id, full_name, nickname, min(yr) first_yr, max(yr) last_yr
from (select nm.*, yr - row_number() over (partition by franchise_id, full_name order by yr) as island from nm) x
group by franchise_id, full_name, nickname, island;
create temp table isl2 as
select i.*, case when i.last_yr >= (select y from last_season) and (select y from last_season) = (select max(start_year) from core.season where league_code = 'nba')
                 then null else make_date(i.last_yr + 1, 7, 1) end as end_on
from isl i;
-- Wikipedia fills the periods SPX's own identities leave uncovered, never overlapping them.
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
select p.franchise_id, p.rng, btrim(left(p.full_name, length(p.full_name) - length(p.nickname))), p.nickname, p.full_name,
       case when p.full_name in ('Toronto Huskies', 'Toronto Raptors', 'Vancouver Grizzlies') then 'CA' else 'US' end, (select source_id from src)
from (select i.franchise_id, i.full_name, i.nickname, u.rng
      from isl2 i
      cross join lateral unnest(datemultirange(daterange(make_date(i.first_yr, 7, 1), i.end_on)) -
            coalesce((select range_agg(x.valid_during) from core.franchise_identity x where x.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, 'nba', p.rng, (select source_id from src)
from (select i.franchise_id, u.rng
      from (select franchise_id, daterange(min(lower(valid_during)), case when bool_or(upper_inf(valid_during)) then null else max(upper(valid_during)) end) as span
            from core.franchise_identity where franchise_id in (select franchise_id from fr) group by franchise_id) i
      cross join lateral unnest(datemultirange(i.span) -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = i.franchise_id and l.league_code = 'nba'), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);

update core.franchise f set founded_on = coalesce(f.founded_on, d.first_game),
       folded_on = case when f.source_id = (select source_id from src) and d.last_yr < (select max(start_year) from core.season where league_code = 'nba') then d.last_game else f.folded_on end
from (select fid, min(game_date) first_game, max(game_date) last_game, max(yr) last_yr
      from (select home_f fid, game_date, yr from ng union all select away_f, game_date, yr from ng) z group by fid) d
where f.franchise_id = d.fid and (f.source_id = (select source_id from src) or f.founded_on is null);
update core.franchise set notes = coalesce(notes, 'Charlotte Hornets 1988-2001 are filed here, as the NBA has kept its records since 2014; the club that moved to New Orleans is the franchise SPX numbers 31')
where franchise_id = (select entity_id from core.external_id where entity_kind = 'franchise' and external_key = 'team:1036' and source_id = (select source_id from meta.source where code = 'spx_database'));

insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select yr, home_f f from ng union select yr, away_f from ng union select yr, franchise_id from nst union select yr, franchise_id from nts) x
join core.season s on s.league_code = 'nba' and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 10, 15) limit 1)
where ts.franchise_identity_id is null and ts.season_id in (select season_id from core.season where league_code = 'nba');

-- SPX's NBA games, matched one to one with Wikipedia's: first on the same date, then a day either side
-- (SPX dated some games by the next morning), then a game SPX still shows unplayed on another date.
create temp table spx_g as
select g.game_id, g.game_date, g.status, g.home_score, g.away_score, h.franchise_id home_f, a.franchise_id away_f, s.start_year, g.phase
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
where s.league_code = 'nba' and g.source_id <> (select source_id from src) and g.status <> 'cancelled' and g.phase in ('regular', 'playoffs');
create temp table matched (key bigint primary key, game_id bigint unique not null, moved boolean not null default false);
insert into matched
select distinct on (game_id) key, game_id from (
  select distinct on (n.gid) n.gid key, s.game_id, s.status
  from ng n join spx_g s on s.start_year = n.yr and s.game_date = n.game_date and s.home_f = n.home_f and s.away_f = n.away_f
  order by n.gid, (s.phase::text = n.phase::text) desc, (s.status = 'final') desc, s.game_id) a
order by game_id, key;
insert into matched
select distinct on (game_id) key, game_id from (
  select distinct on (n.gid) n.gid key, s.game_id, abs(s.game_date - n.game_date) dd
  from ng n join spx_g s on s.start_year = n.yr and abs(s.game_date - n.game_date) <= 1 and s.home_f = n.home_f and s.away_f = n.away_f
  where n.gid not in (select key from matched) and s.game_id not in (select game_id from matched)
  order by n.gid, (s.status = 'final') desc, abs(s.game_date - n.game_date), s.game_id) a
order by game_id, dd, key;
insert into matched (key, game_id, moved)
select distinct on (game_id) key, game_id, true from (
  select distinct on (n.gid) n.gid key, s.game_id, abs(s.game_date - n.game_date) dd
  from ng n join spx_g s on s.start_year = n.yr and s.home_f = n.home_f and s.away_f = n.away_f and s.status <> 'final' and s.phase::text = n.phase::text
  where n.gid not in (select key from matched) and s.game_id not in (select game_id from matched)
  order by n.gid, abs(s.game_date - n.game_date), s.game_id) a
order by game_id, dd, key;

create temp table mm as
select m.key, m.moved, n.game_date as r_date, n.home_pts r_h, n.away_pts r_a, s.game_id, s.status, s.home_score, s.away_score, n.overtime r_ot, n.phase r_phase
from matched m join ng n on n.gid = m.key join spx_g s on s.game_id = m.game_id;

-- SPX filed some playoff games under the regular season (and the reverse): Wikipedia's log knows which.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', g.source_key, format('NBA: SPX has the game as %s, Wikipedia as %s', g.phase, n.phase), 'Phase taken from Wikipedia'
from matched m join core.game g using (game_id) join ng n on n.gid = m.key
where g.phase in ('regular', 'playoffs') and g.phase <> n.phase;
update core.game g set phase = n.phase, updated_at = now()
from matched m join ng n on n.gid = m.key
where g.game_id = m.game_id and g.phase in ('regular', 'playoffs') and g.phase <> n.phase;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id), 'NBA: no result in SPX',
       format('Filled from Wikipedia: %s-%s', m.r_h, m.r_a)
from mm m where m.status <> 'final';
update core.game g set status = 'final', home_score = m.r_h, away_score = m.r_a,
       original_date = case when m.moved and abs(g.game_date - m.r_date) > 1 then g.game_date else g.original_date end,
       game_date = case when m.moved and abs(g.game_date - m.r_date) > 1 then m.r_date else g.game_date end,
       went_to_overtime = coalesce(m.r_ot or null, g.went_to_overtime), updated_at = now()
from mm m where g.game_id = m.game_id and m.status <> 'final';
insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'game', m.game_id, 'score', case when m.home_score = m.r_h and m.away_score = m.r_a then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from src), m.r_h || '-' || m.r_a
from mm m where m.status = 'final';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id),
       format('NBA: SPX has %s-%s, Wikipedia %s-%s', m.home_score, m.away_score, m.r_h, m.r_a), 'Kept SPX''s; needs a third source'
from mm m where m.status = 'final' and (m.home_score <> m.r_h or m.away_score <> m.r_a);

-- An SPX result between two clubs whose logs Wikipedia holds, with no game in them to match it
-- (a club article with no game log at all proves nothing either way).
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', g.source_key, 'NBA: SPX game not found in Wikipedia''s logs (date or teams differ)', 'Kept SPX''s; check the date and the teams'
from spx_g s join core.game g using (game_id)
where s.game_id not in (select game_id from matched) and s.status = 'final' and s.start_year in (select yr from ng)
  and exists (select 1 from nts n where n.yr = s.start_year and n.franchise_id = s.home_f and n.log_games > 0)
  and exists (select 1 from nts n where n.yr = s.start_year and n.franchise_id = s.away_f and n.log_games > 0);

-- Wikipedia's views that disagree with each other (two logs, two scores) are flagged on the game they made.
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, round_label, source_id, source_key, notes)
select s.season_id, n.phase, n.game_date, hts.team_season_id, ats.team_season_id, n.neutral_site, 'final',
       n.home_pts, n.away_pts, case when n.overtime then true end, n.round_name, (select source_id from src), n.key,
       case when n.conflict is not null then 'Wikipedia logs disagree: ' || n.conflict end
from ng n join core.season s on s.league_code = 'nba' and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id
where n.gid not in (select key from matched);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', n.key, 'NBA: Wikipedia''s two logs disagree: ' || n.conflict, 'Kept the home club''s log'
from ng n where n.conflict is not null;
-- Playoff round names for SPX's matched games that have none.
update core.game g set round_label = n.round_name
from matched m join ng n on n.gid = m.key where g.game_id = m.game_id and g.round_label is null and n.round_name is not null and g.phase = 'playoffs';

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, source_key from core.game where source_id = (select source_id from src) and source_key like 'wpnba:%'
union all select 'game', m.game_id, (select source_id from src), n.key from matched m join ng n on n.gid = m.key;

-- Final standings as the season's standings templates publish them (the division template where there is one: it carries home and road).
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, win_pct, games_behind, home_record, road_record,
                           division_record, is_final, source_key)
select ts.team_season_id, 'regular', coalesce(s.regular_ends_on, make_date(n.season + 1, 4, 15)), (select source_id from src),
       coalesce(n.gp, n.w + n.l), n.w, n.l,
       case when n.pct ~ '^[01]?\.\d+$' then n.pct::numeric(5,4) end,
       case when n.gb ~ '^\d+(\.\d)?$' then n.gb::numeric(4,1) when n.gb ~ '^[–—-]$' then 0 end,
       case when n.home ~ '^\d+[–-]\d+$' then n.home end, case when n.road ~ '^\d+[–-]\d+$' then n.road end,
       case when n.div_record ~ '^\d+[–-]\d+$' then n.div_record end,
       true, 'wpnba:' || n.season || ':' || n.team
from (select distinct on (season, franchise_id) * from nst order by season, franchise_id, (home is not null) desc, division) n
join core.season s on s.league_code = 'nba' and s.start_year = n.season
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
where n.w is not null and n.l is not null
on conflict do nothing;

select 'matched' k, count(*) from mm
union all select 'filled', count(*) from mm where status <> 'final'
union all select 'confirmed', count(*) from mm where status = 'final' and home_score = r_h and away_score = r_a
union all select 'disputed', count(*) from mm where status = 'final' and (home_score <> r_h or away_score <> r_a)
union all select 'added', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'nba'
union all select 'standings', count(*) from core.standing where source_id = (select source_id from src) and source_key like 'wpnba:%'
union all select 'unmatched name', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'NBA: club name not matched%';
commit;
