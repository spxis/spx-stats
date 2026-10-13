-- Major League Soccer: core.soccer_* from legacy_mls (made by scripts/mls/load.py; migration 078 first). Rerunnable, matched by stable keys:
--   clubs     core.soccer_team.team_id = 'C-' + the club's English Wikipedia article after redirects (a renamed club is one row)
--   seasons   core.soccer_tournament.tournament_id = mls<year>
--   matches   core.soccer_match.source_key = 'mls-<yyyymmdd>-<home team_id>-<away team_id>'
-- Where the matches come from:
--   2005-2025  openfootball/world (CC0): date, score, shootout, which club is at home: the BASE. Wikipedia's club-season match boxes are the
--              second source: they give the stadium, city and attendance, and check the score (meta.verification soccer_match: confirmed /
--              disputed / not_found; a disagreement is a meta.data_issue and the openfootball value is kept).
--   1996-2004  and whatever openfootball lacks (the 2025 file stops part way through the season, 2026 is not in it): Wikipedia's club-season match
--              boxes. A match is usually in two articles (one per club); two boxes that agree are recorded as confirmed (field
--              score_two_articles), two that disagree as disputed. A club's article does not always list the home side first, so the home side is
--              the club whose own stadium (the one it used four or more times in its article) the match was played in.
-- Standings, honours (MLS Cup from the final, Supporters' Shield from the table's (S) mark), leaders and awards come from the season articles.
-- Does not touch core.venue, core.game, core.team_season, core.franchise or any venue table, and creates no person.

drop table if exists mls_src, mls_club, mls_season, mls_of, mls_wp0, mls_wp, mls_homeset, mls_wpc, mls_pair, mls_dupwp, mls_oc, mls_new, mls_m, mls_home, mls_issue;

-- ---------------------------------------------------------------- sources, sport, league

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, covers_to, retrieved_on, notes) values
 ('openfootball_mls', 'openfootball/world: Major League Soccer', 'dataset', 'CC0 1.0',
  'openfootball contributors (public domain)',
  'https://github.com/openfootball/world/tree/master/north-america/major-league-soccer', '2005-01-01', '2025-12-31', '2026-10-13',
  'MLS 2005-2025 results in Football.TXT: date, score after extra time, shootout, half-time; regular season and playoffs. The 2025 file stops part way through the season.'),
 ('wikipedia_mls', 'English Wikipedia: MLS season and club-season articles', 'website', 'CC BY-SA 4.0',
  'English Wikipedia contributors, the "<year> Major League Soccer season" and club-season articles, CC BY-SA 4.0 (authors in each article''s history). Modified by SPX Stats: tables and match boxes read into the archive''s tables; names matched to clubs by article.',
  'https://en.wikipedia.org/wiki/Major_League_Soccer', '1996-01-01', '2026-12-31', '2026-10-13',
  'Season articles (conference and overall tables, leaders, awards, infobox) and club-season articles (match boxes: date, score, stadium, attendance) for 1996-2026. Wikidata item ids (CC0) come from the Wikipedia pages'' page properties. Never mlssoccer.com: its terms of service (section 5.2) forbid spidering and scraping.')
on conflict (code) do update set name = excluded.name, kind = excluded.kind, licence = excluded.licence, attribution = excluded.attribution,
  url = excluded.url, covers_from = excluded.covers_from, covers_to = excluded.covers_to, retrieved_on = excluded.retrieved_on, notes = excluded.notes;

insert into ref.sport (sport_code, name) values ('soccer', 'Soccer') on conflict (sport_code) do update set name = excluded.name;
insert into ref.league (league_code, sport_code, founded_on, notes) values
 ('mls', 'soccer', '1993-06-15', 'Major League Soccer (United States and Canada); first season 1996')
on conflict (league_code) do update set sport_code = excluded.sport_code, founded_on = excluded.founded_on, notes = excluded.notes;
insert into ref.league_name (league_code, valid_during, name, short_name) values
 ('mls', '(,)', 'Major League Soccer', 'MLS')
on conflict (league_code, valid_during) do update set name = excluded.name, short_name = excluded.short_name;

create temp table mls_src as select
  (select source_id from meta.source where code = 'openfootball_mls') as ofb,
  (select source_id from meta.source where code = 'wikipedia_mls') as wp,
  (select source_id from meta.source where code = 'wikidata') as wd;

-- ---------------------------------------------------------------- clubs

