-- Players of the NBA and CFL clubs, and of the NFL (1920-72), AFL and AAFC clubs (Wikipedia rosters only: scripts/rosters/nflwp_*.py), with their team seasons: core.person and core.roster_stint from legacy_rosters (migration 092;
-- scripts/rosters/). Rerunnable, and safe after scripts/build_core.sh has rebuilt franchises and team seasons (run it after 177): every key
-- it uses is stable. Two sources, both open:
--   * Wikidata (CC0): the "member of sports team" (P54) statements of the league's players, for the club items of the league
--     (legacy_rosters.league_team), with their start and end;
--   * English Wikipedia (CC BY-SA 4.0): the Roster section and the regular-season player statistics table of each club-season article
--     (legacy_rosters.wp_roster; the article title and revision id are in legacy_rosters.wp_article), each name linked to its article and so to its
--     Wikidata item (wp_title).
-- Both give a (person, club, season); the union is written. Rules:
--  * A person is a Wikidata item (core.external_id: entity_kind 'person', source wikidata, the Q-number), found by that key and made when new.
--    A person is made only when at least one season is placed; one already in core keeps their name and every value they have, and fills
--    only what is empty. Two records of one human are merged by db/build/185_person_merge.sql, never here.
--  * A roster_stint (role 'player', source wikidata_rosters) is one season of one club. The club is a franchise whose identity carries the
--    club's name (accents and punctuation ignored; db/seed/roster_team_alias.csv adds the spellings that differ): Wikidata's English label of the
--    club item, or the name the Wikipedia article is about. When the name fits two franchises, the one whose name that season is the name
--    wins, else the one now carrying it; two left standing are not guessed. A season before the player was 14 or after he died is not placed.
--  * A Wikidata statement with no start has no seasons to place. With no end it is the start season only. NBA seasons run autumn to spring:
--    a start from January to May belongs to the season that began the year before (a June or July signing is for the coming one), and an end
--    year with no month ends the season that began the year before; CFL seasons are one calendar year. Where the club-season article lists
--    five or more players, only the article is used for that team season.
--  * A Wikipedia name is used only when its article is a human who is a Wikidata player of the league or whose occupation or sport fits it,
--    and the roster's date of birth, if it gives one, is the item's. Anything else is logged, not guessed.
--  * Already-placed pairs (a stint another step wrote for the same person and team season) are not written again.
--  * What could not be placed is logged in meta.data_issue (entity_kind 'roster_team', 'roster_article', 'roster_player').
--  * The position is not set here: db/build/186_person_positions.sql turns the P413 statements into position codes.
--  * Only the properties scripts/rosters/wd_fetch.py fetches are used: nothing about ethnicity, religion, health, sex or gender, family
--    or politics was fetched, and none is stored.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikidata_rosters', 'Wikidata and Wikipedia club rosters', 'dataset', 'CC0 1.0 and CC BY-SA 4.0',
        'Players and the clubs they played for from Wikidata (www.wikidata.org), CC0, and from the roster tables of club-season articles on English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://www.wikidata.org', null, current_date,
        'Wikidata items with a "member of sports team" (P54) statement for a club of the NBA or the CFL, with the statement''s start and end, and the Roster section and regular-season player statistics table of each "<season> <club> season" article, fetched through the Wikidata and MediaWiki APIs 2026-10-14; archived in legacy_files.raw_archive under wikidata_rosters/.')
on conflict (code) do update set retrieved_on = current_date;
create temp table src on commit drop as select source_id from meta.source where code = 'wikidata_rosters';
create temp table wd on commit drop as select source_id from meta.source where code = 'wikidata';

drop table if exists pg_temp.seed_alias;
create temp table seed_alias (league text, label text, our_name text);
\copy seed_alias from 'db/seed/roster_team_alias.csv' with (format csv, header true)

