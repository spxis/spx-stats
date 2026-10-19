-- Club seasons of the NHL's rival and predecessor leagues (NHA, PCHA, WCHL/WHL, WHA) whose games on file are fewer than the games the same club's record
-- counts (core.standing, source_key 'wph:%', step 154). English Wikipedia's season articles of the WCHL/WHL tabulate standings and playoffs only, and the PCHA
-- and WCHL clubs have no season articles of their own (39 of 41 and 24 of 24 looked up on 2026-10-18 do not exist), so no allowed source lists those
-- games; a few WHA clubs' articles list part of the year. A hole, logged and never guessed: one row per club season in meta.data_issue, entity_kind
-- 'team_season', entity_key '<season start year>:<club name>' (the key shape of 147_nba_log_gaps and 146_cfl_log_gaps).
-- Runs after 154_hockey_rivals_from_wikipedia.sql, which deletes every 'NHA|PCHA|WCHL|WHA' issue first. A rerun deletes only the rows this step wrote.
-- Rerunnable, writes nothing but meta.data_issue.
begin;
delete from meta.data_issue d using meta.source s
where d.source_id = s.source_id and s.code = 'wikipedia' and d.issue ~ '^(NHA|PCHA|WCHL|WHA): club season has fewer games on file than its record$';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'team_season', se.start_year || ':' || api.team_name(ts.team_season_id),
       upper(se.league_code) || ': club season has fewer games on file than its record',
       format('%s of %s regular-season games on file; the league''s season article and the club''s own article (if any) on English Wikipedia list no more, and no allowed source does', coalesce(g.n, 0), st.games_played)
from core.team_season ts
join core.season se on se.season_id = ts.season_id and se.league_code in ('nha', 'pcha', 'wchl', 'wha')
join lateral (select max(s.games_played) as games_played from core.standing s
              where s.team_season_id = ts.team_season_id and s.phase = 'regular' and s.source_key like 'wph:%') st on st.games_played is not null
left join lateral (select count(*) as n from core.game x
                   where x.phase = 'regular' and x.status = 'final' and (x.home_team_season_id = ts.team_season_id or x.away_team_season_id = ts.team_season_id)) g on true
where coalesce(g.n, 0) < st.games_played;

select count(*) as club_seasons_with_gaps from meta.data_issue where issue ~ '^(NHA|PCHA|WCHL|WHA): club season has fewer games on file than its record$';
commit;
