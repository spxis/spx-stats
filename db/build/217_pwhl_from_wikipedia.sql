-- The PWHL (2023-24 on) from English Wikipedia (CC BY-SA 4.0): every game the season article's
-- game log and {{NHLPlayoffs}} blocks list (regular season and playoffs), each season's published
-- standings, and every franchise's names by season, parsed by scripts/pwhl/ into
-- legacy_wikipedia_pwhl (migration 127). The PWHL is a league of its own ('pwhl'): its records are
-- never added to the NHL's. A season is named by the year it starts (2023 = 2023-24).
-- Why Wikipedia: the PWHL's own site and feeds, Hockey-Reference and ESPN are excluded by their terms
-- (no automated collection). NHL endpoints are never used. Recap links are not followed.
-- Run from the repo root (it reads db/seed/pwhl_club.csv). Runs after 154. Safe to rerun.
-- Which club name is which franchise in which years is db/seed/pwhl_club.csv (the six charter clubs
-- were city names / "PWHL <city>" in 2023-24 and took Fleet, Frost, Victoire, Sirens, Charge,
-- Sceptres names in 2024-25; Seattle and Vancouver join in 2025-26).
begin;

insert into ref.sport (sport_code, name) values ('hockey', 'Ice hockey') on conflict (sport_code) do nothing;
insert into ref.country (country_code, name) values ('US', 'United States'), ('CA', 'Canada') on conflict (country_code) do nothing;

insert into meta.source (code, name, kind, notes)
values ('spx_stats_derived', 'Worked out by spx-stats', 'manual',
        'Values worked out from other sources'' data by a rule in db/build, such as a champion from the final series'' results.')
on conflict (code) do nothing;
insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'PWHL season, standings-template and club-season articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', date '2024-01-01', current_date,
        'PWHL results from the season article''s game log and {{NHLPlayoffs}} blocks and the "<year> PWHL season standings" template, raw wikitext fetched 2026-10-16. The PWHL''s own site, Hockey-Reference, ESPN and NHL endpoints were not used.')
on conflict (code) do update set
  retrieved_on = current_date,
  covers_from = least(meta.source.covers_from, excluded.covers_from),
  attribution = case when meta.source.attribution like '%PWHL season, standings-template%' then meta.source.attribution else meta.source.attribution || ' ' || excluded.attribution end,
  notes = case when meta.source.notes like '%PWHL results from the%' then meta.source.notes else coalesce(meta.source.notes || ' ', '') || excluded.notes end;
create temp table src as select source_id from meta.source where code = 'wikipedia';

insert into ref.league (league_code, sport_code, country_code, founded_on, notes)
values ('pwhl', 'hockey', 'US', date '2023-08-29',
        'Professional Women''s Hockey League, 2023-24 on; a league of its own, not NHL seasons')
on conflict (league_code) do nothing;
insert into ref.league_name (league_code, valid_during, name, short_name)
values ('pwhl', daterange(null, null), 'Professional Women''s Hockey League', 'PWHL') on conflict do nothing;
insert into core.award (league_code, code, name, kind, description, first_season, source_id)
values ('pwhl', 'pwhl_walter_cup', 'Walter Cup', 'championship',
        'The PWHL playoff championship (Walter Cup), 2023-24 on.', 2023, (select source_id from src))
on conflict (code) do nothing;

delete from core.standing where source_id = (select source_id from src) and source_key like 'wppwhl:%';
delete from meta.data_issue where source_id = (select source_id from src) and issue ~ '^PWHL:';
delete from core.external_id where source_id = (select source_id from src) and entity_kind = 'game' and external_key like 'wppwhl:%';

create temp table seed_club (club text, league text, first_year int, last_year int, franchise text, country text, display text, note text);
\copy seed_club from 'db/seed/pwhl_club.csv' with (format csv, header true)
insert into core.franchise (sport_code, source_id, source_key)
select 'hockey', (select source_id from src), 'pwhl:' || k
from (select distinct substring(franchise from 5) k from seed_club where franchise like 'new:%') x
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = 'pwhl:' || x.k);
create temp table am as
select lower(s.club) as nm, s.first_year as y0, s.last_year as y1, s.club, nullif(s.display, '') as display, s.country,
       f3.franchise_id
from seed_club s
left join core.franchise f3 on s.franchise like 'new:%' and f3.source_id = (select source_id from src) and f3.source_key = 'pwhl:' || substring(s.franchise from 5);
do $$
declare bad text;
begin
  select string_agg(distinct a.nm || ' ' || a.y0, ', ') into bad from am a join am b on a.nm = b.nm and a.ctid < b.ctid and a.y0 <= b.y1 and b.y0 <= a.y1;
  if bad is not null then raise exception 'club name fits two rows in one year: %', bad; end if;
  select string_agg(distinct nm || ' ' || y0, ', ') into bad from am where franchise_id is null;
  if bad is not null then raise exception 'club row with no franchise: %', bad; end if;
