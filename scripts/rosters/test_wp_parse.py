"""Tests for wp_parse.py: python3 -I scripts/rosters/test_wp_parse.py"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wp_parse as w

NBA = """==Preseason==
text
==Roster==
{{NBA roster header|team=Houston Rockets|season=2009–10}}
{{player2 | num = 1  | first = Trevor | last = Ariza | pos = SF | ft = 6 | in = 8 | lbs = 210 | college = UCLA }}
{{player2 | num = 0 | first = Aaron | last = Brooks | dab = basketball | pos = PG | ft = 6 | in = 0 | lbs = 161 | college = Oregon | DOB = 1985–01–14}}
{{player2 | num = 20 | first = Bill Jr. | last = Hosket | link = Bill Hosket, Jr. | pos = PF | DOB = 1941–12–33 }}
{{player2 | num = 11 | name = Yao Ming | pos = C | ft = 7 | in = 6 | lbs = 310 | from = People's Republic of China }}
<!-- end list of players -->
{{NBA roster footer}}
==Player statistics==
{{NBA roster statistics legend}}
===Regular season===
{{NBA roster statistics start|team=Houston Rockets}}
|-
| {{sort|Andersen, David|[[David Andersen]]}}
| 63 || 0 || 14.1
|-
| style="text-align:left;"|{{sortname|Randy|Brown|dab=basketball}}
| 68 || 0 || 9.9
|-
| {{sortname|Toni|Kukoč||Kukoc, Toni}}
| 74 || 0
|-
| [[Willis Reed]] || 81 || 3089
===Playoffs===
|-
| {{sort|Ghost, Player|[[Ghost Player]]}}
"""

CFL = """==Roster==
{| class="toccolours"
|  style="font-size:95%; vertical-align:top;"| '''Quarterbacks'''
* {{CFL player|12|I|[[Dalton Bell]]}}
* {{CFL player|&nbsp;6|N|[[Danny Brannagan|D. Brannagan]]}}
* {{CFL player|&nbsp;7|N|Plain Name}}
|}
"""

class Parse(unittest.TestCase):
    def test_sections(self):
        s = w.sections(NBA)
        self.assertIn("player2", s["roster"])
        self.assertNotIn("Ghost", s["stats"])      # the playoffs table is not read

    def test_nba_roster(self):
        e = [x for x in w.entries("nba", w.sections(NBA)) if x["src"] == "roster"]
        self.assertEqual([x["title"] for x in e], ["Trevor Ariza", "Aaron Brooks (basketball)", "Bill Hosket, Jr.", "Yao Ming"])
        self.assertEqual(e[1]["dob"], "1985-01-14")
        self.assertIsNone(e[2]["dob"])             # 1941-12-33 does not exist
        self.assertEqual((e[0]["num"], e[0]["pos"], e[0]["ft"], e[0]["inch"], e[0]["lbs"], e[0]["college"]), ("1", "SF", "6", "8", "210", "UCLA"))

    def test_nba_statistics(self):
        e = [x for x in w.entries("nba", w.sections(NBA)) if x["src"] == "stats"]
        self.assertEqual([x["title"] for x in e], ["David Andersen", "Randy Brown (basketball)", "Toni Kukoč", "Willis Reed"])

    def test_cfl(self):
        e = w.entries("cfl", w.sections(CFL))
        self.assertEqual([(x["name"], x["title"], x["num"]) for x in e], [("Dalton Bell", "Dalton Bell", "12"), ("D. Brannagan", "Danny Brannagan", "6"), ("Plain Name", None, "7")])

    def test_no_sections(self):
        self.assertEqual(w.entries("nba", w.sections("nothing here")), [])

if __name__ == "__main__":
    unittest.main()
