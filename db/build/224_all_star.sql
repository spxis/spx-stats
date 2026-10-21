-- Every All-Star Game into core.all_star_event, core.all_star_game, core.all_star_mvp and core.all_star_selection, from legacy_wikipedia_all_star (English Wikipedia,
-- CC BY-SA 4.0; migrations 144 and 145, scripts/all_star/). Run from the repo root, after the five leagues are built (100, 145, 146, 147, 150, 151, 216), the
-- people (177, 179 to 181) and the venues (176, 193).
--  * Keys are the league, the calendar year, the event and game numbers (and the line number of a roster), so a rerun changes no id: rows are updated in place, and
--    only the rows this step wrote (source wikipedia) are removed when the article no longer lists them. Nothing in core.game is written.
--  * A season is found from the day (the NHL and NBA season that starts in the autumn before a winter game, a Pro Bowl in January or February belongs to the season
--    before it, an MLB, WNBA or CFL game to its own year); a cancelled event has no day and takes the season of its year.
--  * A venue is the core.venue whose Wikidata id (its source_key) the venue's article has (legacy_wikidata_dump), else the one venue whose name in
--    core.brand_venue_name is the printed name in that year; venue_wikidata_id is set only for a venue with a place on the map (the site's venue pages).
--  * A player is linked to core.person by the Wikidata id of his article (a link's title is looked up in legacy_wikidata_dump.person, then core.external_id), else by
--    his name when exactly one person of that name has a stat line or roster stint in a team season of that league and season. Never on a name alone.
--  * Where this step and another source disagree (MLB: Retrosheet's All-Star games) the date, score or attendance goes to meta.data_issue as "differs", without the
--    other source's numbers.
-- Rerunnable.
begin;

create or replace function pg_temp.nk(t text) returns text language sql immutable as
$$ select regexp_replace(translate(lower(t), 'éèêëáàâäíîïóôöúûüçñšžøåāēīō', 'eeeeaaaaiiiooouuucnszoaaeio'), '[^a-z]', '', 'g') $$;

create temp table wp as select source_id from meta.source where code = 'wikipedia';

-- The events with their season.
create temp table ev as
select e.league, e.year, e.event_no, e.article, e.status, e.status_reason, e.format, e.first_day, e.last_day, e.venue_name, e.venue_title, e.city_text, e.host_name,
       e.attendance,
       coalesce(p.revision_id, (select revision_id from legacy_wikipedia_all_star.page l where l.kind = 'list' and l.league = e.league limit 1)) as revision_id,
       case when e.league in ('nhl', 'nba') then coalesce(extract(year from e.first_day)::int - case when extract(month from e.first_day) < 9 then 1 else 0 end, e.year - 1)
            when e.league = 'nfl' then coalesce(extract(year from e.first_day)::int - case when extract(month from e.first_day) < 6 then 1 else 0 end, e.year)
            else coalesce(extract(year from e.first_day)::int, e.year) end as start_year
from legacy_wikipedia_all_star.event e
left join legacy_wikipedia_all_star.page p on p.title = e.article;

create temp table ev_s as
select ev.*, s.season_id
from ev left join core.season s on s.league_code = ev.league and s.start_year = ev.start_year;

-- Venue: by the article's Wikidata id.
create temp table vt as
select distinct v.venue_title as title from legacy_wikipedia_all_star.event v where v.venue_title is not null;
create temp table vq as
select vt.title, i.qid
from vt join legacy_wikidata_dump.item i on i.doc -> 'sl' ->> 'enwiki' = vt.title;

create temp table ev_v as
select ev_s.*, coalesce(
         (select cv.venue_id from vq join core.venue cv on cv.source_key = vq.qid where vq.title = ev_s.venue_title limit 1),
         (select min(cv.venue_id) from (select n.wikidata_id from core.brand_venue_name n
                                         where ev_s.venue_name is not null and pg_temp.nk(n.name) = pg_temp.nk(ev_s.venue_name)
                                           and (n.from_year is null or n.from_year <= ev_s.year) and (n.until_year is null or n.until_year >= ev_s.year)
                                         group by n.wikidata_id) w
                    join core.venue cv on cv.source_key = w.wikidata_id
          having count(*) = 1)) as venue_id
from ev_s;

-- Host club: the identity that season whose full name is the printed host.
create temp table ev_h as
select ev_v.*, (select min(ts.franchise_id) from core.team_season ts join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id
                where ts.season_id = ev_v.season_id and pg_temp.nk(fi.full_name) = pg_temp.nk(ev_v.host_name)
                having count(distinct ts.franchise_id) = 1) as host_franchise_id
from ev_v;

insert into core.all_star_event (league_code, year, event_no, season_id, status, status_reason, format, first_day, last_day, venue_name, city_text, venue_id,
                                 venue_wikidata_id, host_name, host_franchise_id, attendance, source_id, source_key)
select h.league, h.year, h.event_no, h.season_id, h.status, h.status_reason, h.format, h.first_day, h.last_day, h.venue_name, h.city_text, h.venue_id,
       (select cv.source_key from core.venue cv where cv.venue_id = h.venue_id and cv.source_key ~ '^Q[0-9]+$' and cv.latitude is not null),
       h.host_name, h.host_franchise_id, h.attendance, (select source_id from wp),
       'wikipedia:all_star:' || h.league || ':' || h.year || ':' || h.event_no || '@' || h.revision_id
from ev_h h
on conflict (league_code, year, event_no) do update set
  season_id = excluded.season_id, status = excluded.status, status_reason = excluded.status_reason, format = excluded.format, first_day = excluded.first_day,
  last_day = excluded.last_day, venue_name = excluded.venue_name, city_text = excluded.city_text, venue_id = excluded.venue_id,
  venue_wikidata_id = excluded.venue_wikidata_id, host_name = excluded.host_name, host_franchise_id = excluded.host_franchise_id, attendance = excluded.attendance,
  source_id = excluded.source_id, source_key = excluded.source_key;

delete from core.all_star_event e where e.source_id = (select source_id from wp)
  and not exists (select 1 from legacy_wikipedia_all_star.event l where l.league = e.league_code and l.year = e.year and l.event_no = e.event_no);

-- Games. A side that is one club of that season (the NHL's early games, the CFL's, the Pro Bowl's first ones) points at its franchise.
create temp table side as
select g.league, g.year, g.event_no, g.game_no, s.n as side, case s.n when 1 then g.side1 else g.side2 end as name, h.season_id
from legacy_wikipedia_all_star.game g cross join (values (1), (2)) s(n)
join ev_h h on h.league = g.league and h.year = g.year and h.event_no = g.event_no;
create temp table side_f as
select sd.*, (select min(ts.franchise_id) from core.team_season ts join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id
              where ts.season_id = sd.season_id and (pg_temp.nk(fi.full_name) = pg_temp.nk(sd.name) or pg_temp.nk(fi.nickname) = pg_temp.nk(sd.name))
              having count(distinct ts.franchise_id) = 1) as franchise_id
from side sd;

insert into core.all_star_game (league_code, year, event_no, game_no, stage, side1_name, side1_score, side1_franchise_id, side2_name, side2_score, side2_franchise_id,
                                decided_by, source_id, source_key)
select g.league, g.year, g.event_no, g.game_no, g.stage, g.side1, g.score1, a.franchise_id, g.side2, g.score2, b.franchise_id, g.decided_by, (select source_id from wp),
       'wikipedia:all_star:' || g.league || ':' || g.year || ':' || g.event_no || ':' || g.game_no
from legacy_wikipedia_all_star.game g
join side_f a on a.league = g.league and a.year = g.year and a.event_no = g.event_no and a.game_no = g.game_no and a.side = 1
join side_f b on b.league = g.league and b.year = g.year and b.event_no = g.event_no and b.game_no = g.game_no and b.side = 2
on conflict (league_code, year, event_no, game_no) do update set
  stage = excluded.stage, side1_name = excluded.side1_name, side1_score = excluded.side1_score, side1_franchise_id = excluded.side1_franchise_id,
  side2_name = excluded.side2_name, side2_score = excluded.side2_score, side2_franchise_id = excluded.side2_franchise_id, decided_by = excluded.decided_by,
  source_id = excluded.source_id, source_key = excluded.source_key;

delete from core.all_star_game c where c.source_id = (select source_id from wp)
  and not exists (select 1 from legacy_wikipedia_all_star.game g where g.league = c.league_code and g.year = c.year and g.event_no = c.event_no and g.game_no = c.game_no);

-- People: the persons of the articles' links.
create temp table pt as
select distinct t.title from (select title from legacy_wikipedia_all_star.mvp union select title from legacy_wikipedia_all_star.selection) t where t.title is not null;
create temp table pq as
select pt.title, p.qid
from pt join legacy_wikidata_dump.person p on p.doc -> 'sl' ->> 'enwiki' = pt.title;
create temp table pl as
select pq.title, min(e.entity_id) as person_id
from pq join core.external_id e on e.entity_kind = 'person' and e.external_key = pq.qid
  and e.source_id = (select source_id from meta.source where code = 'wikidata')
group by pq.title having count(distinct e.entity_id) = 1;

-- and, for a name with no link, the persons who played in that league's season.
create temp table seasons_used as select distinct season_id from ev_h where season_id is not null;
create temp table played as
select distinct ts.season_id, st.person_id
from core.player_season_stat st join core.team_season ts on ts.team_season_id = st.team_season_id
where ts.season_id in (select season_id from seasons_used)
union
select distinct ts.season_id, r.person_id
from core.roster_stint r join core.team_season ts on ts.team_season_id = r.team_season_id
where ts.season_id in (select season_id from seasons_used);
create index on played (season_id, person_id);
create temp table named as
select pl.season_id, pg_temp.nk(p.full_name) as k, min(p.person_id) as person_id, count(distinct p.person_id) as n
from played pl join core.person p on p.person_id = pl.person_id
group by pl.season_id, pg_temp.nk(p.full_name);

insert into core.all_star_mvp (league_code, year, event_no, seq, kind, name, team_name, person_id, source_id, source_key)
select m.league, m.year, m.event_no, m.seq, m.kind, m.name, m.team_name,
       coalesce(l.person_id, case when nm.n = 1 then nm.person_id end), (select source_id from wp),
       'wikipedia:all_star:' || m.league || ':' || m.year || ':' || m.event_no || ':mvp:' || m.seq
from legacy_wikipedia_all_star.mvp m
join ev_h h on h.league = m.league and h.year = m.year and h.event_no = m.event_no
left join pl l on l.title = m.title
left join named nm on nm.season_id = h.season_id and nm.k = pg_temp.nk(m.name)
on conflict (league_code, year, event_no, seq) do update set
  kind = excluded.kind, name = excluded.name, team_name = excluded.team_name, person_id = excluded.person_id, source_id = excluded.source_id, source_key = excluded.source_key;

delete from core.all_star_mvp c where c.source_id = (select source_id from wp)
  and not exists (select 1 from legacy_wikipedia_all_star.mvp m where m.league = c.league_code and m.year = c.year and m.event_no = c.event_no and m.seq = c.seq);

insert into core.all_star_selection (league_code, year, event_no, seq, side, role, grp, position, name, team_name, person_id, source_id, source_key)
select x.league, x.year, x.event_no, x.seq, x.side, x.role, x.grp, x.position, x.name, x.team_name,
       coalesce(l.person_id, case when nm.n = 1 then nm.person_id end), (select source_id from wp),
       'wikipedia:all_star:' || x.league || ':' || x.year || ':' || x.event_no || ':sel:' || x.seq
from legacy_wikipedia_all_star.selection x
join ev_h h on h.league = x.league and h.year = x.year and h.event_no = x.event_no
left join pl l on l.title = x.title
left join named nm on nm.season_id = h.season_id and nm.k = pg_temp.nk(x.name)
on conflict (league_code, year, event_no, seq) do update set
  side = excluded.side, role = excluded.role, grp = excluded.grp, position = excluded.position, name = excluded.name, team_name = excluded.team_name,
  person_id = excluded.person_id, source_id = excluded.source_id, source_key = excluded.source_key;

delete from core.all_star_selection c where c.source_id = (select source_id from wp)
  and not exists (select 1 from legacy_wikipedia_all_star.selection x where x.league = c.league_code and x.year = c.year and x.event_no = c.event_no and x.seq = c.seq);

-- meta.data_issue: this step's own rows are replaced.
delete from meta.data_issue where entity_kind = 'all_star';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'all_star', 'all_star:' || u.league || ':' || coalesce(u.year::text, 'list'),
       format('All-Star Game %s %s: %s: %s', upper(u.league), coalesce(u.year::text, ''), u.what, u.detail),
       'Left empty or kept as the list prints it; nothing guessed'
from legacy_wikipedia_all_star.unparsed u;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'all_star', 'all_star:' || e.league_code || ':' || e.year || ':' || e.event_no,
       format('All-Star Game %s %s: no season of core.season has start year %s', upper(e.league_code), e.year, h.start_year),
       'Kept without a season'
from core.all_star_event e join ev_h h on h.league = e.league_code and h.year = e.year and h.event_no = e.event_no
where e.season_id is null and e.status = 'played';

-- MLB against Retrosheet's All-Star games (same day): the score and the attendance.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'all_star', 'all_star:mlb:' || e.year || ':' || e.event_no,
       format('All-Star Game MLB %s: the %s differs from Retrosheet''s game of the same day', e.year, d.what),
       'Both kept'
from core.all_star_event e
join core.all_star_game g on g.league_code = e.league_code and g.year = e.year and g.event_no = e.event_no and g.game_no = 1
join legacy_retrosheet.game_log r on r.game_type = 'allstar' and r.game_date = e.first_day
cross join lateral (values
  ('score', (least(g.side1_score, g.side2_score) is distinct from least(r.visitor_score, r.home_score)) or (greatest(g.side1_score, g.side2_score) is distinct from greatest(r.visitor_score, r.home_score))),
  ('attendance', e.attendance is not null and r.attendance is not null and e.attendance <> r.attendance)) d(what, differs)
where e.league_code = 'mlb' and d.differs;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'all_star', 'all_star:mlb:' || e.year || ':' || e.event_no,
       format('All-Star Game MLB %s (%s): Retrosheet has no All-Star game on that day', e.year, e.first_day), 'Kept'
from core.all_star_event e
where e.league_code = 'mlb' and e.status = 'played' and e.first_day is not null and e.first_day <= current_date
  and not exists (select 1 from legacy_retrosheet.game_log r where r.game_type = 'allstar' and r.game_date = e.first_day);

select 'events' as k, count(*)::text as n from core.all_star_event
union all select 'played', count(*)::text from core.all_star_event where status = 'played'
union all select 'played with a day', count(*)::text from core.all_star_event where status = 'played' and first_day is not null
union all select 'with a season', count(*)::text from core.all_star_event where season_id is not null
union all select 'with a venue', count(*)::text from core.all_star_event where venue_id is not null
union all select 'with a venue page address', count(*)::text from core.all_star_event where venue_wikidata_id is not null
union all select 'with a host club', count(*)::text from core.all_star_event where host_franchise_id is not null
union all select 'games', count(*)::text from core.all_star_game
union all select 'mvps', count(*)::text from core.all_star_mvp
union all select 'mvps linked to a person', count(*)::text from core.all_star_mvp where person_id is not null
union all select 'roster lines', count(*)::text from core.all_star_selection
union all select 'roster lines linked to a person', count(*)::text from core.all_star_selection where person_id is not null
union all select 'data issues', count(*)::text from meta.data_issue where entity_kind = 'all_star';
commit;
