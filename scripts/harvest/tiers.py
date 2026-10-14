"""Priorities. A higher number is read first. The gap queue (nothing in DS1 yet) always outranks a re-read of what DS1 holds.

John, 2026-10-14: "first be sure to scrape the data that we don't have". Biggest gaps first: NBA rosters, then NFL, then CFL, then team
statistics (and the awards and drafts of seasons that have none), then bios; newest seasons first within a league.
"""

REFRESH_TOP = 399          # a re-read never outranks a gap job (every gap priority is above 4000)

ROSTER = {"nba": 9000, "nfl": 8000, "cfl": 7000, "nhl": 6600, "mlb": 6500}
SEASON = {"nba": 6000, "cfl": 5900, "nfl": 5800, "nhl": 5700, "mlb": 5600}     # team statistics, awards, drafts of seasons with none
BIOS = 5000
LABELS = 4900              # place and country names the bios name


def season_offset(season):
    """0..299: later seasons first within one base."""
    if season is None:
        return 0
    return max(0, min(299, int(season) - 1800))


def gap_priority(base, season=None):
    return base + season_offset(season)


def refresh_priority(season=None):
    return min(REFRESH_TOP, 100 + season_offset(season))
