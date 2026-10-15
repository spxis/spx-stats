#!/usr/bin/env python3
"""Checks for scripts/hockey: the table shapes the NHA, PCHA, WCHL and WHA articles use. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/hockey -p 'test_*.py'     (from the repo root)"""
import datetime, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402

NAMES = ["Montreal Wanderers", "Quebec Hockey Club", "Ottawa Hockey Club", "Montreal Canadiens", "Toronto Hockey Club", "Toronto Ontarios"]

RESULTS = """{| class="wikitable"
! Month
! Day
! Visitor
! Score
! Home
! Score
|-
|Dec.
|| 30 || '''Wanderers''' || 9 || Quebec HC || 5
|-
|rowspan=3 valign=top| Jan.
|| 3 || Quebec HC || 4 || '''Ottawa HC''' || 5 (OT 5'35")
|-
| 4† || Canadiens || 1 || Toronto || 3
|-
| 9 || Wanderers ||  || Canadiens ||
|}
† Protested by Wanderers.
"""

WINNERS = """{| class="wikitable"
! Date
! Winning Team
! Score
! Losing Team
! Location
|-
| March 7, 1914 || Montreal Canadiens || 2–0 || Toronto HC || [[Montreal Arena]]
|-
| March 11 || Toronto HC || 6–0 || Montreal Canadiens || [[Arena Gardens]], Toronto
|}
"""

HOMEFIRST = """{| class="wikitable"
! Date
! Home
! Score
! Away
! Score
|-
| March 12 || Seattle || 1 || '''Vancouver''' || '''3'''
|}
"""


