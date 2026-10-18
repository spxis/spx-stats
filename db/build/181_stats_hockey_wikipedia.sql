-- Player statistics of the NHL's predecessor and rival leagues (NHA, PCHA, WCHL/WHL, WHA) from the player-statistics tables of the club-season
-- articles on English Wikipedia (CC BY-SA 4.0; legacy_wikipedia_hockey.player_line and player_article, migration 134; scripts/hockey/roster_articles.py)
-- into core.player_season_stat: one row per player, club, season, phase (regular, playoffs) and group ('skater', 'goalie', the NHL's own groups).
-- Rerunnable, and safe after scripts/build_core.sh has rebuilt team seasons: every key it uses is stable. Run after 154 (the clubs and team seasons)
-- and 179_players_wikidata (the people and their roster_stints), before 185_person_merge, 186 and 190.
--  * A line is placed only when everything is known: its name links to an article (a name with no link is never used and never matched on the name),
--    that article is a Wikidata item (legacy_rosters.wp_title, from the roster fetch) whose person 179 made (core.external_id: person, wikidata,
--    the Q-number), the article's club season is a team season (the franchise identity named as the club that season, in this league) and 179 placed
--    that person on that club that season (a core.roster_stint). Every reason a line is left out is counted in meta.data_issue
--    (entity_kind 'stat_player', 'stat_article'; entity_key 'wikipedia_hockey_stats:...').
--  * Skaters: games played, goals, assists, points, penalty minutes, and where the table has them plus-minus, power-play, short-handed and game-winning
--    goals. Goaltenders: games played, wins, losses, ties, goals against, shutouts, and shots against and saves where given. Average (GAA), save
--    percentage and minutes are not stored: the average and the percentage are worked out from the counts, and the minutes' unit is not the NHL
--    rows'. A cell that is not a whole number (a dash, "DNP", a range) is no number and is left out; a count above what a season can hold is dropped and
--    counted. A special-count column that is zero in every row of a club season's regular-season table (ten or more skaters) is a placeholder, not
--    a statistic, and is not stored for that club season.
--  * A player twice in one table keeps the row with more games; several tables of one phase and group (a club's skaters of two articles' tables) fill
--    only the keys the first lacks. Traded players have one row per club article, as the articles give them.
--  * source_key is 'enwiki:<article title>@<revision id>': the article revision the line was read from. stat_basis 'total'.
-- Provenance: source wikipedia, the key above; nothing is written in free text.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'dataset', 'CC BY-SA 4.0', 'Text and tables from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; see each article''s history for its authors.',
        'https://en.wikipedia.org', null, current_date, null)
on conflict (code) do nothing;
update meta.source set
  notes = coalesce(notes, '') || ' NHA, PCHA, WCHL and WHA player statistics tables of the club-season articles, read 2026-10-18 at the revisions named in core.player_season_stat.source_key; archived in legacy_files.raw_archive under wikipedia_hockey_old/.'
where code = 'wikipedia' and coalesce(notes, '') not like '%NHA, PCHA, WCHL and WHA player statistics tables%';
create temp table wsrc on commit drop as select source_id from meta.source where code = 'wikipedia';
create temp table wdsrc on commit drop as select source_id from meta.source where code = 'wikidata';

delete from core.player_season_stat x using core.team_season ts, core.season s
where x.source_id = (select source_id from wsrc) and x.stat_group in ('skater', 'goalie')
  and ts.team_season_id = x.team_season_id and s.season_id = ts.season_id and s.league_code in ('nha', 'pcha', 'wchl', 'wha');

-- ---- 1. Lines with their person and team season ------------------------------------------------------------------------------------
create temp table ln on commit drop as
select l.*, a.page_title, a.revid, coalesce(rd.to_qid, t.qid) as qid, px.entity_id as person_id, ts.team_season_id,
       case when l.link_title is null then 'no_link'
            when t.title is null or t.qid is null or t.missing or t.disambiguation then 'no_qid'
            when px.entity_id is null then 'no_person'
            when ts.team_season_id is null then 'no_team_season'
            when not exists (select 1 from core.roster_stint r where r.person_id = px.entity_id and r.team_season_id = ts.team_season_id and r.role = 'player') then 'no_stint'
       end as why
