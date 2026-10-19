-- NBA player statistics by club and season from the "Player statistics" tables of the club-season articles on English Wikipedia (CC BY-SA 4.0;
-- legacy_wikipedia_stats, migration 100; scripts/player_stats/nba_wp_*.py) into core.player_season_stat: one row per player, club, season and phase
-- (regular, playoffs), stat_group 'basketball'. Rerunnable, and safe after scripts/build_core.sh has rebuilt team seasons: every key it uses is
-- stable. Run after 179_players_wikidata (the people and their roster_stints) and before 185_person_merge, 186 and 190.
--  * A line is placed only when everything is known: its name links to an article (a name with no link, or a red link, is not used and never matched on
--    the name), that article is a Wikidata item (legacy_rosters.wp_title, from the roster fetch) whose person 179 made (core.external_id: person,
--    wikidata, Q-number), the article's club season is a team season (the franchise identity named as the club that season), and 179 placed that
--    person on that club that season (a core.roster_stint): the roster step already checks that the item is a human basketball player of the right age.
--    Every reason a line is left out is counted in meta.data_issue (entity_kind 'stat_player', 'stat_team', 'stat_article').
--  * Columns are read through db/seed/nba_stat_column.csv (header text -> key). A header not in it is counted, never guessed. Stored: games and starts
--    (gp gs), minutes, points, rebounds, assists, steals and blocks as counts (min pts reb ast stl blk), the same as per-game averages a_<count>
--    (a_min a_pts a_reb a_ast a_stl a_blk) and the shooting percentages p_fg p_3p p_ft (0 to 1). Field goals, free throws, offensive and defensive
--    rebounds, fouls, turnovers and the advanced columns are left out on purpose: their headers differ from article to article and some tables are
--    wrong in them. Per-game averages and percentages are as published; they are not counting numbers and are never added up (api.person_career_totals
--    leaves them out, migration 101).
--  * A count column whose cell has a decimal point ("17.1" under PTS; a total such as "2,302" never has one) is a per-game figure under a count's header, as some of the
--    1970s tables are: it is stored as a_<count> (a_pts ...), never as a total.
--  * stat_basis: 'total' when the table gives season totals, 'both' when it gives totals and averages, 'per_game' when a count the page needs (points,
--    rebounds, assists, steals, blocks, minutes) is the average times the games played, rounded: those counts can be off by half a game's worth, and
--    the average itself is stored beside them. A count stays absent when neither the count nor its average is in the table.
--  * Several tables of one phase in an article: the first gives the numbers, a later one fills only keys the first lacks; two rows for one player in
--    a table keep the one with more games. Traded players have one row per club article, as the articles give them.
--  * source_key is 'enwiki:<article title>@<revision id>': the article revision the line was read from.
-- Provenance: source wikipedia, the key above; nothing is written in free text.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'dataset', 'CC BY-SA 4.0', 'Text and tables from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; see each article''s history for its authors.',
        'https://en.wikipedia.org', null, current_date, null)
on conflict (code) do nothing;
update meta.source set
  notes = coalesce(notes, '') || ' NBA player statistics tables of the club-season articles, read 2026-10-14 at the revisions named in core.player_season_stat.source_key; archived in legacy_files.raw_archive under wikipedia_nba_stats/.'
where code = 'wikipedia' and coalesce(notes, '') not like '%NBA player statistics tables%';
create temp table wsrc on commit drop as select source_id from meta.source where code = 'wikipedia';
create temp table wdsrc on commit drop as select source_id from meta.source where code = 'wikidata';

delete from core.player_season_stat where source_id = (select source_id from wsrc) and stat_group = 'basketball';

drop table if exists pg_temp.seed_col;
create temp table seed_col (header text, key text, kind text);
\copy seed_col from 'db/seed/nba_stat_column.csv' with (format csv, header true)

-- club names an article uses that no identity of the franchise carries
create temp table club_alias (alias text, club text) on commit drop;
insert into club_alias values ('New Orleans/Oklahoma City Hornets', 'New Orleans Hornets');

-- ---- 1. Lines with their person and team season --------------------------------------------------------------------------------------
create temp table ln on commit drop as
select l.*, a.page_title, a.revid, coalesce(rd.to_qid, t.qid) as qid, t.disambiguation, t.missing,
       px.entity_id as person_id, ts.team_season_id,
       case when l.link_title is null then 'no_link'
            when t.title is null or t.qid is null or t.missing or t.disambiguation then 'no_qid'
            when px.entity_id is null then 'no_person'
            when ts.team_season_id is null then 'no_team_season'
            when not exists (select 1 from core.roster_stint r where r.person_id = px.entity_id and r.team_season_id = ts.team_season_id and r.role = 'player') then 'no_stint'
       end as why
