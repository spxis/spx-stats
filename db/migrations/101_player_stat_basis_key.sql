-- core.player_season_stat.stat_basis and source_key.
-- stat_basis: what the numbers of a season line are, for sources that give averages. NULL (every existing row): counting
-- numbers as the source states them. 'total': the source gives season totals. 'per_game': the source gives per-game averages only; the totals
-- the line also holds (points, rebounds ...) are those averages times the games played, rounded, so they can be off by half a game's worth.
-- 'both': the source gives totals and per-game averages (the totals are exact).
-- source_key: where in the source a line was read, when the source is an article: 'enwiki:<article title>@<revision id>' (CC BY-SA 4.0: the article's
-- history lists its authors). NULL for every existing row. Add-only; no data changes. Rerunnable.
alter table core.player_season_stat add column if not exists stat_basis text check (stat_basis in ('total', 'per_game', 'both'));
comment on column core.player_season_stat.stat_basis is 'NULL: counting numbers as stated. per_game: the source gives averages only; totals are average x games, rounded. total, both: the source gives season totals.';
alter table core.player_season_stat add column if not exists source_key text;
comment on column core.player_season_stat.source_key is 'Where the line was read: enwiki:<article title>@<revision id> for a Wikipedia table. NULL otherwise.';

-- api.person_career_totals (032) adds up every number of a line's stats over a career. A per-game average (a_pts ...) or a percentage (p_fg ...) is not a
-- counting number and adding it up means nothing, so keys that start with a_ or p_ are left out of the sums. Same columns; no key of any existing group
-- starts that way.
create or replace view api.person_career_totals as
with rows as (
  select x.person_id, s.league_code as league, x.phase::text as phase, x.stat_group, s.season_id, ts.team_season_id, x.games_played, x.stats
  from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
  where x.is_total is not true),
sums as (
  select r.person_id, r.league, r.phase, r.stat_group, e.key, sum(e.value::numeric) as v
  from rows r cross join lateral jsonb_each_text(r.stats) e
  where e.value ~ '^-?[0-9]+(\.[0-9]+)?$' and e.key !~ '^(a|p)_'
  group by 1, 2, 3, 4, 5),
agg as (
  select person_id, league, phase, stat_group, jsonb_object_agg(key, v) as stats from sums group by 1, 2, 3, 4),
meta as (
  select person_id, league, phase, stat_group, count(distinct season_id)::int as seasons, count(distinct team_season_id)::int as team_seasons,
         sum(games_played)::int as games_played
  from rows group by 1, 2, 3, 4)
select m.person_id, m.league, m.phase, m.stat_group, m.seasons, m.team_seasons, m.games_played, a.stats
from meta m join agg a using (person_id, league, phase, stat_group);
