-- core.team_season_leader: the club leaders (passing, rushing, receiving; offence for the BC Lions' 1958-81 combined table) that CFL club-season articles on English
-- Wikipedia (CC BY-SA 4.0) list, from legacy_wikipedia_cfl_leaders (migration 174; scripts/cfl_leaders/). Run from the repo root, after db/build/179 and 185 (it finds
-- people through the rosters and Wikidata ids they made) and migration 175. Rerunnable: the rows of this source are deleted and written again. Nothing else points at a
-- row (a row is keyed by team season, category and place in the article), so a rerun changes no id and every row comes back as it was.
--
-- A name is linked to a person ONLY where the match is certain (John, 2026-10-29: "don't do anything like linking unless you're absolutely positive on the match.
-- If we don't have ids or corroborating data, then just show the name"). Two ways, nothing else, never the name alone:
--   wikidata  the name links to an article of English Wikipedia, that article is a Wikidata item (or a merged one: legacy_rosters.redirect), and the item is the
--             Wikidata id of a person in core.external_id (source wikidata, entity_kind person, the Q-number). A person born after the season less 14 years or dead
--             before it is not accepted.
--   roster    the name is plain text, or links to an article that is no person of ours, and exactly one person on that club's roster that season (a player's
--             core.roster_stint on that team season) has that name (accents and punctuation ignored). Refused when the name links to an article whose Wikidata item
--             is another item than the one that person carries.
-- Every other name stays text, in its place in the table, and each club season with such names is one row of meta.data_issue (entity_kind 'cfl_leaders').
-- A club season is found as db/build/179 finds clubs: the club's name in the article's title, accents and punctuation ignored, db/seed/roster_team_alias.csv for
-- the spellings that differ, against the identities of the league's franchises; two team seasons left standing are not guessed.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia_cfl_leaders', 'English Wikipedia: CFL club leaders', 'dataset', 'CC BY-SA 4.0',
        'Club leaders from the club-season articles of English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', null, current_date,
        'The Passing, Rushing and Receiving tables (and the BC Lions'' Offensive leaders table) of "<season> <club> season" articles, as the articles write them, fetched through the MediaWiki API 2026-10-30; archived in legacy_files.raw_archive under wikipedia-cfl-leaders/. A name is linked to a person only through a Wikidata id or a roster, never by name alone (db/build/238).')
on conflict (code) do update set retrieved_on = current_date;
create temp table src on commit drop as select source_id from meta.source where code = 'wikipedia_cfl_leaders';
create temp table wd on commit drop as select source_id from meta.source where code = 'wikidata';

create function pg_temp.key(t text) returns text language sql immutable as $$ select legacy_wikipedia_awards.name_key(t) $$;

create temp table seed_alias (league text, label text, our_name text);
\copy seed_alias from 'db/seed/roster_team_alias.csv' with (format csv, header true)

-- ---- 1. The team season of each article ----------------------------------------------------------------------------------------------
create temp table art on commit drop as
select a.season, a.club, a.page_title, a.revid, pg_temp.key(a.club) as k from legacy_wikipedia_cfl_leaders.article a;

-- the club's name keys: its own, and the other spelling of a seed alias row either way round
create temp table art_k on commit drop as
select season, club, k from art
union select a.season, a.club, pg_temp.key(s.our_name) from art a join seed_alias s on s.league = 'cfl' and pg_temp.key(s.label) = a.k
union select a.season, a.club, pg_temp.key(s.label) from art a join seed_alias s on s.league = 'cfl' and pg_temp.key(s.our_name) = a.k;

create temp table fi on commit drop as
select i.franchise_id, i.franchise_identity_id, pg_temp.key(i.full_name) as k
from core.franchise_identity i join core.franchise_league fl on fl.franchise_id = i.franchise_id and fl.league_code = 'cfl';
create index on fi (k);

create temp table cand on commit drop as
select ak.season, ak.club, ts.team_season_id, bool_or(ts.franchise_identity_id = fi.franchise_identity_id) as strict
from art_k ak
join core.season s on s.league_code = 'cfl' and s.start_year = ak.season
join fi on fi.k = ak.k
join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = fi.franchise_id
group by ak.season, ak.club, ts.team_season_id;
create temp table ranked on commit drop as
select *, rank() over (partition by season, club order by strict desc) as r from cand;
create temp table ts_of on commit drop as
select season, club, min(team_season_id) as team_season_id from ranked where r = 1 group by season, club having count(*) = 1;

-- ---- 2. Each line's person ------------------------------------------------------------------------------------------------------------
create temp table ln on commit drop as
select t.team_season_id, a.season, a.club, a.page_title, a.revid, l.category, l.ord, l.name, l.link_title, l.stats,
       coalesce(rd.to_qid, lt.qid) as qid, pg_temp.key(l.name) as nk