-- a club is a team that appears in some season's overall table
create temp table mls_club as
select c.club_key, c.qid,
       'C-' || replace(core.fold_text(regexp_replace(c.club_key, '\s*\([^)]*\)$', '')), ' ', '-') as team_id,
       replace(core.fold_text(regexp_replace(c.club_key, '\s*\([^)]*\)$', '')), ' ', '-') as slug,
       (select s.team_shown from legacy_mls.wp_standing s where s.club_key = c.club_key and s.kind = 'overall' order by s.year desc limit 1) as name
from legacy_mls.club c
where exists (select 1 from legacy_mls.wp_standing s where s.club_key = c.club_key and s.kind = 'overall');

insert into core.soccer_team (team_id, name, slug, country_code, kind, wikidata_id, has_men, has_women, source_id)
select c.team_id, c.name, c.slug,
       case when c.club_key in ('Toronto FC', 'Vancouver Whitecaps FC', 'CF Montréal') then 'CA' else 'US' end,
       'club', c.qid, true, false, (select wp from mls_src)
from mls_club c
on conflict (team_id) do update set name = excluded.name, slug = excluded.slug, country_code = excluded.country_code, kind = excluded.kind,
  wikidata_id = excluded.wikidata_id, has_men = excluded.has_men, source_id = excluded.source_id;

-- ---------------------------------------------------------------- seasons and the clubs in them

create temp table mls_season as select distinct s.year, 'mls' || s.year as tournament_id from legacy_mls.wp_standing s where s.kind = 'overall';

insert into core.soccer_tournament (tournament_id, league_code, year, name, host_names, host_team_ids, source_id, complete)
select y.tournament_id, 'mls', y.year, y.year || ' Major League Soccer season', '{}', '{}', (select wp from mls_src), y.year < 2026
from mls_season y
on conflict (tournament_id) do update set name = excluded.name, source_id = excluded.source_id, complete = excluded.complete;

insert into core.soccer_tournament_team (tournament_id, team_id, team_name, conference)
select 'mls' || s.year, c.team_id, s.team_shown,
       (select case x.kind when 'eastern' then 'Eastern Conference' else 'Western Conference' end
          from legacy_mls.wp_standing x where x.year = s.year and x.club_key = s.club_key and x.kind in ('eastern', 'western') limit 1)
from legacy_mls.wp_standing s join mls_club c on c.club_key = s.club_key
where s.kind = 'overall'
on conflict (tournament_id, team_id) do update set team_name = excluded.team_name, conference = excluded.conference;
delete from core.soccer_tournament_team tt using core.soccer_tournament t
 where t.tournament_id = tt.tournament_id and t.league_code = 'mls'
   and not exists (select 1 from legacy_mls.wp_standing s join mls_club c on c.club_key = s.club_key
                    where s.kind = 'overall' and 'mls' || s.year = tt.tournament_id and c.team_id = tt.team_id);

-- ---------------------------------------------------------------- the match observations

-- the words of a playoff round, whichever article wrote them
create or replace function pg_temp.mls_round(txt text) returns text language sql immutable as $$
  select case
    when t ~ 'wild ?card|play-?in' then 'wild_card'
    when t ~ 'first round|round one|round 1|knockout|qualif' then 'round_one'
    when t ~ 'conf[a-z.]* ?semi|quarter' then 'conference_semi'
    when t ~ 'conf[a-z.]* ?final|semi' then 'conference_final'
    when t ~ 'mls cup|final' then 'final'
  end
  from (select regexp_replace(lower(txt), 'mls cup playoffs?', 'playoffs') as t) x
$$;

-- openfootball. A line that gives only a shootout score (2023-) has no final score: the 90-minute bracket's, else the half-time one.
-- The two sides are also kept in a fixed order (lo, hi: alphabetical) for comparing with Wikipedia, whose articles do not always list the home side first.
create temp table mls_of as
select o.year, o.seq, o.match_date, o.club1 as home_club, o.club2 as away_club, least(o.club1, o.club2) as lo, greatest(o.club1, o.club2) as hi,
       coalesce(o.score1, (regexp_match(o.score90, '^(\d+)-(\d+)$'))[1]::int, (regexp_match(o.ht, '^(\d+)-(\d+)$'))[1]::int) as hg,
       coalesce(o.score2, (regexp_match(o.score90, '^(\d+)-(\d+)$'))[2]::int, (regexp_match(o.ht, '^(\d+)-(\d+)$'))[2]::int) as ag,
       o.aet, o.pens1 as hp, o.pens2 as ap,
       case when o.stage ~* '^matchday|mls is back' then 'regular' else pg_temp.mls_round(regexp_replace(o.stage, '^Playoffs,\s*', '')) end as stage_key,
       case when o.stage ~* 'mls is back' then 'MLS is Back ' || regexp_replace(o.stage, '^.*, ', '') end as group_name
