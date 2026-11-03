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


SWIM_HEADER = "{| class=\"wikitable\"\n! Rank !! Lane !! Swimmer !! Nation !! Time !! Notes\n"


class Swimming(unittest.TestCase):
    def parse(self, text):
        return P.parse_article(text, "100free-m", 2000)

    def test_rows_without_a_results_heading(self):
        t = "==Heats==\n" + SWIM_HEADER + "|-\n| 1 || 4 || [[A B]] || {{flagIOC|AUS|2000 Summer}} || 1:13.6 WR || \n|}\n==Final==\n" + SWIM_HEADER + \
            "|-\n| {{gold01}} || 4 || [[A B]] || {{flagIOC|AUS|2000 Summer}} || 47.21 ||\n|}\n"
        races, unparsed = self.parse(t)
        self.assertEqual((unparsed, sorted(races)), ([], [(2, 1), (8, 1)]))
        first = races[(2, 1)]["rows"][0]
        self.assertEqual((first["time_s"], first["marks"], first["nation"]), (73.6, ["WR"], "AUS"))

    def test_swim_off_and_lettered_finals(self):
        t = article("===Heats===\n" + SWIM_HEADER + "|-\n| 1 || 4 || A || {{flagIOC|AUS|2000 Summer}} || 50.1 ||\n|}\n; Swim-off\n\n" + SWIM_HEADER +
                    "|-\n| 1 || 4 || A || {{flagIOC|AUS|2000 Summer}} || 50.0 ||\n|}\n===Finals===\n====Final B====\n" + SWIM_HEADER +
                    "|-\n| 9 || 4 || B || {{flagIOC|AUS|2000 Summer}} || 51.0 ||\n|}\n====Final A====\n" + SWIM_HEADER + "|-\n| 1 || 4 || C || {{flagIOC|AUS|2000 Summer}} || 49.0 ||\n|}\n")
        races, unparsed = self.parse(t)
        self.assertEqual(unparsed, [])
        self.assertEqual(sorted(races), [(2, 1), (2, 91), (8, 1), (8, 2)])
        self.assertEqual((races[(2, 91)]["heat_label"], races[(8, 1)]["heat_label"], races[(8, 1)]["rows"][0]["name"], races[(8, 2)]["heat_label"]), ("Swim-off", "Final A", "C", "Final B"))

    def test_rowspan_in_the_last_columns(self):
        t = article("===Heats===\n" + SWIM_HEADER + "|-\n| rowspan=2|16 || 6 || [[A]] || {{flagIOC|FRA|2000 Summer}} || rowspan=2|53.71 || rowspan=2|{{abbr|QSO|x}}\n|-\n| 7 || [[B]] || {{flagIOC|NED|2000 Summer}}\n|}\n")
        races, unparsed = self.parse(t)
        self.assertEqual(unparsed, [])
        second = races[(2, 1)]["rows"][1]
        self.assertEqual((second["place"], second["lane"], second["time_s"], second["marks"]), (16, 7, 53.71, ["QSO"]))

    def test_single_final_table_under_results(self):
        races, unparsed = self.parse("==Results==\n{| class=\"wikitable\"\n! Rank || Swimmer || Nation || Time\n|-\n| {{gold01}}\n| [[A B]] || {{flagIOC|HUN|1896 Summer}}\n| 1:22.2\n|}\n")
        self.assertEqual((unparsed, list(races)), ([], [(8, 1)]))

    def test_medal_icon_and_unlinked_flag_name(self):
        t = article("===Final===\n{| class=\"wikitable\"\n! Rank !! Athlete !! Country !! Time !! Notes\n|-\n| [[File:gold medal icon.svg|1]] || [[A B]] || {{FlagIOC|DEN|1948 Summer}} || 1:06.3 || \n|-\n| 4 || {{flagIOCathlete|Regina Kari|FIN|1912 Summer}} || || 1:09.1 ||\n|}\n")
        races, _ = self.parse(t)
        rows = races[(8, 1)]["rows"]
        self.assertEqual((rows[0]["place"], rows[0]["time_s"], rows[1]["name"], rows[1]["nation"]), (1, 66.3, "Regina Kari", "FIN"))

    def test_split_statistics_table(self):
        t = article("===Final===\n" + SWIM_HEADER + "|-\n| {{gold01}} || 4 || [[A B]] || {{flagIOC|CHN|2024 Summer}} || 46.40 ||\n|}\n"
                    "{| class=\"wikitable\"\n|+ Statistics\n! Name\n! 15 metre split (s)\n! 50 metre split (s)\n! 50–65 metre split (s)\n! Time (s)\n! Stroke rate\n"
                    "|-\n! scope=\"row\" | [[A B]]\n| 5.45\n| 22.28\n| 6.57\n| 46.40\n| 51.6\n|}\n")
        races, unparsed = self.parse(t)
        self.assertEqual((unparsed, list(races)), ([], [(8, 1)]))
        self.assertEqual(races[(8, 1)]["rows"][0]["splits"], [{"m": 15, "s": 5.45}, {"m": 50, "s": 22.28}, {"m": 65, "from": 50, "s": 6.57, "interval": True}])

    def test_clock_splits_and_written_out_status(self):
        t = article("===Final===\n" + SWIM_HEADER + "|-\n| 1 || 4 || [[A B]] || {{flagIOC|ITA|2024 Summer}} || 14:30.67 ||\n|-\n| \u2014 || 5 || C || {{flagIOC|ITA|2024 Summer}} || Did not finish ||\n|}\n"
                    "{| class=\"wikitable\"\n|+ Statistics\n! Name\n! 500 metre split\n! 1000 metre split\n! Time\n|-\n! scope=\"row\" | [[A B]]\n| 04:49.10\n| 09:41.72\n| 14:30.67\n|}\n")
        races, unparsed = self.parse(t)
        rows = races[(8, 1)]["rows"]
        self.assertEqual((unparsed, rows[0]["splits"], rows[1]["status"]), ([], [{"m": 500, "s": 289.1}, {"m": 1000, "s": 581.72}], "DNF"))

    def test_status_words_are_not_marks(self):
        races, _ = self.parse(article("===Final===\n" + SWIM_HEADER + "|-\n| \u2014 || 4 || A || {{flagIOC|AUS|2000 Summer}} || 10.40 {{abbr|DSQ|Disqualified}} ||\n|}\n"))
        row = races[(8, 1)]["rows"][0]
        self.assertEqual((row["status"], row["time_s"], row["marks"]), ("DQ", None, []))


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]] + sys.argv[1:])
