"""CFL Wikipedia team-stat parser. Run: python3 -I scripts/team_stats/test_cfl_wp_parse.py"""
import os, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location("cfl_wp_parse", os.path.join(HERE, "cfl_wp_parse.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

FIX = os.path.join(HERE, "fixtures")

TEAM_OPP = """== Team statistics ==
{| class="wikitable"
|-
! !! Team !! Opp
|-
! Total yards
| 6,500 || 5,200
|-
! Passing yards
| 4,800 || 3,900
|-
! Rushing yards
| 1,700 || 1,300
|}
"""

TOTALS_FOOTER = """=== Passing ===
{| class="wikitable"
|-
! Player !! Att !! Yards
|-
| [[Buck Pierce]] || 362 || 3018
|-
| Team totals || 653 || 5246
|}
"""

LEAGUE = """== Regular season ==
{| class="wikitable"
|-
! Team !! GP !! Total yards !! Yards allowed
|-
| BC Lions || 18 || 6500 || 5200
|-
| Calgary Stampeders || 18 || 6100 || 5400
|}
"""


class T(unittest.TestCase):
    def _fix(self, name):
        with open(os.path.join(FIX, name), encoding="utf-8") as f:
            return f.read()

    def test_2008_player_tables_are_not_team_totals(self):
        self.assertIsNone(P.parse_article(self._fix("cfl_2008_bc_lions_player_stats.wikitext")))

    def test_2022_article_with_no_stats_section(self):
        self.assertIsNone(P.parse_article(self._fix("cfl_2022_winnipeg_no_stats.wikitext")))

    def test_does_not_sum_the_2008_passers(self):
        text = self._fix("cfl_2008_bc_lions_player_stats.wikitext")
        self.assertIsNone(P.parse_article(text))
        # 3018+2164+53 would be 5235 if anyone summed; that must stay a hole
        self.assertNotIn("5235", str(P.parse_article(text)))

    def test_team_opp_table(self):
        one = P.parse_article(TEAM_OPP)
        self.assertIsNotNone(one)
        self.assertEqual(one["stats"]["yds"], 6500)
        self.assertEqual(one["stats"]["yds_against"], 5200)
        self.assertEqual(one["stats"]["pass_yds"], 4800)
        self.assertEqual(one["stats"]["rush_yds"], 1700)
        self.assertTrue(any(h.startswith("team_opp:") for h in one["how"]))

    def test_labelled_team_totals_row(self):
        one = P.parse_article(TOTALS_FOOTER)
        self.assertEqual(one["stats"]["yds"], 5246)
        self.assertTrue(any(h.startswith("totals:") for h in one["how"]))

    def test_league_table_is_per_club_not_the_article_club(self):
        self.assertIsNone(P.parse_article(LEAGUE))
        rows = P.parse_league(LEAGUE)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["team"], "BC Lions")
        self.assertEqual(rows[0]["stats"]["yds"], 6500)
        self.assertEqual(rows[0]["stats"]["yds_against"], 5200)
        self.assertEqual(rows[0]["games_played"], 18)


if __name__ == "__main__":
    unittest.main()