end $$;

create temp table wss as select * from legacy_wikipedia_pwhl.season;
create temp table wgm as select * from legacy_wikipedia_pwhl.game;
create temp table wsd as select * from legacy_wikipedia_pwhl.standing;
create temp table wts as select * from legacy_wikipedia_pwhl.team_season;
create temp table seasons as select season as yr from wss;

create temp table ng as
select row_number() over (order by g.season, g.game_date, g.phase, g.home_team, g.away_team, g.game_seq) as gid,
       g.season as yr, g.phase::core.season_phase as phase, g.game_date, g.round_name,
       g.home_pts, g.away_pts, g.overtime, g.shootout, g.neutral_site, g.views, g.conflict,
       g.home_team, g.away_team, h.franchise_id home_f, a.franchise_id away_f,
       'wppwhl:' || g.season || ':' || g.phase || ':' || g.game_date || ':' || g.home_team || ':' || g.away_team || ':' || g.game_seq as key
from wgm g
left join am h on h.nm = lower(g.home_team) and g.season between h.y0 and h.y1
left join am a on a.nm = lower(g.away_team) and g.season between a.y0 and a.y1
where g.season in (select yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', key, format('PWHL: club name not matched to a franchise: %s / %s in %s', away_team, home_team, yr), 'Game left out'
from ng where home_f is null or away_f is null;
delete from ng where home_f is null or away_f is null or home_f = away_f;
delete from core.game g using core.season s
where g.source_id = (select source_id from src) and s.season_id = g.season_id and s.league_code = 'pwhl'
  and g.source_key like 'wppwhl:%' and not exists (select 1 from ng n where n.key = g.source_key);

create temp table nst as
select s.*, s.season as yr, m.franchise_id from wsd s
left join am m on m.nm = lower(s.team) and s.season between m.y0 and m.y1
where s.season in (select yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', season || ':' || team, 'PWHL: club name not matched to a franchise', 'Standing left out'
from nst where franchise_id is null;
delete from nst where franchise_id is null;

create temp table nts as
select t.season yr, t.team_name, t.log_games, m.franchise_id from wts t
join am m on m.nm = lower(t.team_name) and t.season between m.y0 and m.y1
where t.season in (select yr from seasons);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', t.season || ':' || t.team_name, 'PWHL: club name not matched to a franchise', 'Club left out'
from wts t
where t.season in (select yr from seasons) and not exists (select 1 from am m where m.nm = lower(t.team_name) and t.season between m.y0 and m.y1);

insert into core.season (league_code, start_year, end_year, label, source_id)
select 'pwhl', yr, yr + 1, yr::text || '-' || to_char(yr + 1, 'FM00'), (select source_id from src)
from (select yr from ng union select yr from nst union select yr from nts) x on conflict (league_code, start_year) do nothing;
update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs), regular_ends_on = coalesce(s.regular_ends_on, d.re),
  playoffs_end_on = coalesce(s.playoffs_end_on, d.pe)
from (select yr, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
             max(game_date) filter (where phase = 'playoffs') pe from ng group by yr) d
where s.league_code = 'pwhl' and s.start_year = d.yr;
update core.season s set games_per_team = x.gp
from (select yr, coalesce((select max(coalesce(w, 0) + coalesce(l, 0) + coalesce(otl, 0)) from nst where nst.yr = y.yr),
                          (select max(n) from (select count(*) n from (select home_f f from ng where ng.yr = y.yr and phase = 'regular'
                                                                       union all select away_f from ng where ng.yr = y.yr and phase = 'regular') z group by f) q)) gp
      from (select distinct yr from ng) y) x
where s.league_code = 'pwhl' and s.start_year = x.yr and s.games_per_team is null and x.gp > 0;

create temp table nm as
select distinct on (yr, franchise_id) yr, franchise_id, team_name as full_name,
       case when team_name ~ '^PWHL ' then substring(team_name from 6)
            when team_name ~ ' (Fleet|Frost|Victoire|Sirens|Charge|Sceptres|Torrent|Goldeneyes)$'
              then (regexp_match(team_name, '(Fleet|Frost|Victoire|Sirens|Charge|Sceptres|Torrent|Goldeneyes)$'))[1]
            else regexp_replace(team_name, '^.* ', '') end as nickname
from nts order by yr, franchise_id, team_name;
create temp table pwhlfr as
select franchise_id from core.franchise_league where league_code = 'pwhl'
union select franchise_id from core.franchise where source_id = (select source_id from src) and source_key like 'pwhl:%';

update core.team_season ts set franchise_identity_id = null
where franchise_identity_id in (select franchise_identity_id from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from pwhlfr));
delete from core.franchise_identity i where i.source_id = (select source_id from src) and i.franchise_id in (select franchise_id from pwhlfr);
delete from core.franchise_league l where l.source_id = (select source_id from src) and l.league_code = 'pwhl';

