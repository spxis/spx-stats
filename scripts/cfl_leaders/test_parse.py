"""Tests for parse.py: python3 -I scripts/cfl_leaders/test_parse.py"""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse as P

PLAYER_STATS = """==Roster==
text
== Player stats ==

===Passing===
{| class="wikitable sortable"
|-
! style="background:#bd0d18;color:white;" width="16%" | Player
! style="background:#bd0d18;color:white;" width="9%" | Att
! style="background:#bd0d18;color:white;" width="9%" | Comp
! style="background:#bd0d18;color:white;" width="9%" | %
! style="background:#bd0d18;color:white;" width="9%" | Yards
! style="background:#bd0d18;color:white;" width="9%" | TD
! style="background:#bd0d18;color:white;" width="9%" | INT
! style="background:#bd0d18;color:white;" width="9%" | Rating
|- align="center"
| [[Henry Burris]] || 559 || 370 || 66.2 || 4,945 || 38 || 20 || 101.9
|- align="center"
| [[Tom Clements (Canadian football)|Tom Clements]]<ref name="x"/> || 62 || 44 || 71.0% || 521 || 7 || 0 || N/A
|- align="center"
|}<ref>{{Cite web |url=https://example.org/ |title = Passing {{!}} Statistics}}</ref>

===Rushing===
{| class="wikitable"
|- align="center"  style="background:black;color:red;"
| '''Player''' || '''No.''' || '''Yards''' || '''Avg,''' || '''Longest''' || '''TD'''
|- align="center"
|Condredge Holloway||12||76||6.3||30T||1
|- align="center"
|Short Row||3||20
|}

===Receiving===
{| class="wikitable"
!style="background:black;"|Player ||style="background:black;"| Receptions ||style="background:black;"| Yards
|-
|Nik Lewis|| 90 || 1262
|}

===Kicking===
{| class="wikitable"
! Player !! FGA
|-
| Somebody || 3
|}
==Awards==
"""

OFFENCE = """===Offensive leaders===
{|class="wikitable" width="90%"
|- align="center"  ! style="background:black;color:#FF8800;"
| Player ||Passing yds||Rush yds||Receiving yds||TD
|- align="center" bgcolor=""
| [[Peter Liske]] || 2310 ||31||0||0
|- align="center" bgcolor=""
| [[Lou Harris]] || ||958||220||4
|- align="center" bgcolor=""
|}
==Roster==
"""

EMPTY = """===Passing===
{| class="wikitable"
! style="x" | Player
! style="x" | Att
|- align="center"
| 
|- align="center"
| 
|}
"""


class Leaders(unittest.TestCase):
    def test_passing_table(self):
        ls, un, found = P.leaders(PLAYER_STATS)
        p = [l for l in ls if l["category"] == "passing"]
        self.assertEqual([l["name"] for l in p], ["Henry Burris", "Tom Clements"])
        self.assertEqual(p[0]["title"], "Henry Burris")
        self.assertEqual(p[1]["title"], "Tom Clements (Canadian football)")
        self.assertEqual(p[0]["stats"], {"att": "559", "comp": "370", "pct": "66.2", "yds": "4945", "td": "38", "int": "20", "rating": "101.9"})
        self.assertIsNone(p[1]["stats"]["rating"])            # N/A
        self.assertEqual(p[1]["stats"]["pct"], "71.0")        # the percent sign is not kept
        self.assertEqual([l["ord"] for l in p], [0, 1])       # the blank row after the last player is not a line

    def test_rushing_headed_no_is_carries_and_a_short_row_is_kept(self):
        ls, un, _ = P.leaders(PLAYER_STATS)
        r = [l for l in ls if l["category"] == "rushing"]
        self.assertEqual([l["name"] for l in r], ["Condredge Holloway", "Short Row"])
        self.assertEqual(r[0]["stats"], {"att": "12", "yds": "76", "avg": "6.3", "long": "30T", "td": "1"})   # "Avg," typo read, 30T kept
        self.assertEqual(r[0]["title"], None)
        self.assertEqual(r[1]["stats"], {"att": "3", "yds": "20"})     # the row has fewer cells than the header: the missing ones are not there
        self.assertTrue(any("Short Row: 3 cells under 6 headings" in note for _, note in un))

    def test_header_row_with_double_bars(self):
        ls, _, _ = P.leaders(PLAYER_STATS)
        r = [l for l in ls if l["category"] == "receiving"]
        self.assertEqual(r[0]["stats"], {"rec": "90", "yds": "1262"})

    def test_other_sections_are_not_read(self):
        ls, _, _ = P.leaders(PLAYER_STATS)
        self.assertFalse(any(l["name"] == "Somebody" for l in ls))
        self.assertEqual({l["category"] for l in ls}, {"passing", "rushing", "receiving"})

    def test_offensive_leaders(self):
        ls, un, found = P.leaders(OFFENCE)
        self.assertEqual(found, 1)
        self.assertEqual([(l["category"], l["name"]) for l in ls], [("offence", "Peter Liske"), ("offence", "Lou Harris")])
        self.assertEqual(ls[0]["stats"], {"pass_yds": "2310", "rush_yds": "31", "rec_yds": "0", "td": "0"})
        self.assertIsNone(ls[1]["stats"]["pass_yds"])                                # an empty cell is null, not 0
        self.assertEqual(ls[1]["title"], "Lou Harris")

    def test_an_empty_table_gives_no_line_and_a_note(self):
        ls, un, found = P.leaders(EMPTY)
        self.assertEqual(ls, [])
        self.assertEqual(found, 1)
        self.assertTrue(any("names no player" in n for _, n in un))

    def test_a_heading_with_no_table(self):
        ls, un, found = P.leaders("===Passing===\nno table here\n==Roster==\n")
        self.assertEqual((ls, found), ([], 0))
        self.assertEqual(un, [("passing", "no table under this heading")])

    def test_a_footnote_mark_is_not_part_of_the_name(self):
        text = "===Rushing===\n{| class=\"wikitable\"\n! Player !! Att !! Yards\n|-\n| Jim Smith* || 1 || 2\n|}\n"
        ls, _, _ = P.leaders(text)
        self.assertEqual(ls[0]["name"], "Jim Smith")


class Titles(unittest.TestCase):
    def test_club_season(self):
        self.assertEqual(P.club_season("2010 Calgary Stampeders season"), (2010, "Calgary Stampeders"))
        self.assertEqual(P.club_season("1962 BC Lions season"), (1962, "BC Lions"))
        self.assertEqual(P.club_season("Saskatchewan Roughriders football 1970-79"), (None, None))


class Load(unittest.TestCase):
    def test_sql_of_the_fixture(self):
        raw = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "db", "tests", "cfl-leaders-raw")
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "load.sql")
            arts, lines, unparsed, want, lk = P.sql(raw, out)
            with open(out, encoding="utf-8") as f: sql = f.read()
        self.assertEqual((len(arts), len(lines)), (3, 13))
        self.assertIn("insert into legacy_wikipedia_cfl_leaders.article", sql)
        self.assertEqual(sql.count("insert into legacy_wikipedia_cfl_leaders.line"), 13)
        self.assertEqual(sql.count("insert into legacy_wikipedia_cfl_leaders.link_title"), 8)
        self.assertTrue(sql.startswith("--"))
        self.assertTrue(sql.rstrip().endswith("commit;"))
        self.assertEqual(lk["Rob Cote (running back)"][:2], ("Rob Cote", "Q110"))            # the redirect is followed
        self.assertTrue(lk["Arjei Franklin"][2])                                              # a disambiguation page is marked


if __name__ == "__main__":
    unittest.main()