from legacy_mls.of_match o
where o.club1 is not null and o.club2 is not null and o.club1 <> o.club2;
alter table mls_of add column lo_g int, add column hi_g int, add column lo_p int, add column hi_p int;
update mls_of o set lo_g = case when o.home_club = o.lo then o.hg else o.ag end, hi_g = case when o.home_club = o.lo then o.ag else o.hg end,
                    lo_p = case when o.home_club = o.lo then o.hp else o.ap end, hi_p = case when o.home_club = o.lo then o.ap else o.hp end;

-- Wikipedia match boxes of the league's own sections (not other competitions, not the MLS is Back knockout rounds), each with its sides in lo / hi order
create temp table mls_wp0 as
select b.year, b.club_key, b.seq, b.club1, b.club2, least(b.club1, b.club2) as lo, greatest(b.club1, b.club2) as hi, b.match_date,
       case when b.club1 = least(b.club1, b.club2) then b.score1 else b.score2 end as lo_g, case when b.club1 = least(b.club1, b.club2) then b.score2 else b.score1 end as hi_g,
       case when b.club1 = least(b.club1, b.club2) then b.pens1 else b.pens2 end as lo_p, case when b.club1 = least(b.club1, b.club2) then b.pens2 else b.pens1 end as hi_p,
       case b.result when 'W' then b.club_key = least(b.club1, b.club2) when 'L' then b.club_key <> least(b.club1, b.club2) end as lo_won,
       b.aet, b.golden, b.so, b.stadium, b.stadium_qid, coalesce(b.stadium_qid, core.fold_text(b.stadium)) as skey, b.location, b.attendance,
       case when (coalesce(b.section, '') || ' ' || coalesce(b.round, '')) ~* 'play-?offs?|semi|final|quarter|mls cup|wild ?card|play-in|knockout|first round|round one'
            then pg_temp.mls_round(coalesce(nullif(regexp_replace(b.section, '^.* > ', ''), ''), '') || ' ' || coalesce(b.round, ''))
            else 'regular' end as stage_key
from legacy_mls.wp_box b
where b.scope = 'league' and b.club1 is not null and b.club2 is not null and b.club1 <> b.club2 and b.match_date is not null and b.score1 is not null
  and not coalesce(b.series, false)
  and not (b.section ~* 'mls is back|back tournament' and coalesce(b.round, '') !~* 'group')
  and extract(year from b.match_date) = b.year;

-- one cluster per match: boxes of the same two clubs within a day of each other
create temp table mls_wp as
select x.*, sum(x.newc) over (partition by x.year, x.lo, x.hi order by x.match_date, x.club_key, x.seq) as cl
from (select w.*, case when w.match_date - lag(w.match_date) over (partition by w.year, w.lo, w.hi order by w.match_date, w.club_key, w.seq) > 1 then 1 else 0 end as newc
        from mls_wp0 w where w.stage_key is not null) x;

-- the stadiums a club played at that season: those it used four times or more in its own article (home games are about half of them,
-- an away stadium is visited once or twice), so a stadium names the home side whatever order a box lists the clubs in
create temp table mls_homeset as
select w.year, w.club_key as club, w.skey from mls_wp0 w
where w.stage_key = 'regular' and w.skey is not null and w.club_key in (w.club1, w.club2)
group by w.year, w.club_key, w.skey having count(*) >= 4;

create temp table mls_wpc as
select c.*, case when hs.hl and not hs.hh then c.lo when hs.hh and not hs.hl then c.hi end as home_by_stadium
from (
  select w.year, w.lo, w.hi, w.cl, min(w.match_date) as d, count(*)::int as n_boxes,
         count(distinct (w.lo_g, w.hi_g, coalesce(w.lo_p, -1), coalesce(w.hi_p, -1)))::int as n_scores,
         mode() within group (order by w.stage_key) as stage_key,
         (array_agg(w.lo_g order by w.seq))[1] as lo_g, (array_agg(w.hi_g order by w.seq))[1] as hi_g,
         (array_agg(w.lo_p order by (w.lo_p is null), w.seq))[1] as lo_p, (array_agg(w.hi_p order by (w.hi_p is null), w.seq))[1] as hi_p,
         bool_or(coalesce(w.aet, false) or coalesce(w.golden, false)) as aet, bool_or(coalesce(w.so, false)) as so,
         (array_agg(w.lo_won order by (w.lo_won is null), w.seq))[1] as lo_won,
         count(*) filter (where w.club1 = w.lo)::int as first_lo,
         (array_agg(w.stadium order by (w.stadium is null), w.seq))[1] as stadium,
         (array_agg(w.stadium_qid order by (w.stadium_qid is null), w.seq))[1] as stadium_qid,
         (array_agg(w.skey order by (w.skey is null), w.seq))[1] as skey,
         (array_agg(w.location order by (w.location is null), w.seq))[1] as location,
         (array_agg(w.attendance order by (w.attendance is null), w.seq))[1] as attendance
    from mls_wp w group by w.year, w.lo, w.hi, w.cl) c
