-- The people records that might be one person, for John to decide. Read-only: it changes nothing.
-- Run on DS1 after db/build/185_person_merge.sql (which logs each undecided pair in meta.data_issue as 'possible-duplicate:...'):
--   bash scripts/mac/ds1-apply.sh db/review/person_review.sql --dry-run
-- It prints the list as CSV between the lines ---CSV-START--- and ---CSV-END---. That text is db/seed/person_review.csv, copied to
-- web/src/data/person-review.csv for the admin page (/admin/people); web/scripts/personReview.test.ts checks the two are equal.
-- Nothing here merges anything. A pair John says is one person is merged with the rules of 185_person_merge.sql.
create temp table pr on commit drop as
select (regexp_match(issue, 'person (\d+),.*person (\d+),'))[1]::bigint as a, (regexp_match(issue, 'person (\d+),.*person (\d+),'))[2]::bigint as b
from meta.data_issue where entity_kind = 'person' and entity_key like 'possible-duplicate:%';

create temp table pcnt on commit drop as
select p, string_agg(distinct o::text, ' ') as others from (select a as p, b as o from pr union all select b, a from pr) z group by p having count(*) > 1;

-- every team season a person has (rosters, statistics, awards, head coach, captain), and the seasons of awards that name no team
create temp table pt on commit drop as
select z.person_id, ts.franchise_id, se.start_year as yr, se.league_code as lg,
       (select fi.full_name from core.franchise_identity fi where fi.franchise_id = ts.franchise_id order by fi.valid_during desc limit 1) as club
from (select person_id, team_season_id from core.roster_stint
      union select person_id, team_season_id from core.player_season_stat
      union select person_id, team_season_id from core.award_winner where person_id is not null and team_season_id is not null
      union select head_coach_person_id, team_season_id from core.team_season where head_coach_person_id is not null
      union select captain_person_id, team_season_id from core.team_season where captain_person_id is not null) z
join core.team_season ts using (team_season_id) join core.season se using (season_id)
where z.person_id in (select a from pr union select b from pr)
union all
select w.person_id, null, se.start_year, se.league_code, null
from core.award_winner w join core.season se using (season_id)
where w.team_season_id is null and w.person_id in (select a from pr union select b from pr);
create index on pt (person_id);

create temp table ps on commit drop as
select p.person_id, p.full_name, p.kind, p.birth_date, p.death_date,
       (select string_agg(s.code || ':' || x.external_key, ' ' order by s.code) from core.external_id x join meta.source s using (source_id)
         where x.entity_kind = 'person' and x.entity_id = p.person_id) as sources,
       (select lg from pt where pt.person_id = p.person_id group by lg order by count(*) desc, lg limit 1) as league,
       (select min(yr) from pt where pt.person_id = p.person_id) as first_yr, (select max(yr) from pt where pt.person_id = p.person_id) as last_yr,
       (select string_agg(club, '; ' order by club) from (select distinct club from pt where pt.person_id = p.person_id and club is not null order by club limit 5) c) as clubs
from core.person p where p.person_id in (select a from pr union select b from pr);

create temp table fin on commit drop as
select pr.a, pr.b,
       (select string_agg(distinct pa.club, ', ') from pt pa join pt pb on pb.franchise_id = pa.franchise_id
         where pa.person_id = pr.a and pb.person_id = pr.b) as shared,
       -- a season of one that falls before the other could have played (15 years after birth) or after the other's death
       exists (select 1 from ps pa, ps pb where pa.person_id = pr.a and pb.person_id = pr.b and (
           (pa.birth_date is not null and pb.first_yr < extract(year from pa.birth_date) + 15)
        or (pa.death_date is not null and pb.last_yr > extract(year from pa.death_date) + 1)
        or (pb.birth_date is not null and pa.first_yr < extract(year from pb.birth_date) + 15)
        or (pb.death_date is not null and pa.last_yr > extract(year from pb.death_date) + 1))) as outside_life
from pr;

select '---CSV-START---';
\pset format csv
select case when f.outside_life then 'probably two people'
            when f.shared is not null then 'possibly one person'
            else 'unknown' end as lean,
       case when f.outside_life then 'seasons fall outside the life of the other: a birth or death date rules them out'
            when f.shared is not null then 'same franchise (' || f.shared || ') but no season, birth date or other id in common'
            else 'only the names fit: no season, birth date, franchise or other id in common' end
         || case when a.kind <> b.kind then '; one is a ' || a.kind || ' record, the other a ' || b.kind
                 else '' end
         || coalesce('; ' || (select 'also paired with person ' || pc.others from pcnt pc where pc.p = f.a), '')
         || coalesce('; ' || (select 'person ' || f.b || ' also paired with person ' || pc.others from pcnt pc where pc.p = f.b), '') as why_unsure,
       f.a as person_id_a, a.full_name as name_a, a.kind as kind_a, a.sources as sources_a, coalesce(a.league, b.league) as league_a,
       a.birth_date as born_a, a.first_yr as from_a, a.last_yr as to_a, a.clubs as clubs_a,
       f.b as person_id_b, b.full_name as name_b, b.kind as kind_b, b.sources as sources_b, coalesce(b.league, a.league) as league_b,
       b.birth_date as born_b, b.first_yr as from_b, b.last_yr as to_b, b.clubs as clubs_b
from fin f join ps a on a.person_id = f.a join ps b on b.person_id = f.b
order by case when f.outside_life then 3 when f.shared is not null then 1 else 2 end, a.full_name, f.a, f.b;
\pset format aligned
select '---CSV-END---';
