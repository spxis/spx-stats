-- People: core.person, core.roster_stint and core.award_winner.person_id from legacy_people (Wikidata, CC0),
-- which scripts/people/ read for every person who won an award. Rerunnable, and safe after scripts/build_core.sh
-- has rebuilt franchises and team_seasons (run it after 171): every key it uses is stable.
--  * A person is a Wikidata item (core.external_id: entity_kind 'person', source wikidata, the Q-number). People
--    are matched by that key, never by their core.person_id, so an id survives a rebuild of core.
--    This step deletes only people it owns: the ones an award winner pointed at before this run. A Wikidata person another step
--    added (179, 181, 184, 187) is never removed here; db/tests/run-people-177.sh checks it.
--  * An award winner is linked to a person two ways. A Wikidata winner carries the item in its source_key
--    ('wikidata:Q1382032:1958'). A Wikipedia winner is linked through the article the award's page links the name
--    to (legacy_people.wikipedia_link). Only a human, born at least 14 years before the season, is linked; the
--    rest are logged in meta.data_issue and left unlinked.
--  * A roster_stint (role 'player') is one season of one of Wikidata's "member of sports team" statements (P54),
--    where the team's name is the name of one of our franchises (franchise identity name, in that season first)
--    and the sport and league agree. A statement with no start has no seasons to place. With no end it is the
--    start season only. NHL and NBA seasons run autumn to spring: a start before August belongs to the season
--    that began the year before, and an end year with no month ends the season that began the year before.
--  * The position is not set here: db/build/186_person_positions.sql turns the P413 statements into position codes.
--  * Only what Wikidata states for the properties scripts/people/fetch.py fetches is used: nothing about
--    ethnicity, religion, health, sex or gender, family or politics was fetched, and none is stored.
begin;

create temp table wd on commit drop as select source_id from meta.source where code = 'wikidata';

-- Statements, with merged items followed and deprecated statements dropped.
create temp table c on commit drop as
select cl.qid, cl.prop, cl.n, cl.rank, coalesce(r.to_qid, cl.value_qid) as value_qid, cl.value_on, cl.value_prec, cl.value_num, cl.unit_qid,
       cl.value_lat, cl.value_lon, cl.value_text, cl.start_on, cl.start_prec, cl.end_on, cl.end_prec, cl.point_on, cl.point_prec
from legacy_people.claim cl left join legacy_people.redirect r on r.from_qid = cl.value_qid
where coalesce(cl.rank, 'normal') <> 'deprecated';
create index on c (qid, prop);
analyze c;

create temp table human on commit drop as select distinct qid from c where prop = 'P31' and value_qid = 'Q5';
create temp table born on commit drop as select qid, min(value_on) as on_ from c where prop = 'P569' group by qid;

-- 1. Which winner is which person.
create temp table link0 on commit drop as
select w.award_winner_id, w.source_key, w.winner_name, s.start_year, a.code as award_code, coalesce(r.to_qid, x.qid) as qid
from core.award_winner w join core.award a using (award_id) join core.season s using (season_id)
join meta.source src on src.source_id = w.source_id
cross join lateral (
  select split_part(w.source_key, ':', 2) as qid where src.code = 'wikidata' and w.source_key ~ '^wikidata:Q[0-9]+:'
  union all
  select l.qid from legacy_people.wikipedia_link l
   where src.code = 'wikipedia' and l.award_code = a.code and l.winner_name = w.winner_name and l.qid is not null) x
left join legacy_people.redirect r on r.from_qid = x.qid
where a.kind = 'person_award';

create temp table link on commit drop as
select l.* from link0 l join human h using (qid) left join born b using (qid)
where b.on_ is null or extract(year from b.on_) <= l.start_year - 14;

delete from meta.data_issue where source_id = (select source_id from wd) and entity_kind = 'award_winner' and entity_key like 'people:%';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'award_winner', 'people:' || l.source_key,
       format('%s (%s %s) is linked to Wikidata %s, %s', l.winner_name, l.award_code, l.start_year, l.qid,
              case when h.qid is null then 'which is not a human' else 'born ' || extract(year from b.on_) end),
       'Not linked to a person'
from link0 l left join human h using (qid) left join born b using (qid)
where not exists (select 1 from link k where k.award_winner_id = l.award_winner_id);

