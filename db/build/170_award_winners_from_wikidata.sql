-- Award winners from Wikidata (CC0): a person's "award received" with the year
-- it was given. NHL and NBA awards are given at the end of a season, so an
-- award dated 1980 is the 1979-80 season's; MLB, NFL and CFL seasons are named
-- by the year they are played in. Players listed as Stanley Cup winners are not
-- champions: a championship's winner is a team. Wikidata's lists have gaps
-- (they are what its editors have entered); a season with no winner shows as
-- missing. Runs after 160, 165 and 169.
-- A winner's name is Wikidata's English label; where an item has none, the label service answers the bare id, so the
-- name is then taken from the item's label on legacy_people.item (169 fills the "mul" ones) or from the person
-- already built from it. A winner with no name anywhere is left out and logged: never a bare Q-number.
begin;

delete from core.award_winner where source_id = (select source_id from meta.source where code = 'wikidata');
delete from meta.verification where source_id = (select source_id from meta.source where code = 'wikidata') and entity_kind = 'season';

create temp table wd as
select a.award_id, a.league_code, a.kind,
       r.row->>'winnerLabel' as label, (r.row->>'isHuman')::boolean as is_human,
       extract(year from (r.row->>'time')::timestamptz)::int as yr,
       case when r.row->>'teamLabel' ~ '^Q[0-9]+$' then null else r.row->>'teamLabel' end as team,
       r.row->>'winner' as winner_uri, r.row_number
from legacy_wikidata.result r
join core.external_id x on x.entity_kind = 'award' and 'http://www.wikidata.org/entity/' || x.external_key = r.row->>'award'
join core.award a on a.award_id = x.entity_id
where r.query_name = 'award_winners' and r.row ? 'time';

delete from meta.data_issue where source_id = (select source_id from meta.source where code = 'wikidata') and entity_kind = 'award_winner';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'award_winner', 'wikidata:' || regexp_replace(winner_uri, '.*/', '') || ':' || yr,
       format('%s dated %s', label, yr), 'Left out: the year is in the future'
from wd where yr > extract(year from current_date);

create temp table wdk as
select wd.*, regexp_replace(winner_uri, '.*/', '') as qid, case when league_code in ('nhl', 'nba') then yr - 1 else yr end as start_year from wd
where ((kind = 'person_award' and is_human) or (kind <> 'person_award' and not is_human))
  and yr <= extract(year from current_date);

create temp table wds as
select k.*, coalesce(case when k.label !~ '^Q[0-9]+$' and k.label <> '' then k.label end,
                     case when i.label !~ '^Q[0-9]+$' then i.label end,
                     case when p.full_name !~ '^Q[0-9]+$' then p.full_name end) as winner
from wdk k
left join legacy_people.item i on i.qid = k.qid
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from meta.source where code = 'wikidata') and x.external_key = k.qid
left join core.person p on p.person_id = x.entity_id;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select distinct (select source_id from meta.source where code = 'wikidata'), 'award_winner', 'wikidata:' || qid || ':' || yr,
       format('%s (a winner of %s dated %s) has no name on Wikidata', qid, (select code from core.award where award_id = wds.award_id), yr), 'Left out: no name to show'
from wds where winner is null;
delete from wds where winner is null;

insert into core.season (league_code, start_year, end_year, label, source_id)
select distinct league_code, start_year,
       case when league_code in ('mlb', 'cfl') then start_year else start_year + 1 end,
       case when league_code in ('nhl', 'nba') then start_year || '-' || right((start_year + 1)::text, 2) else start_year::text end,
       (select source_id from meta.source where code = 'wikidata')
from wds on conflict (league_code, start_year) do nothing;

insert into core.award_winner (award_id, season_id, winner_name, note, source_id, source_key)
select distinct on (w.award_id, s.season_id, w.winner)
       w.award_id, s.season_id, w.winner, case when w.team is not null then 'Played for ' || w.team end,
       (select source_id from meta.source where code = 'wikidata'), 'wikidata:' || regexp_replace(w.winner_uri, '.*/', '') || ':' || w.yr
from wds w join core.season s on s.league_code = w.league_code and s.start_year = w.start_year
order by w.award_id, s.season_id, w.winner, w.team nulls last;

-- A champion both Wikidata and the results name: a check mark on that season.
insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'season', d.season_id, a.code, case when d.winner_name = w.winner_name then 'confirmed' else 'disputed' end::meta.verification_status,
       w.source_id, w.winner_name
from core.award_winner d join core.award a using (award_id)
join core.award_winner w on w.award_id = d.award_id and w.season_id = d.season_id and w.source_id = (select source_id from meta.source where code = 'wikidata')
where a.kind = 'championship' and d.source_id = (select source_id from meta.source where code = 'spx_stats_derived')
on conflict do nothing;

select a.league_code, a.kind, count(*), min(s.start_year), max(s.start_year)
from core.award_winner w join core.award a using (award_id) join core.season s using (season_id)
where w.source_id = (select source_id from meta.source where code = 'wikidata') group by 1, 2 order by 1, 2;
commit;
