#!/usr/bin/env python3
"""Checks for scripts/nba/parse.py: the game-log layouts older club-season articles use. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/nba -p 'test_*.py'     (from the repo root)
The wikitext below is written for the test in the layouts the articles use; it is not article text."""
import datetime, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parse as P   # noqa: E402

TEAMS = {"Boston Celtics", "New Jersey Nets", "Dallas Mavericks", "Cleveland Cavaliers", "Chicago Bulls"}

FULL_DATE_LINK = r"""
===Game log===
{{NBA game log start|Boston Celtics|end_year=1986}}
{{NBA game log section|Boston Celtics|October|first=yes
| home_wins = 1
}}
|- align="center" bgcolor="#ffcccc"
| 1
| October 25, 1985
| @ [[1985–86 New Jersey Nets season|New Jersey]]
| [https://example.invalid/box L 109–113 (OT)]
| [[Larry Bird|Bird]] (21)
| [[Brendan Byrne Arena]]<br />13,095
| 0–1
{{NBA game log end}}
"""

DOW_BANG_CELLS = r"""
==Game log==
===Regular season===
{{NBA game log start|Dallas Mavericks|end_year=1994}}
{{NBA game log section|Dallas Mavericks|November|first=yes}}
|- align="center" bgcolor="#ccffcc"
! style="{{NBA color cell|Dallas Mavericks|year=1993–94|border=2}};" |<span style="color:#FFD700;">1</span>
| {{dow tooltip|November 5, 1993}}<br>7:30{{nbsp}}p.m. [[Central Standard Time|CST]]
! style="{{NBA color cell|Chicago Bulls|year=1993–94|border=2}};" |<span style="color:#FF0000;">@</span> [[1993–94 Chicago Bulls season|<span style="color:#FF0000;">Chicago</span>]]
| style="{{NBA color cell|Dallas Mavericks|year=1993–94|border=2}};" |[https://example.invalid/box <span style="color:#FFD700;">W 110–88</span>]
| 1–0
"""

WEEKDAY = r"""
===Game log===
{{Game log start|style=background:#efe196|title= 1986-87 game log}}
{{Game log section start|hide=y|title=October| Game| Date| Opponent| Score| Location| Record}}
|- align="center" bgcolor="#bbffbb"
| 1 || Fri. Oct. 31 || Cleveland Cavaliers || 120-102 ||[[Boston Garden]] ||1-0
|- align="center" bgcolor="edbebf"
| 2 || Sat. Nov. 1 || @ Chicago Bulls  || 105-111  || Chicago Stadium ||1-1
{{Game log section end}}
"""

LINEUP = r"""
===Game log===
{{Game log start|style=x|title=1987–88 Regular Season Starting Lineup game log}}
|-{{Game-lost}}
! style="color:#048234;|8
| {{dow tooltip|November 20, 1987}}
! style="color:#FCB625;|@ LAL
|
|
"""

VISITOR_HOME = r"""
===Game log===

====October====
{|class="wikitable" width="80%"
|- align="center"  bgcolor="#dddddd"
| '''#''' || '''Date''' || '''Visitor''' || '''Score''' || '''Home''' || '''OT''' || '''Leading scorer''' || '''Attendance''' || '''Record'''
|- align="center"  bgcolor="#bbffbb"
| 1 || October 31, 2007 || Mavericks || 92–74 || [[Cleveland Cavaliers|Cleveland]] || NA || [[Jason Terry]] (24) || 20,562 || 1–0
|- align="center" bgcolor="#ffcccc"
| 2 || November 2, 2007 || Cleveland || 99–100 || [[Dallas Mavericks|Mavericks]] || OT || [[Jason Terry]] (30) || 20,000 || 1–1
|}
"""

class Parse(unittest.TestCase):
    def test_full_date_and_external_link_score(self):
        v, bad = P.parse_team_page(FULL_DATE_LINK, 1985, "Boston Celtics")
        self.assertEqual(bad, [])
        self.assertEqual(len(v), 1)
        g = v[0]
        self.assertEqual((g["date"], g["loc"], g["pf"], g["pa"], g["ot"]), (datetime.date(1985, 10, 25), "A", 109, 113, True))
        self.assertEqual(g["opp_link"], "1985–86 New Jersey Nets season")

    def test_date_from_a_year_outside_the_season_is_not_a_game(self):
        text = FULL_DATE_LINK.replace("October 25, 1985", "October 25, 1971")
        self.assertEqual(P.parse_team_page(text, 1985, "Boston Celtics")[0], [])

    def test_dow_tooltip_header_cells_and_colour_spans(self):
        v, bad = P.parse_team_page(DOW_BANG_CELLS, 1993, "Dallas Mavericks")
        self.assertEqual(len(v), 1, bad)
        g = v[0]
        self.assertEqual((g["date"], g["loc"], g["pf"], g["pa"], g["num"]), (datetime.date(1993, 11, 5), "A", 110, 88, 1))
        self.assertEqual(g["opp_link"], "1993–94 Chicago Bulls season")

    def test_weekday_in_the_date_and_unmarked_scores_follow_the_record(self):
        v, bad = P.parse_team_page(WEEKDAY, 1986, "Boston Celtics")
        self.assertEqual(len(v), 2, bad)
        self.assertEqual(v[0]["date"], datetime.date(1986, 10, 31))
        self.assertEqual((v[0]["pf"], v[0]["pa"], v[0]["loc"]), (120, 102, "H"))
        self.assertEqual((v[1]["date"], v[1]["loc"]), (datetime.date(1986, 11, 1), "A"))
        self.assertEqual((v[1]["pf"], v[1]["pa"]), (105, 111))

    def test_lineup_and_officials_logs_are_not_game_rows(self):
        v, bad = P.parse_team_page(LINEUP, 1987, "Dallas Mavericks")
        self.assertEqual((v, bad), ([], []))

    def test_visitor_home_table_settles_home_and_road(self):
        v, bad = P.parse_team_page(VISITOR_HOME, 2007, "Dallas Mavericks")
        self.assertEqual(len(v), 2, bad)
        a, h = v
        self.assertEqual((a["loc"], a["pf"], a["pa"], a["ot"], a["opp_text"]), ("A", 92, 74, False, "Cleveland"))
        self.assertEqual((h["loc"], h["pf"], h["pa"], h["ot"], h["opp_text"]), ("H", 100, 99, True, "Cleveland"))

    def test_pair_joins_the_two_clubs_views_of_one_game(self):
        dal, _ = P.parse_team_page(VISITOR_HOME, 2007, "Dallas Mavericks")
        games, unres = P.pair({"Dallas Mavericks": dal, "Cleveland Cavaliers": []}, TEAMS)
        self.assertEqual(unres, [])
        g = games[0]
        self.assertEqual((g["home"], g["away"], g["home_pts"], g["away_pts"]), ("Cleveland Cavaliers", "Dallas Mavericks", 74, 92))

    def test_is_me(self):
        self.assertTrue(P.is_me("Mavericks", "Dallas Mavericks"))
        self.assertTrue(P.is_me("[[Dallas Mavericks|Dallas]]", "Dallas Mavericks"))
        self.assertTrue(P.is_me("[[1993–94 Dallas Mavericks season|Dallas]]", "Dallas Mavericks"))
        self.assertFalse(P.is_me("Cleveland", "Dallas Mavericks"))

if __name__ == "__main__":
    unittest.main()
