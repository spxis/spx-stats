-- The American Hockey League (1936-37 to 2025-26; the International-American Hockey League until 1939-40) from English Wikipedia (CC BY-SA 4.0), parsed by
-- scripts/hockey_minor/ into legacy_wikipedia_hockey_minor (migration 158). The AHL is a league of its own ('ahl'): its records are never added to the NHL's,
-- and none of its clubs is the franchise of the NHL club it was affiliated with. A season is named by the year it starts (1936 = 1936-37).
-- Runs after 154 (it adds nothing to that step's leagues and reads none of its tables). Run from the repo root (it reads db/seed/hockey_minor_club.csv).
-- Rerunnable: it rebuilds only what Wikipedia supplied here, and a game, a series and an identity keeps its id (below).
--
-- What the league holds: every season's final standings (the season articles' tables, with the division and conference headings, kept as published),
-- the Calder Cup champion (the infobox of the season article; none in 2019-20 and 2020-21, when it was not awarded), every playoff series as a result
-- (core.series: the two clubs in the higher and lower seed columns in no order of merit, the archive holds no seeds, and the winner in winner_team_season_id;
-- games won, or the total goals of a round the article says was played as a total-goals series) and the playoff games an article writes out ({{NHLPlayoffs}}).
-- What is not here, and why:
--   * regular-season games: no article tabulates one, so none is made up (a club's published games played are in its standing line);
--   * the divisions and conferences: step 178 reads them from legacy_wikipedia_hockey_minor.standing, like every league's;
--   * the NHL club(s) a club was affiliated with each season: they are in legacy_wikipedia_hockey_minor (standing.affiliation), not in core;
--   * the regular-season trophies (the Oke, Chick, Macgregor Kilpatrick), the individual awards and the all-star games;
--   * a series' games when they contradict its result, and a game whose points cannot be told from its template: left out, in the legacy `unparsed` table.
-- A standing line stays as published. One whose games played are not W+L+T+OTL+SOL is left out (two in 2020-21), one whose points are not what its record
-- is worth is kept (seven), and each is logged in meta.data_issue, with a line for each season whose league totals do not balance.
--
-- Franchises: db/seed/hockey_minor_club.csv says which club name is which franchise in which years ('new:KEY'), from the league article's own list of
-- teams ("became", "renamed") and the season articles' team-change sections. A club that moved or was renamed is one franchise; a club that came back after a
-- suspension under its old name is the same franchise.
begin;

insert into ref.sport (sport_code, name) values ('hockey', 'Ice hockey') on conflict (sport_code) do nothing;
insert into ref.country (country_code, name) values ('US', 'United States'), ('CA', 'Canada') on conflict (country_code) do nothing;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'Season articles of the American Hockey League from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '1936-10-01', current_date, '')
on conflict (code) do update set retrieved_on = current_date, covers_from = least(meta.source.covers_from, excluded.covers_from);
update meta.source set notes = coalesce(notes || ' ', '') || 'The AHL seasons (standings, playoff series, champions) were read from the "<year> AHL season" and "<year> Calder Cup playoffs" articles and the league''s own articles, fetched 2026-10-28.'
where code = 'wikipedia' and coalesce(notes, '') not like '%The AHL seasons%';
create temp table src as select source_id from meta.source where code = 'wikipedia';

insert into ref.league (league_code, sport_code, country_code, founded_on, dissolved_on, notes) values
  ('ahl', 'hockey', 'US', null, null, 'American Hockey League, 1936-37 on (the International-American Hockey League until 1939-40): the NHL''s main developmental league. A league of its own, not NHL seasons')
on conflict (league_code) do nothing;
insert into ref.league_name (league_code, valid_during, name, short_name) values
  ('ahl', daterange(null, date '1940-07-01'), 'International-American Hockey League', 'IAHL'),
  ('ahl', daterange(date '1940-07-01', null), 'American Hockey League', 'AHL')
on conflict do nothing;
insert into core.award (league_code, code, name, kind, description, first_season, source_id) values
  ('ahl', 'ahl_calder_cup', 'Calder Cup', 'championship', 'The AHL''s playoff championship (1936-37 on). Not awarded in 2019-20 and 2020-21.', 1936, (select source_id from src))
on conflict (code) do nothing;

-- Take back what an earlier run wrote.
delete from core.standing where source_id = (select source_id from src) and source_key like 'wpahl:%';
delete from meta.data_issue where source_id = (select source_id from src) and issue ~ '^AHL[: ]';
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and external_key like 'wpahl:%';
-- (games, series and award winners are not deleted wholesale: each keeps its id from run to run, see below)

-- Club names (as the season articles' standings give them, lower case) -> franchise, by the year a season starts.
create temp table seed_club (club text, league text, first_year int, last_year int, franchise text, country text, display text, note text, loc text, nick text);
\copy seed_club from 'db/seed/hockey_minor_club.csv' with (format csv, header true)
delete from seed_club where league <> 'ahl';
insert into core.franchise (sport_code, source_id, source_key)
select 'hockey', (select source_id from src), 'ahl:' || k
from (select distinct substring(franchise from 5) k from seed_club where franchise like 'new:%') x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'ahl:' || x.k);
create temp table am as
select lower(s.club) as nm, s.first_year as y0, s.last_year as y1, s.club, nullif(s.display, '') as display, s.country, s.loc, s.nick, f.franchise_id
from seed_club s
left join core.franchise f on s.franchise like 'new:%' and f.source_id = (select source_id from src) and f.source_key = 'ahl:' || substring(s.franchise from 5);
do $$
declare bad text;
begin
  select string_agg(distinct a.nm || ' ' || a.y0, ', ') into bad from am a join am b on a.nm = b.nm and a.ctid < b.ctid and a.y0 <= b.y1 and b.y0 <= a.y1;
  if bad is not null then raise exception 'club name fits two rows in one year: %', bad; end if;
  select string_agg(distinct nm || ' ' || y0, ', ') into bad from am where franchise_id is null;
  if bad is not null then raise exception 'club row with no franchise: %', bad; end if;
end $$;

-- Wikipedia's rows.
create temp table wss as select * from legacy_wikipedia_hockey_minor.season where league = 'ahl';
create temp table wgm as select * from legacy_wikipedia_hockey_minor.game where league = 'ahl';
create temp table wsd as select * from legacy_wikipedia_hockey_minor.standing where league = 'ahl';
create temp table wts as select * from legacy_wikipedia_hockey_minor.team_season where league = 'ahl';
create temp table wse as select * from legacy_wikipedia_hockey_minor.series where league = 'ahl';
create temp table seasons as select season as yr from wss;

create temp table ng as
select g.season as yr, g.phase::core.season_phase as phase, g.game_date, g.round_name, g.home_pts, g.away_pts, g.overtime, g.home_team, g.away_team,
       h.franchise_id home_f, a.franchise_id away_f,
       'wpahl:' || g.season || ':' || g.phase || ':' || g.game_date || ':' || g.home_team || ':' || g.away_team || ':' || g.game_seq as key
from wgm g
left join am h on h.nm = lower(g.home_team) and g.season between h.y0 and h.y1
left join am a on a.nm = lower(g.away_team) and g.season between a.y0 and a.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', key, format('AHL: club name not matched to a franchise: %s / %s in %s', away_team, home_team, yr), 'Game left out'
from ng where home_f is null or away_f is null;
delete from ng where home_f is null or away_f is null or home_f = away_f;
delete from core.game g using core.season s
where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code = 'ahl'
  and g.source_key like 'wpahl:%' and not exists (select 1 from ng n where n.key = g.source_key);

create temp table nst as
select s.*, s.season as yr, m.franchise_id from wsd s
left join am m on m.nm = lower(s.team) and s.season between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', 'ahl:' || season || ':' || team, 'AHL: club name not matched to a franchise', 'Standing left out'
from nst where franchise_id is null;
delete from nst where franchise_id is null;

create temp table nts as
select t.season as yr, t.team_name, m.franchise_id from wts t
join am m on m.nm = lower(t.team_name) and t.season between m.y0 and m.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', 'ahl:' || t.season || ':' || t.team_name, 'AHL: club name not matched to a franchise', 'Club left out'
from wts t where not exists (select 1 from am m where m.nm = lower(t.team_name) and t.season between m.y0 and m.y1);

-- Seasons (named like the NHL's: 1936-37).
insert into core.season (league_code, start_year, end_year, label, source_id)
select 'ahl', yr, yr + 1, yr || '-' || right((yr + 1)::text, 2), (select source_id from src)
from seasons on conflict (league_code, start_year) do nothing;
update core.season s set playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select yr, max(game_date) pe from ng where phase = 'playoffs' group by yr) d
where s.league_code = 'ahl' and s.start_year = d.yr;
-- Scheduled games per team: the most the published standings count (a club that folded keeps its own count).
update core.season s set games_per_team = x.gp
from (select yr, max(coalesce(gp, w + l + coalesce(t, 0) + coalesce(otl, 0) + coalesce(sol, 0))) gp from nst group by yr) x
where s.league_code = 'ahl' and s.start_year = x.yr and s.games_per_team is null and x.gp > 0;
update core.season s set ties_allowed = x.ties
from (select yr, coalesce(max(t), 0) > 0 as ties from nst group by yr) x
where s.league_code = 'ahl' and s.start_year = x.yr and s.ties_allowed is null;

-- Names by season. Consecutive seasons under one name are one identity (July 1, as in 154); the AHL's clubs have no identity from another source.
create temp table nm as
select distinct on (x.yr, x.franchise_id) x.yr, x.franchise_id, coalesce(m.display, x.team_name) as full_name, m.country, m.loc, m.nick
from nts x join am m on m.nm = lower(x.team_name) and x.yr between m.y0 and m.y1
order by x.yr, x.franchise_id, x.team_name;
create temp table ahlfr as
select franchise_id from am union select franchise_id from core.franchise_league where league_code = 'ahl';
-- An identity keeps its franchise_identity_id on a rerun: the id of each one deleted below goes to ingest.row_id_map (a key already there keeps its first id)
-- and ingest.identity_id_for (migration 146) gives it back to the identity with the same franchise and first day.
insert into ingest.row_id_map (tbl, natural_key, row_id)
select 'core.franchise_identity', i.franchise_id || '/' || coalesce(lower(i.valid_during)::text, ''), i.franchise_identity_id
from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from ahlfr)
on conflict (tbl, natural_key) do nothing;
update core.team_season ts set franchise_identity_id = null
where franchise_identity_id in (select franchise_identity_id from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from ahlfr));
delete from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from ahlfr);
delete from core.franchise_league l where l.source_id = (select source_id from src) and l.league_code = 'ahl';