-- Statements, with merged items followed and deprecated statements dropped.
create temp table c on commit drop as
select cl.qid, cl.prop, cl.n, cl.rank, coalesce(r.to_qid, cl.value_qid) as value_qid, cl.value_on, cl.value_prec, cl.value_num, cl.unit_qid,
       cl.value_lat, cl.value_lon, cl.value_text, cl.start_on, cl.start_prec, cl.end_on, cl.end_prec
from legacy_rosters.claim cl left join legacy_rosters.redirect r on r.from_qid = cl.value_qid
where coalesce(cl.rank, 'normal') <> 'deprecated';
create index on c (qid, prop);
analyze c;

create temp table human on commit drop as select distinct qid from c where prop = 'P31' and value_qid = 'Q5';
create index on human (qid);
create temp table born on commit drop as select qid, extract(year from min(value_on))::int as y from c where prop = 'P569' group by qid;
create temp table born_on on commit drop as select qid, min(value_on) as d from c where prop = 'P569' and value_prec >= 11 group by qid;
create temp table died on commit drop as select qid, extract(year from min(value_on))::int as y from c where prop = 'P570' group by qid;

-- The players of each league Wikidata lists (a merged item under its new number).
create temp table lp on commit drop as
select distinct p.league_code, coalesce(r.to_qid, p.qid) as qid
from legacy_rosters.league_player p left join legacy_rosters.redirect r on r.from_qid = p.qid
where coalesce(r.to_qid, p.qid) in (select qid from human);
create index on lp (qid);

-- What occupation or sport makes an item a player of a league, for names that come from Wikipedia.
create temp table signal (league_code text, prop text, value_qid text) on commit drop;
insert into signal values
  ('nba', 'P106', 'Q3665646'), ('nba', 'P641', 'Q5372'),
  ('cfl', 'P106', 'Q19841381'), ('cfl', 'P106', 'Q14128148'), ('cfl', 'P106', 'Q19204627'), ('cfl', 'P641', 'Q248534'), ('cfl', 'P641', 'Q41323'),
  -- the NFL (1920-72), the AFL and the AAFC: American football player, gridiron football player; the sport American football. These leagues have no
  -- Wikidata team lists (legacy_rosters.league_player is empty for them), so a name counts only through this signal or an item that states neither.
  ('nfl', 'P106', 'Q19204627'), ('nfl', 'P106', 'Q14128148'), ('nfl', 'P641', 'Q41323'),
  ('afl', 'P106', 'Q19204627'), ('afl', 'P106', 'Q14128148'), ('afl', 'P641', 'Q41323'),
  ('aafc', 'P106', 'Q19204627'), ('aafc', 'P106', 'Q14128148'), ('aafc', 'P641', 'Q41323'),
  -- the NHL's predecessor and rival leagues (NHA, PCHA, WCHL, WHA): ice hockey player; the sport ice hockey. Their seasons run autumn to spring like the NBA's.
  ('nha', 'P106', 'Q11774891'), ('nha', 'P641', 'Q41466'), ('pcha', 'P106', 'Q11774891'), ('pcha', 'P641', 'Q41466'),
  ('wchl', 'P106', 'Q11774891'), ('wchl', 'P641', 'Q41466'), ('wha', 'P106', 'Q11774891'), ('wha', 'P641', 'Q41466');

-- ---- 1. The club names, and the seasons each source puts a player in them --------------------------------------------------------
create function pg_temp.key(t text) returns text language sql immutable as $$ select legacy_wikipedia_awards.name_key(t) $$;

create temp table team_name on commit drop as
select lt.league_code, lt.team_qid, lt.label, pg_temp.key(lt.label) as k from legacy_rosters.league_team lt
union
select a.league, lt.team_qid, lt.label, pg_temp.key(a.our_name) from seed_alias a join legacy_rosters.league_team lt on lt.league_code = a.league and lt.label = a.label;
create index on team_name (league_code, team_qid);
create temp table team_key on commit drop as select distinct league_code, team_qid, k from team_name;
create index on team_key (league_code, team_qid);

