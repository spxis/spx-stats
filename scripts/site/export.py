"""Export the spx-stats database as static JSON for the browsing site.
Usage: export.py <out dir> [psql connection args]. Writes:
  summary.json             leagues, their seasons (games, results, champion, status), totals
  sources.json             every source, its licence and credit, and how many games it holds
  quality.json             data issues and second-source checks, by kind
  <league>/<year>.json     one season: standings, champion, awards, every game
  <league>/teams.json      every franchise: its names over time and its record each season"""
import json, os, subprocess, sys

OUT = sys.argv[1]
CONN = sys.argv[2:] or ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"]


def q(sql):
    p = subprocess.run(["psql", *CONN, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)
    if p.returncode:
        raise SystemExit(p.stderr)
    return json.loads(p.stdout or "null")


def write(path, data):
    path = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)


TEAM_NAME = """coalesce((select i.full_name from core.franchise_identity i where i.franchise_identity_id = ts.franchise_identity_id),
  (select i.full_name from core.franchise_identity i join core.season s2 on s2.season_id = ts.season_id where i.franchise_id = ts.franchise_id
   order by abs(extract(year from lower(i.valid_during)) - s2.start_year) limit 1), 'Team ' || ts.franchise_id)"""


leagues = q("""select json_agg(json_build_object('code', l.league_code, 'name', n.name, 'short', n.short_name) order by
  array_position(array['nhl','nba','mlb','nfl','cfl'], l.league_code)) from ref.league l join ref.league_name n using (league_code)""")

seasons = q(f"""
with g as (select g.season_id, count(*) filter (where phase='regular' and status<>'cancelled') reg, count(*) filter (where phase='regular' and status='final') reg_final,
                  count(*) filter (where phase='playoffs' and status='final') po_final, count(distinct g.home_team_season_id) teams
           from core.game g group by 1),
c as (select distinct on (w.season_id) w.season_id, w.winner_name, w.note, src.code src from core.award_winner w join core.award a using (award_id)
      join meta.source src on src.source_id = w.source_id where a.kind = 'championship'
      order by w.season_id, (src.code = 'spx_stats_derived') desc)
select json_agg(json_build_object('league', s.league_code, 'year', s.start_year, 'label', s.label, 'games', coalesce(g.reg, 0),
  'finals', coalesce(g.reg_final, 0), 'playoff_finals', coalesce(g.po_final, 0), 'teams', coalesce(g.teams, 0),
  'champion', c.winner_name, 'champion_note', c.note, 'champion_source', c.src) order by s.league_code, s.start_year)
from core.season s left join g using (season_id) left join c using (season_id)""")

sources = q("""select json_agg(json_build_object('code', s.code, 'name', s.name, 'licence', s.licence, 'attribution', s.attribution, 'url', s.url,
  'notes', s.notes, 'games', (select count(*) from core.game g where g.source_id = s.source_id),
  'award_winners', (select count(*) from core.award_winner w where w.source_id = s.source_id)) order by s.source_id) from meta.source s""")

quality = q("""select json_build_object(
  'issues', (select json_agg(x) from (select src.code source, i.entity_kind kind, regexp_replace(i.issue, '[0-9]+', '#', 'g') issue, i.resolution, count(*) n
             from meta.data_issue i join meta.source src using (source_id) group by 1,2,3,4 order by 5 desc limit 40) x),
  'checks', (select json_agg(x) from (select src.code source, v.entity_kind kind, v.status, count(*) n
             from meta.verification v join meta.source src using (source_id) group by 1,2,3 order by 4 desc) x),
  'games_by_source', (select json_agg(x) from (select s.league_code league, src.code source, count(*) n from core.game g join core.season s using (season_id)
             join meta.source src on src.source_id = g.source_id group by 1,2 order by 1,3 desc) x))""")

totals = q("""select json_build_object('games', (select count(*) from core.game where status<>'cancelled'), 'finals', (select count(*) from core.game where status='final'),
  'lines', (select count(*) from core.betting_line), 'confirmed', (select count(*) from meta.verification where status='confirmed'),
  'issues', (select count(*) from meta.data_issue), 'award_winners', (select count(*) from core.award_winner),
  'franchises', (select count(distinct franchise_id) from core.team_season), 'seasons', (select count(*) from core.season))""")

