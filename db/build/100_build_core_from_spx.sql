-- Build core.* from legacy_spx for the five leagues. Safe to re-run: it
-- rebuilds everything that came from the SPX database and nothing else.
-- Rules (each one logged in meta.data_issue where it changes what SPX said):
--   * a game belongs to the league both of its teams play in, not the league
--     it was filed under (SPX filed 270 games under the wrong league);
--   * a game is final when SPX marked its score final, or when a score was
--     entered with no mark at all (no status, neither final nor not final):
--     before 2004 SPX did not mark results, so thousands of played games carry
--     a score and nothing else. Each such game is logged in meta.data_issue.
--     A score SPX marked not final (a lineup, a game in progress) is not a result;
--   * team names are as SPX last recorded them; SPX renamed teams in place
--     (the Expos' games read Washington), so identities here are provisional
--     until the identity history is loaded from a reference source;
--   * kick-off times are not converted: SPX stored local clock times with no
--     zone, so only the date is kept here and the time stays in legacy_spx.
begin;

delete from meta.data_issue where source_id in (select source_id from meta.source where code = 'spx_database');
delete from core.external_id where source_id in (select source_id from meta.source where code = 'spx_database');
delete from core.award_winner;  -- rebuilt by 165 and 170
delete from core.standing where source_id in (select source_id from meta.source where code = 'spx_database');
delete from core.betting_line; delete from core.game; delete from core.team_season;
delete from core.franchise_identity; delete from core.franchise_league; delete from core.franchise;
delete from core.season;

insert into meta.source (code, name, kind, licence, attribution, covers_from, covers_to, notes)
values ('spx_database', 'SPX (SportsInteractive.com) database', 'database_backup', 'Owned by SPX',
        'SPX (SportsInteractive.com), 1997-2012', '1997-01-01', '2012-04-30',
        'Merged from the SQL Server backups of January 2007 to January 2012; legacy_spx._seen_in names the backups each row was in.')
on conflict (code) do nothing;
insert into meta.source (code, name, kind, notes)
values ('editorial', 'spx-stats editorial', 'manual', 'Facts entered by the spx-stats editors, each to be confirmed against a reference source.')
on conflict (code) do nothing;

insert into ref.country (country_code, name)
select distinct on (upper(country_abb2)) upper(country_abb2), country_name
from legacy_spx.lk_iso3166 where country_abb2 ~ '^[A-Za-z]{2}$'
on conflict do nothing;
insert into ref.country values ('CA', 'Canada'), ('US', 'United States') on conflict do nothing;

insert into ref.sport values
  ('hockey', 'Hockey'), ('basketball', 'Basketball'), ('baseball', 'Baseball'),
  ('american_football', 'American football'), ('canadian_football', 'Canadian football')
on conflict do nothing;
insert into ref.league (league_code, sport_code, country_code) values
  ('nhl', 'hockey', null), ('nba', 'basketball', null), ('mlb', 'baseball', null),
  ('nfl', 'american_football', 'US'), ('cfl', 'canadian_football', 'CA')
on conflict do nothing;
insert into ref.league_name (league_code, valid_during, name, short_name) values
  ('nhl', daterange(null, null), 'National Hockey League', 'NHL'),
  ('nba', daterange(null, null), 'National Basketball Association', 'NBA'),
  ('mlb', daterange(null, null), 'Major League Baseball', 'MLB'),
  ('nfl', daterange(null, null), 'National Football League', 'NFL'),
  ('cfl', daterange(null, null), 'Canadian Football League', 'CFL')
on conflict do nothing;

create temp table spx_league (spx_league_id smallint primary key, league_code text not null);
insert into spx_league values (1, 'nhl'), (2, 'nba'), (3, 'mlb'), (4, 'nfl'), (5, 'cfl');

-- SPX team ids that are one franchise (a relocation that SPX kept as a new team).
create temp table spx_same_franchise (team_id integer primary key, franchise_of integer not null);
insert into spx_same_franchise values (2412, 53), (2419, 2);

create temp table spx_team as
select x.team_id, l.league_code, coalesce(sf.franchise_of, x.team_id) as franchise_key,
       t.team_city, t.team_name, t.team_short
from legacy_spx.xref_sport_team_leagues x
join spx_league l on l.spx_league_id = x.league_id
join legacy_spx.tbl_teams t using (team_id)
left join spx_same_franchise sf using (team_id);

-- Every SPX game between two teams of one of the five leagues.
create temp table spx_game as
select g.*, h.league_code,
       case when h.league_code in ('mlb', 'cfl') then extract(year from g.game_date)::smallint
            when extract(month from g.game_date) >= 7 then extract(year from g.game_date)::smallint
            else (extract(year from g.game_date) - 1)::smallint end as start_year,
       h.franchise_key as home_fk, a.franchise_key as away_fk,
       st.season_type_id
from legacy_spx.tbl_games g
join spx_team h on h.team_id = g.home_team_id
join spx_team a on a.team_id = g.away_team_id and a.league_code = h.league_code
left join legacy_spx.lk_sport_seasons st on st.season_id = g.season_id
where g.game_date is not null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_database'), 'game', 'spx:game:' || g.game_id,
       format('Filed under SPX league %s, but both teams play in %s', g.league_id, g.league_code),
       format('Placed in %s', g.league_code)
from spx_game g join spx_league l on l.league_code = g.league_code
where g.league_id is distinct from l.spx_league_id;

insert into core.season (league_code, start_year, end_year, label, games_per_team, source_id)
select distinct g.league_code, g.start_year,
       case when g.league_code in ('mlb', 'cfl') then g.start_year else g.start_year + 1 end,
       case when g.league_code in ('nhl', 'nba') then g.start_year || '-' || right((g.start_year + 1)::text, 2)
            else g.start_year::text end,
       case g.league_code
         when 'nhl' then case g.start_year when 2012 then 48 else 82 end
         when 'nba' then case g.start_year when 2011 then 66 when 1998 then 50 else 82 end
         when 'mlb' then 162 when 'nfl' then 16 when 'cfl' then 18 end,
       (select source_id from meta.source where code = 'spx_database')
from spx_game g;

insert into core.franchise (sport_code, source_id, source_key)
select distinct on (t.franchise_key) s.sport_code, src.source_id, t.franchise_key::text
from spx_team t join ref.league s using (league_code)
cross join (select source_id from meta.source where code = 'spx_database') src
order by t.franchise_key;

create temp table fmap as
select f.franchise_id, f.source_key::integer as franchise_key from core.franchise f
where f.source_id = (select source_id from meta.source where code = 'spx_database');

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'franchise', m.franchise_id, (select source_id from meta.source where code = 'spx_database'), 'team:' || t.team_id
from spx_team t join fmap m using (franchise_key);

-- One identity per SPX team row, over the dates SPX has games for it.
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code, source_id)
select m.franchise_id, daterange(r.d0, r.d1 + 1), t.team_city, coalesce(nullif(t.team_short, ''), t.team_name), t.team_name, null,
       case when t.team_city in ('Montreal', 'Toronto', 'Ottawa', 'Calgary', 'Edmonton', 'Vancouver', 'Winnipeg',
                                 'B.C.', 'Hamilton', 'Saskatchewan', 'Regina', 'Quebec') then 'CA' else 'US' end,
       (select source_id from meta.source where code = 'spx_database')
