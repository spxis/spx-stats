-- Every Stanley Cup Final from 1915 into core.cup_final and core.cup_final_game, from legacy_wikipedia_stanley_cup_final (English Wikipedia, CC BY-SA 4.0;
-- migrations 142 and 143, scripts/stanley_cup_final/). Run from the repo root, after the NHL is built (100, 145, 154, 165, 172) and db/build/210 (core.cup_series).
--  * Keys are the year and the game number, so a rerun changes no id: rows are updated in place, and only the rows this step wrote (source wikipedia) are removed
--    when the article is gone. Nothing in core.game is written; a game is only pointed at.
--  * A club of an NHL season is found by its name in that season (core.franchise_identity.full_name, accents and spacing ignored; three names the articles print
--    differently are listed below); a club of another league (1915-1926) takes the franchise core.cup_series already gives it.
--  * A game points at the core.game of the same two clubs in that NHL season when the number of their playoff games in core.game equals the number the article lists
--    (a club meets another once in a playoff year); the k-th by date is game k. When the counts differ nothing is linked and the year goes to meta.data_issue.
--  * Where this step and core.game disagree (a date, a score, the winner) it is written to meta.data_issue as "differs", never with the other source's numbers.
-- Rerunnable.
begin;

create or replace function pg_temp.nk(t text) returns text language sql immutable as
$$ select regexp_replace(translate(lower(t), 'éèêëáàâäíîïóôöúûüç', 'eeeeaaaaiiiooouuuc'), '[^a-z]', '', 'g') $$;

create temp table club_alias (wiki_name text, core_name text);
insert into club_alias values ('Toronto Hockey Club', 'Toronto Arenas'), ('Toronto', 'Toronto Arenas'), ('Mighty Ducks of Anaheim', 'Anaheim Ducks');

create temp table wp as select source_id from meta.source where code = 'wikipedia';

create temp table lf as
select f.*,
       case when f.cup_year >= 1918 then (select season_id from core.season where league_code = 'nhl' and start_year = f.cup_year - 1) end as nhl_season_id,
       (select cs.cup_series_id from core.cup_series cs where cs.cup_year = f.cup_year and cs.kind = 'final' order by cs.seq limit 1) as cup_series_id
from legacy_wikipedia_stanley_cup_final.final f;

-- Each side of each final: the club's name (the club-season article's, else the infobox's), its team season and franchise.
create temp table side as
select f.cup_year, s.n as side,
       case s.n when 1 then f.team1 else f.team2 end as team_name,
       coalesce(regexp_replace(case s.n when 1 then f.team1_article else f.team2_article end, '^\d{4}[–-]\d{2,4}\s+(.*?)\s+season$', '\1'),
                case s.n when 1 then f.team1 else f.team2 end) as club_name,
       f.nhl_season_id, f.cup_series_id
from lf f cross join (values (1), (2)) s(n);

create temp table side_ts as
select sd.*, ts.team_season_id, ts.franchise_id as ts_franchise_id
from side sd
left join lateral (
  select t.team_season_id, t.franchise_id
  from core.team_season t join core.franchise_identity fi on fi.franchise_identity_id = t.franchise_identity_id
  where t.season_id = sd.nhl_season_id
    and pg_temp.nk(fi.full_name) = pg_temp.nk(coalesce((select a.core_name from club_alias a where a.wiki_name = sd.club_name), sd.club_name))
  order by t.team_season_id limit 1
) ts on true;

create temp table side_fr as
select s.*, coalesce(s.ts_franchise_id,
         (select case when cs.winner_name = s.team_name then cs.winner_franchise_id when cs.loser_name = s.team_name then cs.loser_franchise_id end
          from core.cup_series cs where cs.cup_series_id = s.cup_series_id)) as franchise_id
from side_ts s;

insert into core.cup_final (cup_year, cup_series_id, nhl_season_id, first_day, last_day, dates_text, format,
                            team1_name, team1_league, team1_franchise_id, team1_team_season_id, team2_name, team2_league, team2_franchise_id, team2_team_season_id,
                            team1_games, team2_games, winner_side, conn_smythe_name, conn_smythe_team, cup_goal_by, cup_goal_detail, source_id, source_key)