from legacy_wikipedia_stats.nba_line l
join legacy_wikipedia_stats.nba_article a using (season, club)
left join legacy_rosters.wp_title t on t.title = l.link_title
left join legacy_rosters.redirect rd on rd.from_qid = t.qid
left join core.external_id px on px.entity_kind = 'person' and px.source_id = (select source_id from wdsrc) and px.external_key = coalesce(rd.to_qid, t.qid)
left join lateral (
  -- the club season whose franchise bore the article's club name that season (the identity of the season itself first); failing that, any name the franchise ever carried,
  -- compared without punctuation (Kansas City-Omaha / Kansas City–Omaha, Steam Rollers / Steamrollers): a season whose identity row is missing or named otherwise
  -- (Seattle 2002-07 is "Seattle", the Hornets of 2005-06 are "New Orleans/Oklahoma City") still reaches its team season, and never through the player's name
  select ts.team_season_id
  from core.season s
  join core.team_season ts on ts.season_id = s.season_id
  left join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id
  where s.league_code = 'nba' and s.start_year = l.season
    and (fi.full_name = l.club
         or exists (select 1 from core.franchise_identity fx
                    where fx.franchise_id = ts.franchise_id
                      and regexp_replace(lower(fx.full_name), '[^a-z]', '', 'g') = regexp_replace(lower(coalesce((select a.club from pg_temp.club_alias a where a.alias = l.club), l.club)), '[^a-z]', '', 'g')))
  order by (fi.full_name = l.club) desc nulls last
  limit 1) ts on true;
create index on ln (season, club, phase, tbl, ord);

-- ---- 2. Cells read through the column map --------------------------------------------------------------------------------------------
-- a number: the cell without thousands commas, percent signs and footnote letters; anything else (a dash, DNP, 1-2) is no number
create temp table kv_all on commit drop as
select ln.person_id, ln.team_season_id, ln.phase, ln.tbl, ln.ord, ln.season, ln.club, ln.page_title, ln.revid,
       case when dec.per_game then 'a_' || m.key else m.key end as key, case when dec.per_game then 'avg' else m.kind end as kind,
       case when m.kind = 'pct' and v.n > 1 then v.n / 100 else v.n end as val
from ln
cross join lateral jsonb_each_text(ln.cells) c(h, cell)
join seed_col m on m.header = c.h and m.kind <> 'skip' and (m.kind <> 'avg_if_pts' or jsonb_exists(ln.cells, 'PTS'))
cross join lateral (select m.kind = 'count' and m.key not in ('gp', 'gs') and c.cell ~ '\.' as per_game) dec
cross join lateral (select case when cleaned ~ '^-?[0-9]*\.?[0-9]+$' then cleaned::numeric end as n
                    from (select regexp_replace(replace(replace(c.cell, ',', ''), '%', ''), '[^0-9.\-]', '', 'g') as cleaned) z) v
where ln.why is null and c.h !~ '#' and v.n is not null;

-- A value that cannot be true (a typo in an article: 5,000 points in a game, 120 per cent) is dropped and counted: a count or average above what
-- anyone has done in a season, a percentage above 1, a games count outside 0 to 120.
create temp table kv on commit drop as
select * from kv_all
where val >= 0 and (kind <> 'pct' or val <= 1)
  and case key when 'gp' then val <= 120 when 'gs' then val <= 120 when 'a_pts' then val <= 60 when 'a_reb' then val <= 30 when 'a_ast' then val <= 20
               when 'a_stl' then val <= 8 when 'a_blk' then val <= 10 when 'a_min' then val <= 60 when 'pts' then val <= 4500 when 'reb' then val <= 2500
               when 'ast' then val <= 1200 when 'stl' then val <= 300 when 'blk' then val <= 500 when 'min' then val <= 4000 else true end;

-- headers the map does not know, counted (not a stat: Player, POS and Age are skipped on purpose)
create temp table unknown_h on commit drop as
select c.h, count(*) as n
from legacy_wikipedia_stats.nba_line l cross join lateral jsonb_object_keys(l.cells) c(h)
where c.h !~ '#' and c.h not in (select header from seed_col) and lower(c.h) not in ('player', 'name', 'players')
group by c.h;

-- ---- 3. One line per player, club season and phase -----------------------------------------------------------------------------------
-- a player twice in one table keeps the row with more games; tables of one phase merge, the first one first
create temp table rowgp on commit drop as
select person_id, team_season_id, phase, tbl, ord, max(val) filter (where key = 'gp') as gp from kv group by 1, 2, 3, 4, 5;
create temp table pick on commit drop as
select distinct on (person_id, team_season_id, phase, tbl) person_id, team_season_id, phase, tbl, ord
from rowgp order by person_id, team_season_id, phase, tbl, gp desc nulls last, ord;

create temp table merged on commit drop as
select distinct on (k.person_id, k.team_season_id, k.phase, k.key) k.person_id, k.team_season_id, k.phase, k.key, k.kind, k.val, k.tbl, k.page_title, k.revid
from kv k join pick p on (p.person_id, p.team_season_id, p.phase, p.tbl, p.ord) = (k.person_id, k.team_season_id, k.phase, k.tbl, k.ord)
order by k.person_id, k.team_season_id, k.phase, k.key, k.tbl;

