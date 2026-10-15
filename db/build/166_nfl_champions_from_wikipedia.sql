-- Champions of the NFL's early seasons and of the AFL, from the infobox of each "<year> NFL season" / "<year> AFL season" article
-- (English Wikipedia, CC BY-SA 4.0), kept in legacy_wikipedia_nfl.season.champion and legacy_wikipedia_afl.season.champion.
-- Step 165 works a champion out from the playoff games, which covers every season with a championship game (the NFL from 1932,
-- the AFL from 1960). The NFL's first twelve seasons (1920-1931) had no playoff: the title went to the club the owners or the
-- standings named, and that is what the article says, so it is recorded as such (source wikipedia, never worked out here).
--   * Only a season with no champion row from any other source is filled; a season step 165 decided is checked against the
--     article instead: a disagreement is logged in meta.data_issue, never overwritten.
--   * A champion's name is matched to the club's name that season; an unmatched name is kept as text and logged.
-- Runs after 165, before 172. Rerunnable: it takes back its own rows first.
begin;

create temp table src as select source_id from meta.source where code = 'wikipedia';

delete from core.award_winner where source_id = (select source_id from src) and source_key like 'wpchamp:%';
delete from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NFL|AFL) champion';

create temp table wc as
select 'nfl' lg, season, champion from legacy_wikipedia_nfl.season where champion is not null
union all select 'afl', season, champion from legacy_wikipedia_afl.season where champion is not null;

create temp table wcm as
select wc.lg, wc.season, wc.champion, s.season_id, a.award_id, t.team_season_id,
       exists (select 1 from core.award_winner w where w.season_id = s.season_id and w.award_id = a.award_id and w.source_id <> (select source_id from src)) as decided
from wc
join core.season s on s.league_code = wc.lg and s.start_year = wc.season
join core.award a on a.league_code = wc.lg and a.kind = 'championship'
left join lateral (select ts.team_season_id from core.team_season ts join core.franchise_identity i using (franchise_identity_id)
                   where ts.season_id = s.season_id and lower(i.full_name) = lower(wc.champion) limit 1) t on true;

insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select award_id, season_id, team_season_id, champion,
       'Named champion by the season article; the league played no championship game that season',
       (select source_id from src), 'wpchamp:' || lg || ':' || season
from wcm where not decided
on conflict do nothing;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'award_winner', 'wpchamp:' || lg || ':' || season,
       format('%s champion: the %s article names %s, which matches no club of that season', upper(lg), season, champion),
       'Kept as the champion''s name, with no club linked'
from wcm where not decided and team_season_id is null;

-- A season whose champion step 165 worked out from the games: does the article agree?
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'award_winner', 'wpchamp:' || m.lg || ':' || m.season,
       format('%s champion: the %s article names %s; the playoff games give %s', upper(m.lg), m.season, m.champion, string_agg(w.winner_name, ', ')),
       'Kept the champion the games give'
from wcm m join core.award_winner w on w.season_id = m.season_id and w.award_id = m.award_id and w.source_id <> (select source_id from src)
where m.decided
group by m.lg, m.season, m.champion
having not bool_or(lower(w.winner_name) = lower(m.champion));

select lg, count(*) filter (where not decided) filled, count(*) filter (where decided) checked_against_games,
       count(*) filter (where not decided and team_season_id is null) unlinked
from wcm group by lg order by lg;
select count(*) as disagreements from meta.data_issue where source_id = (select source_id from src) and issue ~ '^(NFL|AFL) champion: the [0-9]+ article names .*; the playoff games give';
commit;
