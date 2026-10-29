-- League alignment: conferences, divisions and each team's place in them, season by season.
-- Safe to re-run: it upserts core.conference, core.division and team_season.conference_id / division_id
-- and the alignment rows it wrote to meta.verification / meta.data_issue. Unchanged rows of other
-- leagues keep their ids (a WNBA load must not rewrite NHL/NBA/MLB/NFL/CFL alignment or flood verification).
-- Run on its own (psql -v ON_ERROR_STOP=1 -f); it is not part of build_core.sh, which recreates team_seasons.
--
-- Level names: the "conference" level is the league in MLB (American / National League, and the 19th-century
-- leagues), the conference in the NFL (AFC / NFC), NBA and NHL (Eastern / Western, and the NHL's Prince of Wales /
-- Clarence Campbell), and the two divisions of the CFL (East / West: SPX filed them as both a conference and a
-- division, so only the conference is kept). The "division" level is the division, in every league that had them.
--
-- Where each value comes from, best first (a better source wins; the others are checked against it):
--   1 spx            SPX's own tables, seasons 1998-2010 (SPX values win)
--   2 nhl_api        the NHL API's end-of-season standings: conference and division names, 1926 onward
--   2 retrosheet     the league each club played its games in (MLB, every season)
--   3 wikipedia      the standings templates of the season articles (legacy_alignment.wikipedia_*)
--   verification only: nflverse div_game (two NFL teams that met in a division game are in one division),
--                      SPX's undated "current" division list (the season it was saved in, 2011)
-- A disagreement is kept in meta.data_issue and meta.verification (disputed), never silently dropped.
begin;

create temp table src as select source_id, code from meta.source where code in ('spx_database', 'nhl_api', 'retrosheet', 'nflverse', 'wikipedia');

