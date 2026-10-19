-- CFL club seasons whose games on file are fewer than the games the same club's record counts (core.standing from English Wikipedia's standings
-- templates, source_key 'wpcfl:%'). The usual cause: the club's season article (or the multi-season page a title redirects to) has no schedule or a
-- partial one, or the pages disagree and a game only one page lists is not trusted (schedule_checked, step 146); no allowed source lists the rest
-- (Sports Reference, ESPN and cfl.ca are not). A hole, logged and never guessed: one row per club season in meta.data_issue, entity_kind
-- 'team_season', entity_key '<season start year>:<club name>' (the key shape step 147_nba_log_gaps uses).
-- Runs after 146_cfl_from_wikipedia.sql, which deletes every 'CFL:%' issue first. The rows this step writes carry the issue text below; a rerun
-- deletes only those. Rerunnable, writes nothing but meta.data_issue.
begin;
delete from meta.data_issue d using meta.source s
where d.source_id = s.source_id and s.code = 'wikipedia' and d.issue = 'CFL: club season has fewer games on file than its record';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'team_season', se.start_year || ':' || api.team_name(ts.team_season_id),
       'CFL: club season has fewer games on file than its record',
       format('%s of %s regular-season games on file; the club-season article or schedule on English Wikipedia lists no more, and no allowed source does', coalesce(g.n, 0), st.games_played)
from core.team_season ts
join core.season se on se.season_id = ts.season_id and se.league_code = 'cfl'
join lateral (select max(s.games_played) as games_played from core.standing s
              where s.team_season_id = ts.team_season_id and s.phase = 'regular' and s.source_key like 'wpcfl:%') st on st.games_played is not null
left join lateral (select count(*) as n from core.game x
                   where x.phase = 'regular' and x.status = 'final' and (x.home_team_season_id = ts.team_season_id or x.away_team_season_id = ts.team_season_id)) g on true
where coalesce(g.n, 0) < st.games_played;

select count(*) as club_seasons_with_gaps from meta.data_issue where issue = 'CFL: club season has fewer games on file than its record';
commit;