create temp table st on commit drop as
select tn.league_code, c.qid, c.value_qid as team_qid, tn.label, c.start_on, c.start_prec, c.end_on, c.end_prec, c.n
from c join lp on lp.qid = c.qid
join (select distinct league_code, team_qid, label from legacy_rosters.league_team) tn on tn.team_qid = c.value_qid and tn.league_code = lp.league_code
where c.prop = 'P54';

-- Wikidata: the seasons each dated statement covers, once for each spelling of the club's name
create temp table want_y on commit drop as
select p.league_code, p.qid, p.team_qid, p.label, tk.k, y, 'wikidata'::text as origin
from st p
join team_key tk on tk.league_code = p.league_code and tk.team_qid = p.team_qid
cross join lateral (select extract(year from p.start_on)::int
                           - case when p.league_code in ('nba', 'nha', 'pcha', 'wchl', 'wha') and p.start_prec >= 10 and extract(month from p.start_on) < 6 then 1 else 0 end as a) f
cross join lateral (select greatest(f.a, least(f.a + 30, case
         when p.end_on is null then f.a
         when p.league_code in ('nba', 'nha', 'pcha', 'wchl', 'wha') then extract(year from p.end_on)::int - case when p.end_prec >= 10 and extract(month from p.end_on) >= 8 then 0 else 1 end
         else extract(year from p.end_on)::int - case when p.end_prec >= 10 and extract(month from p.end_on) <= 3 then 1 else 0 end end)) as z) e
cross join lateral generate_series(f.a, e.z) y
where p.start_on is not null;

-- Wikipedia: a listed name whose article is a player of the league
create temp table wp0 on commit drop as
select r.league_code, r.season, r.club, r.src, r.ord, r.name, r.link_title, coalesce(rd.to_qid, t.qid) as qid, r.dob, r.number,
       case when t.qid is null then 'the name links to no Wikidata item'
            when t.disambiguation then 'the name links to a disambiguation page'
            when coalesce(rd.to_qid, t.qid) not in (select qid from human) then 'the item is not a human'
            -- a date of birth a year or more off belongs to someone else; a day, month or one year of difference is a slip in one of the two sources
            when r.dob is not null and bo.d is not null and abs(extract(year from r.dob) - extract(year from bo.d)) > 1 then 'the roster''s date of birth differs from the item''s'
            -- an item that states an occupation or a sport, none of them the league's, is someone else; an item that states neither (a stub) is taken
            when not (exists (select 1 from lp where lp.league_code = r.league_code and lp.qid = coalesce(rd.to_qid, t.qid))
                      or exists (select 1 from signal g join c on c.prop = g.prop and c.value_qid = g.value_qid
                                  where g.league_code = r.league_code and c.qid = coalesce(rd.to_qid, t.qid)))
                 and exists (select 1 from c where c.qid = coalesce(rd.to_qid, t.qid) and c.prop in ('P106', 'P641'))
                 then 'the item is not a player of the league'
            when yb.y is not null and r.season - yb.y not between 15 and 52 then 'the birth year does not fit the season' end as why
from legacy_rosters.wp_roster r
left join legacy_rosters.wp_title t on t.title = r.link_title
left join legacy_rosters.redirect rd on rd.from_qid = t.qid
left join born_on bo on bo.qid = coalesce(rd.to_qid, t.qid)
left join born yb on yb.qid = coalesce(rd.to_qid, t.qid)
where r.link_title is not null;

-- A name whose link failed but whose date of birth is given: the one Wikidata player of the league with that name (accents ignored) and that birth date.
create temp table lp_name on commit drop as
select lp.league_code, lp.qid, pg_temp.key(i.label) as k, b.d from lp join legacy_rosters.item i on i.qid = lp.qid join born_on b on b.qid = lp.qid;
create index on lp_name (league_code, k, d);