-- ---------------------------------------------------------------------------------------------- names
-- A source's own wording -> the name and short name the almanac uses, by league and level.
create function pg_temp.canon(lg text, lvl text, raw text) returns text[] language sql immutable as $$
  select case
    when raw is null or btrim(raw) = '' then null
    when lg = 'cfl' and lvl = 'division' then null
    when lg = 'cfl' then case when lower(btrim(raw)) in ('east', 'east division', 'e') then array['East', 'East']
                              when lower(btrim(raw)) in ('west', 'west division', 'w') then array['West', 'West']
                              when lower(btrim(raw)) = 'north' then array['North', 'North']
                              when lower(btrim(raw)) = 'south' then array['South', 'South'] end
    when lg = 'mlb' and lvl = 'conference' then case lower(btrim(raw))
        when 'american' then array['American League', 'AL'] when 'american league' then array['American League', 'AL'] when 'al' then array['American League', 'AL']
        when 'national' then array['National League', 'NL'] when 'national league' then array['National League', 'NL'] when 'nl' then array['National League', 'NL']
        when 'aa' then array['American Association', 'AA'] when 'ua' then array['Union Association', 'UA']
        when 'pl' then array['Players'' League', 'PL'] when 'fl' then array['Federal League', 'FL'] when 'na' then array['National Association', 'NA'] end
    when lg = 'mlb' then (select array[case left(m[1], 2) when 'AL' then 'American League ' else 'National League ' end || m[2], left(m[1], 2) || ' ' || m[2]]
                          from (select regexp_match(btrim(raw), '^(AL|NL) (East|West|Central)') m) x where m is not null)
    when lg in ('afl', 'aafc', 'wha') and lvl = 'conference' then null
    -- the AHL's Northern and Southern Conferences of 1995-96, then the Eastern and Western Conferences (1997 on)
    when lg = 'ahl' and lvl = 'conference' then case regexp_replace(lower(btrim(raw)), ' conference$', '')
        when 'northern' then array['Northern Conference', 'North'] when 'southern' then array['Southern Conference', 'South']
        when 'eastern' then array['Eastern Conference', 'East'] when 'western' then array['Western Conference', 'West'] end
    when lg = 'wha' then case regexp_replace(lower(btrim(raw)), ' division$', '') when 'eastern' then array['Eastern Division', 'East'] when 'western' then array['Western Division', 'West']
                                                                      when 'canadian' then array['Canadian Division', 'Canadian'] end
    -- the BAA and the NBA before 1970 had Eastern and Western Divisions (and a Central Division in 1949-50), not conferences
    when lg = 'nba' and lvl = 'division' and lower(btrim(raw)) in ('east', 'west') then
        case lower(btrim(raw)) when 'east' then array['Eastern Division', 'East'] else array['Western Division', 'West'] end
    when lg in ('afl', 'aafc') then case lower(btrim(raw)) when 'eastern' then array['Eastern Division', 'East'] when 'east' then array['Eastern Division', 'East']
                                                 when 'western' then array['Western Division', 'West'] when 'west' then array['Western Division', 'West'] end
    when lg = 'nfl' and lvl = 'conference' then case lower(btrim(raw))
        when 'afc' then array['American Football Conference', 'AFC'] when 'american football conference' then array['American Football Conference', 'AFC']
        when 'nfc' then array['National Football Conference', 'NFC'] when 'national football conference' then array['National Football Conference', 'NFC']
        -- the NFL before 1970: the American and National Conferences of 1950-52, the Eastern and Western Conferences of 1953-69
        when 'american' then array['American Conference', 'American'] when 'national' then array['National Conference', 'National']
        when 'eastern' then array['Eastern Conference', 'East'] when 'western' then array['Western Conference', 'West'] end
    when lg = 'nfl' then coalesce(
        (select array[m[1] || ' ' || m[2], m[1] || ' ' || m[2]] from (select regexp_match(btrim(raw), '^(AFC|NFC) (East|West|North|South|Central)') m) x where m is not null),
        -- the divisions of 1933-49 (Eastern and Western) and of 1967-69 (Capitol and Century in the East, Central and Coastal in the West)
        case lower(btrim(raw)) when 'eastern' then array['Eastern Division', 'East'] when 'western' then array['Western Division', 'West']
             when 'capitol' then array['Capitol Division', 'Capitol'] when 'century' then array['Century Division', 'Century']
             when 'central' then array['Central Division', 'Central'] when 'coastal' then array['Coastal Division', 'Coastal'] end)
    when lvl = 'conference' then case regexp_replace(lower(btrim(raw)), ' conference$', '')
        when 'eastern' then array['Eastern Conference', 'East'] when 'east' then array['Eastern Conference', 'East']
        when 'western' then array['Western Conference', 'West'] when 'west' then array['Western Conference', 'West']
        when 'prince of wales' then array['Prince of Wales Conference', 'Wales']
        when 'clarence campbell' then array['Clarence Campbell Conference', 'Campbell'] end
    else (select array[x || ' Division', x] from (select initcap(regexp_replace(regexp_replace(lower(btrim(raw)), ' (division|standings)$', ''),
              '^(discover|honda|massmutual|scotia) ', '')) x) y)
  end
$$;
-- The conference a division name says it is in (MLB, NFL), when a source gives the division alone.
create function pg_temp.implied(lg text, dshort text) returns text[] language sql immutable as $$
  select case when lg = 'mlb' and dshort like 'AL %' then array['American League', 'AL']
              when lg = 'mlb' and dshort like 'NL %' then array['National League', 'NL']
              when lg = 'nfl' and dshort like 'AFC %' then array['American Football Conference', 'AFC']
              when lg = 'nfl' and dshort like 'NFC %' then array['National Football Conference', 'NFC']
              when lg = 'nfl' and dshort in ('Capitol', 'Century') then array['Eastern Conference', 'East']
              when lg = 'nfl' and dshort in ('Central', 'Coastal') then array['Western Conference', 'West'] end
$$;
create function pg_temp.flat(x text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(x), 'áàâäãåéèêëíìîïóòôöõúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]', '', 'g')
$$;

-- ---------------------------------------------------------------------------------------------- team seasons
create temp table ts as
select t.team_season_id, t.franchise_id, s.league_code lg, s.start_year::int y, i.abbreviation abbr,
       coalesce(i.full_name, n.full_name) full_name, coalesce(i.nickname, n.nickname) nickname
from core.team_season t join core.season s using (season_id)
left join core.franchise_identity i using (franchise_identity_id)
left join lateral (select x.full_name, x.nickname from core.franchise_identity x where x.franchise_id = t.franchise_id and i.franchise_identity_id is null
                   order by abs(extract(year from lower(x.valid_during)) - s.start_year) limit 1) n on true  -- a season with no identity of its own: the nearest era's name
