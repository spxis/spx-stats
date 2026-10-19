-- NBA club seasons whose games on file are fewer than the games the same club's record counts (core.standing from English Wikipedia's standings
-- templates, source_key 'wpnba:%'). The usual cause: the club-season article's game log is empty or covers part of the year, and no allowed source
-- (Basketball-Reference, ESPN and the NBA's own feeds are not) lists the rest. A hole, logged and never guessed: one row per club season in
-- meta.data_issue, entity_kind 'team_season', entity_key '<season start year>:<club name>' (the same key 147 uses for team seasons).
-- Runs after 147_nba_from_wikipedia.sql, which deletes every 'NBA:%' issue first. The rows this step writes carry the issue text below; a rerun deletes only those.
-- Rerunnable, writes nothing but meta.data_issue.
begin;
delete from meta.data_issue d using meta.source s
where d.source_id = s.source_id and s.code = 'wikipedia' and d.issue = 'NBA: club season has fewer games on file than its record';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'team_season', se.start_year || ':' || api.team_name(ts.team_season_id),
       'NBA: club season has fewer games on file than its record',
       format('%s of %s regular-season games on file; the club-season article''s game log is empty or partial and no allowed source lists the rest', coalesce(g.n, 0), st.games_played)
from core.team_season ts
join core.season se on se.season_id = ts.season_id and se.league_code = 'nba'
join lateral (select max(s.games_played) as games_played from core.standing s
              where s.team_season_id = ts.team_season_id and s.phase = 'regular' and s.source_key like 'wpnba:%') st on st.games_played is not null
left join lateral (select count(*) as n from core.game x
                   where x.phase = 'regular' and x.status = 'final' and (x.home_team_season_id = ts.team_season_id or x.away_team_season_id = ts.team_season_id)) g on true
where coalesce(g.n, 0) < st.games_played;

select count(*) as club_seasons_with_gaps from meta.data_issue where issue = 'NBA: club season has fewer games on file than its record';
commit;
