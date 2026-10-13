-- The venue of a game without a 380,000-row write to core.game. Follows 067_game_venue.sql and 073_game_venue_games.sql.
-- core.franchise_home_venue (067) says where each club played its home games, by period. core.game_venue holds only what that cannot say:
--   * a game played elsewhere (the venue differs from the club's venue that day): a Retrosheet park, an nflverse stadium, an NHL API venue, an event;
--   * every event and neutral-site game, even when the venue is the club's own;
--   * a game with venue_id null (basis 'unknown') where the club's period would otherwise name a venue: no source knows where it was played, or the
--     period's venue had not opened / had closed that day.
-- A game with no row is held at the venue of its home club's period that day (api.game_venue, core.game_venue_of). A few thousand rows, filled by
-- db/build/199_game_venue.sql. core.game.venue_id stays empty. The new objects are add-only and small; the legacy_game_venue.filled change applies
-- to DS1 and the working copy only.
--   api.game_venue  one row per game: its venue (venue_id null = unknown), how it is known (basis: home for the club's period, else the source), and
--                   the source and its key (Retrosheet park id, nflverse stadium name, NHL venue name, or the page an event row cites).
--   api.venue_game  the games held at a venue: the games of the clubs whose period names it (one index lookup per team season), minus the games
--                   core.game_venue moved elsewhere, plus the games core.game_venue puts there. Filter on venue_id.

create table if not exists core.game_venue (
  game_id     bigint primary key references core.game on delete cascade,
  venue_id    integer references core.venue,            -- null = no venue known
  basis       text not null check (basis in ('event', 'retrosheet', 'nflverse', 'nhlapi', 'home', 'unknown')),
  source_id   smallint references meta.source,
  source_key  text                                      -- Retrosheet park id, nflverse stadium, NHL venue string, or the page of an event row
);
create index if not exists game_venue_venue_idx on core.game_venue (venue_id) where venue_id is not null;
comment on table core.game_venue is 'Games whose venue is not the home club''s venue of that day (core.franchise_home_venue), every event and neutral-site game, and games with no known venue where the period would name one (venue_id null).';

create or replace function core.game_venue_of(p_game bigint) returns integer language sql stable as $$
  select case when gv.game_id is not null then gv.venue_id else h.venue_id end
  from core.game g
  left join core.game_venue gv on gv.game_id = g.game_id
  left join core.team_season ts on ts.team_season_id = g.home_team_season_id
  left join core.franchise_home_venue h on h.franchise_id = ts.franchise_id and h.valid_during @> g.game_date
  where g.game_id = p_game
$$;
comment on function core.game_venue_of(bigint) is 'The venue of a game: its core.game_venue row if there is one, else the venue of its home club''s period that day; null when unknown.';

create or replace view api.game_venue as
select g.game_id,
       case when gv.game_id is not null then gv.venue_id else h.venue_id end as venue_id,
       case when gv.game_id is not null then gv.basis when h.venue_id is not null then 'home' else 'unknown' end as basis,
       s.code as source, gv.source_key
from core.game g
left join core.game_venue gv on gv.game_id = g.game_id
left join meta.source s on s.source_id = gv.source_id
left join core.team_season ts on ts.team_season_id = g.home_team_season_id
left join core.franchise_home_venue h on h.franchise_id = ts.franchise_id and h.valid_during @> g.game_date;
comment on view api.game_venue is 'The venue of each game (null = unknown) and how it is known: home (the home club''s period that day) or the source named in core.game_venue.';
grant select on api.game_venue to anon, authenticated;

create or replace view api.venue_game as
select h.venue_id, g.game_id, g.game_date, g.season_id, s.league_code as league, g.phase, g.status,
       g.home_team_season_id, g.away_team_season_id, g.home_score, g.away_score, g.is_neutral_site, 'home'::text as basis
from core.franchise_home_venue h
join core.team_season ts on ts.franchise_id = h.franchise_id
join core.game g on g.home_team_season_id = ts.team_season_id and h.valid_during @> g.game_date
join core.season s on s.season_id = g.season_id
where not exists (select 1 from core.game_venue gv where gv.game_id = g.game_id)
union all
select gv.venue_id, g.game_id, g.game_date, g.season_id, s.league_code, g.phase, g.status,
       g.home_team_season_id, g.away_team_season_id, g.home_score, g.away_score, g.is_neutral_site, gv.basis
from core.game_venue gv
join core.game g on g.game_id = gv.game_id
join core.season s on s.season_id = g.season_id
where gv.venue_id is not null;
comment on view api.venue_game is 'The games held at a venue (filter on venue_id): the home clubs'' games in its periods that no core.game_venue row moves elsewhere, plus the core.game_venue rows that put a game there.';
grant select on api.venue_game to anon, authenticated;

do $$
begin
  if to_regclass('legacy_game_venue.filled') is not null then
    alter table legacy_game_venue.filled add column if not exists wrote_venue boolean not null default true;   -- false: only the flags of core.game were changed
  end if;
end $$;
