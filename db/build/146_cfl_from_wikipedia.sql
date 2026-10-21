-- CFL from English Wikipedia (CC BY-SA 4.0): the season, club-season and standings
-- articles for 1958 on, parsed by scripts/wikipedia/ into legacy_wikipedia_cfl.
-- Where the SPX database holds a game, SPX stays the base: Wikipedia fills a result
-- SPX never entered, confirms one that agrees and flags one that does not. Games SPX
-- lacks (earlier and later seasons, playoffs) are added with source wikipedia.
-- Franchises: the nine SPX clubs keep their SPX franchise; a club no SPX franchise
-- descends from gets one of its own (the CFL's own continuity is followed: a renamed
-- or relocated club is one franchise, an unrelated club of the same city is not).
-- Runs after 145, before 150 and 155. Safe to rerun as seasons arrive (load them
-- first with scripts/wikipedia/season.py): it rebuilds only what Wikipedia supplied.
-- The same source row also carries the award lists of 170/171; only CFL rows are touched here.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'CFL season, club-season and standings articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '1958-01-01', current_date,
        'CFL results from the "<year> CFL season" and "<year> <club> season" articles (schedule tables, standings templates, playoff brackets), raw wikitext fetched 2026-10-10.')
on conflict (code) do update set
  retrieved_on = current_date,
  covers_from = least(meta.source.covers_from, excluded.covers_from),
  attribution = case when meta.source.attribution like '%CFL season%' then meta.source.attribution else meta.source.attribution || ' ' || excluded.attribution end,
  notes = case when meta.source.notes like '%CFL results%' then meta.source.notes else coalesce(meta.source.notes || ' ', '') || excluded.notes end;
create temp table src as select source_id from meta.source where code = 'wikipedia';

-- On a rerun, first take back what an earlier run filled into SPX's games, so they are matched afresh.
update core.game g set status = 'scheduled', home_score = null, away_score = null, went_to_overtime = null,
       game_date = coalesce(g.original_date, g.game_date), original_date = null, updated_at = now()
from meta.data_issue d
where d.source_id = (select source_id from src) and d.issue = 'CFL: no result in SPX' and d.entity_key = g.source_key
  and g.source_id <> (select source_id from src);

