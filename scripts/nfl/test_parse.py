#!/usr/bin/env python3
"""Checks for the pieces of scripts/nfl that the early NFL (1920-1971) and the AFL needed. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/nfl -p 'test_*.py'     (from the repo root)"""
import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P

LEAGUE_TABLE = """
{| class="wikitable"
|- style="background:#d0e7ff;"
! colspan="8" style="text-align:center;"| October 3, 1920
|- style="text-align:center;"
! Visitor !! Score !! Home !! Score !! Location
|- style="text-align:center;"
| Columbus Panhandles || 0 || [[Dayton Triangles]] (1–0–0) || 14 || Triangle Park
|- style="text-align:center;"
| Wheeling Stogies{{Dagger}} || 0 || [[Akron Pros]] (1–0–0) || 43 || Akron League Park
|- style="background:#d0e7ff;"
! colspan="8" style="text-align:center;"| October 10, 1920
|- style="text-align:center;"
| Racine Cardinals (1–1–1) || 7 || Rock Island Independents (4–1–0) || 7 || Douglas Park
|}
"""

STANDINGS_STEAGLES = """{| class="wikitable"
! Team !! {{Abbr|W|Wins}} !! {{Abbr|L|Losses}} !! {{Abbr|T|Ties}} !! {{Abbr|PCT|pct}} !! {{Abbr|PF|pf}} !! {{Abbr|PA|pa}}
|-
| [[1943 Washington Redskins season|Washington Redskins]]
| 6
| 3
| 1
| .667
| 229
| 137
|-
| [[Steagles|Phil-Pitt]]
| 5
| 4
| 1
| .556
| 225
| 230
|}"""


class Early(unittest.TestCase):
    def test_league_table_games_and_the_club_outside_the_league(self):
        rows = P.parse_league_table(LEAGUE_TABLE, 1920)
        self.assertEqual(len(rows), 2)            # the Dagger row (Wheeling Stogies) is not a league game
        self.assertEqual((rows[0]["away"], rows[0]["home"], rows[0]["home_pts"]), ("Columbus Panhandles", "Dayton Triangles", 14))
        self.assertEqual(str(rows[0]["date"]), "1920-10-03")

    def test_league_table_views_use_the_names_of_the_season(self):
        teams = {"Columbus Panhandles", "Dayton Triangles", "Chicago Cardinals", "Rock Island Independents"}
        views, skipped = P.table_views(P.parse_league_table(LEAGUE_TABLE, 1920), teams, {"Racine Cardinals": "Chicago Cardinals"})
        self.assertEqual(skipped, [])
        self.assertEqual(sorted(views), sorted(teams))
        v = views["Dayton Triangles"][0]
        self.assertEqual((v["loc"], v["mark"], v["hi"], v["lo"]), ("H", "W", 14, 0))
        t = views["Chicago Cardinals"][0]            # a tie, 7-7, as the visitor
        self.assertEqual((t["loc"], t["mark"]), ("A", "T"))

    def test_merged_wartime_club_is_a_standing_row(self):
        rows = P.parse_standings(STANDINGS_STEAGLES, 1943)
        self.assertEqual([r["team"] for r in rows], ["Washington Redskins", "Phil-Pitt Steagles"])
        self.assertEqual((rows[1]["w"], rows[1]["l"], rows[1]["t"], rows[1]["pf"], rows[1]["pa"]), (5, 4, 1, 225, 230))

    def test_a_championship_game_under_its_own_heading_is_a_playoff_game(self):
        text = """==Schedule==
==NFL Championship Game==
{{Americanfootballbox
 |title=1934 NFL Championship: Chicago Bears at New York Giants
 |date=December 9
 |road=Bears
 |R1=0 |R2=10 |R3=3 |R4=0
 |home='''Giants'''
 |H1=3 |H2=0 |H3=0 |H4=27
}}
"""
        views, _ = P.parse_boxes(text, 1934, "New York Giants", [])
        self.assertEqual(len(views), 1)
        self.assertEqual((views[0]["phase"], views[0]["round"], views[0]["mark"], views[0]["hi"], views[0]["lo"]), ("playoffs", "NFL Championship Game", "W", 30, 13))

    def test_template_titles_of_every_era(self):
        text = "{{1925 NFL standings}} {{1933 NFL Eastern standings|hidenote=y}} {{1950 NFL American standings}} {{1960 AFL Western standings}} {{1920 APFA standings}} {{1946 AAFC Eastern standings}} {{1987 AFC East standings}}"
        for y, want in ((1925, ["1925 NFL standings"]), (1933, ["1933 NFL Eastern standings"]), (1950, ["1950 NFL American standings"]),
                        (1960, ["1960 AFL Western standings"]), (1920, ["1920 APFA standings"]), (1946, ["1946 AAFC Eastern standings"]), (1987, ["1987 AFC East standings"])):
            self.assertEqual(F.template_titles(y, text), want)

    def test_season_titles(self):
        self.assertEqual(F.season_title(1950), "1950 NFL season")
        self.assertEqual(F.season_title(1960, "afl"), "1960 AFL season")
        self.assertEqual(F.season_title(1947, "aafc"), "1947 AAFC season")

    def test_club_season_titles_skip_the_league_and_cross_league_articles(self):
        text = "[[1960 AFL season|x]] [[1960 NFL season|y]] [[1960 Dallas Texans season|Texans]] [[1960 Buffalo Bills season|Bills]] [[1960 Pro Bowl]] [[1920 APFA season|z]]"
        self.assertEqual(sorted(F.team_titles(1960, text)), ["1960 Buffalo Bills season", "1960 Dallas Texans season"])
        self.assertEqual(F.team_titles(1920, text), set())


if __name__ == "__main__":
    unittest.main()
