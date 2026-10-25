#!/usr/bin/env python3
"""The registry of score and data sources and the terms gate.

One entry per source: its tier, why, the terms notes and an evidence link, how fast it may be asked (`spacing` seconds between two
requests, one request at a time), how long a fetched answer is reused (`ttl`), which hosts it is, and which leagues it covers.
`require(id)` and `guard_url(url)` raise SourceRefused for a red or unknown source, and for a grey one used the wrong way; the limiter
(limiter.py) calls the first before it queues anything and every fetcher calls the second right before a request.

    green   terms allow storing and reuse. Needs terms.checked_by, terms.checked_on and terms.clause. May be a default.
    grey    no terms found (John, 2026-10-19). A backup or cross-check only: never a default, fetched only by the once-a-day job and by an admin's
            manual request (purpose "daily" or "manual"), at most `daily_cap` requests a day, a handful of endpoints. The admin tools show a
            "grey area" marker with the notes.
    red     the terms forbid it, or AGENTS.md section 3 bars it: never fetched, not even to test.
    red-confirm  a red source John allowed to be READ to confirm a result other sources gave (2026-10-19; NHL APIs, MLB statsapi, stats.nba.com,
            PWHL feed, Yahoo Sports and USA TODAY scoreboards). Only purpose "confirm" (limiter.confirm), through the same limiter, and NEVER stored: no cache, no archive, no copied value,
            only an outcome (agrees, disagrees, unavailable). Never selectable, never a default; the admin tools show a "confirm-only" marker.

    python3 -I scripts/daily/sources.py [--json]      print the registry (what the source picker will list)

To add a source: read its terms first. If they forbid automated collection it goes in as red. A source whose terms cannot be found goes in
as grey with notes, an evidence link when there is one, and only John's yes makes it green.
"""
import json, os, sys
from urllib.parse import urlsplit

GREY_PURPOSES = ("daily", "manual")
CONFIRM_PURPOSE = "confirm"
SEED = "John Morris, 2026-10-19 (ticket cmveuseuh0006kw069tlpou4d)"


class SourceRefused(Exception):
    """A source (or host) that may not be fetched. The message says why and is meant for the run log and the admin."""

    def __init__(self, source, reason):
        self.source, self.reason = source, reason
        super().__init__("%s refused: %s" % (source, reason))


def _s(id, name, tier, reason, spacing=0, hosts=(), leagues=(), default=False, ttl=60, terms=None, notes="", evidence=None, daily_cap=None, url_contains=(), key_needed=False, lease=90, burst=1):
    return dict(id=id, name=name, tier=tier, reason=reason, spacing=float(spacing), hosts=tuple(hosts), leagues=tuple(leagues), default=default, ttl=ttl, terms=terms,
                notes=notes, evidence=evidence, daily_cap=daily_cap, url_contains=tuple(url_contains), key_needed=key_needed, lease=lease, burst=burst)


def _green(id, name, reason, spacing, hosts, leagues=(), default=False, clause="", by=SEED, on="2026-10-19", **kw):
    return _s(id, name, "green", reason, spacing=spacing, hosts=hosts, leagues=leagues, default=default, terms=dict(checked_by=by, checked_on=on, clause=clause), **kw)


def _grey(id, name, hosts, leagues=(), url_contains=(), notes="", evidence=None):
    return _s(id, name, "grey", "No terms found; backup or cross-check only, once a day and on manual request.", spacing=5, hosts=hosts, leagues=leagues, daily_cap=20, url_contains=url_contains,
              notes=notes or "No terms of use found for automated collection. Tier set by John on 2026-10-19; the clause and an evidence link are to be added by the terms check.", evidence=evidence)


def _red_confirm(id, name, reason, hosts=(), url_contains=(), evidence=None, leagues=(), spacing=5):
    return _s(id, name, "red-confirm", reason, spacing=spacing, hosts=hosts, leagues=leagues, url_contains=url_contains, evidence=evidence, daily_cap=20, ttl=0,
              notes=reason + " Confirm-only (John, 2026-10-19): read to confirm a result, never stored.")


def _red(id, name, reason, hosts=(), url_contains=(), evidence=None):
    return _s(id, name, "red", reason, hosts=hosts, url_contains=url_contains, evidence=evidence, notes=reason)