class T(unittest.TestCase):
    def test_season_titles_and_years(self):
        self.assertEqual(F.season_title("nha", 1909), "1909–10 NHA season")
        self.assertEqual(F.season_title("wchl", 1924), "1924–25 WCHL season")
        self.assertEqual(F.season_title("wchl", 1925), "1925–26 WHL season")      # renamed for the last season
        self.assertEqual(F.years("wha"), list(range(1972, 1979)))
        self.assertEqual(len(F.years("pcha")), 13)
        self.assertEqual(F.template_titles(1915, "{{1915–16 NHA standings}} {{1972–73 WHA Eastern Division standings|team=}}"), ["1915–16 NHA standings", "1972–73 WHA Eastern Division standings"])

    def test_names(self):
        self.assertEqual(P.match_name("Wanderers", NAMES), "Montreal Wanderers")
        self.assertEqual(P.match_name("Quebec HC", NAMES), "Quebec Hockey Club")
        self.assertEqual(P.match_name("Ottawa HC", NAMES), "Ottawa Hockey Club")
        self.assertEqual(P.match_name("Toronto", NAMES), "Toronto Hockey Club")     # two Toronto clubs: the one called Hockey Club
        self.assertEqual(P.match_name("Ontarios", NAMES), "Toronto Ontarios")
        self.assertIsNone(P.match_name("Montreal", NAMES))                          # two Montreal clubs: no guess
        self.assertIsNone(P.match_name("Seattle", NAMES))
        self.assertEqual(P.club_of("Quebec Bulldogs", NAMES), "Quebec Hockey Club")  # a champion named by its later name
        self.assertEqual(P.club_name("xIndianapolis Racers"), "Indianapolis Racers")
        self.assertEqual(P.club_name("#Finland"), "Finland")

    def test_results_table(self):
        g, bad, skipped = P.games_from_table(RESULTS, 1911, NAMES)
        self.assertEqual(len(g), 3)
        self.assertEqual(g[0]["date"], datetime.date(1911, 12, 30))
        self.assertEqual((g[0]["away"], g[0]["away_pts"], g[0]["home"], g[0]["home_pts"]), ("Wanderers", 9, "Quebec HC", 5))
        self.assertEqual(g[1]["date"], datetime.date(1912, 1, 3))                    # a month from July on belongs to the year the season starts in
        self.assertTrue(g[1]["overtime"])
        self.assertIn("†", g[2]["marks"])
        self.assertEqual(len(skipped), 1)                                            # the game with no score: not played
        self.assertEqual(bad, [])

    def test_protest_footnote_is_read(self):
        self.assertEqual(P.footnotes("† Protested by Wanderers.\n‡ Replay of protested game.\n"), {"†": "Protested by Wanderers.", "‡": "Replay of protested game."})

    def test_winner_table_takes_the_home_club_from_the_place(self):
        g, bad, _ = P.games_from_table(WINNERS, 1913, NAMES)
        self.assertEqual(len(g), 2)
        out = P.resolve_games(g, NAMES, "League final", "playoffs", [], [])
        self.assertEqual((out[0]["home"], out[0]["neutral"]), ("Montreal Canadiens", False))     # Montreal Arena: not Toronto, so the winner is the home club
        self.assertEqual((out[0]["home_pts"], out[0]["away_pts"]), (2, 0))
        self.assertEqual((out[1]["home"], out[1]["away"], out[1]["neutral"]), ("Toronto Hockey Club", "Montreal Canadiens", False))
        self.assertEqual(out[1]["date"], datetime.date(1914, 3, 11))                  # a date without a year: the year the season ends in

    def test_home_column_first(self):
        g, bad, _ = P.games_from_table(HOMEFIRST, 1918, ["Seattle Metropolitans", "Vancouver Millionaires"])
        self.assertEqual((g[0]["home"], g[0]["home_pts"], g[0]["away"], g[0]["away_pts"]), ("Seattle", 1, "Vancouver", 3))

    def test_sports_table_module(self):
        text = """{{#invoke:sports table|main|style=WDL
|team1=QHC|name_QHC=[[Quebec Bulldogs|Quebec Hockey Club]]
|team2=OHC|name_OHC=[[Ottawa Hockey Club]]
|win_QHC=10|draw_QHC=0|loss_QHC=8|gf_QHC=81|ga_QHC=79
|win_OHC=9|draw_OHC=1|loss_OHC=8|gf_OHC=99|ga_OHC=83
|update=complete|source=
}}"""
        rows = P.standings_from_module(text)
        self.assertEqual([(r["team"], r["gp"], r["w"], r["l"], r["t"], r["gf"], r["ga"]) for r in rows], [("Quebec Hockey Club", 18, 10, 8, 0, 81, 79), ("Ottawa Hockey Club", 18, 9, 8, 1, 99, 83)])

    def test_halves_are_summed(self):
        rows = [{"team": "A", "link": None, "division": "First Half", "gp": 10, "w": 7, "l": 3, "t": 0, "gf": 58, "ga": 38},
                {"team": "A", "link": None, "division": "Second Half", "gp": 10, "w": 8, "l": 2, "t": 0, "gf": 63, "ga": 22},
                {"team": "B", "link": None, "division": "First Half", "gp": 10, "w": 3, "l": 7, "t": 0, "gf": 56, "ga": 72}]
        out = P.sum_halves(rows)
        self.assertEqual([(r["team"], r["gp"], r["w"], r["gf"]) for r in out], [("A", 20, 15, 121), ("B", 10, 3, 56)])

    def test_standings_checked_against_games(self):
        g = [{"phase": "regular", "home": "A", "away": "B", "home_pts": 3, "away_pts": 1},
             {"phase": "regular", "home": "B", "away": "A", "home_pts": 2, "away_pts": 2},
             {"phase": "regular", "home": "A", "away": "B", "home_pts": 9, "away_pts": 0, "counts": False}]
        st = [{"team": "A", "gp": 2, "w": 1, "l": 0, "t": 1, "gf": 5, "ga": 3}, {"team": "B", "gp": 2, "w": 0, "l": 1, "t": 1, "gf": 3, "ga": 5}, {"team": "C", "gp": 20, "w": 10, "l": 10, "t": 0, "gf": 1, "ga": 1}]
        self.assertEqual(P.check_standings(st, g), [])                                # the protested game is left out; C has no games to compare
        st[0]["w"] = 2
        self.assertEqual([d[0] for d in P.check_standings(st, g)], ["A"])
        # an interlocking game against a club of another league counts in the standings
        out = [{"phase": "regular", "home": "A", "away": "Calgary", "home_pts": 1, "away_pts": 0}]
        st[0].update({"gp": 3, "w": 2, "gf": 6, "ga": 3})
        self.assertEqual(P.check_standings(st, g, out), [])

    def test_bracket_series(self):
        text = """{{8TeamBracket
| RD1=Quarterfinals<br/>April 9-30
| RD1-seed1='''W1'''
| RD1-team1='''[[1975–76 Houston Aeros season|Houston Aeros]]'''
| RD1-score1='''4'''
| RD1-seed2=W3
| RD1-team2=[[San Diego Mariners]]
| RD1-score2=2
| RD1b=Preliminary Round
| RD1b-seed1=
| RD1b-team1=New England
| RD1b-score1=3
| RD1b-seed2=
| RD1b-team2=Cleveland Crusaders
| RD1b-score2=0
}}"""
        names = ["Houston Aeros", "San Diego Mariners", "New England Whalers", "Cleveland Crusaders"]
        self.assertEqual(P.series_from_brackets(text, names), [("Quarterfinals", "Houston Aeros", "San Diego Mariners", 4, 2), ("Preliminary Round", "New England Whalers", "Cleveland Crusaders", 3, 0)])

    def test_league_article_champions(self):
        text = """{|class=wikitable
!Season
!Teams
!Champion
|-
|align=center|[[1912 PCHA season|1912]]
|| New Westminster Royals, Vancouver Millionaires || New Westminster Royals
|-
|align=center|[[1919–20 PCHA season|1919–20]]
|| Seattle, Vancouver || Seattle Metropolitans (two-game playoff against Vancouver) {{double dagger}}
|}"""
        self.assertEqual(P.league_champions(text), {1911: "New Westminster Royals", 1919: "Seattle Metropolitans"})   # a bare '1912' is the season that ends in 1912


if __name__ == "__main__":
    unittest.main()
