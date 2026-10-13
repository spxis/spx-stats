-- The venue of every game of the five leagues (nhl, nba, mlb, nfl, cfl). Run from the repo root (scripts/build_core.sh does), after
-- 198_home_venue.sql and after every step that writes games (120-156). Rerunnable.
-- core.game.venue_id is NOT written: production could not take a rewrite of 380,000 rows. The answer is split in two small tables:
--   core.franchise_home_venue   the venue each club played its home games in, by period (finished here, see below), and
--   core.game_venue             only the games whose venue differs from that, every event and neutral-site game, and the games this step
--                               knows no venue for although the club's period would name one (venue_id null: unknown).
-- api.game_venue gives every game its venue (a core.game_venue row if there is one, else the home period's venue), and api.venue_game lists
-- the games at a venue (migration 075). The step also sets is_neutral_site, neutral_site_reason and is_international on the few hundred games
-- an event row or a venue abroad changes, and remembers the old values in legacy_game_venue.filled so a rerun can restore them. An earlier
-- version wrote venue_id too: the first run of this one sets those back to null.
--
-- Where a game's venue comes from, best first:
--   event      db/seed/game_venue_event.csv: games played away from the club's usual home (Super Bowl, Grey Cup, bubbles, games abroad, a club
--              that moved for a season), each read from English Wikipedia (CC BY-SA 4.0) or Wikidata (CC0). Also sets is_neutral_site,
--              neutral_site_reason and is_international for the game.
--   retrosheet MLB: the park id of the Retrosheet game log (legacy_retrosheet.game_log.park_id; the notice is on meta.source) mapped to a
--              Wikidata venue through db/seed/retrosheet_park.csv. A park with no Wikidata item leaves its games without a venue.
--   nflverse   NFL 1999 on: the stadium of the nflverse schedule (CC BY 4.0), by name.
--   nhlapi     NHL: the venue the NHL's web API names for the game, by name.
--   home       the home club's venue that day (core.franchise_home_venue), for every game with no better source and not marked neutral, only
--              when that venue had opened and not closed on that day (30 days of slack, as in db/checks/062_game_venue.sql); otherwise the game
--              is left empty and logged.
-- This step also finishes core.franchise_home_venue: it starts from the chain 198 built (legacy_game_venue.home_prelim) and puts in the periods
-- the games themselves show (the venue most home games had in a season from the Retrosheet park, nflverse stadium or NHL API venue; seasons in a
-- row with the same venue are one period), which replace the seed, brand and franchise_venue periods where they overlap.
-- A venue name from nflverse or the NHL is matched to a venue by db/seed/venue_alias.csv, else by any name core.venue_name, core.brand_venue_name,
-- core.brand_venue or legacy_game_venue.venue gives it (accents, case and punctuation ignored). A name that fits two venues is settled by the home
-- club's venue that day; a name that fits none, and is not the start or end of a name of the home club's venue ("Madison Square Garden III"),
-- leaves the game without a venue. Nothing is guessed: a game with no answer gets meta.data_issue rows ('game_venue_*').

drop table if exists pg_temp.seed_park;
create temp table seed_park (park_id text, qid text, label text, confidence text, note text);
\copy seed_park from 'db/seed/retrosheet_park.csv' with (format csv, header true)
drop table if exists pg_temp.seed_event;
create temp table seed_event (league text, game_date date, team_a text, team_b text, qid text, neutral boolean, international boolean, reason text, source text, source_url text);
\copy seed_event from 'db/seed/game_venue_event.csv' with (format csv, header true)
drop table if exists pg_temp.seed_alias;
create temp table seed_alias (source text, name text, qid text, note text);
\copy seed_alias from 'db/seed/venue_alias.csv' with (format csv, header true)
drop table if exists pg_temp.seed_not_venue;
create temp table seed_not_venue (qid text, why text);
\copy seed_not_venue from 'db/seed/not_a_venue.csv' with (format csv, header true)

