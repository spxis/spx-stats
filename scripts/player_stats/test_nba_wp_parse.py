"""Tests for nba_wp_parse.py. Run: python3 -I scripts/player_stats/test_nba_wp_parse.py"""
import importlib.util, os, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("nba_wp_parse", os.path.join(HERE, "nba_wp_parse.py"))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)

TABLE = """<table class="wikitable"><tbody>
<tr><th>Player</th><th>GP</th><th>PPG</th></tr>
<tr><td><a href="/wiki/Yao_Ming" title="Yao Ming">Yao Ming</a><sup class="reference">[1]</sup></td><td>82</td><td>13.5</td></tr>
<tr><td><a href="/w/index.php?title=Nobody&amp;redlink=1" class="new" title="Nobody (page does not exist)">Nobody</a></td><td>3</td><td>1.0</td></tr>
<tr><td>Team totals</td><td>82</td><td>99.0</td></tr>
</tbody></table>"""

class T(unittest.TestCase):
    def test_phase(self):
        self.assertEqual(P.phase_of(["Player statistics", "Season"]), "regular")
        self.assertEqual(P.phase_of(["Player statistics"]), "regular")
        self.assertEqual(P.phase_of(["Player statistics", "Regular season"]), "regular")
        self.assertEqual(P.phase_of(["Player statistics", "Playoffs"]), "playoffs")
        self.assertEqual(P.phase_of(["Player statistics", "Postseason"]), "playoffs")
        self.assertEqual(P.phase_of(["Player statistics", "Playoffs", "Overall"]), "playoffs")
        self.assertIsNone(P.phase_of(["Player statistics", "Playoffs", "First round"]))
        self.assertIsNone(P.phase_of(["Player statistics", "Preseason"]))
        self.assertIsNone(P.phase_of(["Player statistics", "Summer League"]))
        self.assertIsNone(P.phase_of(["Player statistics", "Play-in"]))
        self.assertIsNone(P.phase_of(["Player statistics", "After season suspension"]))
        self.assertIsNone(P.phase_of(["Player statistics", "Opponents"]))

    def test_table(self):
        html = '<h2>Player statistics</h2><h3>Season</h3>' + TABLE + '<h3>Preseason</h3>' + TABLE
        ts = P.tables(html)
        self.assertEqual(len(ts), 1)
        t = ts[0]
        self.assertEqual((t["phase"], t["tbl"], t["header"]), ("regular", 1, ["Player", "GP", "PPG"]))
        self.assertEqual(len(t["rows"]), 2)                       # the team totals row is dropped
        self.assertEqual(t["rows"][0], {"name": "Yao Ming", "title": "Yao Ming", "cells": {"Player": "Yao Ming", "GP": "82", "PPG": "13.5"}})
        self.assertIsNone(t["rows"][1]["title"])                  # a red link names no article

    def test_td_header_and_repeat(self):
        html = '<h2>Player stats</h2><table><tr><td>Player</td><td>GP</td><td>REB</td></tr><tr><td><a href="/wiki/A" title="A">A</a></td><td>5</td><td>7</td></tr></table>'
        ts = P.tables(html)
        self.assertEqual(ts[0]["rows"][0]["cells"], {"Player": "A", "GP": "5", "REB": "7"})

    def test_team_totals_row(self):
        html = '<h2>Player statistics</h2><h3>Season</h3>' + TABLE
        tt = P.team_totals(html)
        self.assertEqual(len(tt), 1)
        self.assertEqual((tt[0]["phase"], tt[0]["name"]), ("regular", "Team totals"))
        self.assertEqual(tt[0]["cells"]["GP"], "82")
        self.assertEqual(tt[0]["cells"]["PPG"], "99.0")

    def test_team_totals_skips_opponents_and_preseason(self):
        opp = TABLE.replace("Team totals", "Opponents")
        html = '<h2>Player statistics</h2><h3>Preseason</h3>' + TABLE + '<h3>Season</h3>' + opp
        self.assertEqual(P.team_totals(html), [])

if __name__ == "__main__":
    unittest.main()
