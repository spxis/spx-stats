"""The planner: reads what DS1 already holds, finds what it does not, and enqueues exactly that, biggest gaps first.

Pass 1 (always): only targets where DS1 holds nothing, measured from DS1 counts every time it runs (so it adapts as gaps fill):
  - team seasons with no row in core.roster_stint       -> a team-season article (wp_team_season) and the team's Wikidata P54 members (wd_team_members);
  - team seasons with no row in core.team_season_stat   -> the same team-season article, one tier lower;
  - seasons with no row in core.award_winner            -> the league-season article (wp_league_season);
  - draft years with no row in core.draft_pick          -> the draft article (wp_draft);
  - people with a Wikidata id and no birth date, birth place, birth country or position -> their Wikidata item (wd_person).
Pass 2 (only when no gap job is left queued or running): the same targets for everything else, as re-reads at refresh priority.
The planner never changes a job that was already read, and a job it finds again only gains priority.
"""
import json
from datetime import datetime, timezone

import db
import jobs
import tiers
import wikitext as W
from config import LEAGUES

DRAFT_FROM = {"nba": 1947, "nfl": 1936, "cfl": 1950, "nhl": 1963, "mlb": 1965}      # no draft article before these years: not asked for
TITLE_ALIAS = {("mlb", "Sacramento Athletics"): "Athletics"}                         # Wikipedia's article name where it differs from the club's name
IN = "(%s)" % ",".join("'%s'" % x for x in LEAGUES)
NORM = "regexp_replace(translate(lower({c}), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g')"

TEAM_SEASONS = """
select s.league_code as league, s.start_year as season, ts.team_season_id, coalesce(i.full_name, '') as name,{held_wp}
       not exists (select 1 from core.roster_stint r where r.team_season_id = ts.team_season_id) as no_roster,
       not exists (select 1 from core.team_season_stat t where t.team_season_id = ts.team_season_id) as no_stat
from core.team_season ts
join core.season s on s.season_id = ts.season_id
left join lateral (select x.full_name from core.franchise_identity x where x.franchise_id = ts.franchise_id
                   order by (x.valid_during @> make_date(s.start_year::int, 10, 15)) desc, lower(x.valid_during) desc nulls last limit 1) i on true
where s.league_code in %s""" % IN

HELD_WP = """
       exists (select 1 from legacy_rosters.wp_article a where a.league_code = s.league_code and a.season = s.start_year and a.club = i.full_name
               and not a.missing and (a.has_roster or a.has_stats)) as held_wp,"""

SEASONS = """
select s.league_code as league, s.start_year as season,
       not exists (select 1 from core.award_winner w where w.season_id = s.season_id) as no_awards
from core.season s where s.league_code in %s""" % IN

DRAFTS = """
select l.league, y as year, not exists (select 1 from core.draft_pick d where d.league_code = l.league and d.draft_year = y) as no_draft
from (select league_code as league, min(start_year) as lo, max(start_year) + 1 as hi from core.season where league_code in %s group by 1) l
cross join lateral generate_series(l.lo::int, l.hi::int) y""" % IN

TEAM_ITEMS = """
with gap as (select s.league_code, ts.franchise_id, max(s.start_year) as newest
             from core.team_season ts join core.season s on s.season_id = ts.season_id
             where s.league_code in {leagues} and not exists (select 1 from core.roster_stint r where r.team_season_id = ts.team_season_id)
             group by 1, 2),
ident as (select distinct fl.league_code, i.franchise_id, {norm_i} as n
          from core.franchise_identity i join core.franchise_league fl on fl.franchise_id = i.franchise_id)
select t.league_code as league, t.qid, max(g.newest) as season, bool_or(g.franchise_id is not null) as no_roster,{held_wd}
from legacy_team_brand.team t
join ident i on i.league_code = t.league_code and i.n = {norm_t}
left join gap g on g.franchise_id = i.franchise_id and g.league_code = t.league_code
where t.league_code in {leagues} and t.qid ~ '^Q[0-9]+$'
group by 1, 2"""

HELD_WD = "\n       exists (select 1 from legacy_rosters.league_team lt where lt.team_qid = t.qid) as held_wd"


def have_rosters():
    """True when the rosters pipeline (scripts/rosters, migration 092) has made its tables on this database: what it holds is not asked for again."""
    return bool(db.value("select to_regclass('legacy_rosters.wp_article') is not null and to_regclass('legacy_rosters.league_team') is not null"))


def team_seasons_sql(held):
    return TEAM_SEASONS.replace("{held_wp}", HELD_WP if held else " false as held_wp,")


def team_items_sql(held):
    return TEAM_ITEMS.format(leagues=IN, norm_i=NORM.format(c="i.full_name"), norm_t=NORM.format(c="t.label"), held_wd=(HELD_WD if held else " false as held_wd"))

PERSON_INSERT = """
insert into ingest.harvest_job as j (kind, target, priority, gap, refresh_days)
select 'wd_person', x.external_key, {prio}, {gap}, 365
from core.external_id x join core.person p on p.person_id = x.entity_id
where x.entity_kind = 'person' and x.source_id = (select source_id from meta.source where code = 'wikidata') and x.external_key ~ '^Q[0-9]+$'
  and ({cond})
on conflict (kind, target) do update set priority = greatest(j.priority, excluded.priority), gap = j.gap or excluded.gap, updated_at = now()
where j.state = 'queued';"""
PERSON_MISSING = "p.birth_date is null or p.birth_place is null or p.birth_country_code is null or p.primary_position is null"


