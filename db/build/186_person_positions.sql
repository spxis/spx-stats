-- core.person.primary_position and core.person.positions (migration 049, 061): the codes of ref.position, never free text.
-- Sources, mapped through ref.position_alias (db/build/185_ref_position.sql):
--   * Wikidata "position played" (P413) statements of the person's Wikidata item, preferred first, in Wikidata's order; statements that
--     name a job (coach, manager) are dropped;
--   * the NHL API's position for the person's NHL API id, the most recent first;
--   * Wikidata's P413 statements of the players of the NBA and CFL clubs (legacy_rosters, db/build/179), after the ones above;
--   * the position codes of a person's nflverse rosters (core.roster_stint, source nflverse, db/build/181), the most often held first.
-- The main position is the first code; positions lists every code the person holds, the main one first. An unsided "winger" is LW and RW; a hockey "forward" is F
-- (not C, LW or RW, which it could be), and is dropped when the person has a more exact forward position. A raw value that fits no list
-- ("utility player") is logged in meta.data_issue (entity_kind 'position') and leaves nothing; so does every raw
-- value of SPX's roster and injury tables and of Wikipedia's award tables that has no row in ref.position_alias, so the map can be
-- completed in one place. A person whose values all fail to map has no position. Nothing is guessed.
-- 177 and 180 no longer write a position: this step is the only one that does. Run after 185 (person merge and position lists), before 190.
-- Rerunnable; only changed rows are written.
begin;

create temp table pl on commit drop as
select person_id, array_agg(distinct l order by l) as lg from (
  select rs.person_id, s.league_code as l from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id)
  union select x.person_id, s.league_code from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
  union select w.person_id, s.league_code from core.award_winner w join core.season s using (season_id) where w.person_id is not null) z
group by 1;
create index on pl (person_id);

-- What each source states for each person, in the order to use it.
create temp table raw0 on commit drop as
select x.entity_id as person_id, 'wikidata'::text as src, lower(btrim(it.label)) as raw,
       row_number() over (partition by x.entity_id order by (cl.rank = 'preferred') desc, cl.n) as ord
from core.external_id x
join meta.source s on s.source_id = x.source_id and s.code = 'wikidata'
join legacy_people.claim cl on cl.qid = x.external_key and cl.prop = 'P413' and coalesce(cl.rank, 'normal') <> 'deprecated'
left join legacy_people.redirect r on r.from_qid = cl.value_qid
join legacy_people.item it on it.qid = coalesce(r.to_qid, cl.value_qid)
where x.entity_kind = 'person' and it.label is not null and btrim(it.label) <> '' and it.label !~* '(^| )(coach|manager)$'
union all
select x.entity_id, 'nhl_api', lower(btrim(ps.position)),
       1000 + dense_rank() over (partition by x.entity_id order by ps.last desc, ps.position)
from core.external_id x
join meta.source s on s.source_id = x.source_id and s.code = 'nhl_api'
join (select player_id, position, max(season * 10 + game_type) as last from legacy_nhlapi.player_season
       where position is not null and btrim(position) <> '' group by player_id, position) ps on ps.player_id::text = x.external_key
where x.entity_kind = 'person'
union all
-- Wikidata's statements for the players of the NBA and CFL clubs (legacy_rosters, db/build/179), after the ones above
select x.entity_id, 'wikidata', lower(btrim(it.label)),
       500 + row_number() over (partition by x.entity_id order by (cl.rank = 'preferred') desc, cl.n)
from core.external_id x
join meta.source s on s.source_id = x.source_id and s.code = 'wikidata'
join legacy_rosters.claim cl on cl.qid = x.external_key and cl.prop = 'P413' and coalesce(cl.rank, 'normal') <> 'deprecated'
left join legacy_rosters.redirect r on r.from_qid = cl.value_qid
join legacy_rosters.item it on it.qid = coalesce(r.to_qid, cl.value_qid)
where x.entity_kind = 'person' and it.label is not null and btrim(it.label) <> '' and it.label !~* '(^| )(coach|manager)$'
union all
-- the position codes of a person's nflverse rosters (db/build/181), the most often held first, then the latest
select z.person_id, 'nflverse', lower(z.position), 3000 + dense_rank() over (partition by z.person_id order by z.n desc, z.last desc, z.position)
from (select rs.person_id, rs.position, count(*) as n, max(se.start_year) as last
        from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season se using (season_id)
       where rs.source_id = (select source_id from meta.source where code = 'nflverse') and rs.position is not null
       group by rs.person_id, rs.position) z;

-- A value that names two positions ("rf/lf", "Forward/center") is split.
create temp table tok on commit drop as
select r.person_id, r.src, t.tok, r.ord * 100 + t.n as ord
from raw0 r cross join lateral regexp_split_to_table(r.raw, '\s*[/,]\s*') with ordinality as t(tok, n)
where t.tok <> '';

create temp table mapped on commit drop as
select t.person_id, t.ord * 10 + a.ord as ord, a.code, a.league_code,
       -- a value that names one position is a sure statement; "winger" (LW and RW) and the NHL's "forward" (F) are not
       ((select count(*) from ref.position_alias b where b.source_code = a.source_code and b.league_code = a.league_code and b.raw_value = a.raw_value) = 1
        and not (a.league_code = 'nhl' and a.code = 'F')) as sure
from tok t join pl on pl.person_id = t.person_id
join ref.position_alias a on a.source_code = t.src and a.raw_value = t.tok and a.league_code = any (pl.lg);

