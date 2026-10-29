-- NCAA Division I-A / FBS college football (2000 on) from English Wikipedia (CC BY-SA 4.0): every game the teams' season articles log
-- (regular season, conference championship games and bowl games), each season's published standings, the conferences and divisions, the
-- national champion, and every program's names by season, parsed by scripts/ncaaf/ into legacy_wikipedia_ncaaf (migration 159), season by season.
-- College football is a league of its own ('ncaaf'): its records are never added to the NFL's. A season is the year it starts in (2005 = the
-- 2005 season, which ended with the Rose Bowl in January 2006), as core.season.start_year.
--   * A franchise is a program (Texas Longhorns football). A program that changed its name keeps its franchise: db/seed/ncaaf_program.csv.
--     Every other name is its own franchise, keyed by the name in lower case ('ncaaf:<key>').
--   * The teams of the division (Division I-A until 2006, then the FBS) are those in a conference standings template. A team outside it
--     (FCS and lower) that a team of the division played is a franchise too, with a team season in the seasons it played: its games count in
--     the division teams' records, as the NCAA counts them. It has no conference but the pseudo conference 'Non-FBS opponents' and
--     it is a member of the league (core.franchise_league) only in the seasons it was in the division, so a page that lists the league's
--     teams by membership shows the division alone.
--   * The overall record the standings template gives counts the bowl games and the conference championship game; a standing is kept only
--     where it equals the sum of the games (regular season and bowls), the NFL's rule.
--   * A conference championship game is a regular-season game; a bowl game, a College Football Playoff game and the BCS National Championship
--     Game are phase 'playoffs'. A neutral-site game lists its two teams in name order (away first): Wikipedia does not say which is "home".
--   * The national champion is the winner of the national championship game (the BCS title game 1998-2013, the Playoff's from 2014); a title
--     the NCAA vacated (USC, 2004) is kept with that said in the note. No poll champion ("mythical") is recorded.
-- Why Wikipedia: the NCAA's, ESPN's and Sports Reference's sites are excluded by their terms. CollegeFootballData is a cross-check only: no
-- value from it is copied here. Recap links in the articles are not followed.
-- Run from the repo root (it reads db/seed/ncaaf_program.csv and ncaaf_conference.csv). Runs after 229. Safe to rerun as seasons arrive
-- (load them first with scripts/ncaaf/season.py): every game, identity and team season keeps its id.
begin;

insert into ref.sport (sport_code, name) values ('american_football', 'American football') on conflict (sport_code) do nothing;
insert into ref.country (country_code, name) values ('US', 'United States') on conflict (country_code) do nothing;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'College football season, standings-template and team-season articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '2000-08-26', current_date,
        'College football (NCAA Division I-A / FBS) results from the "<year> NCAA Division I-A (FBS) football season" conference standings templates and each "<year> <team> football team" article''s schedule table (regular season, conference championship games and bowl games), raw wikitext fetched 2026-10-29. The NCAA''s, ESPN''s and Sports Reference''s sites were not used.')
on conflict (code) do update set
  retrieved_on = current_date,
  covers_from = least(meta.source.covers_from, excluded.covers_from),
  attribution = case when meta.source.attribution like '%College football season, standings-template%' then meta.source.attribution else meta.source.attribution || ' ' || excluded.attribution end,
  notes = case when meta.source.notes like '%College football (NCAA Division I-A / FBS) results%' then meta.source.notes else coalesce(meta.source.notes || ' ', '') || excluded.notes end;
create temp table src as select source_id from meta.source where code = 'wikipedia';

insert into ref.league (league_code, sport_code, country_code, founded_on, notes)
values ('ncaaf', 'american_football', 'US', date '1869-11-06',
        'NCAA Division I football: the Football Bowl Subdivision (FBS), called Division I-A until 2006; a league of its own, not NFL seasons')