write("summary.json", {"leagues": leagues, "seasons": seasons, "totals": totals})
write("sources.json", sources)
write("quality.json", quality)

for lg in [l["code"] for l in leagues]:
    years = [s["year"] for s in seasons if s["league"] == lg]
    for y in years:
        d = q(f"""
with se as (select * from core.season where league_code = '{lg}' and start_year = {y}),
ts as (select ts.team_season_id, ts.franchise_id, {TEAM_NAME} as name from core.team_season ts join se using (season_id)),
pub as (select distinct on (st.team_season_id) st.* from core.standing st join ts using (team_season_id) where st.phase = 'regular' order by st.team_season_id, st.as_of desc),
calc as (select c.* from core.standing_from_games c join ts using (team_season_id) where c.phase = 'regular')
select json_build_object(
 'league', '{lg}', 'year', {y}, 'label', (select label from se),
 'teams', (select json_agg(json_build_object('id', team_season_id, 'f', franchise_id, 'name', name) order by name) from ts),
 'standings', (select json_agg(r order by r.pct desc nulls last, r.w desc) from (
    select ts.team_season_id id, ts.name,
      coalesce(p.games_played, c.games_played) gp, coalesce(p.wins, c.wins) w, coalesce(p.losses, c.losses) l,
      coalesce(p.ties, nullif(c.ties, 0)) t, coalesce(p.ot_losses, nullif(c.ot_losses, 0)) otl, coalesce(p.points, c.points) pts,
      coalesce(p.points_for, c.points_for) pf, coalesce(p.points_against, c.points_against) pa,
      coalesce(p.home_record, c.home_record) home, coalesce(p.road_record, c.road_record) road,
      round(coalesce(p.wins, c.wins)::numeric / nullif(coalesce(p.wins, c.wins) + coalesce(p.losses, c.losses) + coalesce(p.ot_losses, nullif(c.ot_losses,0), 0), 0), 3) pct,
      case when p.team_season_id is not null then 'published' else 'scores' end basis, p.as_of
    from ts left join pub p using (team_season_id) left join calc c using (team_season_id)
    where p.team_season_id is not null or c.team_season_id is not null) r),
 'awards', (select json_agg(json_build_object('award', a.name, 'kind', a.kind, 'winner', w.winner_name, 'note', w.note, 'source', src.code)
            order by a.kind, a.award_id) from core.award_winner w join core.award a using (award_id) join se using (season_id)
            join meta.source src on src.source_id = w.source_id),
 'games', (select json_agg(json_build_array(g.game_date, g.away_team_season_id, g.away_score, g.home_score, g.home_team_season_id,
            left(g.phase::text, 1), left(g.status::text, 1), src.code,
            case when g.went_to_overtime then 1 else 0 end,
            (select max(case v.status when 'confirmed' then 1 when 'disputed' then -1 end) from meta.verification v where v.entity_kind = 'game' and v.entity_id = g.game_id))
            order by g.game_date, g.game_id)
           from core.game g join se using (season_id) join meta.source src on src.source_id = g.source_id where g.status <> 'cancelled')
)""")
        write(f"{lg}/{y}.json", d)
    teams = q(f"""
select json_agg(json_build_object('f', f.franchise_id,
  'names', (select json_agg(json_build_object('name', i.full_name, 'from', lower(i.valid_during), 'to', upper(i.valid_during)) order by lower(i.valid_during))
            from core.franchise_identity i where i.franchise_id = f.franchise_id),
  'seasons', (select json_agg(json_build_array(s.start_year, c.wins, c.losses, c.ties, c.ot_losses) order by s.start_year)
              from core.team_season ts join core.season s using (season_id) join core.standing_from_games c on c.team_season_id = ts.team_season_id and c.phase = 'regular'
              where ts.franchise_id = f.franchise_id),
  'titles', (select json_agg(s.start_year order by s.start_year) from core.award_winner w join core.award a using (award_id) join core.team_season ts using (team_season_id)
             join core.season s on s.season_id = w.season_id where a.kind = 'championship' and ts.franchise_id = f.franchise_id)))
from (select distinct ts.franchise_id from core.team_season ts join core.season s using (season_id) where s.league_code = '{lg}') f""")
    write(f"{lg}/teams.json", teams)
    print(lg, len(years), "seasons")