create temp table last_season as select max(yr) y from nm;
create temp table isl as
select franchise_id, full_name, min(country) country, min(loc) loc, min(nick) nick, min(yr) first_yr, max(yr) last_yr
from (select nm.*, yr - row_number() over (partition by franchise_id, full_name order by yr) as island from nm) x
group by franchise_id, full_name, island;
-- a club still playing in the latest season has no end date (a club that sat the season out, as three did in 2020-21, ends where its run does)
create temp table isl2 as
select i.*, case when i.last_yr >= (select y from last_season) then null else make_date(i.last_yr + 1, 7, 1) end as end_on from isl i;
insert into core.franchise_identity (franchise_identity_id, franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
overriding system value
select ingest.identity_id_for(p.franchise_id, lower(p.rng)), p.franchise_id, p.rng, p.loc, p.nick, p.full_name, p.country, (select source_id from src)
from (select i.franchise_id, i.full_name, i.country, i.loc, i.nick, u.rng
      from isl2 i
      cross join lateral unnest(datemultirange(daterange(make_date(i.first_yr, 7, 1), i.end_on)) -
            coalesce((select range_agg(x.valid_during) from core.franchise_identity x where x.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);

insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select yr, home_f f from ng union select yr, away_f from ng union select yr, franchise_id from nst union select yr, franchise_id from nts) x
join core.season s on s.league_code = 'ahl' and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 11, 15) limit 1)
where ts.franchise_identity_id is null
  and ts.season_id in (select s.season_id from core.season s join seasons z on z.yr = s.start_year where s.league_code = 'ahl');

-- League membership: a franchise is in the league from its first season to the July after its last (no end while it still plays in the latest season),
-- never overlapping a membership another source wrote.
create temp table clspan as
select ts.franchise_id,
       daterange(make_date(min(s.start_year), 7, 1), case when max(s.start_year) = (select max(start_year) from core.season where league_code = 'ahl')
                                                       then null else make_date(max(s.start_year) + 1, 7, 1) end) as rng
from core.team_season ts join core.season s using (season_id)
where s.league_code = 'ahl' group by ts.franchise_id;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, 'ahl', p.rng, (select source_id from src)
from (select a.franchise_id, u.rng
      from clspan a
      cross join lateral unnest(datemultirange(a.rng) -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = a.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);
-- When a franchise began and ended: the first and last season it played in the league (no end while it still plays).
update core.franchise f set founded_on = x.d0, folded_on = x.d1
from (select ts.franchise_id, make_date(min(s.start_year), 7, 1) d0,
             case when max(s.start_year) = (select max(start_year) from core.season where league_code = 'ahl') then null else make_date(max(s.start_year) + 1, 7, 1) end d1
      from core.team_season ts join core.season s using (season_id) where s.league_code = 'ahl' group by ts.franchise_id) x
where f.franchise_id = x.franchise_id and f.source_id = (select source_id from src) and f.source_key like 'ahl:%';
update core.franchise f set notes = s.note
from (select distinct substring(franchise from 5) k, first_value(note) over (partition by franchise order by first_year) note from seed_club where franchise like 'new:%') s
where f.source_id = (select source_id from src) and f.source_key = 'ahl:' || s.k and coalesce(s.note, '') <> '' and f.notes is distinct from s.note;

-- Games. An update and an insert (as in 154), so a game keeps its id from run to run.
create temp table game_new as
select s.season_id, n.phase, n.game_date, hts.team_season_id home_ts, ats.team_season_id away_ts, n.home_pts, n.away_pts, n.overtime, n.round_name, n.key
from ng n join core.season s on s.league_code = 'ahl' and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id;
update core.game g set season_id = x.season_id, phase = x.phase, game_date = x.game_date, home_team_season_id = x.home_ts, away_team_season_id = x.away_ts,
       is_neutral_site = false, status = 'final', home_score = x.home_pts, away_score = x.away_pts, went_to_overtime = x.overtime, round_label = x.round_name,
       updated_at = now()
from game_new x
where g.source_id = (select source_id from src) and g.source_key = x.key
  and (g.season_id, g.phase, g.game_date, g.home_team_season_id, g.away_team_season_id, g.status, g.home_score, g.away_score, g.went_to_overtime, g.round_label)
      is distinct from (x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, 'final', x.home_pts, x.away_pts, x.overtime, x.round_name);
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status, home_score, away_score, went_to_overtime,
                       round_label, source_id, source_key)
select x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, false, 'final', x.home_pts, x.away_pts, x.overtime, x.round_name, (select source_id from src), x.key
from game_new x
where not exists (select 1 from core.game g where g.source_id = (select source_id from src) and g.source_key = x.key);
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, source_key from core.game where source_id = (select source_id from src) and source_key like 'wpahl:%';

-- Final standings as the articles publish them. A line whose games played are not its wins, losses, ties, overtime and shootout losses is left out and logged
-- (check 040); one whose points are not what its record is worth is kept as published and logged. ot_losses counts overtime and shootout losses together,
-- as the NHL's does (145); shootout_losses keeps the shootout ones apart.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', 'ahl:' || n.season || ':' || n.team,
       format('AHL: Wikipedia''s standings line for %s in %s-%s does not add up: GP %s, W+L+T+OTL+SOL %s', n.team, n.season, right((n.season + 1)::text, 2), n.gp,
              n.w + n.l + coalesce(n.t, 0) + coalesce(n.otl, 0) + coalesce(n.sol, 0)),
       'Standing left out'
from nst n where n.gp is distinct from n.w + n.l + coalesce(n.t, 0) + coalesce(n.otl, 0) + coalesce(n.sol, 0);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', 'ahl:' || n.season || ':' || n.team,
       format('AHL: Wikipedia''s standings line for %s in %s-%s gives %s points; its record is worth %s', n.team, n.season, right((n.season + 1)::text, 2), n.pts,
              2 * n.w + coalesce(n.t, 0) + coalesce(n.otl, 0) + coalesce(n.sol, 0)),
       'Kept as published'
from nst n where n.pts is distinct from 2 * n.w + coalesce(n.t, 0) + coalesce(n.otl, 0) + coalesce(n.sol, 0);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', 'ahl:' || season || ':league',
       format('AHL: the %s-%s standings do not balance: %s wins against %s losses (all kinds), %s goals for against %s goals against', season, right((season + 1)::text, 2), w, l, gf, ga),
       'Kept as published'
from (select season, sum(w) w, sum(l + coalesce(otl, 0) + coalesce(sol, 0)) l, sum(gf) gf, sum(ga) ga from nst group by season) z
where w <> l or gf <> ga;
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, ot_losses, shootout_losses, points, points_for, points_against,
                           win_pct, points_pct, division_rank, league_rank, is_final, source_key)
