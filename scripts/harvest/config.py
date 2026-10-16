"""Settings of the harvest job, all from the environment (names in harvest/harvest.env.example). Standard library only."""
import os

UA = os.environ.get("HARVEST_UA", "spx-stats-harvest/1.0 (https://spxn.com; archive of sports history, non-commercial)")
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WDQS = "https://query.wikidata.org/sparql"

LEAGUES = ["nba", "nfl", "cfl", "nhl", "mlb"]
PARSER_VERSION = 2


def _f(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


class Config:
    """One object holding every knob. `Config(wp_gap=0)` overrides one in a test."""

    def __init__(self, **over):
        self.wp_gap = _f("HARVEST_WP_GAP", 1.0)           # seconds between MediaWiki API requests (en.wikipedia.org); never below 1
        self.wd_gap = _f("HARVEST_WD_GAP", 1.0)           # seconds between wikidata.org API requests
        self.wdqs_gap = _f("HARVEST_WDQS_GAP", 5.0)       # seconds between SPARQL queries
        self.maxlag = int(_f("HARVEST_MAXLAG", 5))         # en.wikipedia.org
        # www.wikidata.org counts the lag of the SPARQL query service in maxlag (26.7 s on 2026-10-14 while the entity API itself was healthy), so
        # a maxlag of 5 would refuse every read for hours. Entity reads are cheap; 60 still stops the job when the wiki itself is struggling.
        self.wd_maxlag = int(_f("HARVEST_WD_MAXLAG", 60))
        self.pause_window = os.environ.get("HARVEST_PAUSE_WINDOW", "09:50-10:30")   # local time; the daily scores run starts at 10:00
        self.pause_tz = os.environ.get("HARVEST_PAUSE_TZ", "America/Toronto")
        self.pause_check_secs = _f("HARVEST_PAUSE_CHECK_SECS", 15)
        self.lease_secs = int(_f("HARVEST_LEASE_SECS", 900))
        self.max_attempts = int(_f("HARVEST_MAX_ATTEMPTS", 6))
        self.plan_every_hours = _f("HARVEST_PLAN_EVERY_HOURS", 6)
        self.idle_sleep = _f("HARVEST_IDLE_SLEEP", 60)
        self.cycle_secs = _f("HARVEST_CYCLE_SECS", 3600)  # one worker process runs this long, then the container loop starts a fresh one (new code)
        self.wp_batch = int(_f("HARVEST_WP_BATCH", 10))   # titles per content request
        self.wd_batch = int(_f("HARVEST_WD_BATCH", 25))   # items per wbgetentities request
        self.recent_refresh_days = int(_f("HARVEST_RECENT_REFRESH_DAYS", 2))
        self.old_refresh_days = int(_f("HARVEST_OLD_REFRESH_DAYS", 120))
        self.fetch_log_days = int(_f("HARVEST_FETCH_LOG_DAYS", 90))
        for k, v in over.items():
            if not hasattr(self, k):
                raise AttributeError(k)
            setattr(self, k, v)
        if self.wp_gap < 1.0 and "wp_gap" not in over:
            self.wp_gap = 1.0                              # Wikimedia etiquette: serial requests, about one a second at most