create temp table want on commit drop as select distinct qid from link;

-- 2. What we state about each of them.
create temp table pf on commit drop as
select i.qid, i.label as full_name,
  (select min(value_on) from c where c.qid = i.qid and prop = 'P569' and value_prec >= 11) as birth_date,
  (select min(value_on) from c where c.qid = i.qid and prop = 'P570' and value_prec >= 11) as death_date,
  (select value_qid from c where c.qid = i.qid and prop = 'P19' order by (rank = 'preferred') desc, n limit 1) as bp,
  (select value_qid from c where c.qid = i.qid and prop = 'P20' order by (rank = 'preferred') desc, n limit 1) as dp,
  (select case when v between 120 and 250 then v end from (
     select round(case unit_qid when 'Q11573' then value_num * 100 when 'Q174728' then value_num when 'Q218593' then value_num * 2.54
                                when 'Q3710' then value_num * 30.48 end)::int as v
     from c where c.qid = i.qid and prop = 'P2048' order by (rank = 'preferred') desc, n limit 1) h) as height_cm,
  (select regexp_replace(replace(it.label, 'ambidextrous', 'both'), '-handed$', '') from c join legacy_people.item it on it.qid = c.value_qid
    where c.qid = i.qid and prop = 'P741' order by (rank = 'preferred') desc, n limit 1) as handedness,
  (select case when it.label ~* 'left' then 'L' when it.label ~* 'right' then 'R' end from c join legacy_people.item it on it.qid = c.value_qid
    where c.qid = i.qid and prop = 'P423' order by (rank = 'preferred') desc, n limit 1) as shoots,
  -- the sport's own halls of fame, in the year Wikidata dates the honour
  (select min(extract(year from c.point_on))::int from c join legacy_people.item it on it.qid = c.value_qid
    where c.qid = i.qid and prop = 'P166' and c.point_on is not null
      and it.label ~* '^(national )?(baseball|hockey|pro football|naismith memorial basketball|canadian football|basketball) hall of fame') as hof,
  (select bool_and(a.code in ('nhl_jack_adams', 'nba_coach_of_the_year', 'mlb_manager_of_the_year', 'cfl_coach_of_the_year', 'nhl_gm_of_the_year'))
     from link l join core.award a on a.code = l.award_code where l.qid = i.qid)
   and not exists (select 1 from c where c.qid = i.qid and prop = 'P54') as staff_only,
  (select bool_and(l.award_code = 'nhl_gm_of_the_year') from link l where l.qid = i.qid) as exec_only
from legacy_people.item i join want using (qid) where i.label is not null;

create temp table place on commit drop as
select it.qid, it.label,
       (select value_lat from c where c.qid = it.qid and prop = 'P625' limit 1) as lat,
       (select value_lon from c where c.qid = it.qid and prop = 'P625' limit 1) as lon,
       (select rc.country_code from c cc join ref.country rc on rc.country_code = cc.value_text
         where cc.prop = 'P297' and cc.qid = coalesce((select x.value_qid from c x where x.qid = it.qid and x.prop = 'P17'
                                                         order by (x.rank = 'preferred') desc, x.n limit 1), it.qid) limit 1) as country
from legacy_people.item it where it.qid in (select bp from pf union select dp from pf);

create temp table pf2 on commit drop as
select pf.*, b.label as birth_place, b.lat as birth_lat, b.lon as birth_lon, b.country as birth_country,
       d.label as death_place, d.country as death_country,
       (select rc.country_code from c join c k on k.qid = c.value_qid and k.prop = 'P297' join ref.country rc on rc.country_code = k.value_text
         where c.qid = pf.qid and c.prop = 'P27' order by (c.end_on is null) desc, (c.rank = 'preferred') desc, c.n limit 1) as nationality
from pf left join place b on b.qid = pf.bp left join place d on d.qid = pf.dp;

-- 3. People: found by their Wikidata number, made when new.
-- The people this step owns are the ones an award winner points at now (it is the only step that sets award_winner.person_id),
-- read before the links are cleared. A Wikidata key no award links to may belong to 179, 181, 184 or 187; this step never deletes those.
create temp table mine on commit drop as
select distinct w.person_id from core.award_winner w
join core.external_id x on x.entity_kind = 'person' and x.entity_id = w.person_id and x.source_id = (select source_id from wd)
where w.person_id is not null;

