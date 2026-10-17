#!/usr/bin/env python3
"""Checks for scripts/wnba: calendar-year titles, WNBA game logs, 1997 club-article standings. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/wnba -p 'test_*.py'     (from the repo root)"""
import datetime, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402

TEAMS_2024 = ["Las Vegas Aces", "Phoenix Mercury", "Minnesota Lynx", "Atlanta Dream", "New York Liberty", "Seattle Storm"]
TEAMS_1997 = ["Houston Comets", "Cleveland Rockers", "Phoenix Mercury", "New York Liberty", "Utah Starzz", "Los Angeles Sparks", "Charlotte Sting"]

LOG_2024 = r"""
{{WNBA game log start|Las Vegas Aces|end_year=2024|note=<br>Total: 27–13}}
{{WNBA game log section|Las Vegas Aces|May|first=yes
| home_wins   = 3
| home_losses = 1
}}
|-{{Game-won}}
| 1
| May 14
| [[2024 Phoenix Mercury season|Phoenix]]
| [https://www.wnba.com/game/1022400003/PHO-vs-LVA W 89–80]
| [[A'ja Wilson]] (30)
| A'ja Wilson (13)
| [[Jackie Young]] (6)
| [[Michelob Ultra Arena]]<br>10,419
| 1–0
|-{{Game-lost}}
| 3
| May 21
| Phoenix
| [https://www.wnba.com/game/1022400018/PHO-vs-LVA L 88–98]
| [[Kelsey Plum]] (27)
| A'ja Wilson (13)
| Jackie Young (8)
| Michelob Ultra Arena<br>10,374
| 2–1
|-{{Game-won}}
| 5
| May 29
| @ [[2024 Minnesota Lynx season|Minnesota]]
| [https://www.wnba.com/game/1022400037/LVA-vs-MIN W 80–66]
| A'ja Wilson (29)
| A'ja Wilson (15)
| Jackie Young (10)
| [[Target Center]]<br>7,409
| 4–1
|-{{Game-lost}}
| 6
| May 31
| @ [[2024 Atlanta Dream season|Atlanta]]
| [https://www.wnba.com/game/1022400040/LVA-vs-ATL L 74–78]
| A'ja Wilson (28)
| A'ja Wilson (9)
| Kelsey Plum (6)
| [[Gateway Center Arena]]<br>4,015
| 4–2
{{WNBA game log end|lva|end_year=2024}}
===Playoffs===
{{WNBA game log start|Las Vegas Aces|playoffs=yes|end_year=2024}}
{{WNBA game log section|Las Vegas Aces|First round vs. Seattle Storm<br>Won Series: 2–0|playoffs=yes|first=yes}}
|-{{Game-won}}
| 1
| September 22
| [[2024 Seattle Storm season|Seattle]]
| [https://www.wnba.com/game/1042400101 W 78–67]
| A'ja Wilson (20)
| A'ja Wilson (10)
| Jackie Young (4)
| Michelob Ultra Arena
| 1–0
{{WNBA game log end|LVA|playoffs=yes|end_year=2024}}
"""

LOG_1997 = r"""
{{WNBA game log start|Houston Comets|end_year=1997}}
{{WNBA game log section|Houston Comets|June|first=yes}}
|-{{Game-won}}
| 1
| June 21
| @ [[1997 Cleveland Rockers season|Cleveland]]
| [https://www.basketball-reference.com/wnba/boxscores/199706210CLE.html W 76–56]
| [[Cynthia Cooper-Dyke|Cynthia Cooper]] (25)
| Cynthia Cooper (8)
| Cynthia Cooper (2)
| [[Gund Arena]]
| 1–0
|-{{Game-lost}}
| 3
| June 26
| [[1997 New York Liberty season|New York]]
| [https://www.basketball-reference.com/wnba/boxscores/199706260HOU.html L 60–62 (OT)]
| Cynthia Cooper (20)
| [[Wanda Guyton]] (9)
| Cynthia Cooper (3)
| [[The Summit]]
| 2–1
{{WNBA game log end|hou|end_year=1997}}
===Playoffs===
{{WNBA game log start|Houston Comets|playoffs=yes|end_year=1997}}
{{WNBA game log section|Houston Comets|Championship vs. New York Liberty|playoffs=yes|first=yes}}
|-{{Game-won}}
| 1
| [[1997 WNBA Championship|August 30]]
| [[1997 New York Liberty season|New York]]
| [https://www.basketball-reference.com/wnba/boxscores/199708300HOU.html W 65–51]
| Cynthia Cooper (25)
| [[Tammy Jackson]] (11)
| Cynthia Cooper (4)
| The Summit
| 1–0
{{WNBA game log end|HOU|playoffs=yes|end_year=1997}}
"""