from spx_team t join fmap m using (franchise_key)
join (select team_id, min(d)::date d0, max(d)::date d1 from (
        select home_team_id team_id, game_date d from spx_game union all select away_team_id, game_date from spx_game) x
      group by team_id) r using (team_id);

insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select distinct i.franchise_id, t.league_code, i.valid_during, i.source_id
from core.franchise_identity i join fmap m using (franchise_id) join spx_team t using (franchise_key);

insert into core.team_season (franchise_id, season_id, franchise_identity_id, source_id)
select distinct on (m.franchise_id, s.season_id) m.franchise_id, s.season_id, i.franchise_identity_id,
       (select source_id from meta.source where code = 'spx_database')
from (select league_code, start_year, home_fk fk, game_date from spx_game
      union all select league_code, start_year, away_fk, game_date from spx_game) x
join fmap m on m.franchise_key = x.fk
join core.season s on s.league_code = x.league_code and s.start_year = x.start_year
left join core.franchise_identity i on i.franchise_id = m.franchise_id and i.valid_during @> x.game_date::date
order by m.franchise_id, s.season_id, x.game_date desc;

create temp table spx_final as
select distinct on (game_id) game_id, score_home, score_away, score_status, score_is_final is null as unmarked
from legacy_spx.tbl_game_scores
where score_is_final
   or (score_is_final is null and score_status is null and score_home is not null and score_away is not null)