where s.league_code in ('nhl', 'nba', 'mlb', 'nfl', 'cfl', 'afl', 'aafc', 'wha', 'wnba', 'pwhl', 'nwsl', 'ahl');
create index on ts (lg, y, franchise_id);

-- ---------------------------------------------------------------------------------------------- evidence
-- (lg, y, franchise_id, source code, priority, conference as written, division as written, parent conference as written)
create temp table ev0 (lg text, y int, franchise_id int, src text, prio int, craw text, draw text, praw text);

-- 1. SPX (seasons 1998-2010)
create temp table spxf as
select distinct substring(e.external_key from 6)::int team_id, e.entity_id franchise_id
from core.external_id e where e.entity_kind = 'franchise' and e.source_id = (select source_id from src where code = 'spx_database')
  and e.external_key ~ '^team:[0-9]+$';
insert into ev0
select distinct ts.lg, x.season_start_year, f.franchise_id, 'spx_database', 1, c.conference_name, d.division_name, null
from legacy_spx.xref_team_conference_division_seasons x
join spxf f on f.team_id = x.team_id
join ts on ts.franchise_id = f.franchise_id and ts.y = x.season_start_year
left join legacy_spx.lk_sport_conferences c on c.conference_id = x.conference_id
left join legacy_spx.lk_sport_divisions d on d.division_id = x.division_id;
-- SPX filed the NBA's Southwest Division (2004-2009) as a second "Central", in the West. Wikipedia's standings
-- templates for those seasons say Southwest for the same clubs; the fix is logged for every club it touches.
create temp table spxfix as select lg, y, franchise_id from ev0 where src = 'spx_database' and prio = 1 and lg = 'nba' and craw = 'Western' and draw = 'Central';
update ev0 e set draw = 'Southwest' from spxfix f where e.src = 'spx_database' and e.prio = 1 and e.lg = f.lg and e.y = f.y and e.franchise_id = f.franchise_id;
-- SPX's undated list (saved with the January 2012 backup: the 2011 season). Used only to check, never to choose.
insert into ev0
select distinct ts.lg, ts.y, f.franchise_id, 'spx_database', 50, null, d.division_name, null
from legacy_spx.xref_sport_team_divisions x
join spxf f on f.team_id = x.team_id
join ts on ts.franchise_id = f.franchise_id and ts.y = 2011 and ts.lg <> 'nba'  -- (its NBA list files the Southwest as Central, with no conference to tell them apart)
join legacy_spx.lk_sport_divisions d on d.division_id = x.division_id;