SOURCES = {x["id"]: x for x in [
    # ---- green
    _green("wikipedia", "English Wikipedia (club-season articles)", "CC BY-SA 4.0 text; the API etiquette is one request at a time, a pause between requests, a User-Agent with contact details.",
           float(os.environ.get("SPX_WIKI_GAP", "1.0")), ("en.wikipedia.org",), ("nhl", "nba", "mlb", "nfl", "cfl"), True, by="John Morris (AGENTS.md section 3, scripts/daily/README.md sources table)", on="2026-10-12",
           clause="Text is CC BY-SA 4.0 (credit and share-alike); MediaWiki API etiquette: one request at a time, maxlag, descriptive User-Agent.",
           evidence="https://www.mediawiki.org/wiki/API:Etiquette"),
    _green("balldontlie", "balldontlie (free tier: teams and games)", "Free account; its terms allow storing and publishing the data. 5 requests a minute, so 13 s apart, one request at a time for NBA, MLB and NFL together.",
           13, ("api.balldontlie.io",), ("nba", "mlb", "nfl"), True, by="John Morris", on="2026-10-12",
           clause="Terms allow storing and publishing the data (credit 'NBA schedule and scores from balldontlie.io'); free tier endpoints teams and games only.",
           evidence="https://docs.balldontlie.io", key_needed=True),
    _green("nflverse", "nflverse games.csv (nflverse-data release 'schedules')", "CC BY 4.0; one conditional file request.",
           2, ("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"), ("nfl",), True, by="John Morris (AGENTS.md section 3, scripts/daily/README.md sources table)", on="2026-10-12",
           clause="CC BY 4.0; credit 'NFL data from nflverse (github.com/nflverse), CC BY 4.0.'", evidence="https://github.com/nflverse/nflverse-data"),
    _green("wikidata", "Wikidata", "CC0.", 1, ("www.wikidata.org", "query.wikidata.org"), clause="CC0 1.0 (AGENTS.md section 3).", evidence="https://www.wikidata.org/wiki/Wikidata:Licensing"),
    _green("retrosheet", "Retrosheet", "Free to use with the credit notice.", 5, ("www.retrosheet.org", "retrosheet.org"), ("mlb",), clause="Credit notice required (AGENTS.md section 3).", evidence="https://www.retrosheet.org/notice.txt"),
    _green("lahman", "Lahman baseball database", "Open licence.", 5, ("sabr.org", "www.seanlahman.com"), ("mlb",), clause="Lahman (AGENTS.md section 3).", evidence="https://sabr.org/lahman-database/"),
    _green("osm", "OpenStreetMap (Overpass API)", "ODbL 1.0, credit '(c) OpenStreetMap contributors'; kept only in legacy_osm and core.brand_venue_osm.", 5,
           ("overpass-api.de", "www.openstreetmap.org"), clause="ODbL 1.0 (AGENTS.md section 3).", evidence="https://www.openstreetmap.org/copyright"),
    _green("cfbd", "CollegeFootballData.com", "Free API with a key.", 1, ("api.collegefootballdata.com",), clause="Seeded green by John 2026-10-19; a key is needed.", key_needed=True, evidence="https://collegefootballdata.com/"),
    _green("odds_api", "The Odds API", "Free tier with a key.", 1, ("api.the-odds-api.com",), clause="Seeded green by John 2026-10-19; a key is needed.", key_needed=True, evidence="https://the-odds-api.com/terms-and-conditions.html"),
    # ---- grey: no terms found
    _grey("wnba_stats", "stats.wnba.com", ("stats.wnba.com",), ("wnba",),
          notes="Tier set by John on 2026-10-19 (no terms found). Terms check 2026-10-25: the WNBA Terms of Use (wnba.com) section 9 says the NBA Statistics may not be used in connection with any website, product or service that features a database. John to decide whether this makes it red; no request is sent until he does.",
          evidence="https://www.wnba.com/terms-of-use"),
    _grey("hockeytech", "HockeyTech feeds (lscluster.hockeytech.com), leagues other than the PWHL", ("lscluster.hockeytech.com",), ("ahl", "echl"),
          url_contains=(), notes="Grey for leagues other than the PWHL only; any request naming the PWHL is red (pwhl_hockeytech). No terms found for the others. Tier set by John on 2026-10-19."),
    _grey("cfl_api", "api.cfl.ca", ("api.cfl.ca",), ("cfl",),
          notes="Tier set by John on 2026-10-19 (no terms found). Check 2026-10-25: the host does not answer (its DNS name points at a CloudFront name with no address); the CFL's API has needed a key issued by the CFL. The cfl.ca website terms forbid automated collection (cfl_ca is red). No parser until John has a working key and endpoint."),
    _grey("ncaa_stats", "stats.ncaa.org", ("stats.ncaa.org",)),
    _grey("fangraphs", "FanGraphs", ("www.fangraphs.com", "fangraphs.com"), ("mlb",),
          notes="Tier set by John on 2026-10-19 (no terms found). Terms check 2026-10-25: the Terms of Service section 17 says not to access the Service by any means other than the interface FanGraphs provides, and section 8 bars reusing the site's contents. John to decide whether this makes it red; no request is sent until he does.",
          evidence="https://www.fangraphs.com/about/terms-of-service"),
    _grey("transfermarkt", "Transfermarkt", ("www.transfermarkt.com", "transfermarkt.com"),
          notes="Tier set by John on 2026-10-19 (no terms found). Terms check 2026-10-25: the terms page could not be read by the checking tool (fetch blocked); a person must read them before any request is sent."),
    # ---- red-confirm: read to confirm a result, never stored
    _red_confirm("nhl_api", "NHL API (confirm-only)", "NHL.com's terms bar spidering, scraping and entering NHL content into a database.",
                 ("api-web.nhle.com", "api.nhle.com", "statsapi.web.nhl.com")),
    _red_confirm("mlb_statsapi", "MLB statsapi (confirm-only)", "MLB's notice bars automated use.", ("statsapi.mlb.com",), evidence="http://gdx.mlb.com/components/copyright.txt"),
    _red_confirm("nba_stats", "stats.nba.com (confirm-only)", "NBA.com's terms forbid automated collection.", ("stats.nba.com",)),
    _red_confirm("pwhl_hockeytech", "thepwhl.com and the PWHL HockeyTech feed (confirm-only)", "The PWHL's terms forbid it; any HockeyTech request for the PWHL is this source.",
                 ("thepwhl.com", "www.thepwhl.com"), url_contains=("client_code=pwhl", "/pwhl/")),
    _red_confirm("yahoo_sports", "Yahoo Sports scoreboards (confirm-only)",
                 "Yahoo's Terms (section 2, member conduct) forbid it: \"access or collect data, or attempt to access or collect data, from our Services using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools, for any purpose without our express, prior permission.\" (read 2026-10-19).",
                 ("sports.yahoo.com", "yahoo.com"), evidence="https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html", leagues=("nhl", "nba", "mlb", "nfl"), spacing=8),
    _red_confirm("usatoday", "USA TODAY Sports scoreboards (confirm-only)",
                 "USA TODAY's Terms of Service forbid it: \"use robots, spiders, scripts, code or any other automatic or manual device, tool or process to 'crawl', 'scrape', search or monitor this Site and/or access, retrieve or copy Content or related information\" (read 2026-10-19).",
                 ("sportsdata.usatoday.com", "www.usatoday.com", "usatoday.com"), evidence="https://cm.usatoday.com/terms/", leagues=("nhl", "nba", "mlb", "nfl"), spacing=8),
    # ---- red: the terms forbid it
    _red("nhl_com", "nhl.com (the website)", "AGENTS.md section 3: NHL.com's terms bar spidering, scraping and entering NHL content into a database.", ("nhl.com", "www.nhl.com")),
    _red("mlb_com", "mlb.com (the website)", "AGENTS.md section 3: MLB's notice bars automated use.", ("mlb.com", "www.mlb.com"), evidence="http://gdx.mlb.com/components/copyright.txt"),
    _red("nba_com", "NBA.com and cdn.nba.com", "AGENTS.md section 3: NBA.com's terms forbid automated collection.", ("nba.com", "www.nba.com", "cdn.nba.com")),
    _red("nfl_com", "NFL.com", "AGENTS.md section 3: NFL.com's terms forbid automated collection.", ("nfl.com", "www.nfl.com")),
    _red("cfl_ca", "cfl.ca (the website)", "AGENTS.md section 3: cfl.ca's terms forbid automated collection.", ("cfl.ca", "www.cfl.ca")),
    _red("espn", "ESPN", "AGENTS.md section 3: never use ESPN.", ("espn.com", "www.espn.com", "site.api.espn.com", "espncdn.com"), evidence="https://disneytermsofuse.com/"),
    _red("sports_reference", "Sports Reference (hockey-, basketball-, baseball-, pro-football-reference, FBref)", "AGENTS.md section 3: never use Sports Reference; its data-use page bars scraping.",
         ("sports-reference.com", "hockey-reference.com", "basketball-reference.com", "baseball-reference.com", "pro-football-reference.com", "fbref.com", "www.fbref.com", "www.hockey-reference.com",
          "www.basketball-reference.com", "www.baseball-reference.com", "www.pro-football-reference.com"), evidence="https://www.sports-reference.com/data_use.html"),
    _red("news_tv", "Newspapers and TV sites", "AGENTS.md section 3: their terms forbid automated collection."),
    _red("nwsl", "nwslsoccer.com", "Terms forbid automated collection.", ("nwslsoccer.com", "www.nwslsoccer.com")),
    _red("cpl", "cplsoccer.com", "Terms forbid automated collection.", ("cplsoccer.com", "www.cplsoccer.com")),
]}