select ts.team_season_id, 'regular', coalesce(s.regular_ends_on, make_date(n.season + 1, 5, 1)), (select source_id from src),
       n.gp, n.w, n.l, n.t, case when n.otl is null and n.sol is null then null else coalesce(n.otl, 0) + coalesce(n.sol, 0) end, n.sol, n.pts, n.gf, n.ga,
       round(n.w::numeric / nullif(n.w + n.l + coalesce(n.t, 0) + coalesce(n.otl, 0) + coalesce(n.sol, 0), 0), 4),
       round(n.pts::numeric / nullif(2 * n.gp, 0), 4),
       case when n.division <> 'Overall' then n.rank_in_table end,
       case when n.division = 'Overall' then n.rank_in_table end,
       true, 'wpahl:' || n.season || ':' || n.team
from nst n
join core.season s on s.league_code = 'ahl' and s.start_year = n.season
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
where n.w is not null and n.l is not null and n.gp = n.w + n.l + coalesce(n.t, 0) + coalesce(n.otl, 0) + coalesce(n.sol, 0)
on conflict do nothing;

-- Champions: the winner of the Calder Cup, as the season article's infobox (else the last playoff series of a normal season) names it.
-- A season whose Calder Cup was not awarded (2019-20, 2020-21) has no champion.
create temp table wchamp as
select s.yr, w.champion, w.champion_basis, m.franchise_id, cs.season_id
from seasons s join wss w on w.season = s.yr
join core.season cs on cs.league_code = 'ahl' and cs.start_year = s.yr
left join am m on m.nm = lower(w.champion) and s.yr between m.y0 and m.y1
where w.champion is not null;
create temp table champ_new as
select a.award_id, c.season_id, ts.team_season_id, coalesce(i.full_name, c.champion) as winner_name, 'Champion per ' || c.champion_basis as note,
       'wpahlchamp:' || c.yr as source_key