delete from core.standing where source_id = (select source_id from src) and source_key like 'wpcfl:%';
delete from meta.verification v using core.game g, core.season s
where v.source_id = (select source_id from src) and v.entity_kind = 'game' and v.entity_id = g.game_id and s.season_id = g.season_id and s.league_code = 'cfl';
delete from meta.data_issue where source_id = (select source_id from src) and issue like 'CFL:%';
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and external_key like 'wpcfl:%';
-- A rerun keeps the number of every Wikipedia game it adds again (the site's game addresses carry it): the ids are
-- remembered before the delete and given back on insert, by source_key, else by day and the two franchises (a club name
-- spelt another way in a newer article changes the key, not the game). Child rows (game_league_id, game_venue, ...)
-- cascade with the delete: rerun 212, 198, 199 and 209 afterwards.
create temp table old_wp_game as
select g.source_key, g.game_id, g.game_date, th.franchise_id as hf, ta.franchise_id as af
from core.game g join core.season s on s.season_id = g.season_id
join core.team_season th on th.team_season_id = g.home_team_season_id join core.team_season ta on ta.team_season_id = g.away_team_season_id
where g.source_id = (select source_id from src) and s.league_code = 'cfl' and g.source_key like 'wpcfl:%';
create temp table old_wp_game_day as
select distinct on (game_date, hf, af) game_date, hf, af, game_id from old_wp_game order by game_date, hf, af, game_id;
delete from core.game g using core.season s where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code = 'cfl';

-- Club names (lower case, no dots or footnote marks) -> franchise, by the year a season starts.
-- spx_team_id: SPX's number for the club (franchise.source_key under the SPX database); new_key: a franchise of Wikipedia's own.
create temp table amap (nm text not null, y0 integer not null, y1 integer not null, spx_team_id text, new_key text);
insert into amap values
  ('montreal alouettes', 1946, 1981, null, 'MTL1'), ('montreal concordes', 1982, 1985, null, 'MTL1'), ('montreal alouettes', 1986, 1987, null, 'MTL1'),
  ('montreal alouettes', 1996, 9999, '162', null),
  ('hamilton tigercats', 1946, 9999, '163', null), ('hamilton tiger cats', 1946, 9999, '163', null),
  ('ottawa rough riders', 1946, 1996, null, 'OTT1'), ('ottawa renegades', 2002, 2005, '164', null), ('ottawa redblacks', 2014, 9999, null, 'OTT3'),
  ('toronto argonauts', 1946, 9999, '165', null),
  ('winnipeg blue bombers', 1946, 9999, '166', null), ('winipeg blue bombers', 1975, 1975, '166', null), -- sic, a typo in a 1975 club article
  ('edmonton eskimos', 1946, 9999, '167', null), ('edmonton football team', 2020, 2021, '167', null), ('edmonton elks', 2021, 9999, '167', null),
  ('saskatchewan roughriders', 1946, 9999, '168', null), ('saskatchewan rough riders', 1946, 9999, '168', null),
  ('calgary stampeders', 1946, 9999, '169', null),
  ('bc lions', 1953, 9999, '170', null), ('british columbia lions', 1953, 9999, '170', null),
  ('baltimore cfl colts', 1994, 1994, null, 'BAL'), ('baltimore football club', 1994, 1994, null, 'BAL'), ('baltimore cflers', 1994, 1994, null, 'BAL'), ('baltimore stallions', 1994, 1995, null, 'BAL'),
  ('sacramento gold miners', 1993, 1994, null, 'SAC'), ('san antonio texans', 1995, 1995, null, 'SAC'),
  ('las vegas posse', 1994, 1994, null, 'LVP'), ('shreveport pirates', 1994, 1995, null, 'SHV'),
  ('memphis mad dogs', 1995, 1995, null, 'MEM'), ('birmingham barracudas', 1995, 1995, null, 'BIR');

insert into core.franchise (sport_code, source_id, source_key)
select 'canadian_football', (select source_id from src), 'cfl:' || k from (select distinct new_key k from amap where new_key is not null) x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'cfl:' || x.k);

create temp table am as
select a.nm, a.y0, a.y1, coalesce(f1.franchise_id, f2.franchise_id)::integer as franchise_id
from amap a
left join core.franchise f1 on a.spx_team_id is not null and f1.source_key = a.spx_team_id and f1.source_id = (select source_id from meta.source where code = 'spx_database')
left join core.franchise f2 on a.new_key is not null and f2.source_id = (select source_id from src) and f2.source_key = 'cfl:' || a.new_key;

create or replace function pg_temp.wnorm(t text) returns text language sql immutable as
$$ select trim(regexp_replace(lower(replace(replace(t, 'B.C.', 'BC'), '-', '')), '[^a-z ]', '', 'g')) $$;

-- Every game of Wikipedia's with its franchises.
create temp table wg as
select g.*, wnorm.h_nm, wnorm.a_nm, h.franchise_id as home_f, a.franchise_id as away_f,
       row_number() over (order by g.season, g.phase, g.game_date, g.teams, g.game_seq) as wid
from legacy_wikipedia_cfl.game g
cross join lateral (select pg_temp.wnorm(g.home_team) h_nm, pg_temp.wnorm(g.away_team) a_nm) wnorm
left join am h on h.nm = wnorm.h_nm and g.season between h.y0 and h.y1
left join am a on a.nm = wnorm.a_nm and g.season between a.y0 and a.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', 'wpcfl:' || season || ':' || phase || ':' || coalesce(game_date::text, '?') || ':' || teams::text,
       'CFL: ' || case when home_team is null then 'neither page says who was at home' else format('club not matched to a franchise: %s / %s in %s', away_team, home_team, season) end,
       'Game left out unless SPX has it'
from wg where home_f is null or away_f is null or home_f = away_f;

create temp table wst as
select s.*, m.franchise_id from legacy_wikipedia_cfl.standing s
left join am m on m.nm = pg_temp.wnorm(s.team) and s.season between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', season || ':' || division || ':' || team, 'CFL: club not matched to a franchise', 'Standing left out'
from wst where franchise_id is null;

