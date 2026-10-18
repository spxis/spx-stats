#!/usr/bin/env python3
"""Checks for scripts/pwhl: two-year titles, Game-log rows, WL OT standings, NHLPlayoffs. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/pwhl -p 'test_*.py'     (from the repo root)"""
import datetime, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402

LOG = r"""
{{Game log start |style="background:#FFFFFF;"}}
{{Game log section start|hide=y|title=Pre-season camp |Date |Time |Visitor |Score |Home |OT |Notes}}
|-
| December 4 || 1:00 || '''Toronto''' || 5–2 || Boston || || @ Utica
{{Game log section end}}
{{Game log section start|hide=n|title=Regular season}}
{{Game log section start|hide=y|title=January |Date |Time |Visitor |Score |Home |OT |Notes}}
|-
| January 1 || 12:30 || '''New York''' || 4–0 || Toronto || ||
|-
| January 2 || 7:00 || '''Montreal''' || 3–2 || Ottawa || OT ||
|-
| rowspan=2|January 3 || 7:00 || Minnesota || 2–1 || '''Boston''' || ||
|-
| 7:00 || '''New York''' || 4–1 || Montreal || SO || @ [[Canadian Tire Centre]]
{{Game log section end}}
{{Game log end}}
"""

STAND = r"""
<onlyinclude>{{#invoke:Sports table|main|style=WL OT
|team_order= TOR, MTL, BOS
|win_BOS=8  |OTwin_BOS=4 |OTloss_BOS=3 |loss_BOS=9  |gf_BOS=50 |ga_BOS=57
|win_MTL=10 |OTwin_MTL=3 |OTloss_MTL=5 |loss_MTL=6  |gf_MTL=60 |ga_MTL=57
|win_TOR=13 |OTwin_TOR=4 |OTloss_TOR=0 |loss_TOR=7  |gf_TOR=69 |ga_TOR=50
|name_BOS=[[2023–24 PWHL Boston season|Boston]]
|name_MTL=[[2023–24 PWHL Montreal season|Montreal]]
|name_TOR=[[2023–24 PWHL Toronto season|Toronto]]
}}
</onlyinclude>
"""

PLAYOFFS = r"""
=== Semi-finals ===
==== Toronto (1) vs. Minnesota (4) ====
{{NHLPlayoffs
| team1     = [[PWHL Toronto]]
| team2     = [[PWHL Minnesota]]
| date1     = May 8
| score1    = 0–4
| home1     = 1
| won1      = 1
| date2     = May 15
| score2    = 0–1
| home2     = 2
| won2      = 2
| ot2       = 2
}}
=== PWHL Finals ===
{{NHLPlayoffs
| team1     = PWHL Minnesota
| team2     = PWHL Boston
| date1     = May 19
| score1    = 4–3
| home1     = 2
| won1      = 2
}}
"""


class T(unittest.TestCase):
    def test_season_titles_and_years(self):
        self.assertEqual(F.season_title(2023), "2023–24 PWHL season")
        self.assertEqual(F.season_title(2024), "2024–25 PWHL season")
        self.assertEqual(F.years()[0], 2023)
        self.assertEqual(F.template_titles(2023, "{{2024 PWHL season standings}} {{2023–24 PWHL standings}}"),
                         ["2023–24 PWHL standings", "2024 PWHL season standings"])
        self.assertEqual(F.team_titles(2023, "[[2023–24 PWHL Minnesota season|Minnesota]] [[2023–24 PWHL season]] [[2024 PWHL Draft]]"),
                         {"2023–24 PWHL Minnesota season"})
        self.assertIn("2025 PWHL playoffs", F.playoff_titles(2024))

    def test_game_log_skips_preseason_and_reads_ot_so_neutral(self):
        games, bad = P.parse_game_logs(LOG, 2023)
        self.assertEqual(bad, [])
        self.assertEqual(len(games), 4)
        self.assertTrue(all(g["phase"] == "regular" for g in games))
        first = next(g for g in games if g["date"] == datetime.date(2024, 1, 1))
        self.assertEqual((first["away"], first["home"]), ("New York", "Toronto"))
        self.assertEqual((first["away_pts"], first["home_pts"]), (4, 0))
        ot = next(g for g in games if g["date"] == datetime.date(2024, 1, 2))
        self.assertTrue(ot["ot"])
        self.assertFalse(ot["so"])
        so = next(g for g in games if g.get("so"))
        self.assertEqual(so["date"], datetime.date(2024, 1, 3))
        self.assertTrue(so["neutral"])
        self.assertEqual(so["away"], "New York")

    def test_standings_wl_ot_points(self):
        rows = P.parse_standings_module(STAND, "2024 PWHL season standings")
        names = {r["team"] for r in rows}
        self.assertEqual(names, {"PWHL Boston", "PWHL Montreal", "PWHL Toronto"})
        tor = next(r for r in rows if r["team"] == "PWHL Toronto")
        self.assertEqual((tor["w"], tor["l"], tor["otl"], tor["pts"]), (17, 7, 0, 47))
        bos = next(r for r in rows if r["team"] == "PWHL Boston")
        self.assertEqual((bos["w"], bos["l"], bos["otl"], bos["pts"]), (12, 9, 3, 35))

    def test_nhl_playoffs_visitor_home_and_ot(self):
        games, bad = P.parse_nhl_playoffs(PLAYOFFS, 2023)
        self.assertEqual(bad, [])
        self.assertEqual(len(games), 3)
        g1 = next(g for g in games if g["date"] == datetime.date(2024, 5, 8))
        self.assertEqual(g1["home"], "PWHL Toronto")
        self.assertEqual((g1["away_pts"], g1["home_pts"]), (0, 4))
        self.assertEqual(g1["round"], "Semifinals")
        g2 = next(g for g in games if g["date"] == datetime.date(2024, 5, 15))
        self.assertEqual(g2["home"], "PWHL Minnesota")
        self.assertTrue(g2["ot"])
        fin = next(g for g in games if "Final" in (g["round"] or ""))
        self.assertEqual(fin["home"], "PWHL Boston")
        self.assertEqual((fin["away_pts"], fin["home_pts"]), (4, 3))

    def test_playoffs_home_from_winner_when_no_home_key(self):
        # score is visitor-home and the winner has the larger number: wonN says who was at home (2-2-1 series)
        txt = ("{{NHLPlayoffs\n| homeright = yes\n| team1 = [[PWHL Boston]]\n| team2 = [[PWHL Ottawa]]\n"
               "| date1 = April 30\n| score1 = 1–2\n| won1 = 1\n| date3 = May 8\n| score3 = 1–2\n| won3 = 2\n}}")
        games, bad = P.parse_nhl_playoffs(txt, 2025)
        self.assertEqual(bad, [])
        a = next(g for g in games if g["date"].day == 30)
        b = next(g for g in games if g["date"].day == 8)
        self.assertEqual((a["home"], a["away"]), ("PWHL Boston", "PWHL Ottawa"))
        self.assertEqual((b["home"], b["away"]), ("PWHL Ottawa", "PWHL Boston"))

    def test_year_for(self):
        self.assertEqual(P.year_for(2023, 1), 2024)
        self.assertEqual(P.year_for(2024, 11), 2024)
        self.assertEqual(P.year_for(2024, 5), 2025)


if __name__ == "__main__":
    unittest.main()
