-- legacy_wikipedia_cfl.game: schedule_checked. A regular-season game only one club's page lists is added to
-- core.game by db/build/146 when this is true: that club's own schedule table is the whole season, with as many
-- games and the same wins, losses and ties as the published standings (scripts/wikipedia/parse.py,
-- complete_schedules). Playoff games read from the season article's tables are true as well. Add-only; DS1 only
-- (legacy schema, never published).
alter table legacy_wikipedia_cfl.game add column if not exists schedule_checked boolean not null default false;
comment on column legacy_wikipedia_cfl.game.schedule_checked is
  'true: two pages list the game, or the one page that does is a club schedule that adds up to the standings, or a playoff table row';