-- 2. NHL API standings. An abbreviation names a franchise through the identity of that season; failing that, through
-- the franchise the abbreviation was recorded against (the Cleveland Barons' CBN).
create temp table nst as
select substring(season, 1, 4)::int y, team_abbrev, nullif(row ->> 'conferenceName', '') c, nullif(row ->> 'divisionName', '') d from legacy_nhlapi.standing;
insert into ev0
select 'nhl', n.y, ts.franchise_id, 'nhl_api', 2, n.c, n.d, null
from nst n join ts on ts.lg = 'nhl' and ts.y = n.y and ts.abbr = n.team_abbrev;
insert into ev0
select 'nhl', n.y, ts.franchise_id, 'nhl_api', 2, n.c, n.d, null
from nst n
join core.external_id e on e.entity_kind = 'franchise' and e.external_key = 'team:' || n.team_abbrev
join ts on ts.lg = 'nhl' and ts.y = n.y and ts.franchise_id = e.entity_id
where not exists (select 1 from ts t2 where t2.lg = 'nhl' and t2.y = n.y and t2.abbr = n.team_abbrev)
  and (select count(distinct e2.entity_id) from core.external_id e2 join ts t3 on t3.franchise_id = e2.entity_id and t3.lg = 'nhl' and t3.y = n.y
        where e2.entity_kind = 'franchise' and e2.external_key = 'team:' || n.team_abbrev) = 1;

-- 2. Retrosheet: the league a club's own games were logged under, by year (ML = all-star games, left out).
create temp table rl as
select distinct on (y, team) y, team, lg from (
  select extract(year from game_date)::int y, home team, home_league lg, count(*) n from legacy_retrosheet.game_log where home_league is not null and home_league <> 'ML' group by 1, 2, 3
  union all
  select extract(year from game_date)::int, visitor, visitor_league, count(*) from legacy_retrosheet.game_log where visitor_league is not null and visitor_league <> 'ML' group by 1, 2, 3) z
order by y, team, n desc;
-- A code names a club by the identity's abbreviation of that season or, once step 179 has replaced Retrosheet's codes with the
-- fans' (CHN -> CHC), by the franchise the code was recorded against in core.external_id (step 140).
insert into ev0
select distinct 'mlb', r.y, ts.franchise_id, 'retrosheet', 2, r.lg, null, null
from rl r
left join core.external_id e on e.entity_kind = 'franchise' and e.source_id = (select source_id from src where code = 'retrosheet') and e.external_key = 'franchise:' || r.team
join ts on ts.lg = 'mlb' and ts.y = r.y and (ts.abbr = r.team or ts.franchise_id = e.entity_id)
where r.lg not in ('NA', 'AA', 'UA', 'PL', 'FL');   -- (a league of its own, na, aa, ua, pl, fl, has no conferences)

-- 3. Wikipedia standings templates. A team named by a template is found by its full name, else by its nickname
-- (the last words of the name) among that season's clubs of the league.
create temp table wt as
select t.league_code lg, t.season y, t.template, t.kind, t.grp, t.parent_grp, w.team_name, pg_temp.flat(w.team_name) fl
from legacy_alignment.wikipedia_template t join legacy_alignment.wikipedia_team w using (league_code, season, template)
union all  -- CFL and NBA standings already read from Wikipedia by their own loaders (legacy_wikipedia_cfl, legacy_wikipedia_nba)
select 'cfl', season, 'CFL ' || season || ' ' || regexp_replace(division, '[^A-Za-z ]', '', 'g'), 'conference',
       case when division like 'Interprovincial Rugby%' then 'East' when division like 'Western Interprovincial%' then 'West'
            else substring(division from '(East|West|North|South)') end, null, team, pg_temp.flat(team)
from legacy_wikipedia_cfl.standing
union all
select 'nba', season, division,
       case when season >= 1970 and division ~ ' NBA (East|West) standings$' then 'conference' else 'division' end,   -- conferences began with 1970-71
       substring(division from ' (?:NBA|BAA) (.+) standings$'), null, team, pg_temp.flat(team)   -- the BAA's templates read "1946-47 BAA East standings"
from legacy_wikipedia_nba.standing
union all  -- the NFL before 1999: the season's standings templates (step 151 loads them as legacy_wikipedia_nfl.standing; "1991 AFC East standings",
           -- and "1982 AFC standings" for the strike season, which was played without divisions)
select 'nfl', season, division, case when division ~ ' (AFC|NFC) standings$' then 'conference' else 'division' end,
       regexp_replace(regexp_replace(division, '^[0-9]{4} ', ''), ' standings$', ''), null, team, pg_temp.flat(team)
from legacy_wikipedia_nfl.standing
where season < 1999 and division ~ '^[0-9]{4} (AFC|NFC)( [A-Za-z]+)? standings$'
union all  -- the NFL before 1970: no divisions 1920-32; Eastern and Western Divisions 1933-49 ("1946 NFL Eastern standings"); the American and National
           -- Conferences 1950-52; the Eastern and Western Conferences 1953-66; the Capitol, Century, Central and Coastal Divisions 1967-69
select 'nfl', season, division,
       case when (season between 1950 and 1966) then 'conference' else 'division' end,
       regexp_replace(regexp_replace(division, '^[0-9]{4} NFL ', ''), ' standings$', ''), null, team, pg_temp.flat(team)