-- ... or, with no date of birth, the one Wikidata player of the league with that name who has a statement for this very club.
create temp table lp_club on commit drop as
select distinct lp.league_code, lp.qid, pg_temp.key(i.label) as k, tk.k as club_k
from lp join legacy_rosters.item i on i.qid = lp.qid
join (select distinct league_code, qid, team_qid from st) s on s.qid = lp.qid and s.league_code = lp.league_code
join team_key tk on tk.league_code = s.league_code and tk.team_qid = s.team_qid;
create index on lp_club (league_code, k, club_k);

create temp table wp_ok on commit drop as
select w.league_code, w.season, w.club, w.src, w.ord, w.name, w.link_title, coalesce(a.qid, b.qid, w.qid) as qid, w.dob, w.number,
       case when a.qid is not null or b.qid is not null then null else w.why end as why
from wp0 w
left join lateral (
  select min(n.qid) as qid from lp_name n
  where w.why is not null and w.dob is not null and n.league_code = w.league_code and n.k = pg_temp.key(w.name) and n.d = w.dob
  having count(*) = 1) a on true
left join lateral (
  select min(n.qid) as qid from lp_club n
  where w.why is not null and w.dob is null and a.qid is null and n.league_code = w.league_code and n.k = pg_temp.key(w.name) and n.club_k = pg_temp.key(w.club)
  having count(distinct n.qid) = 1) b on true;
create index on wp_ok (league_code, season, club);

insert into want_y (league_code, qid, team_qid, label, k, y, origin)
select distinct league_code, qid, null, club, pg_temp.key(club), season, 'wikipedia' from wp_ok where why is null;

-- ---- 2. Which franchise each club is, season by season ----------------------------------------------------------------------------
create temp table fname on commit drop as
select i.franchise_id, i.franchise_identity_id, pg_temp.key(i.full_name) as k, fl.league_code,
       (upper(i.valid_during) is null or upper(i.valid_during) = (select max(upper(i2.valid_during)) from core.franchise_identity i2 where i2.franchise_id = i.franchise_id)) as latest
from core.franchise_identity i join (select distinct franchise_id, league_code from core.franchise_league) fl using (franchise_id);
create index on fname (league_code, k);

-- one row per slot and team season (a franchise whose name appears in two of its identities counts once, at its best fit)
create temp table cand on commit drop as
select distinct on (w.qid, w.k, w.league_code, w.y, w.origin, ts.team_season_id)
       w.league_code, w.qid, w.team_qid, w.k, w.y, w.origin, ts.team_season_id, ts.franchise_id,
       coalesce(ts.franchise_identity_id = f.franchise_identity_id, false) as strict, f.latest
from want_y w
join fname f on f.league_code = w.league_code and f.k = w.k
join core.season s on s.league_code = w.league_code and s.start_year = w.y
join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = f.franchise_id
left join born b on b.qid = w.qid left join died d on d.qid = w.qid
where (b.y is null or w.y >= b.y + 14) and (d.y is null or w.y <= d.y)
order by w.qid, w.k, w.league_code, w.y, w.origin, ts.team_season_id,
         coalesce(ts.franchise_identity_id = f.franchise_identity_id, false) desc, f.latest desc;

create temp table ranked on commit drop as
select *, rank() over (partition by qid, k, league_code, y, origin order by strict desc, latest desc) as r,
       count(*) over (partition by qid, k, league_code, y, origin, strict, latest) as n
from cand;
-- A club season whose article lists five or more players is read from the article alone: Wikidata's statements for that season are mostly years
-- off by one or a club away (a signing in July counted for the season before), and the roster is the more exact list. They are counted in the log.
create temp table wp_ts on commit drop as
select team_season_id from ranked where origin = 'wikipedia' and r = 1 and n = 1 group by team_season_id having count(distinct qid) >= 5;
create temp table pick on commit drop as
select distinct qid, league_code, y, team_season_id, origin, k from ranked
where r = 1 and n = 1 and (origin = 'wikipedia' or team_season_id not in (select team_season_id from wp_ts));
create index on pick (qid);