on conflict (league_code) do nothing;
insert into ref.league_name (league_code, valid_during, name, short_name)
values ('ncaaf', daterange(null, date '2006-03-01'), 'NCAA Division I-A', 'I-A'),
       ('ncaaf', daterange(date '2006-03-01', null), 'NCAA Division I FBS', 'FBS')
on conflict do nothing;
insert into core.award (league_code, code, name, kind, description, first_season, source_id)
values ('ncaaf', 'ncaaf_championship', 'National Championship', 'championship',
        'The national champion of Division I-A / FBS football: the winner of the national championship game (the Bowl Championship Series title game to 2013, the College Football Playoff''s from 2014). No poll champion is recorded.',
        2000, (select source_id from src))
on conflict (code) do nothing;

-- Take back what an earlier run wrote (a game is not deleted wholesale: it keeps its id, see below).
delete from core.standing where source_id = (select source_id from src) and source_key like 'wpncaaf:%';
delete from meta.data_issue where source_id = (select source_id from src) and issue ~ '^NCAAF:';
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and external_key like 'wpncaaf:%';

-- Wikipedia's rows.
create temp table wss as select * from legacy_wikipedia_ncaaf.season;
create temp table wgm as select * from legacy_wikipedia_ncaaf.game;
create temp table wsd as select * from legacy_wikipedia_ncaaf.standing;
create temp table wts as select * from legacy_wikipedia_ncaaf.team_season;
create temp table seasons as select season as yr from wss;
create temp table last_season as select max(yr) y from seasons;

-- Program names -> franchise. A name is its own program (the lower-case name, accents and punctuation dropped) unless the seed says it is another
-- name of one: club, first and last season of that name, the program key (db/seed/ncaaf_program.csv).
create temp table seed_prog (club text, first_year int, last_year int, program text, note text);
\copy seed_prog from 'db/seed/ncaaf_program.csv' with (format csv, header true)
create temp table seed_conf (raw text, name text, short_name text);
\copy seed_conf from 'db/seed/ncaaf_conference.csv' with (format csv, header true)
do $$
declare bad text;
begin
  select string_agg(distinct a.club || ' ' || a.first_year, ', ') into bad from seed_prog a join seed_prog b on lower(a.club) = lower(b.club) and a.ctid < b.ctid
    and a.first_year <= b.last_year and b.first_year <= a.last_year;
  if bad is not null then raise exception 'program name fits two rows in one year: %', bad; end if;
end $$;
create temp table names as
select season as yr, team_name as nm from wts
union select season, home_team from wgm union select season, away_team from wgm;
create temp table am as
select n.yr, n.nm,
       coalesce(s.program, trim(both '-' from regexp_replace(translate(lower(n.nm), 'áàâäãåéèêëíìîïóòôöõúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'))) as program,
       null::integer as franchise_id
from names n
left join seed_prog s on lower(s.club) = lower(n.nm) and n.yr between s.first_year and s.last_year;
insert into core.franchise (sport_code, source_id, source_key)
select 'american_football', (select source_id from src), 'ncaaf:' || p
from (select distinct program p from am) x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'ncaaf:' || x.p);
update am set franchise_id = f.franchise_id
from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'ncaaf:' || am.program;

create temp table ng as
select row_number() over (order by g.season, g.game_date, g.phase, g.home_team, g.away_team, g.game_seq) as gid,
       g.season as yr, g.phase::core.season_phase as phase, g.game_date, g.round_name,
       g.home_pts, g.away_pts, g.overtime, g.neutral_site, g.attendance, g.views, g.conflict,
       g.home_team, g.away_team, h.franchise_id home_f, a.franchise_id away_f,
       'wpncaaf:' || g.season || ':' || g.phase || ':' || g.game_date || ':' || g.home_team || ':' || g.away_team || ':' || g.game_seq as key
from wgm g
join am h on h.yr = g.season and h.nm = g.home_team
join am a on a.yr = g.season and a.nm = g.away_team;
delete from ng where home_f = away_f;