-- the first table's article and revision are the line's source
create temp table line on commit drop as
select person_id, team_season_id, phase,
       (array_agg(page_title order by tbl))[1] as page_title, (array_agg(revid order by tbl))[1] as revid,
       jsonb_object_agg(key, val) as pub,
       bool_or(kind = 'count' and key not in ('gp', 'gs')) as has_total, bool_or(kind in ('avg', 'avg_if_pts')) as has_avg
from merged group by person_id, team_season_id, phase;

-- totals the table does not give but its average does: average x games, rounded
create temp table built on commit drop as
select l.*, d.derived, l.pub || coalesce(d.add, '{}'::jsonb) as stats
from line l
left join lateral (
  select jsonb_object_agg(t.k, t.v) as add, jsonb_object_agg(t.k, t.v) is not null as derived
  from (select z.k, round((l.pub ->> z.a)::numeric * (l.pub ->> 'gp')::numeric) as v
        from (values ('pts', 'a_pts'), ('reb', 'a_reb'), ('ast', 'a_ast'), ('stl', 'a_stl'), ('blk', 'a_blk'), ('min', 'a_min')) z(k, a)
        where not jsonb_exists(l.pub, z.k) and jsonb_exists(l.pub, z.a) and jsonb_exists(l.pub, 'gp')) t) d on true;

-- ---- 4. Rows -------------------------------------------------------------------------------------------------------------------------
create temp table ok on commit drop as
select b.*, (b.pub ->> 'gp')::numeric as gp, (b.pub ->> 'gs')::numeric as gs from built b;

insert into core.player_season_stat (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total, stat_basis, source_key)
select person_id, team_season_id, phase::core.season_phase, 'basketball', core.stats_pack('basketball', stats), (select source_id from wsrc),
       gp::smallint, gs::smallint, false,
       case when derived then 'per_game' when has_total and has_avg then 'both' when has_total then 'total' when has_avg then 'per_game' else 'total' end,
       'enwiki:' || page_title || '@' || revid
from ok;

-- ---- 5. What could not be placed -----------------------------------------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from wsrc) and entity_kind in ('stat_player', 'stat_team', 'stat_article') and entity_key like 'wikipedia_nba_stats:%';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_player', 'wikipedia_nba_stats:' || why,
       format('%s statistics rows of NBA club-season articles left out (%s): %s%s', count(*), why,
              case why when 'no_link' then 'the name links to no article'
                       when 'no_qid' then 'the linked article is not a Wikidata item we looked up, or is a disambiguation page'
                       when 'no_person' then 'the Wikidata item is not a person we hold'
                       when 'no_team_season' then 'no team season of a franchise carrying the club''s name that season'
                       else 'the person is not on that club''s roster for that season in core (the roster step did not place him)' end,
              case when count(*) > 0 then '; first: ' || (array_agg(name || ' (' || season || ' ' || club || ')' order by season, club, name))[1] else '' end),
       'Left out: never matched on a name'
from ln where why is not null group by why;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_team', 'wikipedia_nba_stats:headers',
       format('statistics table headers the column map (db/seed/nba_stat_column.csv) does not know, with their counts: %s',
              (select string_agg(h || ' (' || n || ')', ', ' order by n desc, h) from unknown_h)),
       'Those columns are not stored'
where exists (select 1 from unknown_h);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_article', 'wikipedia_nba_stats:implausible',
       format('%s statistics values that cannot be true (a typo in the article), e.g. %s', count(*),
              (array_agg(key || ' ' || val || ' (' || season || ' ' || club || ')' order by season, club))[1]), 'Those values are not stored'
from kv_all where not exists (select 1 from kv where (kv.person_id, kv.team_season_id, kv.phase, kv.tbl, kv.ord, kv.key) = (kv_all.person_id, kv_all.team_season_id, kv_all.phase, kv_all.tbl, kv_all.ord, kv_all.key))
having count(*) > 0;

-- two numbers for one key in tables of the same phase that disagree (the first table's is kept)
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wsrc), 'stat_article', 'wikipedia_nba_stats:table_conflict',
       format('%s statistics values that two tables of one phase of an article give differently', count(*)), 'The first table''s value is kept'
from (select distinct k.person_id, k.team_season_id, k.phase, k.key from kv k join merged m on (m.person_id, m.team_season_id, m.phase, m.key) = (k.person_id, k.team_season_id, k.phase, k.key)
      where k.tbl <> m.tbl and k.val <> m.val) c having count(*) > 0;

select (select count(*) from core.player_season_stat where source_id = (select source_id from wsrc) and stat_group = 'basketball') as stat_rows,
       (select count(distinct person_id) from core.player_season_stat where source_id = (select source_id from wsrc) and stat_group = 'basketball') as players,
       (select count(*) from ln) as lines, (select count(*) from ln where why is null) as placed_lines;
commit;
