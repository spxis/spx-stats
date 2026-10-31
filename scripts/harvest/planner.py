"""The planner: reads what DS1 already holds, finds what it does not, and enqueues exactly that, biggest gaps first.

Pass 1 (always): only targets where DS1 holds nothing, measured from DS1 counts every time it runs (so it adapts as gaps fill), plus explicitly scoped historical article gaps and one-time reparses of stale/missing archives:
  - team seasons with no row in core.roster_stint       -> a team-season article (wp_team_season) and the team's Wikidata P54 members (wd_team_members);
  - team seasons with no row in core.team_season_stat   -> the same team-season article, one tier lower;
  - seasons with no row in core.award_winner            -> the league-season article (wp_league_season);
  - draft years with no row in core.draft_pick          -> the draft article (wp_draft);
  - people with a Wikidata id and no birth date, birth place, birth country or position -> their Wikidata item (wd_person).
  - pages no core table is measured for, because no pipeline of the site reads them yet (see "Beyond core" below): the club seasons of MLB's rival
    leagues and the few AHL / ECHL clubs that have an article, the playoffs and finals of every league, the drafts of the leagues loaded later, and
    each franchise's list of seasons, head coaches and managers. Never what another pipeline already archived (the WNBA, NWSL and PWHL club seasons,
    the NCAA football seasons: `legacy_files.raw_archive` names `wikipedia-wnba/`, `wikipedia-nwsl/`, `wikipedia-pwhl/`, `wikipedia-ncaaf/`).
Pass 2 (only when no gap job is left queued or running): the same targets for everything else, as re-reads at refresh priority.
The planner leaves completed jobs alone unless the corresponding archive is absent or behind the parser version; then it requeues that completed row once. Gone, failed and running rows retain their state/backoff/lease.
"""
import json
from datetime import datetime, timezone

import db
import jobs
import tiers
import wikitext as W
from config import LEAGUES, PARSER_VERSION