-- A game whose key changed (a team spelled another way, a corrected date) keeps its id. A stored game that no new key matches is paired with a new
-- key of the same season, phase and two teams (either side home): first the one on the same date, then, when both sides hold the same number of such
-- games, in date order within 14 days. Anything left over is a game the articles no longer log (deleted below) or a new one (inserted below).
create temp table old_g as
select g.game_id, g.game_date, s.start_year yr, g.phase, hts.franchise_id hf, ats.franchise_id af
from core.game g join core.season s using (season_id)
join core.team_season hts on hts.team_season_id = g.home_team_season_id
join core.team_season ats on ats.team_season_id = g.away_team_season_id
where g.source_id = (select source_id from src) and s.league_code = 'ncaaf' and g.source_key like 'wpncaaf:%'
  and not exists (select 1 from ng n where n.key = g.source_key);
create temp table new_g as
select n.key, n.game_date, n.yr, n.phase, n.home_f hf, n.away_f af from ng n
where not exists (select 1 from core.game g where g.source_id = (select source_id from src) and g.source_key = n.key);
create temp table rekey as
select o.game_id, n.key
from (select o.*, count(*) over (partition by yr, phase, least(hf, af), greatest(hf, af), game_date) c from old_g o) o
join (select n.*, count(*) over (partition by yr, phase, least(hf, af), greatest(hf, af), game_date) c from new_g n) n
  on (n.yr, n.phase, least(n.hf, n.af), greatest(n.hf, n.af), n.game_date) = (o.yr, o.phase, least(o.hf, o.af), greatest(o.hf, o.af), o.game_date)
where o.c = 1 and n.c = 1;
insert into rekey
select o.game_id, n.key
from (select o.*, row_number() over w rn, count(*) over p c from old_g o where game_id not in (select game_id from rekey)
      window p as (partition by yr, phase, least(hf, af), greatest(hf, af)), w as (p order by game_date, game_id)) o
join (select n.*, row_number() over w rn, count(*) over p c from new_g n where key not in (select key from rekey)
      window p as (partition by yr, phase, least(hf, af), greatest(hf, af)), w as (p order by game_date, key)) n
  on (n.yr, n.phase, least(n.hf, n.af), greatest(n.hf, n.af), n.rn, n.c) = (o.yr, o.phase, least(o.hf, o.af), greatest(o.hf, o.af), o.rn, o.c)
 and abs(n.game_date - o.game_date) <= 14;
update core.game g set source_key = r.key from rekey r where g.game_id = r.game_id;

delete from core.game g using core.season s
where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code = 'ncaaf'
  and g.source_key like 'wpncaaf:%' and not exists (select 1 from ng n where n.key = g.source_key);

create temp table nst as
select s.*, s.season as yr, m.franchise_id from wsd s
join am m on m.yr = s.season and m.nm = s.team_name;

create temp table nts as
select t.season yr, t.team_name, t.school, t.classification, t.conference, t.division, t.log_games, m.franchise_id from wts t
join am m on m.yr = t.season and m.nm = t.team_name;

-- Seasons.
insert into core.season (league_code, start_year, end_year, label, source_id)
select 'ncaaf', yr, yr + 1, yr::text, (select source_id from src)
from (select yr from ng union select yr from nst union select yr from nts) x on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = d.rs, regular_ends_on = d.re, playoffs_end_on = d.pe
from (select yr, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
             max(game_date) filter (where phase = 'playoffs') pe from ng group by yr) d
where s.league_code = 'ncaaf' and s.start_year = d.yr
  and (s.regular_starts_on, s.regular_ends_on, s.playoffs_end_on) is distinct from (d.rs, d.re, d.pe);
-- Games per team: the commonest number of regular-season games among the division's teams.
update core.season s set games_per_team = x.gp
from (select yr, (select mode() within group (order by n) from
                    (select count(*) n from (select home_f f from ng z where z.yr = y.yr and z.phase = 'regular' union all select away_f from ng z where z.yr = y.yr and z.phase = 'regular') q
                     where q.f in (select franchise_id from nts where nts.yr = y.yr and classification = 'fbs') group by f) c) gp
      from (select distinct yr from ng) y) x
