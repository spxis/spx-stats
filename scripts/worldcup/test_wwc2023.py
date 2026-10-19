#!/usr/bin/env python3
"""Checks for scripts/worldcup/wwc2023.py: reading a football box. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/worldcup -p 'test_wwc*.py'     (from the repo root)
The wikitext is written for the test in the layout the articles use; it is not article text."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wwc2023 as W   # noqa: E402

GROUP = """==Matches==
<section begin=A1 />{{Football box
|date={{Start date|2023|7|20|df=y}}
|time=19:00 <includeonly>[[UTC+12:00|UTC+12]]</includeonly>
|team1={{fbw-rt|NZL}}
|score={{score link|2023 FIFA Women's World Cup Group A#New Zealand vs Norway|1–0}}
|team2={{fbw|NOR}}
|goals1=[[Hannah Wilkinson|Wilkinson]] {{goal|48}}
|goals2=
|stadium=[[Eden Park]], [[Auckland]]
}}<section end=A1 />
"""
KO = """==Round of 16==
===Sweden vs United States===
{{Football box
|date={{Start date|2023|8|6|df=y}}
|time=19:00 [[UTC+10:00|UTC+10]]
|team1={{fbw-rt|SWE}}
|score={{score link|x|0–0}}
|aet=yes
|team2={{fbw|USA}}
|goals1=
|goals2=
|stadium=[[Melbourne Rectangular Stadium]], [[Melbourne]]
|penalties1=
*[[A|Rolfö]] {{pengoal}}
|penaltyscore=5–4
|penalties2=
*{{penmiss}} [[B|Rapinoe]]
}}
===Spain vs Netherlands===
{{Football box
|date={{Start date|2023|8|11|df=y}}
|team1={{fbw-rt|ESP}}
|score={{score link|x|2–1}}
|aet=yes
|team2={{fbw|NED}}
|goals1=
*[[Mariona Caldentey|Caldentey]] {{goal|81}}
*[[Salma Paralluelo|Paralluelo]] {{goal|111}}
|goals2=
*[[Stefanie van der Gragt|van der Gragt]] {{goal|23|o.g.}}
|stadium=[[Wellington Regional Stadium]], [[Wellington]]
}}
"""

class Wwc(unittest.TestCase):
    def match(self, text, group=None):
        (body, head), = W.boxes(text)[:1]
        return W.read_match(body, head, group)

    def test_group_box(self):
        m, why = self.match(GROUP, "A")
        self.assertIsNone(why)
        self.assertEqual((m["date"], m["kickoff"], m["utc"], m["t1"], m["t2"], m["s1"], m["s2"], m["stage"], m["group"]),
                         ("2023-07-20", "19:00", "+12:00", "New Zealand", "Norway", 1, 0, "Group stage", "A"))
        self.assertEqual((m["stadium"], m["city"]), ("Eden Park", "Auckland"))
        self.assertEqual(m["g1"], [("Wilkinson", "48", "")])

    def test_shootout_round_and_heading(self):
        m, why = self.match(KO)
        self.assertIsNone(why)
        self.assertEqual((m["stage"], m["aet"], m["p1"], m["p2"], m["s1"], m["s2"], m["g1"], m["g2"]), ("Round of 16", True, 5, 4, 0, 0, [], []))

    def test_extra_time_goals_and_own_goal_credited_to_the_other_side(self):
        boxes = W.boxes(KO)
        m, why = W.read_match(boxes[1][0], boxes[1][1], None)
        self.assertIsNone(why)
        self.assertEqual([x[1] for x in m["g1"]], ["81", "111"])
        self.assertEqual(m["g2"], [("van der Gragt", "23", "og")])

    def test_goals_must_add_up_to_the_score(self):
        bad = GROUP.replace("{{goal|48}}", "")
        m, why = self.match(bad, "A")
        self.assertIsNone(m)
        self.assertIn("goals listed", why)

if __name__ == "__main__":
    unittest.main()