from legacy_wikipedia_cfl_leaders.line l
join art a on a.season = l.season and a.club = l.club
join ts_of t on t.season = l.season and t.club = l.club
left join legacy_wikipedia_cfl_leaders.link_title lt on lt.title = l.link_title and lt.qid is not null and not lt.disambiguation and not lt.missing
left join legacy_rosters.redirect rd on rd.from_qid = lt.qid;
create index on ln (team_season_id);

-- the Wikidata id of each person of core
create temp table pq on commit drop as
select x.external_key as qid, x.entity_id as person_id from core.external_id x
where x.entity_kind = 'person' and x.source_id = (select source_id from wd);
create index on pq (qid);
create index on pq (person_id);

-- wikidata: the linked article's item is a person of core, alive in that season
create temp table by_wd on commit drop as
select ln.team_season_id, ln.category, ln.ord, pq.person_id
from ln join pq on pq.qid = ln.qid
join core.person p on p.person_id = pq.person_id
where (p.birth_date is null or ln.season >= extract(year from p.birth_date) + 14)
  and (p.death_date is null or ln.season <= extract(year from p.death_date));

-- roster: exactly one player of that club's season has the name, and he is not another Wikidata item than the one the name links to
create temp table rost on commit drop as
select distinct rs.team_season_id, p.person_id, pg_temp.key(p.full_name) as nk
from core.roster_stint rs join core.person p using (person_id)
where rs.role = 'player' and rs.team_season_id in (select team_season_id from ts_of);
create index on rost (team_season_id, nk);
create temp table by_roster on commit drop as
select ln.team_season_id, ln.category, ln.ord, min(r.person_id) as person_id
from ln join rost r on r.team_season_id = ln.team_season_id and r.nk = ln.nk
where not exists (select 1 from by_wd w where w.team_season_id = ln.team_season_id and w.category = ln.category and w.ord = ln.ord)
  and not (ln.qid is not null and exists (select 1 from pq where pq.person_id = r.person_id and pq.qid <> ln.qid))
group by ln.team_season_id, ln.category, ln.ord, r.nk
having count(distinct r.person_id) = 1;

-- ---- 3. Write ---------------------------------------------------------------------------------------------------------------------------
delete from core.team_season_leader where source_id = (select source_id from src);
insert into core.team_season_leader (team_season_id, category, ord, name, person_id, matched_by, qid, stats, source_id, source_key)
select distinct on (ln.team_season_id, ln.category, ln.ord)
       ln.team_season_id, ln.category, ln.ord, ln.name,
       coalesce(w.person_id, r.person_id),
       case when w.person_id is not null then 'wikidata' when r.person_id is not null then 'roster' end,
       case when w.person_id is not null then ln.qid end,
       ln.stats, (select source_id from src), 'enwiki:' || ln.page_title || '@' || ln.revid
from ln
left join by_wd w on w.team_season_id = ln.team_season_id and w.category = ln.category and w.ord = ln.ord
left join by_roster r on r.team_season_id = ln.team_season_id and r.category = ln.category and r.ord = ln.ord
order by ln.team_season_id, ln.category, ln.ord, ln.revid desc;

-- ---- 4. What was not placed, in meta.data_issue (rewritten each run) ------------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from src) and entity_kind = 'cfl_leaders';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'cfl_leaders', 'wikipedia_cfl_leaders:' || a.season || ':' || a.club,
       format('%s (cfl %s): %s', a.page_title, a.season, 'no team season of the league carries this club''s name that season'), 'No leaders from this article'
from art a where not exists (select 1 from ts_of t where t.season = a.season and t.club = a.club);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'cfl_leaders', 'wikipedia_cfl_leaders:' || a.season || ':' || a.club,
       format('%s (cfl %s): %s of %s names are shown as text, no certain match: %s', a.page_title, a.season, count(*) filter (where l.person_id is null), count(*),
              string_agg(l.category || ' ' || l.name || coalesce(' (links ' || ln.link_title || ')', ''), '; ' order by l.category, l.ord) filter (where l.person_id is null)),
       'Shown as text, not linked'
from core.team_season_leader l
join ln on ln.team_season_id = l.team_season_id and ln.category = l.category and ln.ord = l.ord
join art a on a.season = ln.season and a.club = ln.club
where l.source_id = (select source_id from src)
group by a.season, a.club, a.page_title
having count(*) filter (where l.person_id is null) > 0;

select category, count(*) as lines, count(person_id) as linked, count(*) filter (where matched_by = 'wikidata') as by_wikidata,
       count(*) filter (where matched_by = 'roster') as by_roster, count(distinct team_season_id) as club_seasons
from core.team_season_leader where source_id = (select source_id from src) group by rollup (category) order by 1;
commit;