def season_label(league, y):
    if league not in ("nba", "nhl"):
        return str(y)
    return "%d\u2013%d" % (y, y + 1) if (y + 1) % 100 == 0 else "%d\u2013%02d" % (y, (y + 1) % 100)      # 1999\u20132000


def team_title(league, y, name):
    return "%s %s season" % (season_label(league, y), TITLE_ALIAS.get((league, name), W.ascii_fold(name)))


def league_title(league, y):
    if league == "nba":
        return "%s %s season" % (season_label(league, y), "BAA" if y < 1949 else "NBA")
    if league == "mlb":
        return "%d Major League Baseball season" % y
    return "%s %s season" % (season_label(league, y), league.upper())


def draft_title(league, y):
    if league == "nba":
        return "%d %s draft" % (y, "BAA" if y < 1949 else "NBA")
    if league == "nhl":
        return "%d NHL %s draft" % (y, "entry" if y >= 1979 else "amateur")
    if league == "mlb":
        return "%d Major League Baseball draft" % y
    return "%d %s draft" % (y, league.upper())


def refresh_days(cfg, season, now):
    return cfg.recent_refresh_days if season is not None and season >= now.year - 1 else cfg.old_refresh_days


def build_targets(cfg, now, team_seasons, seasons, drafts, team_items, everything=False):
    """The queue rows for the given DS1 measurements. Pass 1 keeps only gaps; with everything=True every target is returned (gap=false where DS1 has it)."""
    out = {}

    def add(kind, target, league, season, prio, gap):
        if not gap and not everything:
            return
        if not gap:
            prio = tiers.refresh_priority(season)
        key = (kind, target)
        t = dict(kind=kind, target=target, league=league, season=season, priority=prio, gap=gap, refresh_days=refresh_days(cfg, season, now))
        if key not in out or out[key]["priority"] < prio:
            out[key] = t

    for r in team_seasons:
        lg, y = r["league"], int(r["season"])
        if not r["name"]:
            continue
        if r["no_roster"] and not r.get("held_wp"):          # held_wp: scripts/rosters already holds the article (legacy_rosters), a build step away from core
            add("wp_team_season", team_title(lg, y, r["name"]), lg, y, tiers.gap_priority(tiers.ROSTER[lg], y), True)
        elif r["no_stat"]:
            add("wp_team_season", team_title(lg, y, r["name"]), lg, y, tiers.gap_priority(tiers.SEASON[lg], y), True)
        else:
            add("wp_team_season", team_title(lg, y, r["name"]), lg, y, 0, False)
    for r in seasons:
        lg, y = r["league"], int(r["season"])
        add("wp_league_season", league_title(lg, y), lg, y, tiers.gap_priority(tiers.SEASON[lg], y), bool(r["no_awards"]))
    for r in drafts:
        lg, y = r["league"], int(r["year"])
        if y >= DRAFT_FROM[lg]:
            add("wp_draft", draft_title(lg, y), lg, y, tiers.gap_priority(tiers.SEASON[lg], y), bool(r["no_draft"]))
    for r in team_items:
        lg = r["league"]
        gap = bool(r["no_roster"]) and not r.get("held_wd")      # held_wd: legacy_rosters.league_team already lists the club
        y = int(r["season"]) if r.get("season") is not None else None
        add("wd_team_members", r["qid"], lg, y, tiers.gap_priority(tiers.ROSTER[lg], y), gap)
    return sorted(out.values(), key=lambda t: -t["priority"])


def gap_jobs_left():
    return int(db.value("select count(*) from ingest.harvest_job where gap and state in ('queued', 'running')") or 0)


def plan(cfg, now=None, force_everything=False):
    """One planner run. -> {"pass": 1|2, "enqueued": n, "by_kind": {...}, "gap_jobs_left": n}"""
    now = now or datetime.now(timezone.utc)
    held = have_rosters()
    ts, se, dr, ti = (db.rows(q) for q in (team_seasons_sql(held), SEASONS, DRAFTS, team_items_sql(held)))
    targets = build_targets(cfg, now, ts, se, dr, ti)
    sql = jobs.enqueue_sql(targets) + PERSON_INSERT.format(prio=tiers.BIOS, gap="true", cond=PERSON_MISSING)
    db.run(sql)
    left = gap_jobs_left()
    passed = 1
    if left == 0 or force_everything:
        passed = 2
        rest = build_targets(cfg, now, ts, se, dr, ti, everything=True)
        db.run(jobs.enqueue_sql(rest) + PERSON_INSERT.format(prio=tiers.refresh_priority(None), gap="false", cond="true"))
    by = {}
    for t in targets:
        by[t["kind"]] = by.get(t["kind"], 0) + 1
    summary = {"pass": passed, "gap_targets": len(targets), "gap_by_kind": by, "gap_jobs_left": gap_jobs_left()}
    db.run("insert into ingest.harvest_state (key, value) values ('last_plan', %s) on conflict (key) do update set value = excluded.value, updated_at = now();"
           % db.lit(dict(summary, at=now.isoformat())))
    return summary


def plan_due(cfg, now=None):
    now = now or datetime.now(timezone.utc)
    r = db.rows("select updated_at < now() - interval '%d minutes' as old from ingest.harvest_state where key = 'last_plan'" % int(cfg.plan_every_hours * 60))
    return (not r) or bool(r[0]["old"])
