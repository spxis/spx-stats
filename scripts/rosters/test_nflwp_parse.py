"""Tests for nflwp_parse.py: python3 -I scripts/rosters/test_nflwp_parse.py"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nflwp_parse as p

def read(text):
    return p.entries(p.roster_section(text))

def names(es): return [(e["name"], e["title"], e["num"], e["pos"]) for e in es]

TEMPLATE = """==Season==
==Roster==
{{NFL final roster|team=San Francisco 49ers|year=1959
| quarterbacks =
*{{NFLplayer|12|John Brodie}}
*{{NFLplayer|14|Y. A. Tittle}}
*{{NFLplayer|22|Bob Smith|d=defensive back|HB}}
*{{NFLplayer|33|Joe Nobody|link=no}}
}}
==Notes==
*{{NFLplayer|99|Not Here}}
"""

SPANS = """== Roster ==
{| class="toccolours"
| '''Quarterbacks'''
*<span style="font-family:Arial Black;">18</span> [[Gary Kerkorian]] K
*<span style="font-family:Arial Black;">14</span> ''[[George Shaw (American football)|George Shaw]]'' 
|}
== Schedule ==
"""

PLAIN = """==Roster==
{{col-begin}}
{{col-break}}
'''Quarterbacks''' <br />
• 12 - [[Paul Larson (American football)|Paul Larson]] <br />
• 7 - [[Ted Marchibroda]] <br />
{{col-break}}
*88 ''[[Tom Flores]]'' QB/RB
* 63 [[Don Owen]]
* 71 Unlinked Guy
{{col-end}}
"""

BARE = """==Roster==
* [[Fritz Pollard]]*
* [[Jim Thorpe]] HB
"""

PLAYERS = """==Players==
{{NFL final roster|team=Oakland Raiders|year=1960
| quarterbacks =
*15 [[Tom Flores]]
*10 [[Babe Parilli]]
}}
"""

STAFF_FIRST = """==Roster==
===Staff / Coaches===
* Head coach – [[Frankie Albert]]
=== Players ===
*{{NFLplayer|12|John Brodie}}
*{{NFLplayer|14|Y. A. Tittle}}
"""

TABLE = """==Roster==
{| class="wikitable sortable"
|-
! Number
! Name
! Position
|-
| 53
| [[Tom Addison]]
| [[Linebacker|LB]]
|-
| 85
| [[Jack Atchason]]
| [[End (American football)|E]]
|}
"""

ROWS = """==Roster==
{| class="wikitable"
|- align=center
| ||- align=left|[[Neill Armstrong]]||22 ||E-DB ||12||4 ||189||6–2||1||- align=left|[[Oklahoma State Cowboys football|Oklahoma State]]
|-
|= 1940 [[Pro Bowl|All-Star Selection]]
|}
"""

class T(unittest.TestCase):
    def test_template(self):
        self.assertEqual(names(read(TEMPLATE)), [
            ("John Brodie", "John Brodie", "12", None), ("Y. A. Tittle", "Y. A. Tittle", "14", None),
            ("Bob Smith", "Bob Smith (defensive back)", "22", "HB"), ("Joe Nobody", None, "33", None)])

    def test_span_numbers_and_italics(self):
        self.assertEqual(names(read(SPANS)), [
            ("Gary Kerkorian", "Gary Kerkorian", "18", "K"), ("George Shaw", "George Shaw (American football)", "14", None)])

    def test_plain_numbers_bullets_and_columns(self):
        es = read(PLAIN)
        self.assertEqual([e["title"] for e in es], ["Paul Larson (American football)", "Ted Marchibroda", "Tom Flores", "Don Owen", None])
        self.assertEqual([e["num"] for e in es], ["12", "7", "88", "63", "71"])
        self.assertEqual(es[2]["pos"], "QB/RB")
        self.assertEqual(es[4]["name"], "Unlinked Guy")

    def test_no_numbers(self):
        self.assertEqual(names(read(BARE)), [("Fritz Pollard", "Fritz Pollard", None, None), ("Jim Thorpe", "Jim Thorpe", None, "HB")])

    def test_players_heading_only_with_roster_markup(self):
        self.assertEqual([e["title"] for e in read(PLAYERS)], ["Tom Flores", "Babe Parilli"])
        self.assertIsNone(p.roster_section("==Players==\nThey were good.\n"))

    def test_staff_subheading_first(self):
        self.assertEqual([e["title"] for e in read(STAFF_FIRST)], ["John Brodie", "Y. A. Tittle"])

    def test_table_one_cell_a_line(self):
        self.assertEqual(names(read(TABLE)), [("Tom Addison", "Tom Addison", "53", None), ("Jack Atchason", "Jack Atchason", "85", None)])

    def test_table_row_per_player(self):
        self.assertEqual(names(read(ROWS)), [("Neill Armstrong", "Neill Armstrong", None, None)])

    def test_order_is_page_order(self):
        es = read(TEMPLATE + "")
        self.assertEqual([e["ord"] for e in es], list(range(len(es))))

if __name__ == "__main__":
    unittest.main()