where s.league_code = 'ncaaf' and s.start_year = x.yr and x.gp > 0 and s.games_per_team is distinct from x.gp;

-- Names by season: the article titles' (the program's name that year). Consecutive seasons under one name are one identity.
create temp table nm as
select distinct on (yr, franchise_id) yr, franchise_id, team_name as full_name, school
from nts order by yr, franchise_id, (classification = 'fbs') desc, team_name;
create temp table ncaafr as
select franchise_id from core.franchise_league where league_code = 'ncaaf'
union select franchise_id from core.franchise where source_id = (select source_id from src) and source_key like 'ncaaf:%';

-- An identity keeps its franchise_identity_id on a rerun: the id of each one deleted below goes to ingest.row_id_map (a key already there keeps its first id)
-- and ingest.identity_id_for (migration 146) gives it back to the identity with the same franchise and first day.
insert into ingest.row_id_map (tbl, natural_key, row_id)
select 'core.franchise_identity', i.franchise_id || '/' || coalesce(lower(i.valid_during)::text, ''), i.franchise_identity_id
from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from ncaafr)
on conflict (tbl, natural_key) do nothing;
update core.team_season ts set franchise_identity_id = null
where franchise_identity_id in (select franchise_identity_id from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from ncaafr));
delete from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from ncaafr);
delete from core.franchise_league l where l.source_id = (select source_id from src) and l.league_code = 'ncaaf';

-- One identity for each run of seasons under one name. A program that is missing from some seasons (a team outside the division is only here in the
-- seasons it played a team of it) keeps its name through the gap: the identity lasts until the program's next name begins.
create temp table isl as
select franchise_id, full_name, max(school) school, min(yr) first_yr, max(yr) last_yr
from (select y.*, sum(chg) over (partition by franchise_id order by yr) as island
      from (select nm.*, case when full_name is distinct from lag(full_name) over (partition by franchise_id order by yr) then 1 else 0 end chg from nm) y) x
group by franchise_id, full_name, island;
create temp table isl2 as
select i.*,
       case when lead(i.first_yr) over w is not null then make_date(lead(i.first_yr) over w, 3, 1)
            when i.last_yr >= (select y from last_season) and (select y from last_season) = (select max(start_year) from core.season where league_code = 'ncaaf') then null
            else make_date(i.last_yr + 1, 3, 1) end as end_on,
       case when position(' ' in i.full_name) = 0 then i.full_name
            when i.school is not null and lower(i.full_name) like lower(i.school) || ' %' then i.school
            else btrim(left(i.full_name, length(i.full_name) - length(split_part(i.full_name, ' ', array_length(string_to_array(i.full_name, ' '), 1))))) end as location
