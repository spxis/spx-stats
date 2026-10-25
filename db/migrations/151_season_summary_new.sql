-- api.season_summary named one of two tied clubs as champion: the World's Championship Series of 1885 and 1890 ended 3-3 with a tie and core.award_winner
-- holds one row per club, so `distinct on (season_id)` picked either and each refresh could flip it (DS1 and production disagreed, which stops the
-- same-data check of deploy-prebuilt). A season whose best-ranked championship rows are more than one now has NO champion (champion and
-- champion_franchise null); champion_note and champion_source still carry the note ("ended in a tie") and the source. Every other season is unchanged.
-- Built beside the live view (migration 097): readers do not see it. Swap it in with 152 in a second, short transaction. Needs 015 and 097.
-- Rerunnable: drops only its own api.season_summary_new.
drop materialized view if exists api.season_summary_new;
create materialized view api.season_summary_new as
with g as (
  select season_id,
         count(*) filter (where phase = 'regular' and status <> 'cancelled') as games,
         count(*) filter (where phase = 'regular' and status = 'final') as finals,
         count(*) filter (where phase = 'playoffs' and status = 'final') as playoff_finals,
         count(distinct home_team_season_id) as teams
  from core.game group by season_id),
c as (
  select season_id,
         case when count(*) = 1 then max(winner_name) end as winner_name,
         min(note) as note, min(source) as source,
         case when count(*) = 1 then max(franchise_id) end as franchise_id
  from (
    select w.season_id, w.winner_name, w.note, src.code as source, ts.franchise_id,
           rank() over (partition by w.season_id order by (src.code = 'spx_stats_derived') desc) as r
    from core.award_winner w join core.award a using (award_id) join meta.source src on src.source_id = w.source_id
    left join core.team_season ts on ts.team_season_id = w.team_season_id
    where a.kind = 'championship') x
  where r = 1 group by season_id)
select s.league_code as league, s.start_year as year, s.label, coalesce(g.games, 0) as games, coalesce(g.finals, 0) as finals,
       coalesce(g.playoff_finals, 0) as playoff_finals, coalesce(g.teams, 0) as teams,
       c.winner_name as champion, c.note as champion_note, c.source as champion_source, c.franchise_id as champion_franchise
from core.season s left join g using (season_id) left join c using (season_id);
create unique index season_summary_new_key on api.season_summary_new (league, year);
comment on materialized view api.season_summary_new is 'One row per season: games, teams and the champion; none when the best championship rows are more than one (a tied series). Migration 151.';
analyze api.season_summary_new;