def validate(registry):
    """-> list of problems (empty when the registry is sound)."""
    bad, hosts = [], {}
    for id, s in registry.items():
        t = s["tier"]
        if t not in ("green", "grey", "red", "red-confirm"):
            bad.append("%s: unknown tier %r" % (id, t))
        if t == "green":
            tm = s.get("terms") or {}
            if not (tm.get("checked_by") and tm.get("checked_on") and tm.get("clause")):
                bad.append("%s: green without terms.checked_by, checked_on and clause" % id)
        if t in ("green", "grey", "red-confirm") and s["spacing"] <= 0:
            bad.append("%s: %s without a spacing" % (id, t))
        if t in ("grey", "red-confirm") and not (s.get("notes") and s.get("daily_cap")):
            bad.append("%s: %s without notes and a daily cap" % (id, t))
        if t == "red-confirm" and (s["spacing"] <= 0 or s["ttl"]):
            bad.append("%s: red-confirm needs a spacing and no cache (ttl 0)" % id)
        if s["default"] and t != "green":
            bad.append("%s: only a green source can be a default" % id)
        if not s.get("reason"):
            bad.append("%s: no reason" % id)
        for h in s["hosts"]:
            if h in hosts:
                bad.append("%s: host %s is also %s" % (id, h, hosts[h]))
            hosts[h] = id
    return bad