-- ---- 3. Who is placed, and what Wikidata states about them ------------------------------------------------------------------------
create temp table placed on commit drop as select distinct qid from pick;

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
  (select regexp_replace(replace(it.label, 'ambidextrous', 'both'), '-handed$', '') from c join legacy_rosters.item it on it.qid = c.value_qid
    where c.qid = i.qid and prop = 'P741' order by (rank = 'preferred') desc, n limit 1) as handedness
from legacy_rosters.item i join placed using (qid) where i.label is not null;

create temp table place on commit drop as
select it.qid, it.label,
       (select value_lat from c where c.qid = it.qid and prop = 'P625' limit 1) as lat,
       (select value_lon from c where c.qid = it.qid and prop = 'P625' limit 1) as lon,
       (select rc.country_code from c cc join ref.country rc on rc.country_code = cc.value_text
         where cc.prop = 'P297' and cc.qid = coalesce((select x.value_qid from c x where x.qid = it.qid and x.prop = 'P17'
                                                         order by (x.rank = 'preferred') desc, x.n limit 1), it.qid) limit 1) as country
from legacy_rosters.item it where it.qid in (select bp from pf union select dp from pf);

create temp table pf2 on commit drop as
select pf.*, b.label as birth_place, b.lat as birth_lat, b.lon as birth_lon, b.country as birth_country,
       d.label as death_place, d.country as death_country,
       (select rc.country_code from c join c k on k.qid = c.value_qid and k.prop = 'P297' join ref.country rc on rc.country_code = k.value_text
         where c.qid = pf.qid and c.prop = 'P27' order by (c.end_on is null) desc, (c.rank = 'preferred') desc, c.n limit 1) as nationality
from pf left join place b on b.qid = pf.bp left join place d on d.qid = pf.dp;

-- ---- 4. People: found by their Wikidata number, made when new ---------------------------------------------------------------------
-- A stint keeps its id on a rerun: remembered by person and team season before the delete, given back on insert.
create temp table old_stint on commit drop as
select person_id, team_season_id, min(roster_stint_id) as roster_stint_id from core.roster_stint where source_id = (select source_id from src) group by 1, 2;
delete from core.roster_stint where source_id = (select source_id from src);

create temp table pp on commit drop as
select pf2.qid, coalesce(x.entity_id, nextval(pg_get_serial_sequence('core.person', 'person_id'))) as person_id, (x.entity_id is not null) as existed
from pf2 left join core.external_id x
  on x.entity_kind = 'person' and x.source_id = (select source_id from wd) and x.external_key = pf2.qid;

insert into core.person (person_id, full_name, kind, birth_date, birth_place, birth_country_code, birth_lat, birth_lon, death_date, death_place,
                         death_country_code, nationality_code, height_cm, handedness, source_id)
overriding system value
select pp.person_id, pf2.full_name, 'player', pf2.birth_date, pf2.birth_place, pf2.birth_country, pf2.birth_lat, pf2.birth_lon, pf2.death_date,
       pf2.death_place, pf2.death_country, pf2.nationality, pf2.height_cm, pf2.handedness, (select source_id from wd)
from pf2 join pp using (qid) where not pp.existed
on conflict (person_id) do nothing;

-- a person already in core keeps what they have; only the empty fields are filled
update core.person p set
  birth_date = coalesce(p.birth_date, pf2.birth_date), birth_place = coalesce(p.birth_place, pf2.birth_place),
  birth_country_code = coalesce(p.birth_country_code, pf2.birth_country),
  birth_lat = coalesce(p.birth_lat, pf2.birth_lat), birth_lon = coalesce(p.birth_lon, pf2.birth_lon),
  death_date = coalesce(p.death_date, pf2.death_date), death_place = coalesce(p.death_place, pf2.death_place),
  death_country_code = coalesce(p.death_country_code, pf2.death_country),
  nationality_code = coalesce(p.nationality_code, pf2.nationality), height_cm = coalesce(p.height_cm, pf2.height_cm),
  handedness = coalesce(p.handedness, pf2.handedness),
  kind = case when p.kind in ('coach', 'executive') then 'player' else p.kind end, updated_at = now()