-- Seasons (a CFL season is one calendar year).
insert into core.season (league_code, start_year, end_year, label, source_id)
select 'cfl', yr, yr, yr::text, (select source_id from src)
from (select distinct season yr from wg union select distinct season from wst) x
on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs), regular_ends_on = coalesce(s.regular_ends_on, d.re), playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select season, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
             max(game_date) filter (where phase = 'playoffs') pe from wg group by season) d
where s.league_code = 'cfl' and s.start_year = d.season;
-- Games each club was scheduled for: what the standings counted, wherever a season was played whole.
update core.season s set games_per_team = x.gp
from (select season, max(coalesce(gp, w + l + coalesce(t, 0))) gp from wst group by season) x
where s.league_code = 'cfl' and s.start_year = x.season and s.games_per_team is null and x.gp > 0;

-- Team seasons, and each club's name by season (the article's own: "BC Lions", "Edmonton Football Team").
insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select season, home_f f from wg union select season, away_f from wg union select season, franchise_id from wst) x
join core.season s on s.league_code = 'cfl' and s.start_year = x.season
where x.f is not null
on conflict (franchise_id, season_id) do nothing;

create temp table nm0 as
select ts.season as yr, m.franchise_id, ts.team_name, count(*) n
from legacy_wikipedia_cfl.team_season ts
join am m on m.nm = pg_temp.wnorm(ts.team_name) and ts.season between m.y0 and m.y1
group by 1, 2, 3;
create temp table nm as
select distinct on (yr, franchise_id) yr, franchise_id, team_name from nm0 order by yr, franchise_id, n desc, team_name;

-- Seasons already named by SPX's identities are left to them; Wikipedia names the rest. A run of seasons under one
-- name is one identity; a run next to SPX's range stops at the new year, so the ranges never overlap.
create temp table nmc as
select nm.*, exists (select 1 from core.franchise_identity i where i.franchise_id = nm.franchise_id and i.source_id <> (select source_id from src)
                     and i.valid_during @> make_date(nm.yr, 9, 15)) as covered
from nm;
create temp table last_season as select max(yr) y from nm;
create temp table runs as
select franchise_id, team_name, covered, min(yr) first_yr, max(yr) last_yr from (
  select x.*, sum(chg) over (partition by franchise_id order by yr) as grp
  from (select nmc.*, case when lag(team_name) over w is distinct from team_name or lag(covered) over w is distinct from covered then 1 else 0 end chg
        from nmc window w as (partition by franchise_id order by yr)) x) y
group by franchise_id, team_name, covered, grp;

-- An identity keeps its franchise_identity_id on a rerun: the id of each one deleted below goes to ingest.row_id_map (a key already there keeps its first id)
-- and ingest.identity_id_for (migration 146) gives it back to the identity with the same franchise and first day.
insert into ingest.row_id_map (tbl, natural_key, row_id)
select 'core.franchise_identity', i.franchise_id || '/' || coalesce(lower(i.valid_during)::text, ''), i.franchise_identity_id
from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in
  (select franchise_id from core.franchise where source_id = (select source_id from src) or franchise_id in (select franchise_id from nm))
  and i.franchise_id in (select franchise_id from core.franchise_league where league_code = 'cfl')
on conflict (tbl, natural_key) do nothing;
update core.team_season set franchise_identity_id = null
where franchise_id in (select franchise_id from nm) and franchise_identity_id in
  (select franchise_identity_id from core.franchise_identity where source_id = (select source_id from src));
-- Only CFL clubs: the same source row also made the NBA's and other leagues' franchises and identities (2026-10-17), which stay.
delete from core.franchise_identity where source_id = (select source_id from src) and franchise_id in
  (select franchise_id from core.franchise where source_id = (select source_id from src) or franchise_id in (select franchise_id from nm))
  and franchise_id in (select franchise_id from core.franchise_league where league_code = 'cfl');