LIST_REFRESH_DAYS = 30           # a franchise's list gains a row each season; a revision-id check (50 titles a request) is all a month costs
DRAFT_FROM = {"nba": 1947, "nfl": 1936, "cfl": 1950, "nhl": 1963, "mlb": 1965}      # no draft article before these years: not asked for
TITLE_ALIAS = {("mlb", "Sacramento Athletics"): "Athletics"}                         # Wikipedia's article name where it differs from the club's name
# Where the name core.franchise_identity holds is not the name Wikipedia's article carries. Each row was checked against English Wikipedia
# (2026-10-31, `prop=info` on the title): (league or None for any, identity name, first year, last year, the article's club name). Found as
# `gone` rows in the queue: 269 articles "did not exist", 74 of them only under another name; the rest do not exist (see harvest/README.md).
NAME_ALIAS = [
    ("nhl", "Chicago Blackhawks", 1926, 1985, "Chicago Black Hawks"),             # one word from 1986-87; 38 seasons were asked for as "Blackhawks"
    ("nfl", "St Louis Rams", 1995, 2015, "St. Louis Rams"),
    ("nfl", "Buffalo Bisons", 1924, 1927, "Buffalo Bisons (NFL)"),                # the baseball and hockey clubs of that name have the plain title
    ("nfl", "Brooklyn Dodgers", 1930, 1931, "Brooklyn Dodgers (NFL)"),
    ("nba", "Seattle", 2002, 2008, "Seattle SuperSonics"),
    ("mlb", "Houston Colt .45's", 1962, 1964, "Houston Colt .45s"),
    ("wha", "New York Golden Blades / Jersey Knights", 1973, 1973, "New York Golden Blades/New Jersey Knights"),
    ("wha", "Michigan Stags / Baltimore Blades", 1974, 1974, "Michigan Stags/Baltimore Blades"),
    ("wha", "Denver Spurs / Ottawa Civics", 1975, 1975, "Denver Spurs/Ottawa Civics"),
    (None, "Cleveland Forest Cities", 1871, 1872, "Cleveland Forest Citys"),
    (None, "Ft. Wayne Kekiongas", 1871, 1871, "Fort Wayne Kekiongas"),
    (None, "Baltimore Lord Baltimores", 1872, 1874, "Baltimore Canaries"),
    (None, "New Haven New Havens", 1875, 1875, "New Haven Elm Citys"),
    (None, "Cleveland Spiders", 1879, 1888, "Cleveland Blues"),                    # the Spiders name starts in 1889
    (None, "Allegheny Club", 1882, 1884, "Pittsburgh Alleghenys"),
    (None, "Allegheny Club (none)", 1882, 1884, "Pittsburgh Alleghenys"),
    (None, "Columbus Colts", 1883, 1884, "Columbus Buckeyes"),
    (None, "Columbus Colts", 1889, 1891, "Columbus Solons"),
    (None, "Indianapolis Blues", 1884, 1884, "Indianapolis Hoosiers"),
    (None, "Richmond Virginias", 1884, 1884, "Richmond Virginians"),
    (None, "Washington Senators", 1886, 1889, "Washington Nationals"),
    (None, "Washington Senators", 1891, 1891, "Washington Statesmen"),
    (None, "Brooklyn Wonders", 1890, 1890, "Brooklyn Ward's Wonders"),
    (None, "Philadelphia Quakers", 1890, 1890, "Philadelphia Athletics (PL)"),
    (None, "Rochester Hop Bitters", 1890, 1890, "Rochester Broncos"),
    (None, "St. Louis Browns", 1882, 1882, "St. Louis Brown Stockings"),
    (None, "Chicago White Sox", 1902, 1902, "Chicago White Stockings"),            # the American League club's title that year
    (None, "St.Louis Terriers", 1914, 1915, "St. Louis Terriers"),
    (None, "Buffalo Blues", 1914, 1914, "Buffalo Buffeds"),
    (None, "Chicago Whales", 1914, 1914, "Chicago Federals"),
]
HISTORIC_LEAGUE_RANGES = {
    "nfl": (1920, 1971), "afl": (1960, 1969), "aafc": (1946, 1949),
    "nha": (1910, 1916), "pcha": (1912, 1923), "wchl": (1921, 1925),
    "wha": (1972, 1978), "aba": (1967, 1975), "nbl": (1937, 1948),
    "wfl": (1974, 1975), "usfl": (1983, 1985),
}
# MLB's rival leagues (core.season, 2026-10): their club-season articles are read like the historic ones, once, by the title Wikipedia uses.
RIVAL_LEAGUES = ("na", "aa", "ua", "pl", "fl")
EXTRA_TEAM_LEAGUES = RIVAL_LEAGUES
TEAM_LEAGUES = sorted(set(LEAGUES) | set(HISTORIC_LEAGUE_RANGES) | set(EXTRA_TEAM_LEAGUES))
TEAM_IN = "(%s)" % ",".join("'%s'" % x for x in TEAM_LEAGUES)
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
where s.league_code in %s""" % TEAM_IN

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

# Historical competitions that predate or are absent from core.season. Titles are
# generated only for series with verified Wikipedia title patterns. WHL remains
# deliberately omitted because the alias spans distinct historical competitions.
EXTRA_DRAFTS = {
    "afl": (1960, 1969, lambda y: "%d American Football League draft" % y),
    "wfl": (1974, 1974, lambda y: "%d WFL Draft" % y),
    "aba": (1967, 1976, lambda y: "%d ABA %s" % (y, "dispersal draft" if y == 1976 else "draft")),
    "usfl": (1983, 1985, lambda y: "%d USFL draft" % y),
    "wha": (1972, 1972, lambda y: "WHA general player draft"),
}


def historic_league_title(league, year, initial=False):
    if league == "nfl":
        return "%d %s season" % (year, "APFA" if year < 1922 else "NFL")
    if league == "afl":
        return "%d American Football League season" % year
    if league == "aafc":
        return "%d AAFC season" % year
    if league == "nha":
        return "%d NHA season" % year if initial else "%d–%02d NHA season" % (year, (year + 1) % 100)
    if league == "pcha":
        return "%d PCHA season" % year if initial else "%d–%02d PCHA season" % (year, (year + 1) % 100)
    if league == "wchl":
        return "%d–%02d %s season" % (year, (year + 1) % 100, "WHL" if year == 1925 else "WCHL")      # the league's last season carries its new name
    if league == "aba":
        return "%d–%02d ABA season" % (year, (year + 1) % 100)
    if league == "nbl":
        return "%d–%02d National Basketball League (United States) season" % (year, (year + 1) % 100)
    if league == "wfl":
        return "%d World Football League season" % year
    if league == "usfl":
        return "%d USFL season" % year
    if league == "wha":
        return "%d–%02d WHA season" % (year, (year + 1) % 100)
    raise ValueError("no verified historical title rule for %s" % league)


def historic_season_rows():
    """Potential old league seasons independent of core.season/team_season rows."""
    rows = []
    for lg, (start, end) in HISTORIC_LEAGUE_RANGES.items():
        if lg in ("nha", "pcha"):
            rows.append({"league": lg, "season": start, "title": historic_league_title(lg, start, initial=True)})
        rows.extend({"league": lg, "season": y, "title": historic_league_title(lg, y)} for y in range(start, end + 1))
    return rows


HISTORIC_SEASONS_SQL = """
select v.league, v.season, v.title, true as no_awards
from (values %s) v(league, season, title)
where not exists (select 1 from legacy_wikipedia_harvest.page p
                  where p.kind = 'wp_league_season' and p.title = v.title
                    and p.parser_version >= %d)
