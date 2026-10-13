-- Counts and a per-game hash of DS1, taken before and after a daily load (run.py --apply). psql variable :snap names the moment.
-- Needs the temp tables _snap and _gh, which run.py creates first. Read-only.
insert into _snap select :'snap', 'seasons', s.league_code, '', count(*) from core.season s group by 3;
insert into _snap select :'snap', 'team seasons', s.league_code, '', count(*) from core.team_season t join core.season s using (season_id) group by 3;
insert into _snap select :'snap', 'games by status', s.league_code, g.status::text, count(*) from core.game g join core.season s using (season_id) group by 3, 4;
insert into _snap select :'snap', 'games by source', s.league_code, src.code, count(*) from core.game g join core.season s using (season_id) join meta.source src on src.source_id = g.source_id group by 3, 4;
insert into _snap select :'snap', 'verifications', '', src.code || ' ' || v.status::text, count(*) from meta.verification v join meta.source src on src.source_id = v.source_id group by 3, 4;
insert into _snap select :'snap', 'data issues', '', coalesce(src.code, '(none)'), count(*) from meta.data_issue d left join meta.source src on src.source_id = d.source_id group by 3, 4;
insert into _snap select :'snap', 'external ids (game)', '', src.code, count(*) from core.external_id e join meta.source src on src.source_id = e.source_id where e.entity_kind = 'game' group by 3, 4;
insert into _gh
select :'snap', game_id, source_id, game_date,
       md5(row(season_id, phase, game_date, starts_at, home_team_season_id, away_team_season_id, venue_id, is_neutral_site, status,
               home_score, away_score, went_to_overtime, decided_by_shootout, original_date, broadcaster, notes, source_id, source_key)::text)
from core.game;
