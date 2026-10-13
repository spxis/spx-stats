"""Tests for openfootball.py. Run: python3 -I scripts/worldcup/test_openfootball.py"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openfootball as O


def one(text, year=2022):
    ms, un = O.parse_file(text, year)
    assert not un, un
    assert len(ms) == 1, ms
    return ms[0]


class Parse(unittest.TestCase):
    def test_group_match_with_scorers(self):
        m = one("▪ Group A\nSun Nov 20\n  19:00  Qatar  0-2 (0-2)  Ecuador  @ Al Bayt Stadium, Al Khor\n    (Enner Valencia 16' (pen.), 31')\n")
        self.assertEqual((m["team1"], m["team2"], m["score1"], m["score2"], m["date"], m["group"], m["time"]), ("Qatar", "Ecuador", 0, 2, "2022-11-20", "Group A", "19:00"))
        self.assertEqual([(g[0], g[1], g[2], g[3]) for g in m["goals"]], [("away", "Enner Valencia", "16", "pen"), ("away", "Enner Valencia", "31", "")])

    def test_extra_time_and_shootout(self):
        m = one("▪ Round of 16\nTue Dec 6\n  18:00  Japan  1-1 a.e.t (1-1, 1-0), 1-3 pen.  Croatia  @ Al Janoub Stadium, Al Wakrah\n")
        self.assertEqual((m["score1"], m["score2"], m["aet"], m["pens"]), (1, 1, True, (1, 3)))

    def test_shootout_written_first(self):
        m = one("▪ Round of 16\nMon Jun 26\n  Switzerland  0-3 pen. 0-0 a.e.t. (0-0)   Ukraine  @ RheinEnergieStadion, Köln\n", 2006)
        self.assertEqual((m["score1"], m["score2"], m["aet"], m["pens"]), (0, 0, True, (0, 3)))

    def test_date_and_weekday_on_the_match_line(self):
        m = one("▪ Group A\nFri Jun 9     Germany     4-2 (2-1)  Costa Rica   @ Allianz Arena, München\n", 2006)
        self.assertEqual((m["date"], m["score1"]), ("2006-06-09", 4))

    def test_v_between_the_teams(self):
        m = one("▪ Group A\nThu Jun 12\n  17:00 UTC-3  Brazil v Croatia   3-1 (1-1)       @ Arena de São Paulo, São Paulo\n", 2014)
        self.assertEqual((m["team1"], m["team2"], m["score1"], m["score2"], m["utc"]), ("Brazil", "Croatia", 3, 1, "-3"))

    def test_knockout_number_is_not_a_goal_list(self):
        m = one("▪ Round of 32\nSun Jun 28\n  (73) 12:00 UTC-7  South Africa 0-1 (0-0) Canada   @ Los Angeles (Inglewood)   ## 2A v 2B\n    (Stephan Eustáquio 90+2')\n", 2026)
        self.assertEqual((m["number"], m["venue"], m["comment"]), (73, "Los Angeles (Inglewood)", "2A v 2B"))

    def test_own_goals_and_a_side_with_no_goals(self):
        m = one("▪ Group B\nWed June 24\n  19:00 Bosnia & Herzegovina 3-1 (2-0) Qatar @ Toronto\n    (Kerim Alajbegovic 29' Mahmoud Abunada 34'(OG) Ermin Mahmic 80'; Hassan Al-Haydos 42')\n", 2026)
        self.assertEqual([g[3] for g in m["goals"]], ["", "og", "", ""])
        m = one("▪ Group A\nWed June 24\n  19:00 Czech Republic 0-3 (0-0) Mexico @ Mexico City\n    (Mateo Chávez 55' Julián Quiñones 61')\n", 2026)
        self.assertEqual({g[0] for g in m["goals"]}, {"away"})


if __name__ == "__main__":
    unittest.main()