""" % (",\n".join("(%s, %d, %s)" % ("'%s'" % row["league"], row["season"], "'%s'" % row["title"])
                    for row in historic_season_rows()), PARSER_VERSION)


def historic_draft_rows():
    return [{"league": lg, "year": y, "title": title(y)}
            for lg, (start, end, title) in EXTRA_DRAFTS.items() for y in range(start, end + 1)]


HISTORIC_DRAFTS_SQL = """
select v.league, v.year, v.title, true as no_draft
from (values %s) v(league, year, title)
where not exists (select 1 from legacy_wikipedia_harvest.page p
                  where p.kind = 'wp_draft' and p.title = v.title
                    and p.parser_version >= %d)
""" % (",\n".join("('%s', %d, '%s')" % (r["league"], r["year"], r["title"]) for r in historic_draft_rows()), PARSER_VERSION)

# ---------------------------------------------------------------- beyond core
# Pages no table of core is measured against, so no "gap" can be read from DS1: the articles are known by their title. Each family below was
# checked against English Wikipedia on 2026-10-31 (prop=info, one request per 50 titles) before it was written down; a title that does not exist
# comes back `gone` and is looked at again in 90 days. What another pipeline already archived is left out (legacy_files.raw_archive):
#   wikipedia-wnba/ (385 club seasons, 30 seasons), wikipedia-nwsl/ (135, 13, the championships), wikipedia-pwhl/ (25, 4, playoffs),
#   wikipedia-ncaaf/ (every FBS season and club), wikipedia-hockey-minor/ (the AHL and ECHL seasons and their playoffs),
#   wikipedia-all-star/, wikipedia_stanley_cup/ and wikipedia-stanley-cup-final/ (the Stanley Cup finals), wikipedia_awards/.

# The AHL and ECHL clubs whose season has an article of its own (42 of the 2,305 club seasons core holds for the two leagues; the other titles
# redirect to the league's season article). A reviewed list, not a pattern: a new season's article is added by hand.
MINOR_CLUB_SEASONS = {
    "ahl": ["2024\u201325 Rochester Americans", "2025\u201326 Rochester Americans", "2022\u201323 Coachella Valley Firebirds",
            "2023\u201324 Coachella Valley Firebirds", "2024\u201325 Coachella Valley Firebirds", "2013\u201314 Rockford IceHogs",
            "2013\u201314 Charlotte Checkers", "2014\u201315 Charlotte Checkers", "2015\u201316 Toronto Marlies", "2013\u201314 Grand Rapids Griffins",
            "2014\u201315 Grand Rapids Griffins", "2019\u201320 Lehigh Valley Phantoms", "2013\u201314 Oklahoma City Barons", "2013\u201314 Abbotsford Heat",
            "2012\u201313 Hershey Bears", "2013\u201314 Hershey Bears", "2023\u201324 Hershey Bears", "2010\u201311 Binghamton Senators",
            "2013\u201314 Wilkes-Barre/Scranton Penguins", "2013\u201314 St. John's IceCaps"],
    "echl": ["%d\u2013%02d Alaska Aces" % (y, (y + 1) % 100) for y in range(2004, 2017)]
            + ["%d\u2013%02d Victoria Salmon Kings" % (y, (y + 1) % 100) for y in range(2004, 2011)]
            + ["2014\u201315 Missouri Mavericks", "2015\u201316 Missouri Mavericks"],
}

# Leagues whose drafts are not in DRAFTS (core.season of the five leagues) or EXTRA_DRAFTS: (first year, last year, title of a year)
LATER_DRAFTS = {
    "wnba": (1997, 2026, lambda y: "%d WNBA draft" % y),
    "nwsl": (2013, 2024, lambda y: "%d NWSL %s" % (y, "College Draft" if y <= 2019 else "Draft")),
    "pwhl": (2023, 2025, lambda y: "%d PWHL draft" % y),
}


def ordinal(n):
    return "%d%s" % (n, "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th"))


def roman(n):
    out = ""
    for v, r in ((50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= v:
            out, n = out + r, n - v
    return out


def postseason_rows():
    """(league, first season of the year, title) of the playoffs, the finals and the championship games. `season` is the year the season began,
    like every other page (the 2023 NBA playoffs are the 2022-23 season's)."""
    rows = []

    def add(league, season, title):
        rows.append({"kind": "wp_playoffs", "league": league, "season": season, "title": title, "tier": tiers.POSTSEASON})
    for y in range(1947, 1950):
        add("nba", y - 1, "%d BAA playoffs" % y)
        add("nba", y - 1, "%d BAA Finals" % y)
    for y in range(1950, 2027):
        add("nba", y - 1, "%d NBA playoffs" % y)
        add("nba", y - 1, "%d NBA Finals" % y)
    for y in range(1918, 2027):
        add("nhl", y - 1, "%d Stanley Cup playoffs" % y)        # before 1967 most are redirects to the season's article: they come back gone
    for y in range(1967, 2026):
        add("nfl", y, "%d\u2013%02d NFL playoffs" % (y, (y + 1) % 100))
    for y in range(1933, 1966):
        add("nfl", y, "%d NFL Championship Game" % y)
    for n in range(1, 62):
        add("nfl", 1966 + n - 1, "Super Bowl %s" % roman(n))
    for y in range(1960, 1970):
        add("afl", y, "%d American Football League Championship Game" % y)
    for y in range(1946, 1950):
        add("aafc", y, "%d AAFC Championship Game" % y)
    for y in range(1969, 2027):
        add("mlb", y, "%d Major League Baseball postseason" % y)
    for y in range(1903, 2027):
        if y not in (1904, 1994):
            add("mlb", y, "%d World Series" % y)
    for y in list(range(1909, 1916)) + list(range(1920, 2027)):
        add("cfl", y, "%s Grey Cup" % ordinal(y - 1908 if y <= 1915 else y - 1912))
    for y in range(1997, 2027):
        add("wnba", y, "%d WNBA playoffs" % y)
        add("wnba", y, "%d WNBA Finals" % y)
    return rows


def static_page_rows():
    """Everything above that is named rather than measured: -> dicts (kind, league, season, title, tier)."""
    rows = postseason_rows()
    for lg, (lo, hi, title) in LATER_DRAFTS.items():
        rows.extend({"kind": "wp_draft", "league": lg, "season": y, "title": title(y), "tier": tiers.DRAFT_LATER} for y in range(lo, hi + 1))
    for lg, names in MINOR_CLUB_SEASONS.items():
        rows.extend({"kind": "wp_team_season", "league": lg, "season": int(n[:4]), "title": n + " season", "tier": tiers.MINOR} for n in names)
    return rows


STATIC_PAGES_SQL = """
select v.kind, v.league, v.season, v.title, v.tier
from (values %s) v(kind, league, season, title, tier)
where not exists (select 1 from legacy_wikipedia_harvest.page p where p.kind = v.kind and p.title = v.title and p.parser_version >= %d)
  and not exists (select 1 from ingest.harvest_job j where j.kind = v.kind and j.target = v.title and j.state = 'gone' and j.next_check_at > now())
"""


def static_pages_sql():
    rows = static_page_rows()
    vals = ",\n".join("(%s, %s, %d, %s, %d)" % (db.lit(r["kind"]), db.lit(r["league"]), r["season"], db.lit(r["title"]), r["tier"]) for r in rows)
    return STATIC_PAGES_SQL % (vals, PARSER_VERSION)


# A franchise's own list articles: "List of Boston Celtics seasons" (a record for every season), "List of Boston Celtics head coaches", and for
# baseball "managers". The club's latest name; a club that has no such list (or whose title is a redirect to another club's) comes back gone.
LIST_LEAGUES = ("nba", "nhl", "nfl", "mlb", "cfl")
FRANCHISES = """
select fl.league_code as league,
       (select x.full_name from core.franchise_identity x where x.franchise_id = f.franchise_id
        order by upper(x.valid_during) desc nulls first, lower(x.valid_during) desc limit 1) as name
from core.franchise f join core.franchise_league fl on fl.franchise_id = f.franchise_id
where fl.league_code in (%s)""" % ",".join("'%s'" % x for x in LIST_LEAGUES)


def list_titles(league, name):
    n = W.ascii_fold(name.replace("\u2013", "-"))
    out = ["List of %s seasons" % n]
    out.append("List of %s %s" % (n, "managers" if league == "mlb" else "head coaches"))
    return out


TEAM_PAGE_STATE_SQL = """
select title, max(parser_version) as parser_version
from legacy_wikipedia_harvest.page
where kind = 'wp_team_season' and league in %s
group by title
""" % TEAM_IN
TEAM_JOB_STATE_SQL = "select target, state from ingest.harvest_job where kind = 'wp_team_season'"


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
    if league not in ("nba", "nhl", "nha", "pcha", "wchl", "wha", "aba", "nbl"):
        return str(y)
    return "%d\u2013%d" % (y, y + 1) if (y + 1) % 100 == 0 else "%d\u2013%02d" % (y, (y + 1) % 100)      # 1999\u20132000


def club_name(league, y, name):
    """The club's name as its season article spells it: the reviewed alias if there is one, else the identity name with accents folded and
    dashes kept (the fold used to drop the en dash: 'Kansas City\u2013Omaha Kings' was asked for as 'Kansas CityOmaha Kings')."""
    if (league, name) in TITLE_ALIAS:
        return TITLE_ALIAS[(league, name)]
    for lg, n, lo, hi, wp in NAME_ALIAS:
        if n == name and lo <= y <= hi and lg in (None, league):
            return wp
    return W.ascii_fold(name.replace("\u2013", "-").replace("\u2014", "-"))


def team_title(league, y, name):
    return "%s %s season" % (season_label(league, y), club_name(league, y, name))


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


def build_targets(cfg, now, team_seasons, seasons, drafts, team_items, everything=False, historic_seasons=(), historic_drafts=(), team_pages=None, team_jobs=None,
                  static_pages=(), franchises=()):
    """The queue rows for the given DS1 measurements. Pass 1 keeps only gaps; with everything=True every target is returned (gap=false where DS1 has it)."""
    out = {}

    def add(kind, target, league, season, prio, gap, refresh=None):
        if not gap and not everything:
            return
        if not gap:
            prio = tiers.refresh_priority(season)
        key = (kind, target)
        t = dict(kind=kind, target=target, league=league, season=season, priority=prio, gap=gap, refresh_days=refresh or refresh_days(cfg, season, now))
        if key not in out or out[key]["priority"] < prio:
            out[key] = t

    team_pages = team_pages or {}
    team_jobs = team_jobs or {}
    for r in team_seasons:
        lg, y = r["league"], int(r["season"])
        if not r["name"]:
            continue
        title = team_title(lg, y, r["name"])
        version = team_pages.get(title)
        parser_stale = version is not None and int(version) < PARSER_VERSION
        lo_hi = HISTORIC_LEAGUE_RANGES.get(lg)
        forced_history = (lo_hi is not None and lo_hi[0] <= y <= lo_hi[1] and version is None) or (lg in EXTRA_TEAM_LEAGUES and version is None)
        forced_player_stats = lg in ("nhl", "mlb") and not 1997 <= y <= 2013 and version is None
        if version is not None and not parser_stale:
            # A current archived page already contains the answer; do not fetch
            # it again merely because a downstream core table has not been built.
            if everything:
                add("wp_team_season", title, lg, y, 0, False)
            continue
        if forced_history or forced_player_stats or parser_stale:
            season_tier = tiers.RIVAL if lg in EXTRA_TEAM_LEAGUES else tiers.SEASON.get(lg, 5200)
            add("wp_team_season", title, lg, y, tiers.gap_priority(season_tier, y), True)
            # A done job with no archived page is also checked once: older
            # queue entries can predate the archive row. Gone/running/failed
            # jobs keep their own scheduled state and backoff.
            out[("wp_team_season", title)]["reparse"] = parser_stale or (version is None and team_jobs.get(title) == "done")
            continue
        if r["no_roster"] and not r.get("held_wp"):          # held_wp: scripts/rosters already holds the article (legacy_rosters), a build step away from core
            add("wp_team_season", title, lg, y, tiers.gap_priority(tiers.ROSTER.get(lg, 5200), y), True)
        elif r["no_stat"]:
            add("wp_team_season", title, lg, y, tiers.gap_priority(tiers.SEASON.get(lg, 5200), y), True)
        else:
            add("wp_team_season", title, lg, y, 0, False)
    for r in seasons:
        lg, y = r["league"], int(r["season"])
        add("wp_league_season", league_title(lg, y), lg, y, tiers.gap_priority(tiers.SEASON[lg], y), bool(r["no_awards"]))
    for r in historic_seasons:
        lg, y = r["league"], int(r["season"])
        add("wp_league_season", r["title"], lg, y, tiers.gap_priority(5200, y), bool(r["no_awards"]))
    for r in drafts:
        lg, y = r["league"], int(r["year"])
        if y >= DRAFT_FROM[lg]:
            add("wp_draft", draft_title(lg, y), lg, y, tiers.gap_priority(tiers.SEASON[lg], y), bool(r["no_draft"]))
    for r in historic_drafts:
        lg, y = r["league"], int(r["year"])
        add("wp_draft", r["title"], lg, y, tiers.gap_priority(5200, y), bool(r["no_draft"]))
    for r in static_pages:
        add(r["kind"], r["title"], r["league"], int(r["season"]), tiers.gap_priority(int(r["tier"]), int(r["season"])), True)
    for r in franchises:
        if r.get("name"):
            for t in list_titles(r["league"], r["name"]):
                add("wp_list", t, r["league"], None, tiers.gap_priority(tiers.LISTS), True, refresh=LIST_REFRESH_DAYS)
    for r in team_items:
        lg = r["league"]
        gap = bool(r["no_roster"]) and not r.get("held_wd")      # held_wd: legacy_rosters.league_team already lists the club
        y = int(r["season"]) if r.get("season") is not None else None
        add("wd_team_members", r["qid"], lg, y, tiers.gap_priority(tiers.ROSTER.get(lg, 5200), y), gap)
    return sorted(out.values(), key=lambda t: -t["priority"])


def gap_jobs_left():
    return int(db.value("select count(*) from ingest.harvest_job where gap and state in ('queued', 'running')") or 0)


def plan(cfg, now=None, force_everything=False):
    """One planner run. -> {"pass": 1|2, "enqueued": n, "by_kind": {...}, "gap_jobs_left": n}"""
    now = now or datetime.now(timezone.utc)
    held = have_rosters()
    ts, se, dr, ti, historic, historic_drafts, static, fr = (db.rows(q) for q in (team_seasons_sql(held), SEASONS, DRAFTS, team_items_sql(held), HISTORIC_SEASONS_SQL,
                                                                                  HISTORIC_DRAFTS_SQL, static_pages_sql(), FRANCHISES))
    team_pages = {r["title"]: int(r["parser_version"]) for r in db.rows(TEAM_PAGE_STATE_SQL)}
    team_jobs = {r["target"]: r["state"] for r in db.rows(TEAM_JOB_STATE_SQL)}
    targets = build_targets(cfg, now, ts, se, dr, ti, historic_seasons=historic, historic_drafts=historic_drafts, team_pages=team_pages, team_jobs=team_jobs,
                            static_pages=static, franchises=fr)
    sql = jobs.enqueue_sql(targets) + PERSON_INSERT.format(prio=tiers.BIOS, gap="true", cond=PERSON_MISSING)
    db.run(sql)
    left = gap_jobs_left()
    passed = 1
    if left == 0 or force_everything:
        passed = 2
        rest = build_targets(cfg, now, ts, se, dr, ti, everything=True, historic_seasons=historic, historic_drafts=historic_drafts,
                             team_pages=team_pages, team_jobs=team_jobs, static_pages=static, franchises=fr)
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