insert into core.franchise_identity (franchise_identity_id, franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code, source_id)
overriding system value
select ingest.identity_id_for(r.franchise_id, make_date(r.first_yr, 1, 1)), r.franchise_id,
       daterange(make_date(r.first_yr, 1, 1),
                 case when nx.first_yr is not null then make_date(nx.first_yr, 1, 1)
                      when r.last_yr >= (select y from last_season) then null
                      else make_date(r.last_yr + 1, 1, 1) end),
       trim(regexp_replace(r.team_name, '\s*(Alouettes|Concordes|Rough Riders|Renegades|Redblacks|Argonauts|Tiger-Cats|Blue Bombers|Eskimos|Football Team|Elks|Roughriders|Stampeders|Lions|Stallions|Gold Miners|Texans|Posse|Pirates|Mad Dogs|Barracudas|CFLers|CFL Colts|Colts|Football Club)$', '')),
       trim(substr(r.team_name, length(trim(regexp_replace(r.team_name, '\s*(Alouettes|Concordes|Rough Riders|Renegades|Redblacks|Argonauts|Tiger-Cats|Blue Bombers|Eskimos|Football Team|Elks|Roughriders|Stampeders|Lions|Stallions|Gold Miners|Texans|Posse|Pirates|Mad Dogs|Barracudas|CFLers|CFL Colts|Colts|Football Club)$', ''))) + 1)),
       r.team_name, null,
       case when r.team_name ~ '^(Baltimore|Sacramento|San Antonio|Las Vegas|Shreveport|Memphis|Birmingham)' then 'US' else 'CA' end,
       (select source_id from src)
from runs r
left join lateral (select min(r2.first_yr) first_yr from runs r2 where r2.franchise_id = r.franchise_id and r2.first_yr > r.first_yr) nx on true
where not r.covered;

-- Years each club played in the CFL: SPX's own range is widened to take them in.
create temp table fl as
select i.franchise_id, min(lower(i.valid_during)) lo,
       case when bool_or(upper_inf(i.valid_during)) then null else max(upper(i.valid_during)) end hi
from core.franchise_identity i
where i.franchise_id in (select franchise_id from nm) and i.source_id = (select source_id from src)
group by 1;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, 'cfl', daterange(lo, hi), (select source_id from src) from fl
where not exists (select 1 from core.franchise_league x where x.franchise_id = fl.franchise_id and x.league_code = 'cfl');
update core.franchise_league x set valid_during = daterange(least(lower(x.valid_during), f.lo),
         case when upper_inf(x.valid_during) or f.hi is null then null else greatest(upper(x.valid_during), f.hi) end)
from fl f where x.franchise_id = f.franchise_id and x.league_code = 'cfl' and x.source_id <> (select source_id from src);

update core.franchise f set founded_on = coalesce(f.founded_on, d.first_game),
       folded_on = case when f.source_id = (select source_id from src) and d.last_yr < (select y from last_season) then d.last_game else f.folded_on end
from (select fid, min(game_date) first_game, max(game_date) last_game, max(yr) last_yr
      from (select home_f fid, game_date, season yr from wg union all select away_f, game_date, season from wg) z where fid is not null group by fid) d
where f.franchise_id = d.fid and (f.source_id = (select source_id from src) or f.founded_on is null);
update core.franchise set notes = coalesce(notes, 'Montreal Alouettes 1946-81, Concordes 1982-85, Alouettes 1986-87: the club that folded in 1987; the Alouettes of 1996 on are another franchise')
where source_id = (select source_id from src) and source_key = 'cfl:MTL1';

update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 9, 15) limit 1)
where ts.franchise_identity_id is null and ts.season_id in (select season_id from core.season where league_code = 'cfl')
  and ts.franchise_id in (select franchise_id from nm);

-- SPX's CFL games, to be matched one to one with Wikipedia's: the same date and sides first, then a day either side,
-- then the sides reversed (a page that put the home club on the road).
create temp table spx_g as
select g.game_id, g.game_date, g.status, g.phase, g.home_score, g.away_score, h.franchise_id home_f, a.franchise_id away_f, s.start_year
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
where s.league_code = 'cfl' and g.source_id <> (select source_id from src) and g.status <> 'cancelled' and g.phase in ('regular', 'playoffs');
create temp table ng as select * from wg where home_f is not null and away_f is not null and home_f <> away_f and game_date is not null;
create temp table matched (key bigint primary key, game_id bigint unique not null, swapped boolean not null default false);
insert into matched
select distinct on (game_id) key, game_id, false from (
  select distinct on (n.wid) n.wid key, s.game_id, s.status from ng n join spx_g s on s.start_year = n.season and s.game_date = n.game_date and s.home_f = n.home_f and s.away_f = n.away_f
  order by n.wid, (s.status = 'final') desc, s.game_id) a order by game_id, key;