from wchamp c
join core.award a on a.code = 'ahl_calder_cup'
left join core.team_season ts on ts.franchise_id = c.franchise_id and ts.season_id = c.season_id
left join core.franchise_identity i on i.franchise_identity_id = ts.franchise_identity_id;
delete from core.award_winner w where w.source_id = (select source_id from src) and w.source_key like 'wpahlchamp:%'
  and not exists (select 1 from champ_new n where n.source_key = w.source_key);
update core.award_winner w set award_id = n.award_id, season_id = n.season_id, team_season_id = n.team_season_id, winner_name = n.winner_name, note = n.note
from champ_new n
where w.source_id = (select source_id from src) and w.source_key = n.source_key
  and (w.award_id, w.season_id, w.team_season_id, w.winner_name, w.note) is distinct from (n.award_id, n.season_id, n.team_season_id, n.winner_name, n.note);
insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select n.award_id, n.season_id, n.team_season_id, n.winner_name, n.note, (select source_id from src), n.source_key
from champ_new n
where not exists (select 1 from core.award_winner w where w.source_id = (select source_id from src) and w.source_key = n.source_key);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'award_winner', 'wpahlchamp:' || yr, 'AHL champion ' || yr || '-' || right((yr + 1)::text, 2) || ': ' || champion || ' matches no club of the season', 'Kept as the champion''s name, with no club linked'
from wchamp where franchise_id is null;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'award_winner', 'wpahlchamp:' || yr, 'AHL champion ' || yr || '-' || right((yr + 1)::text, 2) || ': ' || champion || ', per ' || champion_basis, 'Kept the final series'' winner'
from wchamp where champion_basis like '%series%';

