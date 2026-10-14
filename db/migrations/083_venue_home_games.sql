-- Venue pages: who played at a venue (from the home-venue periods) and what was played there (games, finals), for /venues and /venue/<slug>.
-- Add-only: two small core tables, one plain view over the periods and four views over the new tables. Nothing existing is changed.
--
-- api.venue_home_period  core.franchise_home_venue (migration 067, 652 periods) with the venue's Wikidata id, the franchise's league and its last season, so a page
--                        can list every club that used a venue (the brand layer misses tenants such as the Blue Jays at Exhibition Stadium 1977-89).
--                        valid_to is null while the period is open; last_season and league_last let a reader see an open period whose franchise folded.
-- core.venue_game_season one row per venue, league and season: games played (final), regular season, playoffs, games of the season's final, first and last date.
-- core.venue_final_game  one row per game of a season's final that was played at a venue (about 1,850 rows in all).
--   Both are built from api.venue_game by db/build/209_venue_game_summary.sql (rerunnable), because the live view takes 10 s to count the whole archive and a
--   page may not wait that long. After a new season is loaded or scores change, rerun that step on DS1 and release both tables (AGENTS.md section 8, item 5).
-- api.venue_game_season, api.venue_game_total, api.venue_final_game  the same rows with the Wikidata id of the venue (the key a page has) and, for the finals, the clubs.
--
-- A season's final is defined as db/build/165_champions.sql does it: the games between the two teams of the season's last playoff game (the NFL and CFL: that
-- game alone), and only in a season that has a championship on record.
-- On production: apply this file, then a data release of core.venue_game_season and core.venue_final_game (AGENTS.md section 8, item 5).

create or replace view api.venue_home_period as
select h.venue_id,
       v.source_key as wikidata_id,
       h.franchise_id,
       f.league,
       lower(h.valid_during) as valid_from,
       upper(h.valid_during) as valid_to,
       h.basis,
       f.last_season,
       ll.league_last
from core.franchise_home_venue h
join core.venue v on v.venue_id = h.venue_id
join lateral (
  select s.league_code as league, max(s.start_year) as last_season
  from core.team_season ts
  join core.season s on s.season_id = ts.season_id
  where ts.franchise_id = h.franchise_id
  group by s.league_code
  order by count(*) desc
  limit 1
) f on true
join (select league_code, max(start_year) as league_last from core.season group by 1) ll on ll.league_code = f.league
where v.source_key ~ '^Q[0-9]+$';
comment on view api.venue_home_period is 'Where each club played its home games, by period (valid_from, valid_to null = open), with the venue''s Wikidata id; last_season is the franchise''s last season and league_last its league''s latest, so an open period of a folded franchise can be told.';
grant select on api.venue_home_period to anon, authenticated;

create table if not exists core.venue_game_season (
  venue_id       integer  not null references core.venue,
  league_code    text     not null,
  season_id      integer  not null references core.season,
  games          integer  not null check (games > 0),   -- games played (status final) at the venue that season
  regular_games  integer  not null,
  playoff_games  integer  not null,
  final_games    integer  not null,                     -- of those, games of the season's final
  first_date     date     not null,
  last_date      date     not null,
  primary key (venue_id, league_code, season_id)
);
comment on table core.venue_game_season is 'Games played at a venue, by league and season, from api.venue_game. Built by db/build/209_venue_game_summary.sql.';

create table if not exists core.venue_final_game (
  game_id    bigint  primary key references core.game on delete cascade,
  venue_id   integer not null references core.venue,
  season_id  integer not null references core.season
);
create index if not exists venue_final_game_venue_idx on core.venue_final_game (venue_id);
comment on table core.venue_final_game is 'Games of a season''s final and the venue each was played at. Built by db/build/209_venue_game_summary.sql.';

create or replace view api.venue_game_season as
select s.venue_id, v.source_key as wikidata_id, s.league_code as league, ss.start_year as year,
       s.games, s.regular_games, s.playoff_games, s.final_games, s.first_date, s.last_date
from core.venue_game_season s
join core.venue v on v.venue_id = s.venue_id
join core.season ss on ss.season_id = s.season_id
where v.source_key ~ '^Q[0-9]+$';
comment on view api.venue_game_season is 'Games played at a venue by league and season (year = the season''s first year); final_games are games of the season''s final.';
grant select on api.venue_game_season to anon, authenticated;

create or replace view api.venue_game_total as
select s.venue_id, v.source_key as wikidata_id, sum(s.games)::integer as games, sum(s.final_games)::integer as final_games,
       min(s.first_date) as first_date, max(s.last_date) as last_date
from core.venue_game_season s
join core.venue v on v.venue_id = s.venue_id
where v.source_key ~ '^Q[0-9]+$'
group by s.venue_id, v.source_key;
comment on view api.venue_game_total is 'Games played at each venue in all (one row per venue), with the games of finals and the first and last date.';
grant select on api.venue_game_total to anon, authenticated;

create or replace view api.venue_final_game as
select f.venue_id, v.source_key as wikidata_id, g.game_id, g.game_date, ss.league_code as league, ss.start_year as year, g.round_label,
       hts.franchise_id as home_franchise_id, ats.franchise_id as away_franchise_id, g.home_score, g.away_score
from core.venue_final_game f
join core.venue v on v.venue_id = f.venue_id
join core.game g on g.game_id = f.game_id
join core.season ss on ss.season_id = f.season_id
join core.team_season hts on hts.team_season_id = g.home_team_season_id
join core.team_season ats on ats.team_season_id = g.away_team_season_id
where v.source_key ~ '^Q[0-9]+$';
comment on view api.venue_final_game is 'The games of a season''s final played at a venue, with the two clubs (franchise ids) and the score.';
grant select on api.venue_final_game to anon, authenticated;