cross join lateral (select exists (select 1 from mls_homeset h where h.year = c.year and h.club = c.lo and h.skey = c.skey) as hl,
                           exists (select 1 from mls_homeset h where h.year = c.year and h.club = c.hi and h.skey = c.skey) as hh) hs;

-- pair each openfootball match with the cluster of the same two clubs within a day (nearest first, a cluster to one match only); then, for what is
-- left, a cluster with the same score and stage up to 45 days away (one article has a wrong date: the 2006 MLS Cup is dated 28 October in New England's)
create temp table mls_pair as
select p.year, p.seq, p.lo, p.hi, p.cl, 1 as tier from (
  select q.*, row_number() over (partition by q.year, q.lo, q.hi, q.cl order by q.diff, q.seq) as rk2
  from (select o.year, o.seq, c.lo, c.hi, c.cl, abs(c.d - o.match_date) as diff,
               row_number() over (partition by o.year, o.seq order by abs(c.d - o.match_date), c.cl) as rk1
          from mls_of o join mls_wpc c on c.year = o.year and c.lo = o.lo and c.hi = o.hi and abs(c.d - o.match_date) <= 1) q
  where q.rk1 = 1) p
where p.rk2 = 1;
insert into mls_pair
select p.year, p.seq, p.lo, p.hi, p.cl, 3 from (
  select q.*, row_number() over (partition by q.year, q.lo, q.hi, q.cl order by q.diff, q.seq) as rk2
  from (select o.year, o.seq, c.lo, c.hi, c.cl, abs(c.d - o.match_date) as diff,
               row_number() over (partition by o.year, o.seq order by abs(c.d - o.match_date), c.cl) as rk1
          from mls_of o join mls_wpc c on c.year = o.year and c.lo = o.lo and c.hi = o.hi and abs(c.d - o.match_date) <= 45
                                       and c.lo_g = o.lo_g and c.hi_g = o.hi_g and c.stage_key = o.stage_key
         where not exists (select 1 from mls_pair x where x.year = o.year and x.seq = o.seq)
           and not exists (select 1 from mls_pair x where x.year = c.year and x.lo = c.lo and x.hi = c.hi and x.cl = c.cl)) q
  where q.rk1 = 1) p
where p.rk2 = 1;

-- a cluster no openfootball line took, whose score and clubs an openfootball line has within 45 days: the same match with a wrong date, not another match
create temp table mls_dupwp as
select c.year, c.lo, c.hi, c.cl, (array_agg(o.seq order by abs(o.match_date - c.d)))[1] as of_seq, min(c.d) as d
from mls_wpc c join mls_of o on o.year = c.year and o.lo = c.lo and o.hi = c.hi and o.lo_g = c.lo_g and o.hi_g = c.hi_g and abs(o.match_date - c.d) <= 45
where not exists (select 1 from mls_pair p where p.year = c.year and p.lo = c.lo and p.hi = c.hi and p.cl = c.cl)
group by c.year, c.lo, c.hi, c.cl;

-- how many regular-season matches each club has in openfootball, and how many its season table says it played
create temp table mls_oc as
select x.year, x.club, count(*) as n,
       (select s.played from legacy_mls.wp_standing s where s.year = x.year and s.club_key = x.club and s.kind = 'overall' limit 1) as played
from (select year, home_club as club from mls_of where stage_key = 'regular' union all select year, away_club from mls_of where stage_key = 'regular') x
group by x.year, x.club;

-- ---------------------------------------------------------------- the merged matches

create temp table mls_new as
select o.year, o.match_date, o.home_club, o.away_club, o.stage_key, o.group_name,
       coalesce(o.hg, case when o.home_club = o.lo then c.lo_g else c.hi_g end) as hg, coalesce(o.ag, case when o.home_club = o.lo then c.hi_g else c.lo_g end) as ag,
       (o.aet or coalesce(c.aet, false)) as extra_time, o.hp, o.ap, false as mls_so, null::text as so_winner_club,
       c.stadium, c.stadium_qid, c.location, c.attendance, 'of'::text as base, c.n_boxes, c.n_scores, o.seq as of_seq,
       case when c.n_boxes is null then null
            else c.n_scores = 1 and c.lo_g = o.lo_g and c.hi_g = o.hi_g and (c.lo_p is null or o.lo_p is null or (c.lo_p = o.lo_p and c.hi_p = o.hi_p)) end as score_ok,
       (select string_agg(distinct w.lo || ' ' || w.lo_g || '-' || w.hi_g || ' ' || w.hi, ' / ') from mls_wp w
         where w.year = c.year and w.lo = c.lo and w.hi = c.hi and w.cl = c.cl) as their, c.d as their_date, p.tier
from mls_of o
left join mls_pair p on p.year = o.year and p.seq = o.seq
left join mls_wpc c on c.year = p.year and c.lo = p.lo and c.hi = p.hi and c.cl = p.cl
union all
select c.year, c.d, h.home, case when h.home = c.lo then c.hi else c.lo end, c.stage_key, null,
       case when h.home = c.lo then c.lo_g else c.hi_g end, case when h.home = c.lo then c.hi_g else c.lo_g end,
       c.aet, case when c.lo_p is distinct from c.hi_p then case when h.home = c.lo then c.lo_p else c.hi_p end end,
       case when c.lo_p is distinct from c.hi_p then case when h.home = c.lo then c.hi_p else c.lo_p end end,
       (c.so and c.lo_p is null), case when c.so and c.lo_p is null then case c.lo_won when true then c.lo when false then c.hi end end,
       c.stadium, c.stadium_qid, c.location, c.attendance, 'wp', c.n_boxes, c.n_scores, null::int,
       case when c.n_boxes >= 2 then c.n_scores = 1 end,
       (select string_agg(distinct w.lo || ' ' || w.lo_g || '-' || w.hi_g || ' ' || w.hi, ' / ') from mls_wp w
         where w.year = c.year and w.lo = c.lo and w.hi = c.hi and w.cl = c.cl), c.d, 0
from mls_wpc c
cross join lateral (select coalesce(c.home_by_stadium, case when c.first_lo * 2 >= c.n_boxes then c.lo else c.hi end) as home) h
where not exists (select 1 from mls_pair p where p.year = c.year and p.lo = c.lo and p.hi = c.hi and p.cl = c.cl)
  and not exists (select 1 from mls_dupwp d where d.year = c.year and d.lo = c.lo and d.hi = c.hi and d.cl = c.cl)
  -- openfootball holds the regular-season and playoff matches of 2005-2024 (its counts equal the seasons' own tables): a Wikipedia box with no line
  -- there is another competition (a preseason tournament, the Open Cup, MLS is Back's knockout rounds), unless both clubs' tables say they played
  -- more regular-season matches than openfootball gives them
  and (c.year not between 2005 and 2024
       or (c.stage_key = 'regular' and (select o.n < o.played from mls_oc o where o.year = c.year and o.club = c.lo)
                                   and (select o.n < o.played from mls_oc o where o.year = c.year and o.club = c.hi)));

-- ---------------------------------------------------------------- write the matches

create temp table mls_m as
select n.*, hc.team_id as home_id, ac.team_id as away_id,
       'mls-' || to_char(n.match_date, 'YYYYMMDD') || '-' || hc.team_id || '-' || ac.team_id as source_key,
       case n.stage_key when 'regular' then 1 when 'wild_card' then 2 when 'round_one' then 3 when 'conference_semi' then 4 when 'conference_final' then 5 when 'final' then 6 end as stage_order,
       (n.hp is not null and n.ap is not null and n.hp <> n.ap) as shootout
from mls_new n join mls_club hc on hc.club_key = n.home_club join mls_club ac on ac.club_key = n.away_club
where n.hg is not null and n.ag is not null and n.stage_key is not null;

insert into core.soccer_match (source_key, tournament_id, stage_key, stage_order, group_name, match_date, home_team_id, away_team_id, home_goals, away_goals,
                               extra_time, shootout, home_penalties, away_penalties, winner_team_id, venue_name, venue_city, venue_country, venue_wikidata_id,
                               attendance, shootout_style, source_id)
select m.source_key, 'mls' || m.year, m.stage_key, m.stage_order, m.group_name, m.match_date, m.home_id, m.away_id, m.hg, m.ag,
       m.extra_time, m.shootout, case when m.shootout then m.hp end, case when m.shootout then m.ap end,
       case when m.shootout then (case when m.hp > m.ap then m.home_id else m.away_id end)
            when m.hg > m.ag then m.home_id when m.hg < m.ag then m.away_id
            when m.so_winner_club = m.home_club then m.home_id when m.so_winner_club = m.away_club then m.away_id end,
       m.stadium, nullif(btrim(split_part(m.location, ',', 1)), ''),
       case when (select country_code from core.soccer_team where team_id = m.home_id) = 'CA' then 'Canada' else 'United States' end,
       m.stadium_qid, m.attendance, case when m.mls_so then 'mls' end,
       case when m.base = 'of' then (select ofb from mls_src) else (select wp from mls_src) end
from mls_m m
on conflict (source_key) do update set tournament_id = excluded.tournament_id, stage_key = excluded.stage_key, stage_order = excluded.stage_order,
  group_name = excluded.group_name, match_date = excluded.match_date, home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
  home_goals = excluded.home_goals, away_goals = excluded.away_goals, extra_time = excluded.extra_time, shootout = excluded.shootout,
  home_penalties = excluded.home_penalties, away_penalties = excluded.away_penalties, winner_team_id = excluded.winner_team_id,
  venue_name = excluded.venue_name, venue_city = excluded.venue_city, venue_country = excluded.venue_country, venue_wikidata_id = excluded.venue_wikidata_id,
  attendance = excluded.attendance, shootout_style = excluded.shootout_style, source_id = excluded.source_id;
-- a match the sources no longer give goes (no goals, lineups or cards hang off an MLS match)
delete from core.soccer_match m using core.soccer_tournament t
 where t.tournament_id = m.tournament_id and t.league_code = 'mls' and not exists (select 1 from mls_m x where x.source_key = m.source_key);

-- ---------------------------------------------------------------- the second check

delete from meta.verification v using core.soccer_match m
 where v.entity_kind = 'soccer_match' and v.entity_id = m.match_id and m.tournament_id like 'mls%'
   and v.source_id in ((select ofb from mls_src), (select wp from mls_src));
delete from meta.data_issue where entity_kind in ('soccer_match', 'soccer_tournament', 'soccer_tournament_team') and source_id in ((select ofb from mls_src), (select wp from mls_src));

-- openfootball against Wikipedia
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'soccer_match', cm.match_id, 'score',
       case when m.n_boxes is null then 'not_found'::meta.verification_status when m.score_ok then 'confirmed' else 'disputed' end,
       (select wp from mls_src), 'https://en.wikipedia.org/wiki/' || replace(m.year || ' Major League Soccer season', ' ', '_'), m.their
from mls_m m join core.soccer_match cm on cm.source_key = m.source_key
where m.base = 'of';
-- Wikipedia's two articles for one match
insert into meta.verification (entity_kind, entity_id, field, status, source_id, evidence_url, their_value)
select 'soccer_match', cm.match_id, 'score_two_articles', case when m.score_ok then 'confirmed' else 'disputed' end::meta.verification_status,
       (select wp from mls_src), 'https://en.wikipedia.org/wiki/' || replace(m.year || ' Major League Soccer season', ' ', '_'), m.their
from mls_m m join core.soccer_match cm on cm.source_key = m.source_key
where m.base = 'wp' and m.n_boxes >= 2;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select ofb from mls_src), 'soccer_match', m.source_key,
       'openfootball has ' || m.hg || '-' || m.ag || ' (' || m.match_date || ') but the Wikipedia club-season article(s) have ' || m.their || ' (' || m.their_date || ')',
       'kept the openfootball result'
from mls_m m where m.base = 'of' and m.n_boxes is not null and not m.score_ok;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from mls_src), 'soccer_match', m.source_key,
       'a Wikipedia club-season article dates the match ' || m.their_date || ' where openfootball and the other article say ' || m.match_date,
       'kept the openfootball date'
from mls_m m where m.base = 'of' and m.tier = 3;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from mls_src), 'soccer_match', m.source_key,
       'a Wikipedia club-season article dates the match ' || d.d || ' where openfootball says ' || m.match_date, 'kept the openfootball date, left the other box out'