from legacy_wikipedia_hockey.player_line l
join legacy_wikipedia_hockey.player_article a using (league, season, club)
left join legacy_rosters.wp_title t on t.title = l.link_title
left join legacy_rosters.redirect rd on rd.from_qid = t.qid
left join core.external_id px on px.entity_kind = 'person' and px.source_id = (select source_id from wdsrc) and px.external_key = coalesce(rd.to_qid, t.qid)
left join lateral (
  select ts.team_season_id
  from core.season s
  join core.team_season ts on ts.season_id = s.season_id
  join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id
  where s.league_code = l.league and s.start_year = l.season and fi.full_name = l.club
  limit 1) ts on true
where a.revid is not null;

-- A club season whose regular-season table has ten or more skaters and a zero in every row of a column that is a special count (plus-minus, power-play,
-- short-handed or game-winning goals) did not publish that column: the zeros are placeholders, so the column is not stored for that club season (its
-- playoffs included).
create temp table placeholder on commit drop as
select league, season, club, k
from ln cross join lateral (values ('pm'), ('ppg'), ('shg'), ('gwg')) z(k)
where why is null and grp = 'skater' and phase = 'regular' and ln.stats ? z.k
group by league, season, club, k
having count(*) >= 10 and bool_and(replace(ln.stats ->> z.k, '−', '-') ~ '^-?0+$');

-- ---- 2. Cells: whole numbers only, within what a season can hold --------------------------------------------------------------------
create temp table kv_all on commit drop as
select ln.person_id, ln.team_season_id, ln.phase, ln.grp, ln.tbl, ln.ord, ln.league, ln.season, ln.club, ln.page_title, ln.revid, c.k as key, c.v::numeric as val
from ln
cross join lateral jsonb_each_text(ln.stats) c(k, v)
where ln.why is null
  and c.v ~ '^[0-9]{1,5}$'
  and ((ln.grp = 'skater' and c.k in ('gp', 'g', 'a', 'pts', 'pim', 'pm', 'ppg', 'shg', 'gwg'))
    or (ln.grp = 'goalie' and c.k in ('gp', 'w', 'l', 't', 'ga', 'so', 'sa', 'sv')))
  and not exists (select 1 from placeholder h where (h.league, h.season, h.club, h.k) = (ln.league, ln.season, ln.club, c.k));
-- plus-minus is signed and the pattern above keeps no sign: it is read separately
insert into kv_all
select ln.person_id, ln.team_season_id, ln.phase, ln.grp, ln.tbl, ln.ord, ln.league, ln.season, ln.club, ln.page_title, ln.revid, 'pm', replace(ln.stats ->> 'pm', '−', '-')::numeric
from ln where ln.why is null and ln.grp = 'skater' and replace(ln.stats ->> 'pm', '−', '-') ~ '^-?[0-9]{1,3}$'
  and not exists (select 1 from placeholder h where (h.league, h.season, h.club, h.k) = (ln.league, ln.season, ln.club, 'pm'))
  and not exists (select 1 from kv_all k where (k.person_id, k.team_season_id, k.phase, k.grp, k.tbl, k.ord, k.key) = (ln.person_id, ln.team_season_id, ln.phase, ln.grp, ln.tbl, ln.ord, 'pm'));

create temp table kv on commit drop as
select * from kv_all
where case key when 'gp' then val <= 100 when 'g' then val <= 100 when 'a' then val <= 150 when 'pts' then val <= 220 when 'pim' then val <= 600
               when 'pm' then abs(val) <= 100 when 'ppg' then val <= 60 when 'shg' then val <= 20 when 'gwg' then val <= 30
               when 'w' then val <= 80 when 'l' then val <= 80 when 't' then val <= 30 when 'ga' then val <= 500 when 'so' then val <= 15
               when 'sa' then val <= 4000 when 'sv' then val <= 4000 else true end;

