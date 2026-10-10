-- The championships and awards spx-stats keeps, by league. Which ones to keep
-- is editorial (this list); each one's name is Wikidata's English label, and its
-- Wikidata item is kept as an external id. Winners are added by 165 and 170.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikidata', 'Wikidata', 'dataset', 'CC0 1.0', 'Wikidata (www.wikidata.org), CC0.', 'https://www.wikidata.org',
        'Award names and winners, and championship results, from the Wikidata query service.')
on conflict (code) do nothing;
insert into meta.source (code, name, kind, notes)
values ('spx_stats_derived', 'Worked out by spx-stats', 'manual',
        'Values worked out from other sources'' data by a rule in db/build, such as a champion from the final series'' results.')
on conflict (code) do nothing;

delete from core.award;  -- cascades to names and winners

create temp table catalogue (qid text, league_code text, code text, kind core.award_kind, description text);
insert into catalogue values
 ('Q211872','nhl','nhl_stanley_cup','championship','Won by the playoff champion.'),
 ('Q250246','nhl','nhl_presidents_trophy','team_award','The team with the most regular-season points.'),
 ('Q678383','nhl','nhl_hart','person_award','Most valuable player.'),
 ('Q832447','nhl','nhl_ted_lindsay','person_award','Most outstanding player, chosen by the players.'),
 ('Q705707','nhl','nhl_art_ross','person_award','Most regular-season points.'),
 ('Q826079','nhl','nhl_rocket_richard','person_award','Most regular-season goals.'),
 ('Q221401','nhl','nhl_vezina','person_award','Best goaltender.'),
 ('Q752423','nhl','nhl_norris','person_award','Best defenceman.'),
 ('Q726480','nhl','nhl_calder','person_award','Rookie of the year.'),
 ('Q176834','nhl','nhl_conn_smythe','person_award','Most valuable player of the playoffs.'),
 ('Q785207','nhl','nhl_selke','person_award','Best defensive forward.'),
 ('Q516636','nhl','nhl_lady_byng','person_award','Sportsmanship and gentlemanly conduct.'),
 ('Q795029','nhl','nhl_masterton','person_award','Perseverance and dedication to hockey.'),
 ('Q250753','nhl','nhl_king_clancy','person_award','Leadership and humanitarian contribution.'),
 ('Q508631','nhl','nhl_jennings','person_award','Goaltenders of the team allowing the fewest goals.'),
 ('Q757037','nhl','nhl_jack_adams','person_award','Coach of the year.'),
 ('Q1572029','nhl','nhl_gm_of_the_year','person_award','General manager of the year.'),
 ('Q31736','nba','nba_larry_obrien','championship','The NBA Finals winner''s trophy.'),
 ('Q222047','nba','nba_mvp','person_award','Most valuable player.'),
 ('Q739499','nba','nba_finals_mvp','person_award','Most valuable player of the NBA Finals.'),
 ('Q644357','nba','nba_rookie_of_the_year','person_award','Rookie of the year.'),
 ('Q845884','nba','nba_defensive_player','person_award','Defensive player of the year.'),
 ('Q844517','nba','nba_sixth_man','person_award','Best player coming off the bench.'),
 ('Q1125399','nba','nba_most_improved','person_award','Most improved player.'),
 ('Q918054','nba','nba_coach_of_the_year','person_award','Coach of the year.'),
 ('Q265538','mlb','mlb_world_series','championship','Won by the World Series champion, who receives the Commissioner''s Trophy.'),
 ('Q1514249','mlb','mlb_mvp','person_award','Most valuable player, one in each league.'),
 ('Q634857','mlb','mlb_cy_young','person_award','Best pitcher, one in each league.'),
 ('Q594227','mlb','mlb_rookie_of_the_year','person_award','Rookie of the year, one in each league.'),
 ('Q1372040','mlb','mlb_world_series_mvp','person_award','Most valuable player of the World Series.'),
 ('Q800048','mlb','mlb_manager_of_the_year','person_award','Manager of the year, one in each league.'),
 ('Q1518478','mlb','mlb_hank_aaron','person_award','Best hitter, one in each league.'),
 ('Q1366948','mlb','mlb_silver_slugger','person_award','Best hitter at each position.'),
 ('Q120649','mlb','mlb_gold_glove','person_award','Best fielder at each position.'),
 ('Q843859','mlb','mlb_rolaids_relief_man','person_award','Best relief pitcher (1976-2012).'),
 ('Q32096','nfl','nfl_super_bowl','championship','The NFL championship game; its winner receives the Vince Lombardi Trophy.'),
 ('Q28455235','nfl','nfl_ap_mvp','person_award','Most valuable player (Associated Press).'),
 ('Q1079382','nfl','nfl_super_bowl_mvp','person_award','Most valuable player of the Super Bowl.'),
 ('Q119677','nfl','nfl_ap_offensive_player','person_award','Offensive player of the year (Associated Press).'),
 ('Q835765','nfl','nfl_ap_defensive_player','person_award','Defensive player of the year (Associated Press).'),
 ('Q171408','cfl','cfl_grey_cup','championship','The CFL championship game and its trophy.'),
 ('Q5010666','cfl','cfl_most_outstanding_player','person_award','Most outstanding player.'),
 ('Q5010663','cfl','cfl_most_outstanding_canadian','person_award','Most outstanding Canadian player.'),
 ('Q5010662','cfl','cfl_most_outstanding_defensive','person_award','Most outstanding defensive player.'),
 ('Q5010664','cfl','cfl_most_outstanding_lineman','person_award','Most outstanding offensive lineman.'),
 ('Q5010667','cfl','cfl_most_outstanding_rookie','person_award','Most outstanding rookie.'),
 ('Q6218316','cfl','cfl_special_teams','person_award','Most outstanding special teams player (John Agro Special Teams Award).'),
 ('Q4769521','cfl','cfl_coach_of_the_year','person_award','Coach of the year (Annis Stukus Trophy).'),
 ('Q5608144','cfl','cfl_grey_cup_mvp','person_award','Most valuable player of the Grey Cup.');

insert into core.award (league_code, code, name, kind, description, source_id)
select c.league_code, c.code, coalesce(w.label, c.code), c.kind, c.description, (select source_id from meta.source where code = 'wikidata')
from catalogue c
left join lateral (select r.row->>'label' as label from legacy_wikidata.result r
                   where r.query_name like 'award_items%' and r.row->>'item' = 'http://www.wikidata.org/entity/' || c.qid limit 1) w on true;

delete from core.external_id where entity_kind = 'award';
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'award', a.award_id, (select source_id from meta.source where code = 'wikidata'), c.qid
from core.award a join catalogue c using (code);

select league_code, count(*) from core.award group by 1 order by 1;
commit;