-- Playoff series as a result. A rerun keeps the series_id of every series it adds again: one already there is updated in place, one no longer told is deleted.
create temp table nse as
select e.*, e.season as yr, w.franchise_id wf, l.franchise_id lf
from wse e
left join am w on w.nm = lower(e.winner) and e.season between w.y0 and w.y1
left join am l on l.nm = lower(e.loser) and e.season between l.y0 and l.y1;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'series', 'ahl:' || season || ':' || round_name || ':' || winner, 'AHL: club name not matched to a franchise', 'Series left out'
from nse where wf is null or lf is null;
create temp table new_series as
select s.season_id, n.round_name || case when n.winner_goals is null then '' else ' (' || n.format || ' ' || n.winner_goals || '-' || n.loser_goals || ')' end as round_label, n.round_no,
       wts.team_season_id as winner_ts, lts.team_season_id as loser_ts, n.winner_wins, n.loser_wins,
       'wpahl:' || n.season || ':' || n.round_name || ':' || n.winner as source_key
from nse n join core.season s on s.league_code = 'ahl' and s.start_year = n.yr
join core.team_season wts on wts.franchise_id = n.wf and wts.season_id = s.season_id
join core.team_season lts on lts.franchise_id = n.lf and lts.season_id = s.season_id
where n.wf is not null and n.lf is not null;
delete from core.series x where x.source_id = (select source_id from src) and x.source_key like 'wpahl:%'
  and not exists (select 1 from new_series n where n.source_key = x.source_key);