-- ---- 3. One line per player, club season, phase and group -------------------------------------------------------------------------------
create temp table rowgp on commit drop as
select person_id, team_season_id, phase, grp, tbl, ord, max(val) filter (where key = 'gp') as gp from kv group by 1, 2, 3, 4, 5, 6;
create temp table pick on commit drop as
select distinct on (person_id, team_season_id, phase, grp, tbl) person_id, team_season_id, phase, grp, tbl, ord
from rowgp order by person_id, team_season_id, phase, grp, tbl, gp desc nulls last, ord;

create temp table merged on commit drop as
select distinct on (k.person_id, k.team_season_id, k.phase, k.grp, k.key) k.person_id, k.team_season_id, k.phase, k.grp, k.key, k.val, k.tbl, k.page_title, k.revid
from kv k join pick p on (p.person_id, p.team_season_id, p.phase, p.grp, p.tbl, p.ord) = (k.person_id, k.team_season_id, k.phase, k.grp, k.tbl, k.ord)
order by k.person_id, k.team_season_id, k.phase, k.grp, k.key, k.tbl;

create temp table line on commit drop as
select person_id, team_season_id, phase, grp, (array_agg(page_title order by tbl))[1] as page_title, (array_agg(revid order by tbl))[1] as revid,
       jsonb_object_agg(key, val) as stats
from merged group by person_id, team_season_id, phase, grp;

-- ---- 4. Rows -------------------------------------------------------------------------------------------------------------------------
insert into core.player_season_stat (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total, stat_basis, source_key)
select person_id, team_season_id, phase::core.season_phase, grp, core.stats_pack(grp, stats), (select source_id from wsrc),
       (stats ->> 'gp')::smallint, null, false, 'total', 'enwiki:' || page_title || '@' || revid
from line;

-- ---- 5. What could not be placed ---------------------------------------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from wsrc) and entity_kind in ('stat_player', 'stat_article') and entity_key like 'wikipedia_hockey_stats:%';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_player', 'wikipedia_hockey_stats:' || league || ':' || why,
       format('%s statistics rows of %s club-season articles left out (%s): %s%s', count(*), upper(league), why,
              case why when 'no_link' then 'the name links to no article'
                       when 'no_qid' then 'the linked article is not a Wikidata item we looked up, or is a disambiguation page'
                       when 'no_person' then 'the Wikidata item is not a person we hold'
                       when 'no_team_season' then 'no team season of a franchise carrying the club''s name that season'
                       else 'the person is not on that club''s roster for that season in core (the roster step did not place him)' end,
              case when count(*) > 0 then '; first: ' || (array_agg(name || ' (' || season || ' ' || club || ')' order by season, club, name))[1] else '' end),
       'Left out: never matched on a name'
from ln where why is not null group by league, why;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_article', 'wikipedia_hockey_stats:implausible',
       format('%s statistics values that cannot be true (a typo in the article), e.g. %s', count(*),
              (array_agg(key || ' ' || val || ' (' || league || ' ' || season || ' ' || club || ')' order by season, club))[1]), 'Those values are not stored'
from kv_all where not exists (select 1 from kv where (kv.person_id, kv.team_season_id, kv.phase, kv.grp, kv.tbl, kv.ord, kv.key) = (kv_all.person_id, kv_all.team_season_id, kv_all.phase, kv_all.grp, kv_all.tbl, kv_all.ord, kv_all.key))
having count(*) > 0;

-- club seasons with no article or no statistics table, per league
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_article', 'wikipedia_hockey_stats:' || a.league || ':no_table',
       format('%s club-season articles of %s have no player statistics we can read (%s with no such article on English Wikipedia)',
              count(*), upper(a.league), count(*) filter (where a.missing)), 'No statistics for those club seasons'
from legacy_wikipedia_hockey.player_article a where a.missing or a.tables = 0 group by a.league;

select s.league_code, count(*) as stat_rows, count(distinct x.person_id) as players
from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
where x.source_id = (select source_id from wsrc) and x.stat_group in ('skater', 'goalie') and s.league_code in ('nha', 'pcha', 'wchl', 'wha')
group by 1 order by 1;
commit;