from isl i
window w as (partition by i.franchise_id order by i.first_yr);
-- seasons start on 1 March, as in the other leagues' steps
insert into core.franchise_identity (franchise_identity_id, franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
overriding system value
select ingest.identity_id_for(p.franchise_id, lower(p.rng)), p.franchise_id, p.rng, p.location,
       case when position(' ' in p.full_name) = 0 then p.full_name else btrim(substr(p.full_name, length(p.location) + 1)) end, p.full_name, 'US', (select source_id from src)
from (select i.franchise_id, i.full_name, i.location, u.rng
      from isl2 i
      cross join lateral unnest(datemultirange(daterange(make_date(i.first_yr, 3, 1), i.end_on)) -
            coalesce((select range_agg(x.valid_during) from core.franchise_identity x where x.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng) and btrim(substr(p.full_name, length(p.location) + 1)) <> '' or position(' ' in p.full_name) = 0 and not isempty(p.rng);

insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select yr, home_f f from ng union select yr, away_f from ng union select yr, franchise_id from nst union select yr, franchise_id from nts) x
join core.season s on s.league_code = 'ncaaf' and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 10, 1) limit 1)
where ts.franchise_identity_id is null and ts.season_id in (select season_id from core.season where league_code = 'ncaaf');

-- League membership: the seasons a program was in the division, one span for each run of seasons (a program that dropped to the FCS and came back has two).
create temp table clspan as
select franchise_id, daterange(make_date(min(yr), 3, 1),
       case when max(yr) >= (select max(start_year) from core.season where league_code = 'ncaaf') then null else make_date(max(yr) + 1, 3, 1) end) as rng
from (select yr, franchise_id, yr - row_number() over (partition by franchise_id order by yr) as island from nts where classification = 'fbs') x
group by franchise_id, island;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, 'ncaaf', p.rng, (select source_id from src)
from (select a.franchise_id, u.rng
      from clspan a
      cross join lateral unnest(datemultirange(a.rng) -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = a.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);

-- Conferences and divisions. The seed gives a conference's name and short name; a name it lacks is kept as the template gives it.
create temp table tsc as
select t.yr, t.franchise_id,
       case when t.classification = 'fbs' then coalesce(c.name, t.conference) else 'Non-FBS opponents' end as cname,
       case when t.classification = 'fbs' then coalesce(c.short_name, c.name, t.conference) else 'Non-FBS' end as cshort,
       case when t.classification = 'fbs' then nullif(btrim(t.division), '') end as dname
from nts t left join seed_conf c on c.raw = t.conference;
insert into core.conference (league_code, name, short_name, first_season)
select 'ncaaf', x.cname, x.cshort, x.y0
from (select cname, min(cshort) cshort, min(yr) y0 from tsc group by cname) x
where not exists (select 1 from core.conference c where c.league_code = 'ncaaf' and c.name = x.cname);
update core.conference c set first_season = x.y0, last_season = x.y1, short_name = x.cshort
from (select cname, min(cshort) cshort, min(yr) y0,
             case when max(yr) >= (select max(start_year) from core.season where league_code = 'ncaaf') then null else max(yr) end y1
      from tsc group by cname) x
where c.league_code = 'ncaaf' and c.name = x.cname and (c.first_season, c.last_season, c.short_name) is distinct from (x.y0, x.y1, x.cshort);
insert into core.division (league_code, conference_id, name, short_name, first_season)
select 'ncaaf', c.conference_id, x.dname, regexp_replace(x.dname, ' Division$', ''), x.y0
from (select cname, dname, min(yr) y0 from tsc where dname is not null group by cname, dname) x
join core.conference c on c.league_code = 'ncaaf' and c.name = x.cname
where not exists (select 1 from core.division d where d.league_code = 'ncaaf' and d.conference_id = c.conference_id and d.name = x.dname);
update core.division d set first_season = x.y0, last_season = x.y1
from (select c.conference_id, dname, min(yr) y0, case when max(yr) >= (select max(start_year) from core.season where league_code = 'ncaaf') then null else max(yr) end y1
      from tsc join core.conference c on c.league_code = 'ncaaf' and c.name = tsc.cname where dname is not null group by c.conference_id, dname) x
where d.league_code = 'ncaaf' and d.conference_id = x.conference_id and d.name = x.dname and (d.first_season, d.last_season) is distinct from (x.y0, x.y1);
update core.team_season ts set conference_id = x.conference_id, division_id = x.division_id
from (select s.season_id, t.franchise_id, c.conference_id, d.division_id
      from tsc t join core.season s on s.league_code = 'ncaaf' and s.start_year = t.yr
      join core.conference c on c.league_code = 'ncaaf' and c.name = t.cname
      left join core.division d on d.league_code = 'ncaaf' and d.conference_id = c.conference_id and d.name = t.dname) x
where ts.season_id = x.season_id and ts.franchise_id = x.franchise_id and (ts.conference_id, ts.division_id) is distinct from (x.conference_id, x.division_id);
delete from core.division d where d.league_code = 'ncaaf' and not exists (select 1 from core.team_season t where t.division_id = d.division_id);
delete from core.conference c where c.league_code = 'ncaaf' and not exists (select 1 from core.team_season t where t.conference_id = c.conference_id)
  and not exists (select 1 from core.division d where d.conference_id = c.conference_id);

-- Games.
create temp table game_new as
select s.season_id, n.phase, n.game_date, hts.team_season_id home_ts, ats.team_season_id away_ts, n.neutral_site, n.home_pts, n.away_pts, n.overtime,
       n.round_name, n.attendance, n.key, case when n.conflict is not null then 'Wikipedia logs: ' || n.conflict end as notes
from ng n join core.season s on s.league_code = 'ncaaf' and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id;
update core.game g set season_id = x.season_id, phase = x.phase, game_date = x.game_date, home_team_season_id = x.home_ts, away_team_season_id = x.away_ts,
       is_neutral_site = x.neutral_site, home_score = x.home_pts, away_score = x.away_pts, went_to_overtime = x.overtime,
       round_label = x.round_name, attendance = x.attendance, notes = x.notes, updated_at = now()
from game_new x
where g.source_id = (select source_id from src) and g.source_key = x.key
  and (g.season_id, g.phase, g.game_date, g.home_team_season_id, g.away_team_season_id, g.is_neutral_site, g.home_score, g.away_score, g.went_to_overtime, g.round_label, g.attendance, g.notes)
      is distinct from (x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, x.neutral_site, x.home_pts, x.away_pts, x.overtime, x.round_name, x.attendance, x.notes);
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, round_label, attendance, source_id, source_key, notes)
select x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, x.neutral_site, 'final', x.home_pts, x.away_pts, x.overtime, x.round_name, x.attendance,
       (select source_id from src), x.key, x.notes
from game_new x
where not exists (select 1 from core.game g where g.source_id = (select source_id from src) and g.source_key = x.key);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', n.key, 'NCAAF: Wikipedia''s two logs disagree: ' || split_part(n.conflict, ' | kept: ', 1),
       coalesce(nullif('Kept ' || split_part(n.conflict, ' | kept: ', 2), 'Kept '), 'Kept the home team''s log')
from ng n where n.conflict is not null;
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, source_key from core.game
where source_id = (select source_id from src) and source_key like 'wpncaaf:%';

-- Final standings as the conference standings templates publish them, kept only where they agree with the games (wins, losses and ties of
-- the regular season and the bowl games together, the NCAA's overall record); a line that does not is logged and the site shows the games' sum.
create temp table gsum as
select yr, fid, count(*) filter (where pf > pa) w, count(*) filter (where pf < pa) l, count(*) filter (where pf = pa) t
from (select yr, home_f fid, home_pts pf, away_pts pa from ng
      union all select yr, away_f, away_pts, home_pts from ng) z group by yr, fid;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', n.season || ':' || n.team_name,
       format('NCAAF: Wikipedia''s standings give %s-%s-%s overall; its games add up to %s', n.w, n.l, coalesce(n.t, 0),
              coalesce(g.w || '-' || g.l || '-' || g.t, 'no games')),
       'Standing left out; the site shows the games'' sum'
from nst n left join gsum g on g.yr = n.yr and g.fid = n.franchise_id
where g.fid is null or (g.w, g.l, g.t) is distinct from (n.w, n.l, coalesce(n.t, 0));
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, win_pct,
                           division_rank, conference_rank, conference_record, division_record, extra, is_final, source_key)
select ts.team_season_id, 'regular', coalesce(s.playoffs_end_on, s.regular_ends_on, make_date(n.season + 1, 1, 1)), (select source_id from src),
       n.w + n.l + coalesce(n.t, 0), n.w, n.l, coalesce(n.t, 0),
       round((n.w + 0.5 * coalesce(n.t, 0))::numeric / nullif(n.w + n.l + coalesce(n.t, 0), 0), 4),
       case when n.division is not null then n.rank_in_template end,
       case when n.division is null then n.rank_in_template end,
       case when n.conf_w is not null and n.conf_l is not null then n.conf_w || '-' || n.conf_l || coalesce('-' || n.conf_t, '') end,
       null,
       jsonb_strip_nulls(jsonb_build_object('includes_postseason', true, 'conference_champion', nullif(n.conf_champ, false), 'division_champion', nullif(n.div_champ, false),
                                            'co_champion', nullif(n.co_champ, false))),
       true, 'wpncaaf:' || n.season || ':' || n.team_name
from nst n
join core.season s on s.league_code = 'ncaaf' and s.start_year = n.season
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
join gsum g on g.yr = n.yr and g.fid = n.franchise_id and (g.w, g.l, g.t) = (n.w, n.l, coalesce(n.t, 0))
on conflict do nothing;

-- The national champion: the winner of the national championship game, found by the parser (legacy season.champion). The team season is the
-- program's that year; a title the season's infobox says was vacated is kept and says so.
insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select a.award_id, s.season_id, t.team_season_id, coalesce(i.full_name, w.champion),
       case when w.infobox_champions ~* 'vacat' then 'Won the national championship game; the title was later vacated (' || w.champion_basis || ')'
            else 'Won the national championship game (' || w.champion_basis || ')' end,
       (select source_id from src), 'wpncaaf:champ:' || w.season
from wss w
join core.season s on s.league_code = 'ncaaf' and s.start_year = w.season
join core.award a on a.code = 'ncaaf_championship'
join am on am.yr = w.season and am.nm = w.champion
join core.team_season t on t.season_id = s.season_id and t.franchise_id = am.franchise_id
left join core.franchise_identity i on i.franchise_identity_id = t.franchise_identity_id
where w.champion is not null
on conflict (award_id, season_id, winner_name, source_id) do update
set note = excluded.note, team_season_id = excluded.team_season_id, source_key = excluded.source_key;
delete from core.award_winner x where x.source_id = (select source_id from src) and x.source_key like 'wpncaaf:champ:%'
  and not exists (select 1 from wss w join am on am.yr = w.season and am.nm = w.champion
                  join core.season s on s.league_code = 'ncaaf' and s.start_year = w.season
                  join core.team_season t on t.season_id = s.season_id and t.franchise_id = am.franchise_id
                  left join core.franchise_identity i on i.franchise_identity_id = t.franchise_identity_id
                  where x.source_key = 'wpncaaf:champ:' || w.season and x.winner_name = coalesce(i.full_name, w.champion));
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'season', w.season::text, 'NCAAF: no national championship game found in the team articles', 'No champion recorded'
from wss w where w.champion is null;

-- A name the legacy rows give that no franchise answers cannot happen (every name is its own program unless the seed folds it); the counts say so.
select 'seasons' k, count(*)::bigint n from seasons
union all select 'games', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'ncaaf'
union all select 'regular', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'ncaaf' and g.phase = 'regular'
union all select 'playoffs', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'ncaaf' and g.phase = 'playoffs'
union all select 'standings', count(*) from core.standing where source_id = (select source_id from src) and source_key like 'wpncaaf:%'
union all select 'standings left out', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'NCAAF: Wikipedia''s standings%'
union all select 'log conflicts', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'NCAAF: Wikipedia''s two logs%'
union all select 'team seasons', count(*) from core.team_season t join core.season s using (season_id) where s.league_code = 'ncaaf'
union all select 'division team seasons', count(*) from core.team_season t join core.season s using (season_id) join core.conference c using (conference_id) where s.league_code = 'ncaaf' and c.name <> 'Non-FBS opponents'
union all select 'franchises', count(*) from core.franchise where source_id = (select source_id from src) and source_key like 'ncaaf:%'
union all select 'conferences', count(*) from core.conference where league_code = 'ncaaf'
union all select 'divisions', count(*) from core.division where league_code = 'ncaaf'
union all select 'champions', count(*) from core.award_winner where source_id = (select source_id from src) and source_key like 'wpncaaf:champ:%';
commit;
