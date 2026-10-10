-- The public, read-only API: views over core, meta and ref that the website and
-- anyone else read through Supabase's REST API (PostgREST). Only this schema is
-- exposed; the tables behind it are not. Summaries are materialized views:
-- refresh them after every load with `select api.refresh();`.
create schema if not exists api;
comment on schema api is 'Read-only views of the archive for the website and the public API.';

create or replace function api.team_name(p_team_season_id integer) returns text language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(
    (select i.full_name from core.team_season ts join core.franchise_identity i on i.franchise_identity_id = ts.franchise_identity_id
      where ts.team_season_id = p_team_season_id),
    (select i.full_name from core.team_season ts join core.season s using (season_id) join core.franchise_identity i on i.franchise_id = ts.franchise_id
      where ts.team_season_id = p_team_season_id order by abs(extract(year from lower(i.valid_during)) - s.start_year) limit 1))
$$;

drop materialized view if exists api.season_summary cascade;
create materialized view api.season_summary as
with g as (
  select season_id,
         count(*) filter (where phase = 'regular' and status <> 'cancelled') as games,
         count(*) filter (where phase = 'regular' and status = 'final') as finals,
         count(*) filter (where phase = 'playoffs' and status = 'final') as playoff_finals,
         count(distinct home_team_season_id) as teams
  from core.game group by season_id),
c as (
  select distinct on (w.season_id) w.season_id, w.winner_name, w.note, src.code as source, ts.franchise_id
  from core.award_winner w join core.award a using (award_id) join meta.source src on src.source_id = w.source_id
  left join core.team_season ts on ts.team_season_id = w.team_season_id
  where a.kind = 'championship' order by w.season_id, (src.code = 'spx_stats_derived') desc)
select s.league_code as league, s.start_year as year, s.label, coalesce(g.games, 0) as games, coalesce(g.finals, 0) as finals,
       coalesce(g.playoff_finals, 0) as playoff_finals, coalesce(g.teams, 0) as teams,
       c.winner_name as champion, c.note as champion_note, c.source as champion_source, c.franchise_id as champion_franchise
from core.season s left join g using (season_id) left join c using (season_id);
create unique index on api.season_summary (league, year);

drop materialized view if exists api.totals cascade;
create materialized view api.totals as
select (select count(*) from core.game where status <> 'cancelled') as games,
       (select count(*) from core.game where status = 'final') as finals,
       (select count(*) from core.betting_line) as lines,
       (select count(*) from meta.verification where status = 'confirmed') as confirmed,
       (select count(*) from meta.data_issue) as issues,
       (select count(*) from core.award_winner) as award_winners,
       (select count(distinct franchise_id) from core.team_season) as franchises,
       (select count(*) from core.season) as seasons,
       now() as refreshed_at;

drop materialized view if exists api.games_by_source cascade;
create materialized view api.games_by_source as
select s.league_code as league, src.code as source, src.name as source_name, count(*) as games
from core.game g join core.season s using (season_id) join meta.source src on src.source_id = g.source_id
group by 1, 2, 3;

drop materialized view if exists api.quality cascade;
create materialized view api.quality as
select 'check' as kind, src.code as source, v.entity_kind as entity, v.status::text as what, null::text as resolution, count(*) as n
from meta.verification v join meta.source src using (source_id) group by 2, 3, 4
union all
select 'issue', src.code, i.entity_kind, regexp_replace(i.issue, '[0-9]+', '#', 'g'), i.resolution, count(*)
from meta.data_issue i join meta.source src using (source_id) group by 2, 3, 4, 5;

create or replace view api.games as
select s.league_code as league, s.start_year as year, g.game_id, g.game_date, g.phase::text as phase, g.status::text as status,
       g.away_team_season_id as away_id, api.team_name(g.away_team_season_id) as away, g.away_score,
       g.home_team_season_id as home_id, api.team_name(g.home_team_season_id) as home, g.home_score,
       g.went_to_overtime as overtime, src.code as source,
       (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v
         where v.entity_kind = 'game' and v.entity_id = g.game_id) as checked,
       (select franchise_id from core.team_season where team_season_id = g.away_team_season_id) as away_f,
       (select franchise_id from core.team_season where team_season_id = g.home_team_season_id) as home_f
from core.game g join core.season s using (season_id) join meta.source src on src.source_id = g.source_id
where g.status <> 'cancelled';

create or replace view api.standings as
with pub as (select distinct on (team_season_id) * from core.standing where phase = 'regular' order by team_season_id, as_of desc)
select s.league_code as league, s.start_year as year, ts.team_season_id as team_id, ts.franchise_id, api.team_name(ts.team_season_id) as team,
       coalesce(p.games_played, c.games_played) as gp, coalesce(p.wins, c.wins) as w, coalesce(p.losses, c.losses) as l,
       coalesce(p.ties, nullif(c.ties, 0)) as t, coalesce(p.ot_losses, nullif(c.ot_losses, 0)) as otl, coalesce(p.points, c.points) as pts,
       coalesce(p.points_for, c.points_for) as pf, coalesce(p.points_against, c.points_against) as pa,
       coalesce(p.home_record, c.home_record) as home, coalesce(p.road_record, c.road_record) as road,
       round(coalesce(p.wins, c.wins)::numeric / nullif(coalesce(p.wins, c.wins) + coalesce(p.losses, c.losses) + coalesce(p.ot_losses, nullif(c.ot_losses, 0), 0), 0), 3) as pct,
       case when p.team_season_id is not null then 'published' else 'scores' end as basis,
       (select code from meta.source where source_id = p.source_id) as source
from core.team_season ts join core.season s using (season_id)
left join pub p using (team_season_id)
left join core.standing_from_games c on c.team_season_id = ts.team_season_id and c.phase = 'regular'
where p.team_season_id is not null or c.team_season_id is not null;

create or replace view api.awards as
select s.league_code as league, s.start_year as year, a.code as award_code, a.name as award, a.kind::text as kind,
       w.winner_name as winner, w.note, src.code as source,
       (select franchise_id from core.team_season where team_season_id = w.team_season_id) as franchise_id
from core.award_winner w join core.award a using (award_id) join core.season s using (season_id) join meta.source src on src.source_id = w.source_id;

create or replace view api.award_list as
select league_code as league, code, name, kind::text as kind, description from core.award;

create or replace view api.team_seasons as
select s.league_code as league, s.start_year as year, ts.franchise_id, api.team_name(ts.team_season_id) as team,
       c.wins as w, c.losses as l, c.ties as t, c.ot_losses as otl,
       exists (select 1 from core.award_winner w join core.award a using (award_id) where a.kind = 'championship' and w.team_season_id = ts.team_season_id) as champion
from core.team_season ts join core.season s using (season_id)
left join core.standing_from_games c on c.team_season_id = ts.team_season_id and c.phase = 'regular';

create or replace view api.franchise_names as
select fl.league_code as league, i.franchise_id, i.full_name as name, lower(i.valid_during) as name_from, upper(i.valid_during) as name_to
from core.franchise_identity i join core.franchise_league fl using (franchise_id);

create or replace view api.sources as
select code, name, licence, attribution, url, notes from meta.source;

create or replace function api.refresh() returns void language sql security definer as $$
  refresh materialized view api.season_summary; refresh materialized view api.totals;
  refresh materialized view api.games_by_source; refresh materialized view api.quality;
$$;
revoke all on function api.refresh() from public;

grant usage on schema api to anon, authenticated;
grant select on all tables in schema api to anon, authenticated;
grant execute on function api.team_name(integer) to anon, authenticated;
