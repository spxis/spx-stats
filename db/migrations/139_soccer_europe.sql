-- European club leagues in the soccer family. Add-only: one new table, two new columns on core.soccer_team, two new views.
-- Design (docs/soccer-europe.md): the same shape as MLS (docs/mls.md). A division is a league of its own (ref.league, sport soccer:
-- premier_league, efl_championship, la_liga, ...); a season of it is a core.soccer_tournament (tournament_id = league_code + start year,
-- premier_league2005); a club is a core.soccer_team of kind 'club'; the clubs of a season are core.soccer_tournament_team; a match is
-- a core.soccer_match whose source_key is eu-<yyyymmdd>-<home team_id>-<away team_id>, so two sources that know the same match meet on one row.
-- Promotion and relegation are not stored: ref.soccer_league_system says which divisions form one pyramid and in what order, and
-- api.soccer_club_moves reads a club's step between two consecutive seasons from the memberships.
-- Nothing here touches core.game, core.team_season, core.franchise or any venue table.
-- Filled by db/build/220_soccer_europe_spx.sql (SPX's own 2004-2006 European fixtures and scores; later loads add openfootball and Wikipedia).
begin;

create table if not exists ref.soccer_league_system (
  league_code   text primary key references ref.league,
  system_key    text not null,                       -- one national pyramid: england, scotland, spain, germany, italy, france, netherlands
  country_code  text references ref.country,         -- GB for England and Scotland (as core.soccer_team does)
  tier          smallint not null check (tier >= 1), -- 1 is the top division
  unique (system_key, tier)
);
comment on table ref.soccer_league_system is 'Which divisions form one national pyramid and in what order. A club moving to a lower tier number between two seasons was promoted, to a higher one relegated.';

alter table core.soccer_team add column if not exists source_key text;   -- how the source names the club (spx:team:1068); MLS and national teams leave it empty
create unique index if not exists soccer_team_source_key_idx on core.soccer_team (source_id, source_key) where source_key is not null;
comment on column core.soccer_team.source_key is 'The source''s own key for a club: spx:team:<SPX team id> for the clubs read from the SPX database.';

alter table core.soccer_tournament add column if not exists note text;   -- why a season is partial, as the build knows it (plain English)
comment on column core.soccer_tournament.note is 'Plain-language note on what the season holds (for example that only part of its matches are known).';

-- one row per club per season of a European league
create or replace view api.soccer_club_seasons as
select t.tournament_id, t.league_code as league, t.year, ls.system_key, ls.tier,
       tt.team_id, c.slug as team_slug, coalesce(tt.team_name, c.name) as team_name, c.country_code, t.complete,
       (select count(*)::int from core.soccer_match m where m.tournament_id = t.tournament_id
          and (m.home_team_id = tt.team_id or m.away_team_id = tt.team_id)) as matches
from core.soccer_tournament_team tt
join core.soccer_tournament t using (tournament_id)
join ref.soccer_league_system ls on ls.league_code = t.league_code
join core.soccer_team c on c.team_id = tt.team_id;

-- a club's step from one season to the next in its pyramid; move is null when the club is not in the next year's data
create or replace view api.soccer_club_moves as
select s.team_id, s.team_slug, s.system_key, s.year as from_year, s.league as from_league, s.tier as from_tier,
       n.year as to_year, n.league as to_league, n.tier as to_tier,
       case when n.tournament_id is null then null
            when n.tier < s.tier then 'promoted'
            when n.tier > s.tier then 'relegated'
            else 'stayed' end as move
from api.soccer_club_seasons s
left join api.soccer_club_seasons n
       on n.team_id = s.team_id and n.system_key = s.system_key and n.year = s.year + 1;

grant select on api.soccer_club_seasons, api.soccer_club_moves to anon, authenticated;

commit;