create temp table last_season as select max(yr) y from nm;
create temp table isl as
select franchise_id, full_name, nickname, min(yr) first_yr, max(yr) last_yr
from (select nm.*, yr - row_number() over (partition by franchise_id, full_name order by yr) as island from nm) x
group by franchise_id, full_name, nickname, island;
create temp table isl2 as
select i.*, case when i.last_yr >= (select y from last_season) and (select y from last_season) = (select max(start_year) from core.season where league_code = 'pwhl')
                 then null else make_date(i.last_yr + 1, 3, 1) end as end_on
from isl i;
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code, source_id)
select p.franchise_id, p.rng,
       case when p.full_name ~ '^PWHL ' then substring(p.full_name from 6)
            else btrim(left(p.full_name, length(p.full_name) - length(p.nickname))) end,
       p.nickname, p.full_name,
       coalesce((select a.country from am a where a.franchise_id = p.franchise_id and p.full_name = a.club limit 1), 'US'),
       (select source_id from src)
from (select i.franchise_id, i.full_name, i.nickname, u.rng
      from isl2 i
      cross join lateral unnest(datemultirange(daterange(make_date(i.first_yr, 3, 1), i.end_on)) -
            coalesce((select range_agg(x.valid_during) from core.franchise_identity x where x.franchise_id = i.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);

insert into core.team_season (franchise_id, season_id, source_id)
select distinct x.f, s.season_id, (select source_id from src)
from (select yr, home_f f from ng union select yr, away_f from ng union select yr, franchise_id from nst union select yr, franchise_id from nts) x
join core.season s on s.league_code = 'pwhl' and s.start_year = x.yr
on conflict (franchise_id, season_id) do nothing;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during @> make_date(s.start_year, 7, 1) limit 1)
where ts.franchise_identity_id is null and ts.season_id in (select season_id from core.season where league_code = 'pwhl');

create temp table clspan as
select ts.franchise_id, daterange(make_date(min(s.start_year), 3, 1),
       case when max(s.start_year) = (select max(start_year) from core.season where league_code = 'pwhl') then null
            else make_date(max(s.start_year) + 1, 3, 1) end) as rng
from core.team_season ts join core.season s using (season_id)
where s.league_code = 'pwhl' group by ts.franchise_id;
insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select p.franchise_id, 'pwhl', p.rng, (select source_id from src)
from (select a.franchise_id, u.rng
      from clspan a
      cross join lateral unnest(datemultirange(a.rng) -
            coalesce((select range_agg(l.valid_during) from core.franchise_league l where l.franchise_id = a.franchise_id), '{}'::datemultirange)) as u(rng)) p
where not isempty(p.rng);
update core.franchise f set founded_on = coalesce(f.founded_on, x.d0),
       folded_on = case when f.source_id = (select source_id from src) and x.d1 is not null then x.d1 else f.folded_on end
from (select ts.franchise_id, make_date(min(s.start_year), 3, 1) d0,
             case when max(s.start_year) < (select max(start_year) from core.season where league_code = 'pwhl')
                  then make_date(max(s.start_year) + 1, 3, 1) end d1
      from core.team_season ts join core.season s using (season_id) where s.league_code = 'pwhl' group by ts.franchise_id) x
where f.franchise_id = x.franchise_id and f.source_id = (select source_id from src) and f.source_key like 'pwhl:%';

create temp table game_new as
select s.season_id, n.phase, n.game_date, hts.team_season_id home_ts, ats.team_season_id away_ts, n.neutral_site, n.home_pts, n.away_pts, n.overtime, n.shootout,
       n.round_name, n.key, case when n.conflict is not null then 'Wikipedia logs disagree: ' || n.conflict end as notes
from ng n join core.season s on s.league_code = 'pwhl' and s.start_year = n.yr
join core.team_season hts on hts.franchise_id = n.home_f and hts.season_id = s.season_id
join core.team_season ats on ats.franchise_id = n.away_f and ats.season_id = s.season_id;
update core.game g set season_id = x.season_id, phase = x.phase, game_date = x.game_date, home_team_season_id = x.home_ts, away_team_season_id = x.away_ts,
       is_neutral_site = x.neutral_site, home_score = x.home_pts, away_score = x.away_pts, went_to_overtime = x.overtime, decided_by_shootout = x.shootout,
       round_label = x.round_name, notes = x.notes, updated_at = now()
from game_new x
where g.source_id = (select source_id from src) and g.source_key = x.key
  and (g.season_id, g.phase, g.game_date, g.home_team_season_id, g.away_team_season_id, g.is_neutral_site, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout, g.round_label, g.notes)
      is distinct from (x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, x.neutral_site, x.home_pts, x.away_pts, x.overtime, x.shootout, x.round_name, x.notes);
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, is_neutral_site, status,
                       home_score, away_score, went_to_overtime, decided_by_shootout, round_label, source_id, source_key, notes)
select x.season_id, x.phase, x.game_date, x.home_ts, x.away_ts, x.neutral_site, 'final', x.home_pts, x.away_pts, x.overtime, x.shootout, x.round_name,
       (select source_id from src), x.key, x.notes
from game_new x
where not exists (select 1 from core.game g where g.source_id = (select source_id from src) and g.source_key = x.key);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', n.key, 'PWHL: Wikipedia''s two logs disagree: ' || n.conflict, 'Kept the home club''s log'
from ng n where n.conflict is not null;
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'game', game_id, source_id, source_key from core.game
where source_id = (select source_id from src) and source_key like 'wppwhl:%';

create temp table gsum as
select yr, fid,
       count(*) filter (where pf > pa) w,
       count(*) filter (where pf < pa and not coalesce(ot or so, false)) l,
       count(*) filter (where pf < pa and coalesce(ot or so, false)) otl
from (select yr, home_f fid, home_pts pf, away_pts pa, overtime ot, shootout so from ng where phase = 'regular'
      union all select yr, away_f, away_pts, home_pts, overtime, shootout from ng where phase = 'regular') z group by yr, fid;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'standing', n.season || ':' || n.team,
       format('PWHL: Wikipedia''s standings give %s-%s-%s; its games add up to %s', n.w, n.l, n.otl,
              coalesce(g.w || '-' || g.l || '-' || g.otl, 'no games')),
       'Standing left out; the site shows the games'' sum'
from nst n left join gsum g on g.yr = n.yr and g.fid = n.franchise_id
where n.w is not null and n.l is not null
  and (g.fid is null or (g.w, g.l, g.otl) is distinct from (n.w, n.l, coalesce(n.otl, 0)));
insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ot_losses, points, win_pct,
                           points_for, points_against, is_final, source_key)
