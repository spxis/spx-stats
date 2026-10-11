-- The sports resume of a person (core.person_career) from Wikidata (CC0) and the Lahman database (CC BY-SA 3.0):
--  * education: P69 "educated at" (legacy_people.resume_claim) and the colleges Lahman lists a player at (CollegePlaying);
--  * clubs outside our five leagues: P54 "member of sports team" whose club is not one of our franchises (junior, minor,
--    college, foreign and national teams), with the level worked out from the club's and its league's names;
--  * the draft: P647 "drafted by", with the year and the pick when Wikidata states them.
-- Seasons in the five leagues are not copied here (core.roster_stint, core.player_season_stat). Rerunnable: a run takes back
-- what it wrote before. Nothing about ethnicity, religion, health, sex or gender, family or politics is read or kept.
begin;

create temp table wd on commit drop as select source_id from meta.source where code = 'wikidata';
create temp table lh on commit drop as select source_id from meta.source where code = 'lahman';
delete from core.person_career where source_id in (select source_id from wd union select source_id from lh);

create temp table who on commit drop as
select x.external_key as qid, x.entity_id as person_id
from core.external_id x where x.entity_kind = 'person' and x.source_id = (select source_id from wd)
  and exists (select 1 from core.person p where p.person_id = x.entity_id);

-- Our own clubs, by name: a statement about one of them is a season in a league, not a line of the resume.
create temp table own on commit drop as
select distinct translate(lower(full_name), 'éèêëáàâäíîïóôöúùûüç', 'eeeeaaaaiiiooouuuuc') as n from core.franchise_identity;

create temp table cl on commit drop as
select c.qid, c.prop, c.n, c.value_qid, coalesce(i.label, c.value_qid) as name,
       c.start_on, c.end_on, c.point_on, c.ranking, c.ordinal,
       lg.label as league, lower(coalesce(lg.label, '') || ' ' || coalesce(i.label, '')) as hay,
       (select string_agg(lower(k.label), ' ') from unnest(coalesce(i.kinds, '{}')) kq join legacy_people.item k on k.qid = kq) as kinds_text
from legacy_people.resume_claim c
left join legacy_people.resume_item i on i.qid = c.value_qid
left join legacy_people.resume_item lg on lg.qid = i.league_qid
where coalesce(c.rank, 'normal') <> 'deprecated';

insert into core.person_career (person_id, kind, name, club_qid, level, league, start_year, end_year, detail, source_id, source_key)
select w.person_id, 'education', cl.name, cl.value_qid,
       case when cl.hay ~ 'high school|secondary school|collegiate institute|prep school|preparatory|academy|lycée|gymnasium' then 'high_school' else 'college' end,
       null, extract(year from cl.start_on)::int, extract(year from cl.end_on)::int, null, (select source_id from wd),
       'wikidata:' || cl.qid || ':P69:' || cl.n
from cl join who w using (qid)
where cl.prop = 'P69';

insert into core.person_career (person_id, kind, name, club_qid, level, league, start_year, end_year, detail, source_id, source_key)
select w.person_id, 'club', cl.name, cl.value_qid,
       case when cl.hay ~ 'national (ice hockey |baseball |basketball |football )?team|olympic' or cl.kinds_text ~ 'national .*team' then 'national'
            when cl.hay ~ 'junior|ontario hockey league|western hockey league|quebec major|ushl|united states hockey league|bchl|ojhl|north american hockey league|midget|major junior' then 'junior'
            when cl.name ~* '(men''s|women''s) .*(basketball|hockey|football|soccer)$| baseball$' or cl.hay ~ 'ncaa|college|university|universit|varsity|huskies|wildcats|bulldogs' or cl.kinds_text ~ 'college|university' then 'college'
            when cl.hay ~ '(international|pacific coast|eastern|southern|texas|midwest|california|carolina|florida state|south atlantic|northwest|pioneer|appalachian|gulf coast|arizona|dominican summer|american association|three-i) league|american hockey league|echl|central hockey|international hockey league|minor league|triple-a|double-a|class [a-d]|pacific coast league|international league|farm team|affiliate|sphl|ihl' or cl.kinds_text ~ 'minor league' then 'minor'
            when cl.league is not null then 'professional'
            else 'other' end,
       cl.league, extract(year from cl.start_on)::int, extract(year from cl.end_on)::int, null, (select source_id from wd),
       'wikidata:' || cl.qid || ':P54:' || cl.n
from cl join who w using (qid)
where cl.prop = 'P54'
  and translate(lower(cl.name), 'éèêëáàâäíîïóôöúùûüç', 'eeeeaaaaiiiooouuuuc') not in (select n from own)
  and coalesce(cl.league, '') !~* '^(national hockey league|national basketball association|basketball association of america|major league baseball|american league|national league|national football league|canadian football league|american football league|all-america football conference|western interprovincial football union|interprovincial rugby football union|big four|ontario rugby football union)$';

insert into core.person_career (person_id, kind, name, club_qid, level, league, start_year, end_year, detail, source_id, source_key)
select w.person_id, 'draft', cl.name, cl.value_qid, null, null,
       extract(year from coalesce(cl.point_on, cl.start_on))::int, null,
       nullif(concat_ws(', ', case when cl.ordinal ~ '^[0-9]+$' then 'round ' || cl.ordinal end, case when cl.ranking is not null then 'pick ' || cl.ranking::int end), ''),
       (select source_id from wd), 'wikidata:' || cl.qid || ':P647:' || cl.n
from cl join who w using (qid)
where cl.prop = 'P647';

-- Colleges from Lahman (a player Wikidata already places at a school of that name is not listed twice).
insert into core.person_career (person_id, kind, name, club_qid, level, league, start_year, end_year, detail, source_id, source_key)
select x.entity_id, 'education', sc.namefull, null, 'college', null, min(cp.yearid::int), max(cp.yearid::int), null, (select source_id from lh),
       'lahman:' || cp.playerid || ':' || cp.schoolid
from legacy_lahman.collegeplaying cp
join legacy_lahman.schools sc using (schoolid)
join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from lh) and x.external_key = cp.playerid
where exists (select 1 from core.person p where p.person_id = x.entity_id)
  and not exists (select 1 from core.person_career e where e.person_id = x.entity_id and e.kind = 'education' and lower(e.name) = lower(sc.namefull))
group by x.entity_id, sc.namefull, cp.playerid, cp.schoolid;
commit;