from mls_dupwp d join mls_m m on m.base = 'of' and m.year = d.year and m.of_seq = d.of_seq;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from mls_src), 'soccer_match', m.source_key, 'the Wikipedia articles of the two clubs give different scores for this match: ' || m.their,
       'kept the first article''s score'
from mls_m m where m.base = 'wp' and m.n_boxes >= 2 and not m.score_ok;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from mls_src), 'soccer_match', 'mls ' || c.year || ' ' || c.lo || ' v ' || c.hi || ' ' || c.d,
       'a Wikipedia club-season match box (' || c.lo || ' ' || c.lo_g || '-' || c.hi_g || ' ' || c.hi || ', ' || c.d || ') that no openfootball line matches, in a season whose openfootball file is complete',
       'left out: taken to be another competition'
from mls_wpc c
where c.year between 2005 and 2024 and c.stage_key is not null
  and not exists (select 1 from mls_pair p where p.year = c.year and p.lo = c.lo and p.hi = c.hi and p.cl = c.cl)
  and not exists (select 1 from mls_dupwp d where d.year = c.year and d.lo = c.lo and d.hi = c.hi and d.cl = c.cl)
  and not exists (select 1 from mls_m m where m.base = 'wp' and m.year = c.year and m.match_date = c.d and c.lo in (m.home_club, m.away_club) and c.hi in (m.home_club, m.away_club));

