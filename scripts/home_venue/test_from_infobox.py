#!/usr/bin/env python3
"""Checks for scripts/home_venue/from_infobox.py (the stadium field). Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/home_venue -p 'test_*.py'     (from the repo root)"""
import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import from_infobox as F   # noqa: E402

class Stadium(unittest.TestCase):
    def test_first_link_and_several(self):
        raw, links = F.stadium("{{Infobox NFL season\n| team = Green Bay Packers\n| stadium = [[City Stadium (Green Bay)]], [[Wisconsin State Fair Park]]\n| playoffs =\n}}")
        self.assertEqual(links, ["City Stadium (Green Bay)", "Wisconsin State Fair Park"])

    def test_piped_link_and_comment(self):
        self.assertEqual(F.stadium("| stadium =[[Polo Grounds|The Polo Grounds]]<!-- home -->\n")[1], ["Polo Grounds"])

    def test_empty_field_does_not_read_the_next_line(self):
        raw, links = F.stadium("| stadium =\n| playoffs = [[1924 NFL season|x]]\n")
        self.assertEqual(links, [])

    def test_no_field(self):
        self.assertIsNone(F.stadium("| team = X\n"))

if __name__ == "__main__":
    unittest.main()