STAND_2024 = r"""
{| class="wikitable sortable"
! width="5%" | #
! width="37%"| Team
! width="7.5%" | {{Abbr| W | Games won}}
! width="7.5%" | {{Abbr| L | Games lost}}
! width="7.5%" | {{Abbr| PCT | Winning percentage}}
! width="7.5%" | {{Abbr| GB | Games behind}}
|- style="{{#ifeq:{{{team}}}|NYL|background-color:#CCFFCC}}"
! 1
| '''yx''' – [[2024 New York Liberty season|New York Liberty]] || 32 || 8 ||{{winpct|32|8}}|| —
|- style="{{#ifeq:{{{team}}}|LVA|background-color:#CCFFCC}}"
! 4
| '''x''' – [[2024 Las Vegas Aces season|Las Vegas Aces]] || 27 || 13 ||{{winpct|27|13}}|| 5
|}
<noinclude>{{Documentation}}</noinclude>
"""

STAND_2002_WEST = r"""
{{Table alignment}}
{| class="wikitable defaultcenter col1left"
! width=200| [[Western Conference (WNBA)|Western Conference]]
! width=50| W
! width=50| L
! width=50| PCT
! width=50| GB
|- style="{{#ifeq:{{{team}}}|LAS|background-color:#CCFFCC}}"
| [[Los Angeles Sparks]] <sup>z</sup> || 25 || 7 || .781 || –
|- style="{{#ifeq:{{{team}}}|UTA|background-color:#CCFFCC}}"
| [[Utah Starzz]] <sup>x</sup> || 20 || 12 || .625 || 5.0
|}
<noinclude>{{2002 WNBA Western Conference standings|team=PHO}}</noinclude>
"""

STAND_1997 = r"""
{{Table alignment}}
{| class="wikitable defaultcenter col1left"
! width=200| [[Eastern Conference (WNBA)|Eastern Conference]]
! width=50| W
! width=50| L
! width=50| PCT
! width=50| Conf.
! width=50| GB
|- style="{{#ifeq:{{{team}}}|HOU|background-color:#CCFFCC}}"
| [[Houston Comets]] <sup>x</sup> || 18 || 10 || .643 || 6–6 || –
|- style="{{#ifeq:{{{team}}}|NYL|background-color:#CCFFCC}}"
| [[New York Liberty]] <sup>x</sup> || 17 || 11 || .607 || 8–4 || 1.0
|}
<noinclude>This is a template that was created to easily update every article.
{{1997 WNBA Eastern Conference standings|team=CHA}}
</noinclude>
"""