-- ---------------------------------------------------------------- standings

delete from core.soccer_group_standing g using core.soccer_tournament t where t.tournament_id = g.tournament_id and t.league_code = 'mls';
insert into core.soccer_group_standing (tournament_id, stage_number, stage_key, group_name, position, team_id, played, wins, draws, losses, goals_for, goals_against,
                                        goal_difference, points, advanced, shootout_wins, qualification)
select 'mls' || s.year, case s.kind when 'overall' then 2 else 1 end, case s.kind when 'overall' then 'overall' else 'conference' end,
       case s.kind when 'eastern' then 'Eastern Conference' when 'western' then 'Western Conference' else 'Overall' end,
       s.pos, c.team_id, s.played, s.wins, coalesce(s.draws, 0), s.losses, s.gf, s.ga, s.gd, s.points,
       exists (select 1 from core.soccer_match m where m.tournament_id = 'mls' || s.year and m.stage_key <> 'regular' and c.team_id in (m.home_team_id, m.away_team_id)),
       s.shootout_wins, s.qualification
from legacy_mls.wp_standing s join mls_club c on c.club_key = s.club_key
where s.pos is not null
on conflict (tournament_id, stage_number, group_name, team_id) do nothing;

-- ---------------------------------------------------------------- the season's honours and each club's playoff result