create or replace function pg_temp.norm(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(t), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g') $$;

delete from meta.data_issue where entity_kind in ('game_venue_none', 'game_venue_park', 'game_venue_name', 'game_venue_event');

-- ---------------------------------------------------------------- take back this step's own earlier work
update core.game g set venue_id = case when f.wrote_venue and g.venue_id = f.venue_id then null else g.venue_id end,
       is_neutral_site = coalesce(f.was_neutral, g.is_neutral_site),
       neutral_site_reason = case when f.basis = 'event' then f.was_reason else g.neutral_site_reason end,
       is_international = coalesce(f.was_international, g.is_international)
from legacy_game_venue.filled f where f.game_id = g.game_id;
delete from legacy_game_venue.filled;

-- core.franchise_home_venue starts from the chain step 198 built (legacy_game_venue.home_prelim); this step then adds the periods the games
-- themselves show (below), so a rerun of this step alone gives the same table.
delete from core.franchise_home_venue;
insert into core.franchise_home_venue (franchise_id, venue_id, valid_during, basis, source_id)
select franchise_id, venue_id, valid_during, basis, source_id from legacy_game_venue.home_prelim;

create temp table wd as select source_id from meta.source where code = 'wikidata';
create temp table venue_of as select source_key as qid, venue_id, country_code, opened_on, closed_on from core.venue where source_id = (select source_id from wd);
create temp table notv as
select qid from seed_not_venue
union select source_key from core.brand_venue where pg_temp.norm(venue_label) = pg_temp.norm(city);

-- ---------------------------------------------------------------- the games to fill
create temp table gm as
select g.game_id, g.game_date, g.is_neutral_site as neutral, s.league_code as lg, s.start_year, hts.franchise_id as home_f, ats.franchise_id as away_f
from core.game g join core.season s using (season_id)
join core.team_season hts on hts.team_season_id = g.home_team_season_id join core.team_season ats on ats.team_season_id = g.away_team_season_id
where g.venue_id is null and s.league_code in ('nhl', 'nba', 'mlb', 'nfl', 'cfl');
create unique index on gm (game_id);

create temp table hi0 as   -- the home club's venue that day by the chain 198 built, when that venue stood on that day (30 days of slack)
select gm.game_id, h.venue_id from gm join core.franchise_home_venue h on h.franchise_id = gm.home_f and h.valid_during @> gm.game_date
join venue_of vo on vo.venue_id = h.venue_id
where (vo.opened_on is null or gm.game_date >= vo.opened_on - 30) and (vo.closed_on is null or gm.game_date <= vo.closed_on + 30);
create unique index on hi0 (game_id);

-- ---------------------------------------------------------------- events
create temp table fn as
select fl.league_code, i.franchise_id, i.full_name, i.valid_during
from core.franchise_identity i join (select distinct franchise_id, league_code from core.franchise_league) fl using (franchise_id);
create temp table ev as
select e.*, a.franchise_id as fa, b.franchise_id as fb, v.venue_id,
       row_number() over () as eid
from seed_event e
left join lateral (select fn.franchise_id from fn where fn.league_code = e.league and fn.full_name = e.team_a and fn.valid_during @> e.game_date limit 1) a on true
left join lateral (select fn.franchise_id from fn where fn.league_code = e.league and fn.full_name = e.team_b and fn.valid_during @> e.game_date limit 1) b on true
left join venue_of v on v.qid = e.qid;
create temp table ev_game as
select distinct on (gm.game_id) gm.game_id, ev.venue_id, ev.neutral, ev.international, ev.reason, ev.eid, ev.source, ev.source_url
from ev join gm on gm.lg = ev.league and gm.game_date = ev.game_date
 and ((gm.home_f = ev.fa and gm.away_f = ev.fb) or (gm.home_f = ev.fb and gm.away_f = ev.fa))
where ev.venue_id is not null
order by gm.game_id, ev.eid;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'game_venue_event', e.league || ':' || e.game_date || ':' || e.team_a || ' / ' || e.team_b,
       case when e.fa is null or e.fb is null then 'A club name matches no franchise of ' || e.league || ' on that date'
            when e.venue_id is null then 'Venue ' || e.qid || ' is not in core.venue (no city or country known; load it with scripts/game_venue/)'
            else 'No game of ' || e.league || ' on that date between those clubs, or it already has a venue' end,
       'Event row not used (db/seed/game_venue_event.csv).'
from ev e where e.eid not in (select eid from ev_game);

-- ---------------------------------------------------------------- what each source says about a game
create temp table ps as   -- (game, source kind, the source's value)
select e.entity_id as game_id, 'retrosheet' as kind, l.park_id as val
from core.external_id e join gm on gm.game_id = e.entity_id
join legacy_retrosheet.game_log l on to_char(l.game_date, 'YYYYMMDD') || ':' || l.home || ':' || l.visitor || ':' || l.game_number || ':' || l.game_type = e.external_key
where e.entity_kind = 'game' and e.source_id = (select source_id from meta.source where code = 'retrosheet') and l.park_id is not null
union all
select e.entity_id, 'nflverse', n.stadium
from core.external_id e join gm on gm.game_id = e.entity_id
join legacy_nflverse.game n on n.game_id = e.external_key
where e.entity_kind = 'game' and e.source_id = (select source_id from meta.source where code = 'nflverse') and nullif(btrim(n.stadium), '') is not null
union all
select e.entity_id, 'nhlapi', coalesce(nullif(btrim(h.venue), ''), nullif(btrim(h.row #>> '{venue,default}'), ''))
from core.external_id e join gm on gm.game_id = e.entity_id
join legacy_nhlapi.game h on h.nhl_game_id::text = e.external_key
where e.entity_kind = 'game' and e.source_id = (select source_id from meta.source where code = 'nhl_api')
  and coalesce(nullif(btrim(h.venue), ''), nullif(btrim(h.row #>> '{venue,default}'), '')) is not null;
create index on ps (game_id);

-- a venue name from a source -> Wikidata ids that carry that name
create temp table al as
select pg_temp.norm(nm) as k, qid from (
  select n.name as nm, v.source_key as qid from core.venue_name n join core.venue v using (venue_id) where v.source_id = (select source_id from wd)
  union select name, wikidata_id from core.brand_venue_name
  union select venue_label, source_key from core.brand_venue
  union select label, qid from legacy_game_venue.venue
) z where nm is not null and qid not in (select qid from notv) group by 1, 2;
create temp table sa as select source, pg_temp.norm(name) as k, qid from seed_alias group by 1, 2, 3;

create temp table sv as   -- every distinct (kind, value) of nflverse and the NHL: the qids it could be
select x.kind, x.val, x.k,
       coalesce((select array_agg(distinct sa.qid) from sa where sa.source = x.kind and sa.k = x.k),
                (select array_agg(distinct al.qid) from al where al.k = x.k)) as qids
from (select distinct kind, val, pg_temp.norm(val) as k from ps where kind <> 'retrosheet') x;

-- one qid per (game, source value): single match; several -> the one the home club plays in; none -> the home venue when the value
-- is the start or end of one of its names
create temp table pq as
select distinct on (p.game_id) p.game_id, p.kind, p.val,
       case p.kind
         when 'retrosheet' then (select nullif(sp.qid, '') from seed_park sp where sp.park_id = p.val)
         else case
           when array_length(s.qids, 1) = 1 then s.qids[1]
           when array_length(s.qids, 1) > 1 then (select hv.source_key from hi0 join core.venue hv on hv.venue_id = hi0.venue_id where hi0.game_id = p.game_id and hv.source_key = any (s.qids))
           else (select hv.source_key from hi0 join core.venue hv on hv.venue_id = hi0.venue_id
                  where hi0.game_id = p.game_id and length(s.k) >= 6
                    and exists (select 1 from al where al.qid = hv.source_key and length(al.k) >= 6 and (al.k like s.k || '%' or s.k like al.k || '%')))
         end
       end as qid,
       case p.kind when 'retrosheet' then case when exists (select 1 from seed_park sp where sp.park_id = p.val and nullif(sp.qid, '') is not null) then null
                                               else 'park ' || p.val || ' has no Wikidata item in db/seed/retrosheet_park.csv' end
            else case when s.qids is null then 'name not matched to any venue'
                      when array_length(s.qids, 1) > 1 then 'name fits several venues: ' || array_to_string(s.qids, ', ')
                      end end as why
from ps p left join sv s on s.kind = p.kind and s.val = p.val
order by p.game_id, p.kind;
create unique index on pq (game_id);

-- ---------------------------------------------------------------- the periods the games themselves show
-- A club's home venue in a season is the venue most of its home games had in the game-level sources (the Retrosheet park, the nflverse
-- stadium, the NHL API venue; not neutral or event games). Seasons in a row with the same venue make one period, from the first of its games at
-- that venue to the day after the last. These periods come before the seeds, brand and franchise_venue (they replace them where they overlap),
-- so what the table says about a club agrees with where it played; a day no source covers stays without a venue.
create temp table ge as   -- venue_id is null for a value no venue is known for: a season it wins gets no period, never a lesser venue's
select gm.game_id, gm.home_f, gm.start_year, gm.game_date, v.venue_id
from gm join pq on pq.game_id = gm.game_id left join venue_of v on v.qid = pq.qid
where not gm.neutral and pq.kind in ('retrosheet', 'nflverse', 'nhlapi') and not exists (select 1 from ev_game e where e.game_id = gm.game_id);
create temp table gmode as
select distinct on (home_f, start_year) home_f, start_year, venue_id, d0, d1
from (select home_f, start_year, venue_id, count(*) as n, min(game_date) as d0, max(game_date) as d1 from ge group by 1, 2, 3) x
order by home_f, start_year, n desc, d0 desc;
create temp table gl_raw as
with m as (select *, lag(venue_id) over (partition by home_f order by start_year) as pv from gmode),
     isl as (select *, sum((pv is distinct from venue_id)::int) over (partition by home_f order by start_year) as grp from m)
select row_number() over () as rid, home_f as franchise_id, venue_id, daterange(min(d0), max(d1) + 1) as rng
from isl where venue_id is not null group by home_f, venue_id, grp;
create temp table gl as   -- no two overlap (the earlier start wins)
select r.franchise_id, r.venue_id, piece as rng
from gl_raw r, lateral unnest(datemultirange(r.rng) - coalesce((select range_agg(o.rng) from gl_raw o where o.franchise_id = r.franchise_id and o.rid <> r.rid
        and (lower(o.rng) < lower(r.rng) or (lower(o.rng) = lower(r.rng) and o.rid < r.rid))), '{}'::datemultirange)) as piece
where not isempty(piece);

delete from core.franchise_home_venue;
insert into core.franchise_home_venue (franchise_id, venue_id, valid_during, basis, source_id)
select franchise_id, venue_id, rng, 'games', coalesce((select source_id from meta.source where code = 'spx_stats_derived'), (select source_id from wd)) from gl;
insert into core.franchise_home_venue (franchise_id, venue_id, valid_during, basis, source_id)
select p.franchise_id, p.venue_id, piece, p.basis, p.source_id
from legacy_game_venue.home_prelim p,
     lateral unnest(datemultirange(p.valid_during) - coalesce((select range_agg(g.rng) from gl g where g.franchise_id = p.franchise_id), '{}'::datemultirange)) as piece
where not isempty(piece);
-- periods of one venue that touch become one
create temp table fhv_all as select * from core.franchise_home_venue;
delete from core.franchise_home_venue;
insert into core.franchise_home_venue (franchise_id, venue_id, valid_during, basis, source_id)
select m.franchise_id, m.venue_id, m.rng,
       (select a.basis from fhv_all a where a.franchise_id = m.franchise_id and a.venue_id = m.venue_id and a.valid_during <@ m.rng
         order by coalesce(upper(a.valid_during) - lower(a.valid_during), 1000000) desc, case a.basis when 'games' then 0 when 'seed' then 1 when 'brand' then 2 else 3 end limit 1),
       (select a.source_id from fhv_all a where a.franchise_id = m.franchise_id and a.venue_id = m.venue_id and a.valid_during <@ m.rng
         order by coalesce(upper(a.valid_during) - lower(a.valid_during), 1000000) desc, case a.basis when 'games' then 0 when 'seed' then 1 when 'brand' then 2 else 3 end limit 1)
from (select franchise_id, venue_id, unnest(range_agg(valid_during)) as rng from fhv_all group by 1, 2) m;

-- the home club's venue that day from the final chain, only when that venue stood on that day (30 days of slack)
create temp table hi_all as
select gm.game_id, h.venue_id from gm join core.franchise_home_venue h on h.franchise_id = gm.home_f and h.valid_during @> gm.game_date;
create unique index on hi_all (game_id);
create temp table hi as
select a.game_id, a.venue_id from hi_all a join gm using (game_id) join venue_of vo on vo.venue_id = a.venue_id
where (vo.opened_on is null or gm.game_date >= vo.opened_on - 30) and (vo.closed_on is null or gm.game_date <= vo.closed_on + 30);
create unique index on hi (game_id);

-- ---------------------------------------------------------------- the answer for each game
create temp table fin as
select gm.game_id, coalesce(e.venue_id, v.venue_id, case when pq.game_id is null and not gm.neutral then hi.venue_id end) as venue_id,
       case when e.venue_id is not null then 'event' when v.venue_id is not null then pq.kind
            when pq.game_id is null and not gm.neutral and hi.venue_id is not null then 'home' end as basis,
       e.neutral as ev_neutral, e.international as ev_international, e.reason as ev_reason,
       case when e.venue_id is not null or v.venue_id is not null then null
            when pq.game_id is not null then coalesce(pq.why, 'venue ' || pq.qid || ' is not in core.venue', pq.kind || ' names a venue that fits none the home club has used')
            when gm.neutral then 'neutral-site game; no source names the venue'
            when hi.venue_id is null and hi_all.venue_id is not null then 'no source names the venue, and the home venue the chain gives (' || (select vo.qid from venue_of vo where vo.venue_id = hi_all.venue_id) || ') had not opened or had closed on that date'
            when hi.venue_id is null then 'no source names the venue and no home venue is known for the club on that date' end as why,
       pq.kind as src_kind, pq.val as src_val
from gm
left join ev_game e on e.game_id = gm.game_id
left join pq on pq.game_id = gm.game_id
left join venue_of v on v.qid = pq.qid
left join hi on hi.game_id = gm.game_id
left join hi_all on hi_all.game_id = gm.game_id;
create unique index on fin (game_id);

-- ---------------------------------------------------------------- write
-- core.game_venue: the games whose venue is not simply the home club's venue that day (hi_all, the chain as the view reads it), every event and
-- neutral-site game, and the games left without a venue where the chain would name one (venue_id null, basis 'unknown').
delete from core.game_venue;
insert into core.game_venue (game_id, venue_id, basis, source_id, source_key)
select f.game_id, f.venue_id, coalesce(f.basis, 'unknown'),
       case f.basis when 'event' then (select source_id from meta.source where code = ev.source)
                    when 'retrosheet' then (select source_id from meta.source where code = 'retrosheet')
                    when 'nflverse' then (select source_id from meta.source where code = 'nflverse')
                    when 'nhlapi' then (select source_id from meta.source where code = 'nhl_api') end,
       case when f.basis = 'event' then ev.source_url when f.basis in ('retrosheet', 'nflverse', 'nhlapi') then f.src_val end
from fin f join gm using (game_id)
left join hi_all d on d.game_id = f.game_id
left join ev_game ev on ev.game_id = f.game_id
where f.basis = 'event' or gm.neutral or f.venue_id is distinct from d.venue_id;

-- the few games whose flags change: an event row sets is_neutral_site, neutral_site_reason and is_international; a venue outside the US and
-- Canada (CFL excepted) sets is_international. The old values are kept in legacy_game_venue.filled.
create temp table flagchg as
select g.game_id, f.venue_id, f.basis,
       g.is_neutral_site as was_neutral, g.is_international as was_international, g.neutral_site_reason as was_reason,
       case when f.basis = 'event' and f.ev_neutral then true else g.is_neutral_site end as new_neutral,
       case when f.basis = 'event' then coalesce(f.ev_reason, g.neutral_site_reason) else g.neutral_site_reason end as new_reason,
       case when f.basis = 'event' and f.ev_international is not null then f.ev_international
            when vo.country_code not in ('US', 'CA') and gm.lg <> 'cfl' then true
            else g.is_international end as new_intl
from fin f join gm using (game_id) join core.game g using (game_id) join venue_of vo on vo.venue_id = f.venue_id
where f.venue_id is not null;
delete from flagchg where (new_neutral, new_reason, new_intl) is not distinct from (was_neutral, was_reason, was_international);
insert into legacy_game_venue.filled (game_id, venue_id, basis, was_neutral, was_international, was_reason, wrote_venue)
select game_id, venue_id, basis, was_neutral, was_international, was_reason, false from flagchg;
update core.game g set is_neutral_site = c.new_neutral, neutral_site_reason = c.new_reason, is_international = c.new_intl
from flagchg c where g.game_id = c.game_id;

-- ---------------------------------------------------------------- what is left, logged
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'game_venue_none', gm.lg || ':franchise ' || gm.home_f || ':' || gm.start_year || ':' || case when gm.neutral then 'neutral' else 'home' end,
       count(*) || case when count(*) > 1 then ' games' else ' game' end || ' of ' || gm.lg || ' ' || gm.start_year || ' (home club franchise ' || gm.home_f || case when count(*) > 1 then ') have' else ') has' end || ' no venue: ' || f.why,
       'No venue; nothing is guessed. Add a period to db/seed/home_venue.csv or an event row to db/seed/game_venue_event.csv.'
from fin f join gm using (game_id)
where f.venue_id is null and f.why is not null and f.src_kind is null
group by gm.lg, gm.home_f, gm.start_year, gm.neutral, f.why;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), case when f.src_kind = 'retrosheet' then 'game_venue_park' else 'game_venue_name' end,
       f.src_kind || ':' || f.src_val,
       count(*) || ' game' || case when count(*) > 1 then 's' else '' end || ' with ' || f.src_kind || ' value "' || f.src_val || '": ' || f.why,
       'No venue; add the value to db/seed/' || case when f.src_kind = 'retrosheet' then 'retrosheet_park.csv' else 'venue_alias.csv' end || '.'
from fin f
where f.venue_id is null and f.src_kind is not null
group by f.src_kind, f.src_val, f.why;

-- ---------------------------------------------------------------- counts
-- (a venue not yet open, or already closed, on the game day: the 30 days of slack are the same as in db/checks/062_game_venue.sql)
select 'games of the five leagues' as what, count(*) as n from gm
union all select 'placed: ' || coalesce(basis, '-'), count(*) from fin where venue_id is not null group by basis
union all select 'left without a venue', count(*) from fin where venue_id is null
union all select 'neutral-site games placed', count(*) from fin f join gm using (game_id) where f.venue_id is not null and gm.neutral
union all select 'neutral-site games left without a venue', count(*) from fin f join gm using (game_id) where f.venue_id is null and gm.neutral
union all select 'event rows used', count(distinct eid) from ev_game
union all select 'event rows not used', count(*) from meta.data_issue where entity_kind = 'game_venue_event'
union all select 'core.game_venue rows: ' || basis, count(*) from core.game_venue group by basis
union all select 'core.game_venue rows in all', count(*) from core.game_venue
union all select 'of which unknown (venue_id null)', count(*) from core.game_venue where venue_id is null
union all select 'source venue differs from the home club''s venue (' || lg || ')', count(*)
  from fin f join gm using (game_id) join hi using (game_id) where f.venue_id is not null and f.basis in ('retrosheet', 'nflverse', 'nhlapi') and f.venue_id <> hi.venue_id group by lg
union all select 'placed in ' || lg, count(*) from fin f join gm using (game_id) where f.venue_id is not null group by lg
union all select 'left without a venue in ' || lg, count(*) from fin f join gm using (game_id) where f.venue_id is null group by lg
union all select 'core.game rows this step changed (flags)', count(*) from legacy_game_venue.filled
union all select 'core.game rows with a venue_id', count(*) from core.game where venue_id is not null;