order by game_id, score_is_final desc nulls last, score_type_id nulls last, score_id;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_database'), 'game', 'spx:game:' || f.game_id,
       'Score entered with no final mark', 'Taken as the final score'
from spx_final f join spx_game g using (game_id) where f.unmarked;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_database'), 'game', 'spx:game:' || f.game_id,
       'Score marked final with no score', 'Left as scheduled: the result is missing'
from spx_final f join spx_game g using (game_id) where f.score_home is null or f.score_away is null;

insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status,
                       home_score, away_score, went_to_overtime, original_date, broadcaster, notes,
                       source_id, source_key)
select s.season_id,
       case g.season_type_id when 1 then 'preseason' when 3 then 'playoffs' when 4 then 'all_star' else 'regular' end::core.season_phase,
       g.game_date::date, hts.team_season_id, ats.team_season_id,
       case when g.game_cancelled then 'cancelled'
            when f.score_home is not null and f.score_away is not null then 'final'
            else 'scheduled' end::core.game_status,
       f.score_home, f.score_away,
       case when f.score_status ~* 'OT|overtime|SO|extra' then true end,
       case when g.game_is_rescheduled then g.game_original_date::date end,
       nullif(trim(g.game_station), ''), nullif(trim(g.game_note), ''),
       (select source_id from meta.source where code = 'spx_database'), 'spx:game:' || g.game_id
from spx_game g
join core.season s on s.league_code = g.league_code and s.start_year = g.start_year
join fmap hm on hm.franchise_key = g.home_fk join core.team_season hts on hts.franchise_id = hm.franchise_id and hts.season_id = s.season_id
join fmap am on am.franchise_key = g.away_fk join core.team_season ats on ats.franchise_id = am.franchise_id and ats.season_id = s.season_id
left join spx_final f on f.game_id = g.game_id
where hm.franchise_id <> am.franchise_id;

insert into core.betting_line (game_id, source_id, source_key, set_by, offered_during, favourite, point_spread,
                               favourite_money_line, total, total_kind, total_price, recorded_at)
select cg.game_id, cg.source_id, 'spx:odds:' || o.game_odd_id,
       'SPX moderators, informed by lines published at the time',
       case when o.game_odd_start_date is not null or o.game_odd_end_date is not null
            then tsrange(o.game_odd_start_date, o.game_odd_end_date) end,
       case when o.game_odd_home_is_favourite then 'home' when o.game_odd_home_is_favourite = false then 'away' end,
       abs(o.game_odd_spread), o.game_odd_money, o.game_odd_total, nullif(trim(o.game_odd_total_type), ''),
       o.game_odd_total_lay, o.game_odd_timestamp
from legacy_spx.tbl_game_odds o
join core.game cg on cg.source_key = 'spx:game:' || o.game_id;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, substring(source_key from 5) from core.game where source_key like 'spx:game:%';

commit;