-- MLS Cup: the final's winner and loser
update core.soccer_tournament t set winner_team_id = f.winner_team_id,
  runner_up_team_id = case when f.winner_team_id = f.home_team_id then f.away_team_id else f.home_team_id end
from (select distinct on (tournament_id) * from core.soccer_match where stage_key = 'final' and tournament_id like 'mls%' order by tournament_id, match_date desc, match_id desc) f
where t.tournament_id = f.tournament_id and f.winner_team_id is not null;
update core.soccer_tournament t set winner_team_id = null, runner_up_team_id = null
where t.league_code = 'mls' and not exists (select 1 from core.soccer_match f where f.tournament_id = t.tournament_id and f.stage_key = 'final' and f.winner_team_id is not null);

-- Supporters' Shield: the overall table's (S) mark
update core.soccer_tournament t set shield_team_id = (
  select c.team_id from legacy_mls.wp_standing s join mls_club c on c.club_key = s.club_key
   where s.kind = 'overall' and 'mls' || s.year = t.tournament_id and s.marker ~ 'S' order by s.pos limit 1)
where t.league_code = 'mls';

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from mls_src), 'soccer_tournament', t.tournament_id,
       'the table marks ' || coalesce((select string_agg(c.club_key, ', ') from legacy_mls.wp_standing s join mls_club c on c.club_key = s.club_key
                                        where s.kind = 'overall' and 'mls' || s.year = t.tournament_id and s.marker ~ 'C'), 'nobody') || ' (C) but the final was won by ' ||
       coalesce((select tt.team_name from core.soccer_tournament_team tt where tt.tournament_id = t.tournament_id and tt.team_id = t.winner_team_id), 'nobody'),
       'kept the final''s winner'
from core.soccer_tournament t
where t.league_code = 'mls' and t.complete
  and coalesce((select c.team_id from legacy_mls.wp_standing s join mls_club c on c.club_key = s.club_key
                 where s.kind = 'overall' and 'mls' || s.year = t.tournament_id and s.marker ~ 'C' limit 1), '') is distinct from coalesce(t.winner_team_id, '');

