-- The NHL's own game id, published on its own so the site can link to the league's game page and
-- notes. core.external_id already holds it (source nhl_api, external_key the 10 digits), but
-- production does not publish game rows of that table. This table holds only that one number.
-- About 70 thousand rows, a few megabytes. The big external_id table stays unpublished.
--
-- The table is core.game_league_id. core.game_official already exists (migration 020): it is the
-- referees and linesmen of a game, with a person_id. Do not write the NHL id there.
--
-- api.games gains nhl_id at the end. Null when this table has no row (every league but the NHL,
-- and an NHL game we never matched). The site then links to that day's scores instead.
--
-- On DS1, then on production, before the release that copies core.game_league_id.
-- Filling the rows is db/build/212_game_league_id.sql, not this file.
-- This file was first added as 115_game_official.sql; that name stole the referees table.

create table core.game_league_id (
  game_id  bigint primary key references core.game (game_id) on delete cascade,
  nhl_id   bigint not null check (nhl_id between 1000000000 and 9999999999)
);

comment on table core.game_league_id is
  'The NHL numeric game id for games we can link to the league site. One row per such game. No other league. Not core.game_official, which is the referees. Filled by db/build/212 from core.external_id on DS1.';
comment on column core.game_league_id.nhl_id is
  'Ten digits: season start year, type 01 preseason / 02 regular / 03 playoffs, and a four-digit number. The id the NHL publishes, never one we made up.';

grant select on core.game_league_id to anon, authenticated;

create or replace view api.games as
select s.league_code as league, s.start_year as year, g.game_id, g.game_date, g.phase::text as phase, g.status::text as status,
       g.away_team_season_id as away_id, api.team_name(g.away_team_season_id) as away, g.away_score,
       g.home_team_season_id as home_id, api.team_name(g.home_team_season_id) as home, g.home_score,
       g.went_to_overtime as overtime, src.code as source,
       (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v
         where v.entity_kind = 'game' and v.entity_id = g.game_id) as checked,
       (select franchise_id from core.team_season where team_season_id = g.away_team_season_id) as away_f,
       (select franchise_id from core.team_season where team_season_id = g.home_team_season_id) as home_f,
       g.starts_at,
       o.nhl_id
from core.game g
join core.season s using (season_id)
join meta.source src on src.source_id = g.source_id
left join core.game_league_id o on o.game_id = g.game_id
where g.status <> 'cancelled';

comment on view api.games is
  'One row per game that was not cancelled. starts_at is the scheduled start in UTC when a source recorded one, and null when none did. nhl_id is the NHL numeric game id when we have one, and null otherwise. Neither is inferred.';
grant select on api.games to anon, authenticated;