from pf2 join pp using (qid)
where pp.existed and p.person_id = pp.person_id
  and (p.birth_date is null or p.birth_place is null or p.birth_country_code is null or p.nationality_code is null or p.height_cm is null
       or p.handedness is null or (p.death_date is null and pf2.death_date is not null) or p.kind in ('coach', 'executive'));

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', pp.person_id, (select source_id from wd), pp.qid from pp join core.person p using (person_id) where not pp.existed
on conflict do nothing;

-- ---- 5. Teams: one roster_stint per person and team season ------------------------------------------------------------------------
-- the jersey number the club's roster table gives (a number of one or two digits)
create temp table wp_num on commit drop as
select distinct on (qid, league_code, season, club) qid, league_code, season, pg_temp.key(club) as k, number::smallint as num
from wp_ok where why is null and src = 'roster' and number ~ '^[0-9]{1,2}$' order by qid, league_code, season, club, ord;

insert into core.roster_stint (roster_stint_id, person_id, team_season_id, role, jersey_number, source_id)
overriding system value
select coalesce(o.roster_stint_id, nextval(pg_get_serial_sequence('core.roster_stint', 'roster_stint_id'))), s.person_id, s.team_season_id, 'player', s.num, (select source_id from src)
from (
select distinct on (pp.person_id, pick.team_season_id) pp.person_id, pick.team_season_id, n.num
from pick join pp using (qid)
left join wp_num n on n.qid = pick.qid and n.league_code = pick.league_code and n.season = pick.y and n.k = pick.k
where not exists (select 1 from core.roster_stint r where r.person_id = pp.person_id and r.team_season_id = pick.team_season_id and r.role = 'player')
order by pp.person_id, pick.team_season_id, (n.num is null)) s
left join old_stint o on o.person_id = s.person_id and o.team_season_id = s.team_season_id;

-- A person an earlier run made that this run places nowhere (a source changed its mind) and who holds nothing else goes again, with the key.
-- A person anything else points at is kept: the delete is tried per person and a foreign key that objects leaves them in place.
do $$
declare o record;
begin
  for o in
    select x.entity_id as person_id from core.external_id x
    where x.entity_kind = 'person' and x.source_id = (select source_id from wd)
      and (x.external_key in (select qid from lp) or x.external_key in (select qid from wp_ok where qid is not null))
      and not exists (select 1 from core.roster_stint r where r.person_id = x.entity_id)
      and not exists (select 1 from core.player_season_stat s where s.person_id = x.entity_id)
      and not exists (select 1 from core.award_winner w where w.person_id = x.entity_id)
      and not exists (select 1 from core.person_career c where c.person_id = x.entity_id)
      and not exists (select 1 from core.external_id y where y.entity_kind = 'person' and y.entity_id = x.entity_id and y.source_id <> x.source_id)
  loop
    begin
      delete from core.external_id where entity_kind = 'person' and entity_id = o.person_id;
      delete from core.person where person_id = o.person_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;
end $$;

-- ---- 6. What could not be placed ----------------------------------------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from src) and entity_kind in ('roster_team', 'roster_article', 'roster_player');

-- a Wikidata club: counts of statements and seasons
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'roster_team', 'wikidata_rosters:' || t.league_code || ':' || t.team_qid,
       format('%s (%s, Wikidata %s): %s statements, %s with no start date, %s season-slots asked for, %s placed, %s of those set aside because the club-season article lists the roster, %s with no team season of a franchise carrying the name, %s fitting two franchises',
              t.label, t.league_code, t.team_qid, t.statements, t.undated, t.slots, t.placed, t.set_aside, t.no_season, t.ambiguous),
       case when t.franchise_known then 'Placed where a franchise and season fit; the rest left out' else 'Club not found among the league''s franchises: add its spelling to db/seed/roster_team_alias.csv' end
