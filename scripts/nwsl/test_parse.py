#!/usr/bin/env python3
"""Checks for scripts/nwsl: calendar-year titles, football boxes, WDL standings, penalty bump. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/nwsl -p 'test_*.py'     (from the repo root)"""
import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402

BOX = r"""
== Regular season ==
{{football box
|date = April 13, 2013
|team1 = [[FC Kansas City]]
|score = 1–1
|team2 = [[Portland Thorns FC]]
}}
{{football box
|date = August 24, 2013
|round = Semi-finals
|team1 = [[FC Kansas City]]
|score = 2–3 (a.e.t.)
|team2 = [[2013 Portland Thorns FC season|Portland Thorns FC]]
|aet = yes
}}
== Playoffs ==
=== Championship ===
{{football box
|date = August 31, 2013
|team1 = [[Western New York Flash]]
|score = 0–2
|team2 = [[Portland Thorns FC]]
}}
== Challenge Cup ==
{{football box
|date = March 7, 2025
|team1 = [[Orlando Pride]]
|score = 1–1
|team2 = [[Washington Spirit]]
|penaltyscore = 2–4
}}
"""

PENS = r"""
== Playoffs ==
=== Quarterfinals ===
{{football box
|date = November 8, 2025
|team1 = [[Washington Spirit]]
|score = 1–1 (a.e.t.)
|team2 = [[Racing Louisville FC]]
|aet = yes
|penaltyscore = 3–1
}}
"""

STAND = r"""
<onlyinclude>{{#invoke:Sports table|main|style=WDL
|team_order= WNY, KC, POR
|win_WNY=10 |draw_WNY=8 |loss_WNY=4 |gf_WNY=36 |ga_WNY=20
|win_KC=11  |draw_KC=5  |loss_KC=6  |gf_KC=34  |ga_KC=22
|win_POR=11 |draw_POR=5 |loss_POR=6 |gf_POR=32 |ga_POR=25
|name_WNY=[[2013 Western New York Flash season|Western New York Flash]]
|name_KC=[[FC Kansas City]]
|name_POR=[[2013 Portland Thorns FC season|Portland Thorns FC]]
}}
</onlyinclude>
"""


class T(unittest.TestCase):
    def test_season_titles_and_years(self):
        self.assertEqual(F.season_title(2013), "2013 National Women's Soccer League season")
        self.assertEqual(F.season_title(2025), "2025 National Women's Soccer League season")
        self.assertEqual(F.season_title_short(2013), "2013 NWSL season")
        self.assertEqual(F.years()[0], 2013)
        self.assertEqual(F.template_titles(2013, "{{2013 National Women's Soccer League standings}} {{2013 NWSL standings}}"),
                         ["2013 NWSL standings", "2013 National Women's Soccer League standings"])
        self.assertEqual(F.team_titles(2013, "[[2013 Portland Thorns FC season|Thorns]] [[2013 National Women's Soccer League season]] [[2013 NWSL College Draft]]"),
                         {"2013 Portland Thorns FC season"})

    def test_boxes_skip_challenge_cup_and_split_phase(self):
        gs, bad = P.games_from_boxes(P.B.boxes(BOX, 2013), "test")
        self.assertEqual(bad, [])
        phases = sorted((g["phase"], g["home"], g["away"], g["home_pts"], g["away_pts"]) for g in gs)
        self.assertEqual(phases, [
            ("playoffs", "FC Kansas City", "Portland Thorns FC", 2, 3),
            ("playoffs", "Western New York Flash", "Portland Thorns FC", 0, 2),
            ("regular", "FC Kansas City", "Portland Thorns FC", 1, 1),
        ])
        self.assertTrue(next(g for g in gs if g["ot"])["ot"])

    def test_penalty_shootout_adds_one_to_winner(self):
        gs, bad = P.games_from_boxes(P.B.boxes(PENS, 2025), "qf")
        self.assertEqual(bad, [])
        self.assertEqual(len(gs), 1)
        g = gs[0]
        self.assertEqual((g["home_pts"], g["away_pts"]), (2, 1))
        self.assertTrue(g["so"] and g["ot"])
        self.assertIn("3–1 pens", g["conflict"])

    def test_standings_wdl_and_check(self):
        st = P.parse_standings_module(STAND, "2013 standings")
        self.assertEqual(len(st), 3)
        flash = next(r for r in st if "Flash" in r["team"])
        self.assertEqual((flash["w"], flash["d"], flash["l"], flash["pts"], flash["gp"]), (10, 8, 4, 38, 22))
        games = [
            dict(phase="regular", home="Western New York Flash", away="FC Kansas City", home_pts=1, away_pts=0),
            dict(phase="regular", home="Western New York Flash", away="FC Kansas City", home_pts=1, away_pts=1),
            dict(phase="regular", home="FC Kansas City", away="Western New York Flash", home_pts=2, away_pts=0),
        ]
        # published 10-8-4 vs three parsed games: differs
        diffs = P.check(games, st)
        self.assertTrue(any("Flash" in d[0] for d in diffs))

    def test_champion_of(self):
        self.assertEqual(P.champion_of("|champions = [[Portland Thorns FC]]\n"), "Portland Thorns FC")
        self.assertEqual(P.champion_of("|champion = [[Gotham FC]]\n"), "Gotham FC")