from legacy_wikipedia_nfl.standing
where season between 1933 and 1969 and division ~ '^[0-9]{4} NFL (Eastern|Western|American|National|Capitol|Century|Central|Coastal) standings$'
union all  -- the AFL: Eastern and Western Divisions ("1960 AFL Eastern standings")
select 'afl', season, division, 'division', regexp_replace(regexp_replace(division, '^[0-9]{4} AFL ', ''), ' standings$', ''), null, team, pg_temp.flat(team)
from legacy_wikipedia_afl.standing
where division ~ '^[0-9]{4} AFL (Eastern|Western) standings$'
union all  -- the AAFC: Eastern and Western Divisions 1946-48 ("1946 AAFC Eastern standings"); 1949 was one table, with no divisions
select 'aafc', season, division, 'division', regexp_replace(regexp_replace(division, '^[0-9]{4} AAFC ', ''), ' standings$', ''), null, team, pg_temp.flat(team)
from legacy_wikipedia_aafc.standing
where division ~ '^[0-9]{4} AAFC (Eastern|Western) standings$'
union all  -- the WHA: Eastern and Western Divisions, and the Canadian Division of 1974-76 (the standings templates' captions); 1977-78 and 1978-79 had none
select 'wha', season, division, 'division', division, null, team, pg_temp.flat(team)
from legacy_wikipedia_hockey.standing
where league = 'wha' and division ~ '^(Eastern|Western|Canadian) Division$'
union all  -- the WNBA: Eastern and Western Conference tables ("1997 WNBA Eastern Conference standings"); a season that
           -- published one overall table ("2024 WNBA standings") has no conference on the template name
select 'wnba', season, division, 'conference',
       case when division ~* 'eastern' then 'Eastern' when division ~* 'western' then 'Western' end, null, team, pg_temp.flat(team)
from legacy_wikipedia_wnba.standing
where division ~* '(eastern|western)'
union all  -- the AHL: the division table's heading and the conference heading above it (the one table of 1952-76 headed "Overall" has no division)
select 'ahl', season, coalesce(conference || ' ', '') || division, 'division', division, conference, team, pg_temp.flat(team)
from legacy_wikipedia_hockey_minor.standing
where league = 'ahl' and division <> 'Overall';
create temp table wmatch as
select w.*, coalesce(
    (select min(ts.franchise_id) from ts where ts.lg = w.lg and ts.y = w.y and pg_temp.flat(ts.full_name) = w.fl having count(*) = 1),
    (select min(ts.franchise_id) from ts where ts.lg = w.lg and ts.y = w.y and ts.nickname is not null and length(pg_temp.flat(ts.nickname)) > 3
        and w.fl like '%' || pg_temp.flat(ts.nickname) || '%' having count(*) = 1),
    (select min(ts.franchise_id) from ts where ts.lg = w.lg and ts.y = w.y and ts.nickname is not null
        and length(pg_temp.flat(regexp_replace(ts.nickname, '^.* ', ''))) > 4
        and w.fl like '%' || pg_temp.flat(regexp_replace(ts.nickname, '^.* ', '')) having count(*) = 1),
    -- Relocation year with no identity of its own (2002 Utah Starzz, 2003 Connecticut Sun): the
    -- nearest era's name is the other city's, so match any name that franchise has borne.
    (select min(ts.franchise_id) from ts
     join core.franchise_identity i on i.franchise_id = ts.franchise_id
     where ts.lg = w.lg and ts.y = w.y and pg_temp.flat(i.full_name) = w.fl
     having count(distinct ts.franchise_id) = 1)) franchise_id
from wt w;
insert into ev0
select lg, y, franchise_id, 'wikipedia', 3, case when kind = 'conference' then grp end, case when kind = 'division' then grp end, parent_grp
from wmatch where franchise_id is not null;

-- ---------------------------------------------------------------------------------------------- canonical evidence
create temp table ev as
select e.lg, e.y, e.franchise_id, e.src, e.prio,
       c.cn[1] cname, c.cn[2] cshort, d.dn[1] dname, d.dn[2] dshort, e.craw, e.draw
from ev0 e
cross join lateral (select coalesce(pg_temp.canon(e.lg, 'conference', e.craw), pg_temp.canon(e.lg, 'conference', e.praw)) cn) c
cross join lateral (select pg_temp.canon(e.lg, 'division', e.draw) dn) d;
-- a division alone (MLB, NFL) names its conference
update ev set cname = (pg_temp.implied(lg, dshort))[1], cshort = (pg_temp.implied(lg, dshort))[2]
where cname is null and dname is not null and pg_temp.implied(lg, dshort) is not null;

-- ---------------------------------------------------------------------------------------------- choice
-- the best source for each field of each team season (verification-only rows, priority 50, never chosen)
create temp table pick as
select ts.team_season_id, ts.lg, ts.y, ts.franchise_id,
       c.cname, c.cshort, c.src csrc, d.dname, d.dshort, d.src dsrc
from ts
left join lateral (select cname, cshort, src from ev e where e.lg = ts.lg and e.y = ts.y and e.franchise_id = ts.franchise_id and e.cname is not null and e.prio < 50
                   order by e.prio, e.src limit 1) c on true
left join lateral (select dname, dshort, src from ev e where e.lg = ts.lg and e.y = ts.y and e.franchise_id = ts.franchise_id and e.dname is not null and e.prio < 50
                   order by e.prio, e.src limit 1) d on true
where c.cname is not null or d.dname is not null;
-- a division known without a conference in a season whose other teams of that division name one
update pick p set cname = q.cname, cshort = q.cshort, csrc = q.csrc
from (select lg, y, dname, (array_agg(cname order by n desc))[1] cname, (array_agg(cshort order by n desc))[1] cshort, 'derived' csrc
      from (select lg, y, dname, cname, cshort, count(*) n from pick where cname is not null and dname is not null group by 1, 2, 3, 4, 5) z group by 1, 2, 3) q
where p.cname is null and p.dname is not null and p.lg = q.lg and p.y = q.y and p.dname = q.dname and p.lg <> 'nhl';

-- ---------------------------------------------------------------------------------------------- the check
-- Upsert only: do not delete-all then insert (that rewrote every league's verification ids).
create temp table new_iss as
select (select source_id from src where code = 'wikipedia') as source_id, 'team_season'::text as entity_kind,
       'alignment:' || lg || ':' || y || ':' || team_name as entity_key,
       'Standings template ' || template || ' lists a club that matches none of that season''s clubs' as issue,
       'Left out of the alignment'::text as resolution
from (select distinct lg, y, template, team_name from wmatch where franchise_id is null) w
where exists (select 1 from ts where ts.lg = w.lg and ts.y = w.y)
union all
select (select source_id from src where code = 'spx_database'), 'team_season',
       'alignment:nba:' || f.y || ':' || t.team_season_id || ':division',
       'SPX filed the Southwest Division as "Central" in the Western Conference',
       'Read as Southwest, which the Wikipedia standings template of the season confirms'
from spxfix f join ts t on t.lg = f.lg and t.y = f.y and t.franchise_id = f.franchise_id;

create temp table cmp as
select p.team_season_id, p.lg, p.y, 'conference' field, e.src, e.craw their_raw, e.cname their, p.cname chosen, p.csrc chosen_src
from pick p join ev e on e.lg = p.lg and e.y = p.y and e.franchise_id = p.franchise_id and e.cname is not null and e.src <> coalesce(p.csrc, '')
where p.cname is not null
union all
select p.team_season_id, p.lg, p.y, 'division', e.src, e.draw, e.dname, p.dname, p.dsrc
from pick p join ev e on e.lg = p.lg and e.y = p.y and e.franchise_id = p.franchise_id and e.dname is not null and e.src <> coalesce(p.dsrc, '')
where p.dname is not null;
-- one row per (team season, field, source): when a source gave several (the NBA's division and conference templates), the disputed one first
create temp table cmp1 as
select distinct on (team_season_id, field, src) *, (their is not distinct from chosen) agrees from cmp order by team_season_id, field, src, (their is not distinct from chosen);
insert into new_iss
select (select source_id from src where code = c.src), 'team_season', 'alignment:' || c.lg || ':' || c.y || ':' || c.team_season_id || ':' || c.field,
       format('%s says %s %s; %s has %s', c.src, c.field, c.their, c.chosen_src, c.chosen), format('Kept %s from %s', c.chosen, c.chosen_src)
from cmp1 c where not c.agrees;

-- nflverse: two clubs that met in a division game are in one division
create temp table nflpair as
select distinct least(h.entity_id, a.entity_id) f1, greatest(h.entity_id, a.entity_id) f2, g.season y
from legacy_nflverse.game g
join core.external_id h on h.entity_kind = 'franchise' and h.source_id = (select source_id from src where code = 'nflverse') and h.external_key = 'team:' || g.home_team
join core.external_id a on a.entity_kind = 'franchise' and a.source_id = (select source_id from src where code = 'nflverse') and a.external_key = 'team:' || g.away_team
where g.game_type = 'REG' and g.row ->> 'div_game' = '1';
create temp table nflchk as
select p.team_season_id, p.y, p.dname,
       count(*) filter (where o.dname is not distinct from p.dname) same, count(*) filter (where o.dname is distinct from p.dname) diff,
       string_agg(distinct o.dname, ', ') filter (where o.dname is distinct from p.dname) others
from pick p
join nflpair n on n.y = p.y and p.franchise_id in (n.f1, n.f2)
join pick o on o.lg = 'nfl' and o.y = p.y and o.franchise_id = (case when p.franchise_id = n.f1 then n.f2 else n.f1 end)
where p.lg = 'nfl' group by 1, 2, 3;
insert into new_iss
select (select source_id from src where code = 'nflverse'), 'team_season', 'alignment:nfl:' || y || ':' || team_season_id || ':division',
       format('nflverse div_game: %s met %s in division games', dname, others), 'Kept the chosen division'
from nflchk where diff > 0;

create temp table new_ver as
select 'team_season'::text as entity_kind, c.team_season_id as entity_id, c.field,
       case when c.agrees then 'confirmed' else 'disputed' end::meta.verification_status as status,
       (select source_id from src where code = c.src) as source_id, null::text as evidence_url, coalesce(c.their_raw, c.their) as their_value
from cmp1 c
union all
select 'team_season', team_season_id, 'division', case when diff = 0 then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from src where code = 'nflverse'), null,
       case when diff = 0 then 'plays its division games only against ' || dname else 'division games against ' || others end
from nflchk;

update meta.verification v set status = n.status, evidence_url = n.evidence_url, their_value = n.their_value, checked_at = now()
from new_ver n
where v.entity_kind = n.entity_kind and v.entity_id = n.entity_id and v.field = n.field and v.source_id = n.source_id
  and (v.status, v.evidence_url, v.their_value) is distinct from (n.status, n.evidence_url, n.their_value);
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select n.entity_kind, n.entity_id, n.field, n.status, n.source_id, n.evidence_url, n.their_value
from new_ver n
where not exists (select 1 from meta.verification v
                  where v.entity_kind = n.entity_kind and v.entity_id = n.entity_id and v.field = n.field and v.source_id = n.source_id);
delete from meta.verification v
where v.entity_kind = 'team_season' and v.field in ('conference', 'division')
  and v.source_id in (select source_id from src)
  and not exists (select 1 from new_ver n where n.entity_id = v.entity_id and n.field = v.field and n.source_id = v.source_id);

update meta.data_issue d set issue = n.issue, resolution = n.resolution
from new_iss n
where d.entity_kind = n.entity_kind and d.entity_key = n.entity_key and d.source_id = n.source_id
  and (d.issue, d.resolution) is distinct from (n.issue, n.resolution);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select n.source_id, n.entity_kind, n.entity_key, n.issue, n.resolution
from new_iss n
where not exists (select 1 from meta.data_issue d
                  where d.entity_kind = n.entity_kind and d.entity_key = n.entity_key and d.source_id is not distinct from n.source_id);
delete from meta.data_issue d
where d.entity_kind = 'team_season' and d.entity_key like 'alignment:%'
  and not exists (select 1 from new_iss n where n.entity_key = d.entity_key and n.source_id is not distinct from d.source_id);

-- ---------------------------------------------------------------------------------------------- conferences, divisions
create temp table sord as select league_code lg, start_year::int y, row_number() over (partition by league_code order by start_year) ord from core.season;
-- (a league that no longer plays, the AFL, has no open-ended group: its last season is its last)
create temp table lastyear as select p.lg, case when l.dissolved_on is null then max(p.y) end as ly
from pick p join ref.league l on l.league_code = p.lg group by p.lg, l.dissolved_on;

-- A conference (or division) group runs over seasons; a gap of more than one league season starts a new run, so the
-- NHL's East Division of 1967-73 and of 2020-21 are two rows, and the Eastern Conference skips 2020-21 without breaking.
create temp table cruns as
select lg, cname, cshort, min(y) first_y, max(y) last_y, island from (
  select w.*, sum(case when ord - prev > 2 then 1 else 0 end) over (partition by lg, cname order by y) island from (
    select z.*, lag(ord) over (partition by lg, cname order by y) prev
    from (select distinct p.lg, p.cname, p.cshort, p.y, s.ord from pick p join sord s on s.lg = p.lg and s.y = p.y where p.cname is not null) z) w) q
group by lg, cname, cshort, island;
create temp table newc as
select c.lg as league_code, c.cname as name, c.cshort as short_name, c.first_y as first_season,
       case when c.last_y = l.ly then null else c.last_y end as last_season
from cruns c join lastyear l using (lg);

create temp table druns as
select lg, cname, dname, dshort, min(y) first_y, max(y) last_y, island from (
  select w.*, sum(case when ord - prev > 2 then 1 else 0 end) over (partition by lg, dname, cname order by y) island from (
    select z.*, lag(ord) over (partition by lg, dname, cname order by y) prev
    from (select distinct p.lg, p.cname, p.dname, p.dshort, p.y, s.ord from pick p join sord s on s.lg = p.lg and s.y = p.y where p.dname is not null) z) w) q
group by lg, cname, dname, dshort, island;
create temp table newd as
select d.lg as league_code, d.cname as conference_name, d.dname as name, d.dshort as short_name, d.first_y as first_season,
       case when d.last_y = l.ly then null else d.last_y end as last_season
from druns d join lastyear l using (lg);

update core.conference c set short_name = n.short_name, last_season = n.last_season
from newc n
where c.league_code = n.league_code and c.name = n.name and c.first_season = n.first_season
  and (c.short_name, c.last_season) is distinct from (n.short_name, n.last_season);
insert into core.conference (league_code, name, short_name, first_season, last_season)
select n.league_code, n.name, n.short_name, n.first_season, n.last_season
from newc n
where not exists (select 1 from core.conference c
                  where c.league_code = n.league_code and c.name = n.name and c.first_season = n.first_season);

update core.division d set short_name = n.short_name, last_season = n.last_season, conference_id = c.conference_id
from newd n
left join core.conference c on c.league_code = n.league_code and c.name = n.conference_name
  and n.first_season >= c.first_season and n.first_season <= coalesce(c.last_season, 32767)
where d.league_code = n.league_code and d.name = n.name and d.first_season = n.first_season
  and (d.short_name, d.last_season, d.conference_id) is distinct from (n.short_name, n.last_season, c.conference_id);
insert into core.division (league_code, conference_id, name, short_name, first_season, last_season)
select n.league_code, c.conference_id, n.name, n.short_name, n.first_season, n.last_season
from newd n
left join core.conference c on c.league_code = n.league_code and c.name = n.conference_name
  and n.first_season >= c.first_season and n.first_season <= coalesce(c.last_season, 32767)
where not exists (select 1 from core.division d
                  where d.league_code = n.league_code and d.name = n.name and d.first_season = n.first_season);

update core.team_season t set conference_id = c.conference_id
from pick p
join newc n on n.league_code = p.lg and n.name = p.cname
  and p.y between n.first_season and coalesce(n.last_season, 32767)
join core.conference c on c.league_code = n.league_code and c.name = n.name and c.first_season = n.first_season
where t.team_season_id = p.team_season_id and p.cname is not null
  and t.conference_id is distinct from c.conference_id;
update core.team_season t set division_id = d.division_id
from pick p
join newd n on n.league_code = p.lg and n.name = p.dname
  and p.y between n.first_season and coalesce(n.last_season, 32767)
  and n.conference_name is not distinct from p.cname
join core.division d on d.league_code = n.league_code and d.name = n.name and d.first_season = n.first_season
where t.team_season_id = p.team_season_id and p.dname is not null
  and t.division_id is distinct from d.division_id;
update core.team_season t set conference_id = null
where t.conference_id is not null
  and not exists (select 1 from pick p where p.team_season_id = t.team_season_id and p.cname is not null);
update core.team_season t set division_id = null
where t.division_id is not null
  and not exists (select 1 from pick p where p.team_season_id = t.team_season_id and p.dname is not null);

update core.team_season t set division_id = null
where t.division_id in (select d.division_id from core.division d
                        where not exists (select 1 from newd n
                                          where n.league_code = d.league_code and n.name = d.name and n.first_season = d.first_season));
delete from core.division d
where not exists (select 1 from newd n
                  where n.league_code = d.league_code and n.name = d.name and n.first_season = d.first_season);
update core.team_season t set conference_id = null
where t.conference_id in (select c.conference_id from core.conference c
                          where not exists (select 1 from newc n
                                            where n.league_code = c.league_code and n.name = c.name and n.first_season = c.first_season));
delete from core.conference c
where not exists (select 1 from newc n
                  where n.league_code = c.league_code and n.name = c.name and n.first_season = c.first_season);

-- ---------------------------------------------------------------------------------------------- report
select lg, count(*) filter (where cname is not null) with_conference, count(*) filter (where dname is not null) with_division, count(*) team_seasons
from pick group by lg order by lg;
commit;