select f.cup_year, f.cup_series_id, f.nhl_season_id, f.first_day, f.last_day, f.dates_text, f.format,
       case when length(a.club_name) > length(f.team1) and a.club_name like f.team1 || ' %' then a.club_name else f.team1 end, f.team1_league, a.franchise_id, a.team_season_id,
       case when length(b.club_name) > length(f.team2) and b.club_name like f.team2 || ' %' then b.club_name else f.team2 end, f.team2_league, b.franchise_id, b.team_season_id,
       f.team1_games, f.team2_games,
       case when f.winner is null then null when f.winner = f.team1 then 1 else 2 end,
       f.conn_smythe, f.conn_smythe_team, f.cup_goal_by, f.cup_goal_detail,
       (select source_id from wp), 'wikipedia:stanley_cup_final:' || f.cup_year || '@' || f.revision_id
from lf f
join side_fr a on a.cup_year = f.cup_year and a.side = 1
join side_fr b on b.cup_year = f.cup_year and b.side = 2
on conflict (cup_year) do update set
  cup_series_id = excluded.cup_series_id, nhl_season_id = excluded.nhl_season_id, first_day = excluded.first_day, last_day = excluded.last_day,
  dates_text = excluded.dates_text, format = excluded.format,
  team1_name = excluded.team1_name, team1_league = excluded.team1_league, team1_franchise_id = excluded.team1_franchise_id, team1_team_season_id = excluded.team1_team_season_id,
  team2_name = excluded.team2_name, team2_league = excluded.team2_league, team2_franchise_id = excluded.team2_franchise_id, team2_team_season_id = excluded.team2_team_season_id,
  team1_games = excluded.team1_games, team2_games = excluded.team2_games, winner_side = excluded.winner_side,
  conn_smythe_name = excluded.conn_smythe_name, conn_smythe_team = excluded.conn_smythe_team, cup_goal_by = excluded.cup_goal_by, cup_goal_detail = excluded.cup_goal_detail,
  source_id = excluded.source_id, source_key = excluded.source_key;

delete from core.cup_final where source_id = (select source_id from wp) and cup_year not in (select cup_year from lf);

insert into core.cup_final_game (cup_year, game_no, played_on, team1_score, team2_score, overtime_periods, home_side, venue_name, venue_city, source_id, source_key)
select g.cup_year, g.game_no, g.played_on, g.team1_score, g.team2_score, g.overtime_periods, g.home_side, g.venue, g.city,
       (select source_id from wp), 'wikipedia:stanley_cup_final:' || g.cup_year || ':' || g.game_no
from legacy_wikipedia_stanley_cup_final.game g
on conflict (cup_year, game_no) do update set
  played_on = excluded.played_on, team1_score = excluded.team1_score, team2_score = excluded.team2_score, overtime_periods = excluded.overtime_periods,
  home_side = excluded.home_side, venue_name = excluded.venue_name, venue_city = excluded.venue_city, source_id = excluded.source_id, source_key = excluded.source_key;

delete from core.cup_final_game c where c.source_id = (select source_id from wp)
  and not exists (select 1 from legacy_wikipedia_stanley_cup_final.game g where g.cup_year = c.cup_year and g.game_no = c.game_no);

-- The Conn Smythe row of core.award_winner for that NHL season, when the winner's name is the same.
update core.cup_final f set conn_smythe_award_winner_id = null;
update core.cup_final f set conn_smythe_award_winner_id = w.award_winner_id
from (select s.season_id, nk, min(aw.award_winner_id) as award_winner_id
      from core.award a join core.award_winner aw on aw.award_id = a.award_id
      join core.season s on s.season_id = aw.season_id
      cross join lateral (select pg_temp.nk(aw.winner_name) as nk) k
      where a.code = 'nhl_conn_smythe' group by s.season_id, nk) w
where w.season_id = f.nhl_season_id and w.nk = pg_temp.nk(f.conn_smythe_name);

-- Games: point at core.game when the two clubs' playoff games are as many as the article lists.
update core.cup_final_game set game_id = null where game_id is not null;
create temp table pg as
select f.cup_year, g.game_id, g.game_date, g.home_team_season_id, g.home_score, g.away_score,
       row_number() over (partition by f.cup_year order by g.game_date, g.game_id) as rn,
       count(*) over (partition by f.cup_year) as n
from core.cup_final f
join core.game g on g.season_id = f.nhl_season_id and g.phase = 'playoffs' and g.status in ('final', 'forfeit')
 and ((g.home_team_season_id = f.team1_team_season_id and g.away_team_season_id = f.team2_team_season_id)
   or (g.home_team_season_id = f.team2_team_season_id and g.away_team_season_id = f.team1_team_season_id))
where f.team1_team_season_id is not null and f.team2_team_season_id is not null;