insert into matched
select distinct on (game_id) key, game_id, false from (
  select distinct on (n.wid) n.wid key, s.game_id, abs(s.game_date - n.game_date) dd
  from ng n join spx_g s on s.start_year = n.season and abs(s.game_date - n.game_date) <= 1 and s.home_f = n.home_f and s.away_f = n.away_f
  where n.wid not in (select key from matched) and s.game_id not in (select game_id from matched)
  order by n.wid, abs(s.game_date - n.game_date), s.game_id) a order by game_id, dd, key;
insert into matched
select distinct on (game_id) key, game_id, true from (
  select distinct on (n.wid) n.wid key, s.game_id, abs(s.game_date - n.game_date) dd
  from ng n join spx_g s on s.start_year = n.season and abs(s.game_date - n.game_date) <= 1 and s.home_f = n.away_f and s.away_f = n.home_f
  where n.wid not in (select key from matched) and s.game_id not in (select game_id from matched)
  order by n.wid, abs(s.game_date - n.game_date), s.game_id) a order by game_id, dd, key;

create temp table mm as
select m.key, m.swapped, n.game_date r_date, n.phase::text r_phase,
       case when m.swapped then n.away_pts else n.home_pts end r_h, case when m.swapped then n.home_pts else n.away_pts end r_a,
       n.overtime r_ot, s.game_id, s.status, s.phase::text s_phase, s.home_score, s.away_score
from matched m join ng n on n.wid = m.key join spx_g s on s.game_id = m.game_id;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', g.source_key, 'CFL: Wikipedia has the home club on the road', 'Kept SPX''s sides'
from mm m join core.game g using (game_id) where m.swapped;

-- SPX filed some games under the wrong phase: Wikipedia knows which.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', g.source_key, format('CFL: SPX has the game as %s, Wikipedia as %s', m.s_phase, m.r_phase), 'Phase taken from Wikipedia'
from mm m join core.game g using (game_id) where m.s_phase <> m.r_phase;
update core.game g set phase = m.r_phase::core.season_phase, updated_at = now()
from mm m where g.game_id = m.game_id and m.s_phase <> m.r_phase;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id), 'CFL: no result in SPX',
       format('Filled from Wikipedia: %s-%s', m.r_h, m.r_a)
from mm m where m.status <> 'final';
update core.game g set status = 'final', home_score = m.r_h, away_score = m.r_a,
       original_date = case when abs(g.game_date - m.r_date) > 1 then g.game_date else g.original_date end,
       game_date = case when abs(g.game_date - m.r_date) > 1 then m.r_date else g.game_date end,
       went_to_overtime = coalesce(m.r_ot, g.went_to_overtime), updated_at = now()
from mm m where g.game_id = m.game_id and m.status <> 'final';
insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'game', m.game_id, 'score', case when m.home_score = m.r_h and m.away_score = m.r_a then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from src), m.r_h || '-' || m.r_a
from mm m where m.status = 'final';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id),
       format('CFL: SPX has %s-%s, Wikipedia %s-%s', m.home_score, m.away_score, m.r_h, m.r_a), 'Kept SPX''s; needs a third source'
from mm m where m.status = 'final' and (m.home_score <> m.r_h or m.away_score <> m.r_a);

-- Where two pages of Wikipedia's own disagree about a game it adds.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', 'wpcfl:' || n.season || ':' || n.phase || ':' || n.game_date || ':' || n.home_team || ':' || n.away_team || ':' || n.game_seq,
       case when n.conflict like 'date marked uncertain%' then 'CFL: ' || n.conflict else 'CFL: the two clubs'' pages disagree: ' || n.conflict end,
       case when n.conflict like 'date marked uncertain%' then 'Date kept as the article gives it' else 'Home club''s page taken' end
from ng n where n.conflict is not null and n.wid not in (select key from matched) and n.conflict not like 'home team%';