-- how far each club went: the stage it last played in (the final: lost it, unless it won it)
update core.soccer_tournament_team tt set performance = x.perf, final_position = x.pos
from (select tt2.tournament_id, tt2.team_id,
             case when not t.complete then null when t.winner_team_id = tt2.team_id then 'champion'
                  else coalesce((select m.stage_key from core.soccer_match m
                                  where m.tournament_id = tt2.tournament_id and m.stage_key <> 'regular' and tt2.team_id in (m.home_team_id, m.away_team_id)
                                  order by m.stage_order desc limit 1), 'missed') end as perf,
             case when t.winner_team_id = tt2.team_id then 1 when t.runner_up_team_id = tt2.team_id then 2 end as pos
        from core.soccer_tournament_team tt2 join core.soccer_tournament t using (tournament_id) where t.league_code = 'mls') x
where tt.tournament_id = x.tournament_id and tt.team_id = x.team_id;

-- a season's dates and size
update core.soccer_tournament t set
  start_date = (select min(m.match_date) from core.soccer_match m where m.tournament_id = t.tournament_id),
  end_date = (select max(m.match_date) from core.soccer_match m where m.tournament_id = t.tournament_id),
  team_count = (select count(*) from core.soccer_tournament_team tt where tt.tournament_id = t.tournament_id)
where t.league_code = 'mls';

-- ---------------------------------------------------------------- each club's home stadium that season
-- the stadium most of its home regular-season matches were played in; the season article's stadium table where no match box gave one

create temp table mls_home as
select distinct on (x.tournament_id, x.team_id) x.* from (
  select m.tournament_id, m.home_team_id as team_id, m.venue_name, mode() within group (order by m.venue_city) as city,
         mode() within group (order by m.venue_wikidata_id) as qid, count(*) as n
    from core.soccer_match m
   where m.tournament_id like 'mls%' and m.stage_key = 'regular' and m.venue_name is not null
   group by m.tournament_id, m.home_team_id, m.venue_name) x
order by x.tournament_id, x.team_id, x.n desc, x.venue_name;

update core.soccer_tournament_team tt set venue_name = null, venue_city = null, venue_wikidata_id = null
from core.soccer_tournament t where t.tournament_id = tt.tournament_id and t.league_code = 'mls';
update core.soccer_tournament_team tt set venue_name = h.venue_name, venue_city = h.city, venue_wikidata_id = h.qid
from mls_home h
where h.tournament_id = tt.tournament_id and h.team_id = tt.team_id;
update core.soccer_tournament_team tt set venue_name = st.stadium_shown, venue_wikidata_id = st.stadium_qid
from core.soccer_tournament t, legacy_mls.wp_stadium st, mls_club c
where t.tournament_id = tt.tournament_id and t.league_code = 'mls' and st.year = t.year and c.club_key = st.club_key and c.team_id = tt.team_id
  and tt.venue_name is null;

-- ---------------------------------------------------------------- leaders and awards (names; no person rows)

delete from core.soccer_season_leader l using core.soccer_tournament t where t.tournament_id = l.tournament_id and t.league_code = 'mls';
insert into core.soccer_season_leader (tournament_id, category, label, rank, player_name, team_id, value, wikidata_id)
select distinct on ('mls' || l.year, l.category, l.label, l.rank, l.player) 'mls' || l.year, l.category, l.label, l.rank, l.player, c.team_id, l.value, l.player_qid
from legacy_mls.wp_leader l
left join mls_club c on c.club_key = l.club_key
where exists (select 1 from core.soccer_tournament t where t.tournament_id = 'mls' || l.year)
order by 'mls' || l.year, l.category, l.label, l.rank, l.player;

-- ---------------------------------------------------------------- the standings against the matches

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select wp from mls_src), 'soccer_tournament_team', gs.tournament_id || ' ' || gs.team_id,
       'the overall table says ' || gs.played || ' played, ' || gs.goals_for || '-' || gs.goals_against || ' goals; the matches we hold give ' ||
       coalesce(r.played, 0) || ' played, ' || coalesce(r.gf, 0) || '-' || coalesce(r.ga, 0),
       'kept both: the table as published, the matches as found'
from core.soccer_group_standing gs
join core.soccer_tournament t on t.tournament_id = gs.tournament_id and t.league_code = 'mls' and t.complete
left join (select m.tournament_id, x.team_id, count(*) as played, sum(x.gf) as gf, sum(x.ga) as ga
             from core.soccer_match m
             cross join lateral (values (m.home_team_id, m.home_goals, m.away_goals), (m.away_team_id, m.away_goals, m.home_goals)) x(team_id, gf, ga)
            where m.stage_key = 'regular' group by m.tournament_id, x.team_id) r on r.tournament_id = gs.tournament_id and r.team_id = gs.team_id
where gs.stage_key = 'overall' and (coalesce(r.played, 0) <> gs.played or coalesce(r.gf, 0) <> gs.goals_for or coalesce(r.ga, 0) <> gs.goals_against);
