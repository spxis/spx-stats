-- MLB before the modern World Series (1871-1902) and the Federal League (1914-15): the pennant winner of every major league and the postseason series, from
-- db/seed/mlb_pre1903_champion.csv (scripts/mlb_early/: English Wikipedia's "<year> Major League Baseball season" infoboxes and
-- "List of pre-World Series baseball champions", CC BY-SA 4.0). Run from the repo root, after 160 and 165, before 172. Rerunnable.
--  * Pennants are team awards, one award per league (National Association, National League, American Association, Union Association,
--    Players' League, American League, Federal League), one winner per league and year. The pennant of a league of its own (na, aa, ua, pl, fl: step 139)
--    is that league's championship, placed on that league's season; the National and American League pennants stay team awards of MLB's season.
--  * The season's champion (kind 'championship', the award "Championship before the World Series") is the one row the seed marks counts_as_champion:
--    the winner of the postseason series where one was played (the World's Championship Series 1884-90 and the 1892 split-season playoff, the Temple
--    Cup 1894-97, the Chronicle-Telegraph Cup 1900), else the National League pennant winner where MLB's season holds the National League alone
--    (1876-83, 1891, 1893, 1898, 1899). 1901 and 1902 name no single champion: the American and National Leagues did not meet. A tied series (1885, 1890)
--    gives both clubs a row. The World's Championship Series stay in MLB's season even when the winner played in the American Association.
--  * It is a separate award from "World Series": the World Series titles of a franchise stay the modern ones, and 165 skips it.
--  * A club is placed by its name that season (api.team_name, punctuation ignored; the seed's core_club where core names it otherwise). A row whose
--    club matches no team season of the season is not written and is logged in meta.data_issue (entity_kind 'mlb_early').
-- Owns only award_winner rows with source_key 'mlbearly:%' and the eight awards below. Safe to run again. Needs 139 and 140 (the seasons).
begin;

create temp table src on commit drop as select source_id from meta.source where code = 'wikipedia';

create temp table seed (year smallint, role text, league text, event text, club text, opponent text, score text, counts_as_champion boolean, note text, source_url text, core_club text);
\copy seed from 'db/seed/mlb_pre1903_champion.csv' with (format csv, header true)

insert into core.award (league_code, code, name, kind, description, first_season, source_id) values
 ('mlb', 'mlb_early_championship', 'Championship before the World Series', 'championship',
  'The champion of the major leagues before the first modern World Series (1903): the winner of the postseason series where one was played, else the pennant winner of the only major league.', 1871, (select source_id from src)),
 ('na', 'mlb_pennant_na', 'National Association pennant', 'championship', 'The National Association of Professional Base Ball Players'' champion (1871-75).', 1871, (select source_id from src)),
 ('mlb', 'mlb_pennant_nl', 'National League pennant', 'team_award', 'The National League''s regular-season champion before the World Series (1876-1902).', 1876, (select source_id from src)),
 ('aa', 'mlb_pennant_aa', 'American Association pennant', 'championship', 'The American Association''s regular-season champion (1882-91).', 1882, (select source_id from src)),
 ('ua', 'mlb_pennant_ua', 'Union Association pennant', 'championship', 'The Union Association''s regular-season champion (1884).', 1884, (select source_id from src)),
 ('pl', 'mlb_pennant_pl', 'Players'' League pennant', 'championship', 'The Players'' League''s regular-season champion (1890).', 1890, (select source_id from src)),
 ('mlb', 'mlb_pennant_al', 'American League pennant', 'team_award', 'The American League''s regular-season champion before the World Series (1901-02).', 1901, (select source_id from src)),
 ('fl', 'mlb_pennant_fl', 'Federal League pennant', 'championship', 'The Federal League''s regular-season champion (1914-15); the World Series of those years was played by the AL and NL champions.', 1914, (select source_id from src))
on conflict (code) do update set league_code = excluded.league_code, name = excluded.name, kind = excluded.kind, description = excluded.description,
  first_season = excluded.first_season, source_id = excluded.source_id;

-- one row per club of a seed row ("A / B" for a tied series), placed on a team season of that year
create temp table club on commit drop as
select s.*, x.name as club_name, x.core_name, se.season_id, se.league_code as season_league, ts.team_season_id
from seed s
cross join lateral (select unnest(string_to_array(s.club, ' / ')) as name, unnest(string_to_array(coalesce(nullif(s.core_club, ''), s.club), ' / ')) as core_name) x
join core.season se on se.start_year = s.year
  and se.league_code = case when s.role = 'pennant' and s.league in ('NA', 'AA', 'UA', 'PL', 'FL') then lower(s.league) else 'mlb' end
left join lateral (select t.team_season_id from core.team_season t join core.season ts_se on ts_se.season_id = t.season_id
                   where (t.season_id = se.season_id
                          or (s.role = 'series' and ts_se.start_year = s.year and ts_se.league_code in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl')))   -- a series winner may be an American Association or Players' League club
                     and regexp_replace(lower(api.team_name(t.team_season_id)), '[^a-z0-9]', '', 'g') = regexp_replace(lower(x.core_name), '[^a-z0-9]', '', 'g')
                   order by (t.season_id = se.season_id) desc, t.team_season_id limit 1) ts on true;

delete from core.award_winner where source_id = (select source_id from src) and source_key like 'mlbearly:%';
delete from meta.data_issue where source_id = (select source_id from src) and entity_kind = 'mlb_early';

insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select a.award_id, c.season_id, c.team_season_id, c.club_name,
       case when c.role = 'series' and c.opponent <> '' then format('Won the %s %s against %s', c.event, regexp_replace(replace(c.score, '–', '-'), '-\(1\)\*', ' with a tied game'), c.opponent) || coalesce(' (' || nullif(c.note, '') || ')', '')
            when c.role = 'series' then format('%s ended %s: %s', c.event, regexp_replace(replace(c.score, '–', '-'), '-\(1\)\*', ' with a tied game'), lower(c.note))
            else format('Pennant winner of the %s; no postseason series was played', case c.league when 'NA' then 'National Association' when 'NL' then 'National League' end) end,
       (select source_id from src),
       'mlbearly:championship:' || c.year || ':' || regexp_replace(lower(c.club_name), '[^a-z0-9]+', '_', 'g')
from club c join core.award a on a.code = 'mlb_early_championship'
where c.counts_as_champion and c.team_season_id is not null and c.season_league = 'mlb';

insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select a.award_id, c.season_id, c.team_season_id, c.club_name,
       case when c.counts_as_champion and c.season_league = 'mlb' then 'Also named the season''s champion' else null end,
       (select source_id from src), 'mlbearly:pennant:' || c.league || ':' || c.year
from club c join core.award a on a.code = 'mlb_pennant_' || lower(c.league)
where c.role = 'pennant' and c.team_season_id is not null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'mlb_early', c.role || ':' || coalesce(nullif(c.league, ''), 'series') || ':' || c.year || ':' || c.club_name,
       format('MLB %s %s: %s matches no team season of that year', c.year, case c.role when 'pennant' then c.league || ' pennant winner' else c.event end, c.club_name),
       'Left out'
from club c where c.team_season_id is null;

select a.name, count(*) as winners, min(s.start_year) as first_year, max(s.start_year) as last_year
from core.award_winner w join core.award a using (award_id) join core.season s using (season_id)
where w.source_key like 'mlbearly:%' group by a.name order by a.name;
select count(*) as seed_rows_not_placed from meta.data_issue where entity_kind = 'mlb_early';
commit;
