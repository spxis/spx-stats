#!/usr/bin/env python3
"""Offline tests for scripts/olympics/parse.py: python3 -I scripts/olympics/test_parse.py. The samples are written in the shape of the real articles."""
import importlib.util, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("olympics_parse", os.path.join(HERE, "parse.py"))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)

HEADER = "{| class=\"wikitable\"\n! Rank !! Lane !! Athlete !! Nation !! Reaction !! Time !! Notes\n"


def article(rounds):
    return "==Results==\n" + rounds + "\n==References==\n"


class Wind(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(P.wind_of("Wind: −0.9&nbsp;m/s"), ("-0.9", -0.9))
        self.assertEqual(P.wind_of("Wind: +0.5m/s"), ("+0.5", 0.5))
        self.assertEqual(P.wind_of("Wind: {{convert|+0.3|m/s|mph|abbr=on}}"), ("+0.3", 0.3))
        self.assertEqual(P.wind_of("The tailwind of 2.3 m/s made this heat ineligible"), ("+2.3", 2.3))
        self.assertEqual(P.wind_of("no wind here"), (None, None))

    def test_readings(self):
        self.assertEqual(P.readings_of("Wind readings- Heat 1: -0.1&nbsp;m/s; Heat 2: +0.1&nbsp;m/s"), {1: ("-0.1", -0.1), 2: ("+0.1", 0.1)})
        self.assertEqual(P.wind_of("Wind readings- Heat 1: -0.1 m/s"), (None, None))   # a sentence for several heats is not one race's wind
        self.assertEqual(P.wind_of("Wind reading: -0.6 m/s"), ("-0.6", -0.6))


class Times(unittest.TestCase):
    def test_seconds(self):
        self.assertEqual(P.to_seconds("9.69"), 9.69)
        self.assertEqual(P.to_seconds("12.2, OR"), 12.2)
        self.assertEqual(P.to_seconds("10.59 (10.581)"), 10.59)
        self.assertEqual(P.to_seconds("1:02.5"), 62.5)
        for t in ("Unknown", "DNS", "(11.9)", "", "-"):
            self.assertIsNone(P.to_seconds(t), t)


class Cells(unittest.TestCase):
    def test_attributes_and_spans(self):
        self.assertEqual(P.attr_split('align=left| [[X|Y]]')[0].strip(), "[[X|Y]]")
        self.assertEqual(P.attr_split('rowspan=2| {{bronze3}}')[1], 2)
        self.assertEqual(P.attr_split("[[a|b]] text")[0], "[[a|b]] text")           # a link's pipe is not an attribute separator
        rows = P.table_rows(['! Rank !! Athlete', '|-', '| 1 || A', '|-', '|rowspan=2| 3 || B', '|-', '| C'])
        self.assertEqual([c for h, c in rows], [["Rank", "Athlete"], ["1", "A"], ["3", "B"], ["3", "C"]])

    def test_athlete(self):
        self.assertEqual(P.athlete_of("align=left| [[Usain Bolt]]".split("|", 1)[1]), ("Usain Bolt", "Usain Bolt", None))
        self.assertEqual(P.athlete_of("[[Charles Greene (athlete)|Charlie Greene]]"), ("Charlie Greene", "Charles Greene (athlete)", None))
        self.assertEqual(P.athlete_of("{{sortname|Anni|Holdmann}}")[:2], ("Anni Holdmann", "Anni Holdmann"))
        self.assertEqual(P.athlete_of("Boevi Lawson"), ("Boevi Lawson", None, None))
        self.assertEqual(P.athlete_of("{{flagIOCathlete|[[Thomas Burke (athlete)|Thomas Burke]]|USA|1896 Summer}}"), ("Thomas Burke", "Thomas Burke (athlete)", "USA"))
        self.assertEqual(P.nation_of("{{FlagIOC|USA|1968 Summer}}"), "USA")

    def test_marks(self):
        self.assertEqual(P.marks_of("{{abbr|Q|Qualified for quarterfinals by place}}, {{abbr|SB|Season best}}"), ["Q", "SB"])
        self.assertEqual(P.marks_of("{{WR|athletics|eq=y}} (h), {{WR|athletics}} (a)"), ["WR"])
        self.assertEqual(P.marks_of("'''Q'''"), ["Q"])
        self.assertEqual(P.marks_of("{{AthAbbr|NR|Afghan}}"), ["NR"])
        self.assertEqual(P.marks_of("Photo-finish shows 10.275"), [])


class Rounds(unittest.TestCase):
    def test_classify(self):
        c = P.classify
        self.assertEqual([c(x) for x in ("Heats", "First round", "Round 1", "Preliminaries", "Preliminary heat 2", "Quarterfinal 3", "Semi-finals", "Semifinal 1", "Final", "Repechage", "Second round")],
                         ["heats", "heats", "heats", "prelim", "prelim", "quarterfinals", "semifinals", "semifinals", "final", "repechage", "round2"])
        self.assertIsNone(c("Heat 4"))
        self.assertIsNone(c("Records"))


class Article(unittest.TestCase):
    def rows(self, text):
        races, unparsed = P.parse_article(text, "100m-m", 2000)
        return races, unparsed

    def test_heat_final_and_wind(self):
        t = article("===Heats===\n====Heat 1====\nWind: +1.0 m/s\n" + HEADER +
                    "|-\n| 1 || 3 || [[A B]] || {{flagIOC|JAM|2000 Summer}} || 0.150 || 10.01 || {{abbr|Q|x}}\n|-\n| 2 || 4 || C D || {{flagIOC|USA|2000 Summer}} || || DNS || \n|}\n"
                    "===Final===\n" + HEADER + "|-\n| {{gold1}} || 4 || [[A B]] || {{flagIOC|JAM|2000 Summer}} || 0.140 || 9.90 || OR\n|}\n")
        races, unparsed = self.rows(t)
        self.assertEqual(unparsed, [])
        heat, final = races[(2, 1)], races[(8, 1)]
        self.assertEqual((heat["wind_ms"], final["wind_ms"]), (1.0, None))
        self.assertEqual([(f["place"], f["lane"], f["name"], f["nation"], f["reaction_s"], f["time_s"], f["marks"], f["status"]) for f in heat["rows"]],
                         [(1, 3, "A B", "JAM", 0.15, 10.01, ["Q"], None), (2, 4, "C D", "USA", None, None, [], "DNS")])
        self.assertEqual((final["rows"][0]["place"], final["rows"][0]["time_s"], final["rows"][0]["marks"]), (1, 9.9, ["OR"]))

    def test_other_tables_are_not_results(self):
        t = "==Records==\n{| class=\"wikitable\"\n! Record !! Athlete !! Time\n|-\n| WR || X || 9.58\n|}\n" + article("===Final===\n" + HEADER + "|-\n| 1 || 4 || A || {{flagIOC|JAM|2000 Summer}} || 0.1 || 9.9 ||\n|}\n")
        races, _ = self.rows(t)
        self.assertEqual(len(races), 1)

    def test_unknown_round_is_reported(self):
        races, unparsed = self.rows(article("===Mystery===\n" + HEADER + "|-\n| 1 || 4 || A || {{flagIOC|JAM|2000 Summer}} || 0.1 || 9.9 ||\n|}\n"))
        self.assertEqual((len(races), len(unparsed)), (0, 1))


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]] + sys.argv[1:])