from (
  select tn.league_code, tn.team_qid, tn.label,
         (select count(*) from st s where s.league_code = tn.league_code and s.team_qid = tn.team_qid) as statements,
         (select count(*) from st s where s.league_code = tn.league_code and s.team_qid = tn.team_qid and s.start_on is null) as undated,
         (select count(distinct (w.qid, w.y)) from want_y w where w.origin = 'wikidata' and w.league_code = tn.league_code and w.team_qid = tn.team_qid) as slots,
         (select count(distinct (r.qid, r.y)) from ranked r where r.origin = 'wikidata' and r.league_code = tn.league_code and r.team_qid = tn.team_qid and r.r = 1 and r.n = 1) as placed,
         (select count(distinct (r.qid, r.y)) from ranked r where r.origin = 'wikidata' and r.league_code = tn.league_code and r.team_qid = tn.team_qid and r.r = 1 and r.n = 1
             and r.team_season_id in (select team_season_id from wp_ts)
             and not exists (select 1 from ranked x where x.origin = 'wikipedia' and x.r = 1 and x.n = 1 and x.qid = r.qid and x.team_season_id = r.team_season_id)) as set_aside,
         (select count(distinct (w.qid, w.y)) from want_y w where w.origin = 'wikidata' and w.league_code = tn.league_code and w.team_qid = tn.team_qid
             and not exists (select 1 from cand x where (x.qid, x.team_qid, x.y, x.origin) = (w.qid, w.team_qid, w.y, w.origin))) as no_season,
         (select count(distinct (x.qid, x.y)) from ranked x where x.origin = 'wikidata' and x.league_code = tn.league_code and x.team_qid = tn.team_qid and x.r = 1 and x.n > 1) as ambiguous,
         exists (select 1 from team_key tk join fname f on f.league_code = tk.league_code and f.k = tk.k where tk.league_code = tn.league_code and tk.team_qid = tn.team_qid) as franchise_known
  from (select distinct league_code, team_qid, label from legacy_rosters.league_team) tn) t
where t.undated > 0 or t.placed < t.slots or not t.franchise_known;

-- a Wikipedia article with no roster, or whose club is not among the franchises
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'roster_article', 'wikipedia_rosters:' || a.league_code || ':' || a.season || ':' || a.club,
       format('%s (%s %s): %s', a.page_title, a.league_code, a.season,
              case when a.missing then 'no such article' when not a.has_roster then 'the article has no Roster section we can read'
                   when not exists (select 1 from fname f where f.league_code = a.league_code and f.k = pg_temp.key(a.club)) then 'the club is not among the league''s franchises'
                   else 'the roster fits no team season' end),
       'No roster read from this article'
from legacy_rosters.wp_article a
where a.missing or not a.has_roster
   or not exists (select 1 from ranked r where r.origin = 'wikipedia' and r.league_code = a.league_code and r.y = a.season and r.k = pg_temp.key(a.club) and r.r = 1 and r.n = 1);

-- names in a roster that could not be used, one row per league and reason with examples
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'roster_player', 'wikipedia_rosters:' || league_code || ':' || why,
       format('%s roster entries (%s distinct names) in %s: %s. Examples: %s', n, names, league_code, why, examples), 'Left out'
from (select league_code, why, count(*) as n, count(distinct link_title) as names,
             (array_to_string((array_agg(distinct link_title order by link_title))[1:25], '; ')) as examples
      from wp_ok where why is not null group by league_code, why) z;

select s.league_code, count(*) as stints, count(distinct r.person_id) as players, count(distinct ts.season_id) as seasons
from core.roster_stint r join core.team_season ts using (team_season_id) join core.season s using (season_id)
where r.source_id = (select source_id from src) group by s.league_code order by 1;
commit;