select ts.team_season_id, 'regular', coalesce(s.regular_ends_on, make_date(n.season + 1, 5, 1)), (select source_id from src),
       n.w + n.l + coalesce(n.otl, 0), n.w, n.l, n.otl, n.pts,
       case when n.pct ~ '^[01]?\.\d+$' then n.pct::numeric(5,4) else round((n.w)::numeric / nullif(n.w + n.l + coalesce(n.otl, 0), 0), 4) end,
       n.gf, n.ga, true, 'wppwhl:' || n.season || ':' || n.team
from (select distinct on (season, franchise_id) * from nst order by season, franchise_id, division) n
join core.season s on s.league_code = 'pwhl' and s.start_year = n.season
join core.team_season ts on ts.franchise_id = n.franchise_id and ts.season_id = s.season_id
join gsum g on g.yr = n.yr and g.fid = n.franchise_id and (g.w, g.l, g.otl) = (n.w, n.l, coalesce(n.otl, 0))
where n.w is not null and n.l is not null
on conflict do nothing;

select 'seasons' k, count(*)::bigint n from seasons
union all select 'games', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'pwhl'
union all select 'regular', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'pwhl' and g.phase = 'regular'
union all select 'playoffs', count(*) from core.game g join core.season s using (season_id) where g.source_id = (select source_id from src) and s.league_code = 'pwhl' and g.phase = 'playoffs'
union all select 'standings', count(*) from core.standing where source_id = (select source_id from src) and source_key like 'wppwhl:%'
union all select 'standings left out', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'PWHL: Wikipedia''s standings%'
union all select 'unmatched name', count(*) from meta.data_issue where source_id = (select source_id from src) and issue like 'PWHL: club name not matched%'
union all select 'team seasons', count(*) from core.team_season t join core.season s using (season_id) where s.league_code = 'pwhl'
union all select 'franchises', count(*) from core.franchise where source_id = (select source_id from src) and source_key like 'pwhl:%';
commit;