def get(id, registry=None):
    return (registry or SOURCES).get(id)


def require(id, registry=None, purpose="daily"):
    """The entry of a source that may be fetched, else SourceRefused (unknown, red, or grey used for anything but the daily job or a manual request)."""
    s = (registry or SOURCES).get(id)
    if s is None:
        raise SourceRefused(id, "not in the registry of sources")
    if s["tier"] == "red":
        raise SourceRefused(id, "%s (red)" % s["reason"])
    if s["tier"] == "red-confirm" and purpose != CONFIRM_PURPOSE:
        raise SourceRefused(id, "%s (red, confirm-only: it may be read to confirm a result and nothing else, never fetched or stored for use)" % s["reason"])
    if purpose == CONFIRM_PURPOSE and s["tier"] != "red-confirm":
        raise SourceRefused(id, "not a confirm-only source")
    if s["tier"] == "grey" and purpose not in GREY_PURPOSES:
        raise SourceRefused(id, "grey area (no terms found): only the daily job and manual requests may use it, not %r" % purpose)
    return s


def assert_storable(id, registry=None):
    """Raise SourceRefused for a confirm-only or red source: nothing from it may be cached, archived or loaded. Called by every persistence path."""
    s = (registry or SOURCES).get(id)
    if s is not None and s["tier"] in ("red", "red-confirm"):
        raise SourceRefused(id, "confirm-only or forbidden: its answers are never stored")
    return s


def for_host(host, registry=None, url=""):
    """The entry for a host: the longest matching host name wins; a red entry whose `url_contains` appears in the URL wins over a host match."""
    host, low = (host or "").lower().rstrip("."), (url or "").lower()
    reg = (registry or SOURCES).values()
    for s in reg:
        if s["tier"] in ("red", "red-confirm") and any(u in low for u in s["url_contains"]):
            return s
    best, blen = None, -1
    for s in reg:
        for h in s["hosts"]:
            if (host == h or (host.endswith("." + h) and "." in h)) and len(h) > blen:
                best, blen = s, len(h)
    return best


def guard_url(url, registry=None, purpose="daily"):
    """Refuse a URL whose host is a red or unknown source (or a grey one used the wrong way). -> the source's entry. Called right before every request."""
    host = urlsplit(url).hostname
    s = for_host(host, registry, url)
    if s is None:
        raise SourceRefused(host or url, "host is not a known source")
    return require(s["id"], registry, purpose)


def listing(registry=None):
    """What the source picker shows: every source with its tier, `selectable` (green or grey), `grey_area` (show the marker and the notes), the reason it is greyed out when red."""
    out = []
    for s in (registry or SOURCES).values():
        ok = s["tier"] in ("green", "grey")
        cf = s["tier"] == "red-confirm"
        out.append(dict(id=s["id"], name=s["name"], tier=s["tier"], selectable=ok, default=bool(s["default"] and s["tier"] == "green"), grey_area=s["tier"] == "grey",
                        reason=s["reason"], notes=s["notes"], evidence=s["evidence"], leagues=list(s["leagues"]), key_needed=s["key_needed"],
                        confirm_only=cf, spacing_seconds=s["spacing"] if ok or cf else None, cache_seconds=s["ttl"] if ok else None, daily_cap=s["daily_cap"], terms=s["terms"]))
    return out


PROBLEMS = validate(SOURCES)
if PROBLEMS:
    raise RuntimeError("source registry: " + "; ".join(PROBLEMS))


if __name__ == "__main__":
    rows = listing()
    if "--json" in sys.argv:
        print(json.dumps(rows, indent=1, ensure_ascii=False))
    else:
        for r in rows:
            print("%-17s %-6s %s" % (r["id"], r["tier"], r["name"] + ("" if r["selectable"] else "  [" + r["reason"][:80] + "]")))