update core.cup_final_game c set game_id = p.game_id
from pg p
where p.cup_year = c.cup_year and p.rn = c.game_no
  and p.n = (select count(*) from core.cup_final_game x where x.cup_year = c.cup_year);

-- meta.data_issue: this step's own rows are replaced.
delete from meta.data_issue where entity_kind = 'cup_final';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'cup_final', 'cup_final:' || u.cup_year,
       format('Stanley Cup Final %s: %s', u.cup_year, u.what || ': ' || u.detail),
       'Left empty or kept as the article lists it; nothing guessed'
from legacy_wikipedia_stanley_cup_final.unparsed u;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'cup_final', 'cup_final:' || f.cup_year,
       format('Stanley Cup Final %s: a club of the final could not be found among the NHL season''s team seasons (%s, %s); its games are not linked to core.game',
              f.cup_year, f.team1_name, f.team2_name),
       'Kept with the names the article prints'
from core.cup_final f
where f.nhl_season_id is not null and (f.team1_team_season_id is null or f.team2_team_season_id is null)
  and f.cup_year >= 1927;   -- before 1927 the other club of a final was often outside the NHL

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'cup_final', 'cup_final:' || f.cup_year,
       format('Stanley Cup Final %s: core.game holds a different number of playoff games between the two clubs than the article''s %s; no game linked', f.cup_year,
              (select count(*) from core.cup_final_game c where c.cup_year = f.cup_year)),
       'Both kept; core.cup_final_game.game_id stays empty for the year'
from core.cup_final f
where f.team1_team_season_id is not null and f.team2_team_season_id is not null
  and not exists (select 1 from core.cup_final_game c where c.cup_year = f.cup_year and c.game_id is not null);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'cup_final', 'cup_final:' || c.cup_year || ':' || c.game_no,
       format('Stanley Cup Final %s game %s: the article''s date %s differs from the date of the same game in core.game', c.cup_year, c.game_no, c.played_on),
       'Both kept'
from core.cup_final_game c join pg p on p.game_id = c.game_id
where c.played_on is not null and c.played_on <> p.game_date;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'cup_final', 'cup_final:' || c.cup_year || ':' || c.game_no,
       format('Stanley Cup Final %s game %s: the article''s score %s-%s differs from the score of the same game in core.game', c.cup_year, c.game_no, c.team1_score, c.team2_score),
       'Both kept'
from core.cup_final_game c join core.cup_final f on f.cup_year = c.cup_year join pg p on p.game_id = c.game_id
where c.team1_score is not null
  and not ((p.home_team_season_id = f.team1_team_season_id and p.home_score = c.team1_score and p.away_score = c.team2_score)
        or (p.home_team_season_id = f.team2_team_season_id and p.home_score = c.team2_score and p.away_score = c.team1_score));

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'cup_final', 'cup_final:' || f.cup_year,
       format('Stanley Cup Final %s: the article''s winner (%s) is not the club core''s Stanley Cup winner of that season', f.cup_year,
              case f.winner_side when 1 then f.team1_name else f.team2_name end),
       'Both kept'
from core.cup_final f
join core.award a on a.code = 'nhl_stanley_cup'
join core.award_winner w on w.award_id = a.award_id and w.season_id = f.nhl_season_id
join core.team_season ts on ts.team_season_id = w.team_season_id
where f.winner_side is not null and f.team1_franchise_id is not null and f.team2_franchise_id is not null
  and ts.franchise_id is distinct from (case f.winner_side when 1 then f.team1_franchise_id else f.team2_franchise_id end);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wp), 'cup_final', 'cup_final:' || f.cup_year,
       format('Stanley Cup Final %s: the Conn Smythe winner %s is not matched to a Conn Smythe row of core.award_winner for that season', f.cup_year, f.conn_smythe_name),
       'Kept as the article names him; no link'
from core.cup_final f
where f.conn_smythe_name is not null and f.nhl_season_id is not null and f.conn_smythe_award_winner_id is null;

select 'finals' as k, count(*)::text as n from core.cup_final
union all select 'games', count(*)::text from core.cup_final_game
union all select 'games with a day', count(*)::text from core.cup_final_game where played_on is not null
union all select 'finals with both clubs in an NHL season', count(*)::text from core.cup_final where team1_team_season_id is not null and team2_team_season_id is not null
union all select 'games linked to core.game', count(*)::text from core.cup_final_game where game_id is not null
union all select 'Conn Smythe linked', count(*)::text from core.cup_final where conn_smythe_award_winner_id is not null
union all select 'data issues', count(*)::text from meta.data_issue where entity_kind = 'cup_final';
commit;
