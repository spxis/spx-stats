-- Put api.season_summary_new (migration 151) in place of api.season_summary, in one short transaction: the old copy is dropped, the new one and its
-- index take the old names, select is granted to anon and authenticated, the comment is copied. api.swap_matview() (097) gives up after 5 seconds
-- rather than queue behind a running refresh while readers queue behind it: run this again when no refresh is running. api.refresh() needs no change.
-- Needs 097 and 151.
begin;
set local lock_timeout = '5s';
select api.swap_matview('season_summary', 'season_summary_new');
comment on materialized view api.season_summary is 'One row per season: games, teams and the champion; none when the best championship rows are more than one (a tied series). Migration 151.';
commit;
