-- College football betting lines from CollegeFootballData.com (cfbd, green; legacy_cfbd.betting_line on DS1, 2013 on): one row per game and provider (the sportsbook or
-- aggregator CFBD names, in set_by), plus one more row for the provider's opening line where CFBD gives spreadOpen or overUnderOpen (line_moment 'open'). A line is stored as
-- the source states it. CFBD's `spread` is from the home side's view (positive = home is the underdog; formattedSpread names the favourite), so the favourite is 'home' for a
-- negative spread and 'away' for a positive one; a spread of 0 has no favourite; a negative total (one row, an error in CFBD) is a hole. The favourite's money line is the home or away price CFBD gives for that side; CFBD gives no
-- open money line, no price on the spread or the total and says nothing about when its unqualified values were taken, so line_moment stays empty there.
-- Games are matched as 231 does (CFBD's ids are ESPN's, never stored in core): same season, the same two programs, a date a day apart at most (CFBD's times are UTC), the nearest;
-- a CFBD game with no Wikipedia counterpart in core.game (FCS against FCS, a season not loaded) gets no line: a hole. The key of a core line is the key of OUR game and the provider.
-- Run from the repo root (it reads db/seed/ncaaf_cfbd_name.csv) after 230 and after legacy_cfbd.betting_line and game are loaded (scripts/grey/cfbd_load.py).
-- A rerun keeps every line's id (updated in place; a row whose game was deleted and added again gets the id ingest.row_id_map remembers) and deletes only cfbd's lines whose
-- game or provider is no longer listed. Needs migration 196, and 221 afterwards. DS1 only.
begin;

create temp table cf as select source_id from meta.source where code = 'cfbd';
create function pg_temp.flat(x text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(replace(x, '&', 'and')), 'áàâäãåéèêëíìîïóòôöõúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]', '', 'g')
$$;

create temp table seed_cfbd (cfbd_name text, program text);
\copy seed_cfbd from 'db/seed/ncaaf_cfbd_name.csv' with (format csv, header true)

create temp table og as
select g.game_id, g.source_key, s.start_year yr, g.game_date, substr(hf.source_key, 7) hp, substr(af.source_key, 7) ap
from core.game g join core.season s using (season_id)
join core.team_season ht on ht.team_season_id = g.home_team_season_id join core.franchise hf on hf.franchise_id = ht.franchise_id
join core.team_season at on at.team_season_id = g.away_team_season_id join core.franchise af on af.franchise_id = at.franchise_id
where s.league_code = 'ncaaf' and g.source_key like 'wpncaaf:%';

create temp table cnames as
select distinct season, n from (select g.season, g.home_team n from legacy_cfbd.game g union select g.season, g.away_team from legacy_cfbd.game g) x
where season in (select distinct yr from og);
create temp table cmap as
select c.season, c.n, coalesce(sd.program, (select min(substr(f.source_key, 7)) from core.franchise_identity i join core.franchise f using (franchise_id)
                                            where f.source_key like 'ncaaf:%' and pg_temp.flat(i.location) = pg_temp.flat(c.n)
                                            having count(distinct f.franchise_id) = 1)) program
from cnames c left join seed_cfbd sd on sd.cfbd_name = c.n;

-- CFBD games that carry a line, with the programs of their sides
create temp table cg as
select g.game_id cfbd_id, g.season yr, (g.start_date at time zone 'UTC')::date d, h.program hp, a.program ap
from legacy_cfbd.game g
join cmap h on h.season = g.season and h.n = g.home_team
join cmap a on a.season = g.season and a.n = g.away_team
where h.program is not null and a.program is not null and h.program <> a.program
  and exists (select 1 from legacy_cfbd.betting_line l where l.game_id = g.game_id);

-- one of our games for each CFBD game (the nearest date of the same two programs), and one CFBD game for each of ours; swapped = CFBD's home side is our away side
create temp table near as
select distinct on (c.cfbd_id) c.cfbd_id, o.game_id, o.source_key, (c.hp <> o.hp) as swapped, abs(c.d - o.game_date) as gap
from cg c join og o on o.yr = c.yr and ((c.hp = o.hp and c.ap = o.ap) or (c.hp = o.ap and c.ap = o.hp)) and abs(c.d - o.game_date) <= 1
order by c.cfbd_id, abs(c.d - o.game_date), o.game_id;
create temp table pairs as
select distinct on (game_id) cfbd_id, game_id, source_key, swapped from near order by game_id, gap, cfbd_id;

-- the lines: the provider's latest values, and its opening values where CFBD gives them
create temp table want as
select p.game_id, 'cfbd:' || p.source_key || ':' || l.provider as source_key, l.provider as set_by, null::text as line_moment,
       case when l.spread < 0 then 'home' when l.spread > 0 then 'away' end as fav_cfbd, p.swapped,
       abs(l.spread)::numeric as point_spread, (case when l.over_under >= 0 then l.over_under end)::numeric as total, l.home_moneyline, l.away_moneyline
from pairs p join legacy_cfbd.betting_line l on l.game_id = p.cfbd_id
where (l.spread is not null or l.over_under is not null or l.home_moneyline is not null or l.away_moneyline is not null)
  and l.provider not ilike '%espn%'   -- John, 2026-11-03: no ESPN, not even ESPN Bet's lines through CFBD
union all
select p.game_id, 'cfbd:' || p.source_key || ':' || l.provider || ':open', l.provider, 'open',
       case when l.spread_open < 0 then 'home' when l.spread_open > 0 then 'away' end, p.swapped,
       abs(l.spread_open)::numeric, (case when l.over_under_open >= 0 then l.over_under_open end)::numeric, null, null
from pairs p join legacy_cfbd.betting_line l on l.game_id = p.cfbd_id
where (l.spread_open is not null or l.over_under_open is not null)
  and l.provider not ilike '%espn%';

create temp table final as
select game_id, source_key, set_by, line_moment, point_spread, total,
       case when fav_cfbd is null then null when swapped then case fav_cfbd when 'home' then 'away' else 'home' end else fav_cfbd end as favourite,
       case fav_cfbd when 'home' then round(home_moneyline)::integer when 'away' then round(away_moneyline)::integer end as favourite_money_line
from want;

update core.betting_line b
set game_id = w.game_id, set_by = w.set_by, line_moment = w.line_moment, favourite = w.favourite, point_spread = w.point_spread,
    favourite_money_line = w.favourite_money_line, total = w.total
from final w
where b.source_id = (select source_id from cf) and b.source_key = w.source_key
  and (b.game_id, b.set_by, b.line_moment, b.favourite, b.point_spread, b.favourite_money_line, b.total)
      is distinct from (w.game_id, w.set_by, w.line_moment, w.favourite, w.point_spread, w.favourite_money_line, w.total);

delete from core.betting_line b
where b.source_id = (select source_id from cf) and b.source_key like 'cfbd:%'
  and not exists (select 1 from final w where w.source_key = b.source_key);

insert into core.betting_line (betting_line_id, game_id, source_id, source_key, set_by, line_moment, favourite, point_spread, favourite_money_line, total)
overriding system value
select coalesce(m.row_id, nextval(pg_get_serial_sequence('core.betting_line', 'betting_line_id'))),
       w.game_id, (select source_id from cf), w.source_key, w.set_by, w.line_moment, w.favourite, w.point_spread, w.favourite_money_line, w.total
from final w
left join ingest.row_id_map m on m.tbl = 'core.betting_line' and m.natural_key = (select source_id from cf)::text || '/' || w.source_key
     and not exists (select 1 from core.betting_line y where y.betting_line_id = m.row_id)
where not exists (select 1 from core.betting_line b where b.source_id = (select source_id from cf) and b.source_key = w.source_key);

select 'our games' k, count(*)::bigint n from og
union all select 'CFBD games with a line', count(*) from (select distinct game_id from legacy_cfbd.betting_line) x
union all select 'CFBD games with a line and a team no program answers', count(distinct l.game_id) from legacy_cfbd.betting_line l join legacy_cfbd.game g on g.game_id = l.game_id
  where exists (select 1 from cmap m where m.season = g.season and m.program is null and m.n in (g.home_team, g.away_team))
union all select 'CFBD games matched to one of ours', count(*) from pairs
union all select 'cfbd lines in core', count(*) from core.betting_line where source_id = (select source_id from cf)
union all select 'of them opening lines', count(*) from core.betting_line where source_id = (select source_id from cf) and line_moment = 'open';
commit;