update core.award_winner set person_id = null
 where person_id in (select entity_id from core.external_id where entity_kind = 'person' and source_id = (select source_id from wd));
delete from core.roster_stint where source_id = (select source_id from wd);

create temp table pp on commit drop as
select pf.qid, coalesce(x.entity_id, nextval(pg_get_serial_sequence('core.person', 'person_id'))) as person_id, (x.entity_id is not null) as existed
from pf left join core.external_id x
  on x.entity_kind = 'person' and x.source_id = (select source_id from wd) and x.external_key = pf.qid;

-- A person this step linked to an award last run and no award links to now goes again, with the key. Only those: a Wikidata
-- person another step made (179 rosters, 181 statistics, 184 staff, 187 birth countries) has no award link from here and stays.
-- One that anything else uses (a stint or statistics line of any step, a career, another source's key from a merge, 185) stays too;
-- the delete is tried per person and a foreign key that objects leaves them in place.
create temp table gone on commit drop as
select x.entity_id from core.external_id x
where x.entity_kind = 'person' and x.source_id = (select source_id from wd) and x.external_key not in (select qid from want)
  and x.entity_id in (select person_id from mine)
  and not exists (select 1 from core.roster_stint r where r.person_id = x.entity_id)
  and not exists (select 1 from core.player_season_stat s where s.person_id = x.entity_id)
  and not exists (select 1 from core.person_career c where c.person_id = x.entity_id)
  and not exists (select 1 from core.award_winner w where w.person_id = x.entity_id)
  and not exists (select 1 from core.external_id y where y.entity_kind = 'person' and y.entity_id = x.entity_id and y.source_id <> x.source_id);
do $$
declare o record;
begin
  for o in select entity_id as person_id from gone loop
    begin
      delete from core.external_id where entity_kind = 'person' and entity_id = o.person_id and source_id = (select source_id from wd);
      delete from core.person where person_id = o.person_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;
end $$;

insert into core.person (person_id, full_name, kind, birth_date, birth_place, birth_country_code, birth_lat, birth_lon, death_date, death_place,
                         death_country_code, nationality_code, height_cm, handedness, throws_or_shoots, hall_of_fame_year, source_id)
overriding system value
select pp.person_id, pf2.full_name,
       case when pf2.exec_only and pf2.staff_only then 'executive' when pf2.staff_only then 'coach' else 'player' end,
       pf2.birth_date, pf2.birth_place, pf2.birth_country, pf2.birth_lat, pf2.birth_lon, pf2.death_date, pf2.death_place, pf2.death_country,
       pf2.nationality, pf2.height_cm, pf2.handedness, pf2.shoots, pf2.hof, (select source_id from wd)
from pf2 join pp using (qid) where pf2.full_name is not null
on conflict (person_id) do update set
  full_name = excluded.full_name,
  kind = case when excluded.kind <> 'player' and exists (select 1 from core.player_season_stat s where s.person_id = core.person.person_id) then 'player' else excluded.kind end,
  -- what Wikidata does not state stays as another source (or a merge, 185) gave it
  birth_date = coalesce(excluded.birth_date, core.person.birth_date), birth_place = coalesce(excluded.birth_place, core.person.birth_place),
  birth_country_code = coalesce(excluded.birth_country_code, core.person.birth_country_code),
  birth_lat = coalesce(excluded.birth_lat, core.person.birth_lat), birth_lon = coalesce(excluded.birth_lon, core.person.birth_lon),
  death_date = coalesce(excluded.death_date, core.person.death_date), death_place = coalesce(excluded.death_place, core.person.death_place),
  death_country_code = coalesce(excluded.death_country_code, core.person.death_country_code),
  nationality_code = coalesce(excluded.nationality_code, core.person.nationality_code), height_cm = coalesce(excluded.height_cm, core.person.height_cm),
  handedness = coalesce(excluded.handedness, core.person.handedness), throws_or_shoots = coalesce(excluded.throws_or_shoots, core.person.throws_or_shoots),
  hall_of_fame_year = coalesce(excluded.hall_of_fame_year, core.person.hall_of_fame_year), updated_at = now();

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', pp.person_id, (select source_id from wd), pp.qid from pp join core.person p using (person_id) where not pp.existed
on conflict do nothing;

update core.award_winner w set person_id = pp.person_id
from link l join pp using (qid) join core.person p on p.person_id = pp.person_id
where w.award_winner_id = l.award_winner_id;

-- 4. Teams: one roster_stint per person, team and season.
create temp table team_sport on commit drop as
select c.qid as team_qid,
       array_remove(array_agg(distinct case
         when si.label ~* 'ice hockey' then 'hockey' when si.label ~* '^(men''s |professional )?basketball' then 'basketball' when si.label ~* '^(professional )?baseball' then 'baseball'
         when si.label ~* '^american football' then 'american_football' when si.label ~* 'canadian football' then 'canadian_football' end), null) as sports,
       bool_or(si.label ~* '^gridiron') as gridiron
from c join legacy_people.item si on si.qid = c.value_qid where c.prop = 'P641' group by c.qid;

create temp table p54 on commit drop as
select c.qid, c.value_qid as team_qid, t.label as team_label, c.start_on, c.start_prec, c.end_on, c.end_prec,
       case when ts.gridiron then ts.sports || array['american_football', 'canadian_football'] else nullif(ts.sports, '{}') end as sports
from c join want using (qid) join legacy_people.item t on t.qid = c.value_qid left join team_sport ts on ts.team_qid = c.value_qid
where c.prop = 'P54' and c.start_on is not null and t.label is not null;

create temp table cand on commit drop as
select p.qid, p.team_qid, l.league_code, s.start_year, ts.team_season_id, ts.franchise_id,
       (ts.franchise_identity_id = i.franchise_identity_id) as strict
from p54 p cross join ref.league l
cross join lateral (select extract(year from p.start_on)::int
                           - case when l.league_code in ('nhl', 'nba') and p.start_prec >= 10 and extract(month from p.start_on) < 8 then 1 else 0 end as a) f
cross join lateral (select greatest(f.a, least(f.a + 30, case
         when p.end_on is null then f.a
         when l.league_code in ('nhl', 'nba') then extract(year from p.end_on)::int - case when p.end_prec >= 10 and extract(month from p.end_on) >= 8 then 0 else 1 end
         else extract(year from p.end_on)::int - case when p.end_prec >= 10 and extract(month from p.end_on) <= 3 then 1 else 0 end end)) as z) e
cross join lateral generate_series(f.a, e.z) y
join core.season s on s.league_code = l.league_code and s.start_year = y
join core.team_season ts on ts.season_id = s.season_id
join core.franchise_identity i on i.franchise_id = ts.franchise_id
where (p.sports is null or l.sport_code = any(p.sports))
  and legacy_wikipedia_awards.name_key(i.full_name) = legacy_wikipedia_awards.name_key(p.team_label);

-- The identity the franchise had that season wins; two franchises left standing for one season are not guessed.
-- A team that names no sport must fit one league only.
create temp table pick on commit drop as
with ranked as (
  select *, rank() over (partition by qid, team_qid, league_code, start_year order by strict desc) as r from cand),
one as (
  select *, count(*) over (partition by qid, team_qid, league_code, start_year) as n from ranked where r = 1),
lg as (select qid, team_qid, count(distinct league_code) as leagues from cand group by qid, team_qid)
select distinct o.qid, o.team_qid, o.league_code, o.start_year, o.team_season_id
from one o join lg using (qid, team_qid)
where o.n = 1 and (lg.leagues = 1 or exists (select 1 from p54 q where q.qid = o.qid and q.team_qid = o.team_qid and q.sports is not null));

insert into core.roster_stint (person_id, team_season_id, role, source_id)
select distinct pp.person_id, pick.team_season_id, 'player', (select source_id from wd)
from pick join pp using (qid);

select (select count(*) from core.person p join core.external_id x on x.entity_kind = 'person' and x.entity_id = p.person_id and x.source_id = (select source_id from wd)) as people,
       (select count(*) from core.person where birth_date is not null) as with_birth_date,
       (select count(*) from core.person where birth_lat is not null) as with_coordinates,
       (select count(*) from core.award_winner where person_id is not null) as winners_linked,
       (select count(*) from core.roster_stint where source_id = (select source_id from wd)) as roster_stints;
commit;