-- An SPX result in a season Wikipedia covers, with no game there to match it.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', g.source_key, 'CFL: SPX game not found at Wikipedia (date or teams differ)', 'Kept SPX''s; check the date and the teams'
from spx_g s join core.game g using (game_id)
where s.game_id not in (select game_id from matched) and s.status = 'final' and s.start_year in (select distinct season from wg);

-- A game only one club's page lists is added only when that club's whole schedule table adds up to the published
-- standings (schedule_checked: as many games, the same wins, losses and ties); else nothing corroborates its date or score.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', 'wpcfl:' || n.season || ':' || n.phase || ':' || n.game_date || ':' || n.home_team || ':' || n.away_team || ':' || n.game_seq,
       'CFL: only one club''s Wikipedia page lists this game (' || n.src || ')', 'Not added; needs a second source'
from ng n where n.wid not in (select key from matched) and n.views < 2 and not n.schedule_checked and n.phase = 'regular' and n.home_pts is not null;

insert into core.game (game_id, season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, source_id, source_key)
overriding system value
select coalesce(o.game_id, o2.game_id, nextval(pg_get_serial_sequence('core.game', 'game_id'))), s.season_id, n.phase::core.season_phase, n.game_date, hts.team_season_id, ats.team_season_id, n.neutral_site, 'final',
       n.home_pts, n.away_pts, case when n.phase = 'regular' then n.overtime end, (select source_id from src),
       'wpcfl:' || n.season || ':' || n.phase || ':' || n.game_date || ':' || n.home_team || ':' || n.away_team || ':' || n.game_seq
from ng n join core.season s on s.league_code = 'cfl' and s.start_year = n.season
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id
left join old_wp_game o on o.source_key = 'wpcfl:' || n.season || ':' || n.phase || ':' || n.game_date || ':' || n.home_team || ':' || n.away_team || ':' || n.game_seq
left join old_wp_game_day o2 on o.game_id is null and n.game_seq = 0 and o2.game_date = n.game_date and o2.hf = n.home_f and o2.af = n.away_f
  and not exists (select 1 from old_wp_game ok where ok.game_id = o2.game_id and exists (select 1 from ng n3
        where 'wpcfl:' || n3.season || ':' || n3.phase || ':' || n3.game_date || ':' || n3.home_team || ':' || n3.away_team || ':' || n3.game_seq = ok.source_key))
where n.wid not in (select key from matched) and (n.views >= 2 or n.schedule_checked or n.phase = 'playoffs') and n.home_pts is not null and n.away_pts is not null;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', g.game_id, g.source_id, substr(g.source_key, 1) from core.game g
where g.source_id = (select source_id from src) and g.source_key like 'wpcfl:%'
union
select 'game', m.game_id, (select source_id from src), 'wpcfl:' || n.season || ':' || n.phase || ':' || n.game_date || ':' || n.home_team || ':' || n.away_team || ':' || n.game_seq
from matched m join ng n on n.wid = m.key
on conflict do nothing;

-- Final standings (the article's table is the season's last).
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, ot_losses, points, points_for, points_against, division_rank, source_key)
select ts.team_season_id, 'regular', coalesce(s.regular_ends_on, make_date(w.season, 11, 1)), (select source_id from src),
       coalesce(w.gp, w.w + w.l + coalesce(w.t, 0)), w.w, w.l, w.t, w.otl, coalesce(w.pts, 2 * w.w + coalesce(w.t, 0)), w.pf, w.pa, w.rank,
       'wpcfl:' || w.season || ':' || w.division || ':' || w.team
from wst w join core.season s on s.league_code = 'cfl' and s.start_year = w.season
join core.team_season ts on ts.franchise_id = w.franchise_id and ts.season_id = s.season_id
where w.franchise_id is not null
on conflict do nothing;

select 'matched' k, count(*) from mm
union all select 'filled', count(*) from mm where status <> 'final'
union all select 'confirmed', count(*) from mm where status = 'final' and home_score = r_h and away_score = r_a
union all select 'disputed', count(*) from mm where status = 'final' and (home_score <> r_h or away_score <> r_a)
union all select 'added', count(*) from core.game where source_id = (select source_id from src) and source_key like 'wpcfl:%'
union all select 'standings', count(*) from core.standing where source_id = (select source_id from src) and source_key like 'wpcfl:%'
union all select 'unmatched club', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'CFL: club not matched%';
commit;