insert into core.series (season_id, round_label, round_number, best_of, higher_seed_team_season_id, lower_seed_team_season_id, winner_team_season_id,
                         higher_seed_wins, lower_seed_wins, source_id, source_key)
select season_id, round_label, round_no, null, winner_ts, loser_ts, winner_ts, winner_wins, loser_wins, (select source_id from src), source_key
from new_series
on conflict (source_id, source_key) do update set season_id = excluded.season_id, round_label = excluded.round_label, round_number = excluded.round_number,
  best_of = excluded.best_of, higher_seed_team_season_id = excluded.higher_seed_team_season_id, lower_seed_team_season_id = excluded.lower_seed_team_season_id,
  winner_team_season_id = excluded.winner_team_season_id, higher_seed_wins = excluded.higher_seed_wins, lower_seed_wins = excluded.lower_seed_wins;

select k, n from (
  select 'seasons' k, count(*) n from seasons
  union all select 'franchises', count(distinct franchise_id) from core.team_season ts join core.season s using (season_id) where s.league_code = 'ahl'
  union all select 'team seasons', count(*) from core.team_season ts join core.season s using (season_id) where s.league_code = 'ahl'
  union all select 'identities', count(*) from core.franchise_identity where source_id = (select source_id from src) and franchise_id in (select franchise_id from am)
  union all select 'games', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'ahl'
  union all select 'standings', count(*) from core.standing where source_id = (select source_id from src) and source_key like 'wpahl:%'
  union all select 'series', count(*) from core.series x join core.season s using (season_id) where x.source_id = (select source_id from src) and s.league_code = 'ahl'
  union all select 'champions', count(*) from core.award_winner where source_id = (select source_id from src) and source_key like 'wpahlchamp:%'
  union all select 'standing lines logged', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'AHL: Wikipedia''s standings%'
  union all select 'league totals logged', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'AHL: the %standings do not balance%'
  union all select 'unmatched name', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'AHL: club name not matched%') z
order by k;
commit;