class T(unittest.TestCase):
    def test_season_titles_and_years(self):
        self.assertEqual(F.season_title(1997), "1997 WNBA season")
        self.assertEqual(F.season_title(2024), "2024 WNBA season")
        self.assertEqual(F.years()[0], 1997)
        self.assertEqual(F.years()[-1], 2026)
        self.assertEqual(F.template_titles(2024, "{{2024 WNBA standings|notes=yes}} {{1997 WNBA Eastern Conference standings}}"),
                         ["2024 WNBA standings"])
        self.assertEqual(F.template_titles(1997, "{{1997 WNBA Eastern Conference standings}} {{1997 WNBA Western Conference standings}}"),
                         ["1997 WNBA Eastern Conference standings", "1997 WNBA Western Conference standings"])
        self.assertEqual(F.team_titles(2024, "[[2024 Las Vegas Aces season|Aces]] [[2024 WNBA season]] [[2024 WNBA Playoffs]]"),
                         {"2024 Las Vegas Aces season"})

    def test_2024_log_dates_are_the_season_year(self):
        views, bad = P.parse_team_page(LOG_2024, 2024, "Las Vegas Aces")
        self.assertEqual(bad, [])
        self.assertTrue(any(v["phase"] == "playoffs" for v in views))
        may = next(v for v in views if v["date"] == datetime.date(2024, 5, 14))
        self.assertEqual(may["loc"], "H")
        self.assertEqual((may["pf"], may["pa"]), (89, 80))
        road = next(v for v in views if v["date"] == datetime.date(2024, 5, 29))
        self.assertEqual(road["loc"], "A")
        po = next(v for v in views if v["phase"] == "playoffs")
        self.assertEqual(po["date"].year, 2024)
        self.assertIn("First", po["round"] or "")

    def test_1997_log_ot_and_championship_date_link(self):
        views, bad = P.parse_team_page(LOG_1997, 1997, "Houston Comets")
        self.assertEqual(bad, [])
        ot = next(v for v in views if v["date"] == datetime.date(1997, 6, 26))
        self.assertTrue(ot["ot"])
        self.assertEqual((ot["pf"], ot["pa"]), (60, 62))
        final = next(v for v in views if v["phase"] == "playoffs")
        self.assertEqual(final["date"], datetime.date(1997, 8, 30))
        self.assertEqual((final["pf"], final["pa"]), (65, 51))

    def test_pair_two_views(self):
        a, _ = P.parse_team_page(LOG_2024, 2024, "Las Vegas Aces")
        # a home win over Phoenix on May 14, from Phoenix's road view
        phx = dict(phase="regular", round=None, date=datetime.date(2024, 5, 14), alt=None, shown=None,
                   opp_link="2024 Las Vegas Aces season", opp_text="Las Vegas", loc="A", pf=80, pa=89, ot=False,
                   flag="L", signed=True, rec="0-1", tpl=False, src="phx", team="Phoenix Mercury")
        games, unres = P.pair({"Las Vegas Aces": a, "Phoenix Mercury": [phx]}, set(TEAMS_2024))
        g = next(x for x in games if x["date"] == datetime.date(2024, 5, 14) and {x["home"], x["away"]} == {"Las Vegas Aces", "Phoenix Mercury"})
        self.assertEqual(g["home"], "Las Vegas Aces")
        self.assertEqual((g["home_pts"], g["away_pts"]), (89, 80))
        self.assertEqual(g["views"], 2)
        self.assertEqual(unres, [])

    def test_standings_2024_overall_and_1997_club_articles(self):
        r24 = P.parse_standings(STAND_2024, 2024)
        names = {r["team"] for r in r24}
        self.assertIn("New York Liberty", names)
        self.assertIn("Las Vegas Aces", names)
        nyl = next(r for r in r24 if r["team"] == "New York Liberty")
        self.assertEqual((nyl["w"], nyl["l"]), (32, 8))
        r97 = P.parse_standings(STAND_1997, 1997)
        hou = next(r for r in r97 if r["team"] == "Houston Comets")
        self.assertEqual((hou["w"], hou["l"]), (18, 10))
        self.assertEqual(len(r97), 2)

    def test_resolve_calendar_year_link(self):
        self.assertEqual(P.resolve("Phoenix", "2024 Phoenix Mercury season", TEAMS_2024), ["Phoenix Mercury"])
        self.assertEqual(P.resolve("Cleveland", "1997 Cleveland Rockers season", TEAMS_1997), ["Cleveland Rockers"])
        self.assertEqual(P.resolve("Utah", None, TEAMS_1997), ["Utah Starzz"])

    def test_seed_titles_cover_relocation_years(self):
        s2002 = F.seed_team_titles(2002)
        self.assertIn("2002 Utah Starzz season", s2002)
        self.assertIn("2002 Orlando Miracle season", s2002)
        self.assertNotIn("2002 Connecticut Sun season", s2002)
        self.assertNotIn("2002 San Antonio Silver Stars season", s2002)
        s2003 = F.seed_team_titles(2003)
        self.assertIn("2003 Connecticut Sun season", s2003)
        self.assertIn("2003 San Antonio Silver Stars season", s2003)
        self.assertNotIn("2003 Utah Starzz season", s2003)
        self.assertNotIn("2003 Orlando Miracle season", s2003)

    def test_standings_2002_utah_starzz(self):
        rows = P.parse_standings(STAND_2002_WEST, 2002)
        names = {r["team"] for r in rows}
        self.assertIn("Utah Starzz", names)
        self.assertIn("Los Angeles Sparks", names)
        uta = next(r for r in rows if r["team"] == "Utah Starzz")
        self.assertEqual((uta["w"], uta["l"]), (20, 12))


if __name__ == "__main__":
    unittest.main()