-- The main position is the first sure one in the order the sources gave them, else the first. A "forward" (F) is dropped when the person
-- also has a more exact forward position (C, LW or RW) from any source.
create temp table want on commit drop as
select person_id, array_agg(code order by not sure, first_ord) as codes
from (select m.person_id, m.code, bool_or(m.sure) as sure, min(m.ord) as first_ord from mapped m
       where not (m.league_code = 'nhl' and m.code = 'F'
                  and exists (select 1 from mapped x where x.person_id = m.person_id and x.league_code = 'nhl' and x.code in ('C', 'LW', 'RW')))
       group by m.person_id, m.code) z
group by person_id;

update core.person p set primary_position = w.codes[1], positions = w.codes
from want w
where w.person_id = p.person_id and (p.primary_position is distinct from w.codes[1] or p.positions is distinct from w.codes);

update core.person p set primary_position = null, positions = null
where (p.primary_position is not null or p.positions is not null) and not exists (select 1 from want w where w.person_id = p.person_id);

-- Raw values nothing maps.
delete from meta.data_issue where entity_kind = 'position';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = u.src), 'position', u.src || ':' || u.leagues || ':' || u.tok,
       format('%s states the position "%s" for %s %s (%s), which the league''s position list does not hold', u.src, u.tok, u.n,
              case when u.n = 1 then 'person' else 'people' end, u.leagues),
       'Position left empty'
from (select t.src, array_to_string(pl.lg, '+') as leagues, t.tok, count(distinct t.person_id) as n
      from tok t join pl on pl.person_id = t.person_id
      where not exists (select 1 from ref.position_alias a where a.source_code = t.src and a.raw_value = t.tok and a.league_code = any (pl.lg))
      group by t.src, array_to_string(pl.lg, '+'), t.tok) u;

-- Raw values in tables that are not tied to a person (SPX's rosters, injuries and game logs, Wikipedia's award tables), by league.
create temp table other_raw on commit drop as
select src, lg, tok, sum(n) as n from (
  select src, lg, t.tok, n from (
    select 'spx'::text as src, 'nhl'::text as lg, lower(btrim(player_position)) as v, count(*) as n from legacy_spx.tbl_nhl_rosters group by 3
    union all select 'spx', 'nhl', lower(btrim(player_position)), count(*) from legacy_spx.tbl_nhl_rosters_raw_yahoo group by 3
    union all select 'spx', 'nhl', lower(btrim(player_position)), count(*) from legacy_spx.tbl_nhl_player_games_raw group by 3
    union all select 'spx', 'nhl', lower(btrim(position_name)), count(*) from legacy_spx.tbl_nhl_player_injuries group by 3
    union all select 'spx', 'nhl', lower(btrim(position_name)), count(*) from legacy_spx.tbl_nhl_goalie_injuries group by 3
    union all select 'spx', 'nhl', lower(btrim(position_name)), count(*) from legacy_spx.tbl_nhl_injuries_raw group by 3
    union all select 'spx', 'mlb', lower(btrim(player_position)), count(*) from legacy_spx.tbl_mlb_rosters group by 3
    union all select 'spx', 'mlb', lower(btrim(player_position)), count(*) from legacy_spx.tbl_mlb_rosters_raw_yahoo group by 3
    union all select 'spx', 'mlb', lower(btrim(player_position)), count(*) from legacy_spx.tbl_mlb_player_injuries group by 3
    union all select 'spx', 'mlb', lower(btrim(player_position)), count(*) from legacy_spx.tbl_mlb_player_injuries_raw group by 3
    union all select 'spx', 'nba', lower(btrim(player_position)), count(*) from legacy_spx.tbl_nba_rosters group by 3
    union all select 'spx', 'nba', lower(btrim(player_position)), count(*) from legacy_spx.tbl_nba_player_games_raw group by 3
    union all select 'spx', 'nfl', lower(btrim(player_position)), count(*) from legacy_spx.tbl_nfl_rosters group by 3
    union all select 'spx', 'nfl', lower(btrim(player_position)), count(*) from legacy_spx.tbl_nfl_rosters_raw_yahoo group by 3
    union all select 'wikipedia', substring(award_code from '^[a-z]+'), lower(btrim(position)), count(*) from legacy_wikipedia_awards.winner group by 2, 3) x
  cross join lateral regexp_split_to_table(x.v, '\s*[/,]\s*') as t(tok)
  where x.v is not null and t.tok <> '' and x.v !~ '<') y
group by src, lg, tok;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = case o.src when 'spx' then 'spx_database' else o.src end), 'position',
       o.src || ':' || o.lg || ':' || o.tok,
       format('%s has the position "%s" in %s rows (%s), which the league''s position list does not hold', o.src, o.tok, o.n, o.lg),
       'Not mapped'
from other_raw o
where not exists (select 1 from ref.position_alias a where a.source_code = o.src and a.raw_value = o.tok and a.league_code = o.lg)
  and not exists (select 1 from meta.data_issue d where d.entity_kind = 'position' and d.entity_key = o.src || ':' || o.lg || ':' || o.tok);

alter table core.person validate constraint person_primary_position_fk;

select (select count(*) from core.person where primary_position is not null) as with_position,
       (select count(*) from core.person where cardinality(positions) > 1) as with_more_than_one,
       (select count(*) from meta.data_issue where entity_kind = 'position') as unmapped_values;

commit;
