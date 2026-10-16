-- NFL week and the Retrosheet box key, computed from core.game.source_key.
-- That column is already published. This adds nothing to store: no new table, no new
-- column on a table, about 0 MB. core.external_id game rows stay unpublished.
--
-- A game whose source is nflverse has source_key nflverse:2024_01_BAL_KC (season, week,
-- away, home). nfl_week is that week. A game matched onto an older row keeps the older
-- source key, so nfl_week is null there (about 2,666 NFL games, 2002-2011) and the site
-- links to the schedule instead. The week is never taken from the date.
--
-- A game whose source is retrosheet has source_key retro:20251101:TOR:LAN:0:worldseries
-- (date, home, away, game number, type). retro_box is the home code and the game number,
-- TOR:0, which is what the box-score address needs. The site's own abbreviation is not
-- that code (LAD is not LAN). About 24,000 matched games have the id only in
-- core.external_id and get no retro_box.
--
-- Read on DS1 before this file: 4,882 NFL rows and 211,113 MLB rows would fill the two
-- columns. A table of only the unpublished remainder would be about 0.2 MB (NFL weeks)
-- and about 2 MB (MLB keys). Not added.
--
-- api.games gains nfl_week and retro_box at the end. nhl_id is unchanged.
-- core.game_league_id and core.game_official are not written. This file does not fill rows.

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
       o.nhl_id,
       case
         when g.source_key ~ '^nflverse:[0-9]{4}_[0-9]{2}_'
          and substring(g.source_key from 10 for 4) = s.start_year::text
          and substring(g.source_key from 15 for 2)::smallint between 1 and 22
         then substring(g.source_key from 15 for 2)::smallint
       end as nfl_week,
       case
         when g.source_key ~ '^retro:[0-9]{8}:[A-Z0-9]{3}:[A-Z0-9]{3}:[0-3]:'
          and substring(g.source_key from 7 for 8) = to_char(g.game_date, 'YYYYMMDD')
         then split_part(g.source_key, ':', 3) || ':' || split_part(g.source_key, ':', 5)
       end as retro_box
from core.game g
join core.season s using (season_id)
join meta.source src on src.source_id = g.source_id
left join core.game_league_id o on o.game_id = g.game_id
where g.status <> 'cancelled';

comment on view api.games is
  'One row per game that was not cancelled. starts_at is the scheduled start in UTC when a source recorded one, and null when none did. nhl_id is the NHL numeric game id when we have one, and null otherwise. nfl_week is the nflverse week when this game''s source key is that id, and null otherwise. retro_box is the Retrosheet home code and game number (TOR:0) when this game''s source key is that id, and null otherwise. None of these is inferred.';
comment on column api.games.nfl_week is
  'The week in an nflverse source key (2024_01_BAL_KC). Null when that key is not this game''s source key. Not derived from the date.';
comment on column api.games.retro_box is
  'Retrosheet home code and game number from a retrosheet source key, as TOR:0. The box-score file uses the home code, which is not always the abbreviation the site shows.';
grant select on api.games to anon, authenticated;
