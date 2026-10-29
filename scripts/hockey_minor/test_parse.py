#!/usr/bin/env python3
"""Checks for scripts/hockey_minor: the table shapes the AHL season articles use, in the articles' own wikitext. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/hockey_minor -p 'test_*.py'     (from the repo root)"""
import datetime, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402

OLD = """==Final standings==
{| class="wikitable"
|-
! bgcolor="#DDDDFF" width="30%" | East
! bgcolor="#DDDDFF" width="5%" | GP
! bgcolor="#DDDDFF" width="5%" | W
! bgcolor="#DDDDFF" width="5%" | L
! bgcolor="#DDDDFF" width="5%" | T
! bgcolor="#DDDDFF" width="7.5%" | Pts
! bgcolor="#DDDDFF" width="7.5%" | GF
! bgcolor="#DDDDFF" width="7.5%" | GA
|-
|[[Providence Reds]] ([[Chicago Black Hawks|CHI]]) ||56||31||21||4||66||196||171
|-
|[[Springfield Indians]] ([[New York Americans|NYA]]) ||56||26||21||9||61||157||149
|}

{| class="wikitable"
|-
! bgcolor="#DDDDFF" width="30%" | West
! bgcolor="#DDDDFF" width="5%" | GP
! bgcolor="#DDDDFF" width="5%" | W
! bgcolor="#DDDDFF" width="5%" | L
! bgcolor="#DDDDFF" width="5%" | T
! bgcolor="#DDDDFF" width="7.5%" | Pts
! bgcolor="#DDDDFF" width="7.5%" | GF
! bgcolor="#DDDDFF" width="7.5%" | GA
|-
|[[Cleveland Barons (1937-1973)|Cleveland Barons]] (independent) ||56||26||21|| 9||61||177||162
|-
|[[Hershey Bears]] ([[Boston Bruins|BOS]]/[[Calgary Flames|CGY]]) ||56||24||23|| 9||57||193||189
|}
==Scoring leaders==
"""

NEW = """== Final standings ==
=== Eastern Conference ===
{| class="wikitable" style="width:50em"
|- bgcolor="#DDDDFF"
! width="35%" | Atlantic Division
! width="5%" | {{abbr|GP|Games played}}
! width="5%" | {{abbr|W|Wins}}
! width="5%" | {{abbr|L|Losses}}
! width="5%" | {{abbr|OTL|Overtime losses}}
! width="5%" | {{abbr|SOL|Shootout losses}}
! width="7.5%" | {{abbr|Pts|Points}}
! width="7.5%" | {{abbr|Pts%|Points percentage}}
! width="7.5%" | {{abbr|GF|Goals for}}
! width="7.5%" | {{abbr|GA|Goals against}}
|- bgcolor=#97DEFF
| '''y–'''[[Charlotte Checkers]] ([[Carolina Hurricanes|CAR]]) || 76 || 51 || 17 || 7 || 1 || '''110''' || .724 || 255 || 189
|- bgcolor=#ffcccc
| '''e–'''[[Hartford Wolf Pack]] ([[New York Rangers|NYR]]) || 76 || 29 || 36 || 7 || 4 || '''69''' || .454 || 209 || 266
|}
=== Western Conference ===
{| class="wikitable" style="width:50em"
! width="35%" | Pacific Division
! GP !! W !! L !! OTL !! SOL !! Pts !! GF !! GA
|-
| [[Cleveland Barons (1937–1973)|Cleveland]] || 10 || 5 || 3 || 1 || 1 || 12 || 30 || 28
|}
== Statistical leaders ==
"""

BRACKET = """{{6TeamBracket-Info |style=2
| RD1=Preliminary Round
| RD2=League Semi-Final
| RD3=Calder Cup Final
| RD1-seed1=E2
| RD1-team1=[[New Haven Eagles|New Haven]]
| RD1-score1=0
| RD1-seed2=W2
| RD1-team2='''[[Hershey Bears|Hershey]]'''
| RD1-score2='''2'''
| RD2-seed1=E1
| RD2-team1=[[Providence Reds|Providence]]
| RD2-score1=1
| RD2-seed2=W1
| RD2-team2='''[[Cleveland Barons (1937–1973)|Cleveland]]'''
| RD2-score2='''3'''
| RD3-seed1=W1
| RD3-team1='''[[Cleveland Barons (1937–1973)|Cleveland]]'''
| RD3-score1='''3'''
| RD3-seed2=W2
| RD3-team2=[[Hershey Bears|Hershey]]
| RD3-score2=2
}}
"""

PROSE = """==Calder Cup playoffs==
;First round
*[[Cleveland Barons (1937-1973)|Cleveland Barons]] defeated [[Syracuse Warriors]] 3 games to 1.
*[[Pittsburgh Hornets]] earned second round bye.
;Finals
*[[Cleveland Barons (1937-1973)|Cleveland Barons]] defeated [[Pittsburgh Hornets]] 4 games to 3, to win the Calder Cup.
* [http://www.hockeydb.com/ihdb/stats/playoffdisplay.php3 list of scores]

==Trophy and Award winners==
"""

GAMES = """{{NHLPlayoffs
|team1=Rochester Americans
|team2=New Haven Nighthawks
|date1=April 3
|score1=4 - 3
|ot1=OT
|won1=1
|date2=April 5
|score2=2 - 1
|won2=1
|date3=April 10
|score3=5 - 2
|won3=2
|date4=April 13
|home4=2
|score4=1 &ndash; 5
|date5=April 14
|score5=4 - 1
|series=New Haven won series 4 – 2
 }}
{{NHLPlayoffs
|team1=Charlotte Checkers
|team2=Providence Bruins
|homeright=yes
|date1=April 20
|home1=2
|score1=5–4
|won1=1
|date2=April 24
|home2=1
|score2=0–3
|won2=1
}}
"""


class Standings(unittest.TestCase):
    def test_old_table_with_ties_and_affiliations(self):
        rows, bad = P.parse_standings(OLD)
        self.assertEqual(bad, [])
        self.assertEqual([(r["team"], r["division"], r["affiliation"], r["w"], r["l"], r["t"], r["pts"], r["gf"], r["ga"]) for r in rows], [
            ("Providence Reds", "East", "CHI", 31, 21, 4, 66, 196, 171),
            ("Springfield Indians", "East", "NYA", 26, 21, 9, 61, 157, 149),
            ("Cleveland Barons", "West", "independent", 26, 21, 9, 61, 177, 162),
            ("Hershey Bears", "West", "BOS/CGY", 24, 23, 9, 57, 193, 189)])
        self.assertEqual([r["rank"] for r in rows], [1, 2, 1, 2])

    def test_new_table_with_otl_sol_and_conference(self):
        rows, bad = P.parse_standings(NEW)
        self.assertEqual(len(rows), 3)
        a = rows[0]
        self.assertEqual((a["team"], a["conference"], a["division"], a["gp"], a["w"], a["l"], a["otl"], a["sol"], a["pts"], a["gf"], a["ga"], a["affiliation"]),
                         ("Charlotte Checkers", "Eastern Conference", "Atlantic Division", 76, 51, 17, 7, 1, 110, 255, 189, "CAR"))
        self.assertIsNone(a.get("t"))
        self.assertEqual(rows[1]["team"], "Hartford Wolf Pack")
        self.assertEqual((rows[2]["conference"], rows[2]["division"], rows[2]["otl"], rows[2]["sol"]), ("Western Conference", "Pacific Division", 1, 1))

    def test_a_cell_with_only_the_city_takes_the_articles_name(self):
        rows, _ = P.parse_standings(NEW)
        self.assertEqual(rows[2]["team"], "Cleveland Barons")


class Playoffs(unittest.TestCase):
    def test_bracket_pairs_teams_two_by_two(self):
        series, odd = P.bracket_series(BRACKET)
        self.assertEqual(odd, [])
        self.assertEqual(series, [
            ("Preliminary Round", "New Haven", "New Haven Eagles", 0, "Hershey", "Hershey Bears", 2),
            ("League Semi-Final", "Providence", "Providence Reds", 1, "Cleveland", "Cleveland Barons (1937–1973)", 3),
            ("Calder Cup Final", "Cleveland", "Cleveland Barons (1937–1973)", 3, "Hershey", "Hershey Bears", 2)])

    def test_sentences_with_games_to_games(self):
        out, unparsed = P.prose_series(PROSE)
        self.assertEqual(unparsed, [])
        self.assertEqual([(r[0], r[1], r[2], r[3], r[4], r[5], r[6]) for r in out], [
            ("First round", "Cleveland Barons", "Cleveland Barons (1937-1973)", "Syracuse Warriors", "Syracuse Warriors", 3, 1),
            ("Finals", "Cleveland Barons", "Cleveland Barons (1937-1973)", "Pittsburgh Hornets", "Pittsburgh Hornets", 4, 3)])

    def test_a_section_of_another_article(self):
        text = "x {{#section:2019 Calder Cup playoffs|2019bracket}} y"
        page = "a <section begin=2019bracket />BRACKET<section end=2019bracket /> b"
        self.assertEqual(P.expand_sections(text, {"2019 Calder Cup playoffs": page}), "x BRACKET y")

    def test_champion_from_the_infobox(self):
        self.assertEqual(P.champion_of("| finals_champ = [[Cleveland Barons (1937–73)|Cleveland Barons]]\n| finals_runner-up = [[Hershey Bears]]"),
                         ("Cleveland Barons", "Cleveland Barons (1937–73)"))
        self.assertEqual(P.champion_of("| finals_runner-up = [[Hershey Bears]]"), (None, None))


class Games(unittest.TestCase):
    def test_score_order_follows_homeright_and_the_winner(self):
        games, _bad = P.playoff_games(GAMES, 1973)
        g = {(x["date"], x["home"]): x for x in games}
        # no homeN: the winner owns the larger number; home-visitor order, so the first number is the home team's
        a = g[(datetime.date(1974, 4, 3), "Rochester Americans")]
        self.assertEqual((a["away"], a["home_pts"], a["away_pts"], a["overtime"]), ("New Haven Nighthawks", 4, 3, True))
        b = g[(datetime.date(1974, 4, 10), "New Haven Nighthawks")]
        self.assertEqual((b["away"], b["home_pts"], b["away_pts"], b["overtime"]), ("Rochester Americans", 5, 2, False))
        # homeN given (team 2 at home), first number is the home team's: 1-5 is a home loss, so the visitor won it
        c = g[(datetime.date(1974, 4, 13), "New Haven Nighthawks")]
        self.assertEqual((c["home_pts"], c["away_pts"]), (1, 5))
        # homeright=yes: visitor-home
        d = g[(datetime.date(1974, 4, 20), "Providence Bruins")]
        self.assertEqual((d["away"], d["home_pts"], d["away_pts"]), ("Charlotte Checkers", 4, 5))
        e = g[(datetime.date(1974, 4, 24), "Charlotte Checkers")]
        self.assertEqual((e["home_pts"], e["away_pts"]), (3, 0))

    def test_a_game_with_neither_home_nor_winner_is_not_guessed(self):
        games, bad = P.playoff_games(GAMES, 1973)
        self.assertEqual(len(games), 6)           # game 5 of the first block names neither homeN nor wonN
        self.assertTrue(any("home side unknown" in b for b in bad))


class Fetch(unittest.TestCase):
    def test_titles(self):
        self.assertEqual(F.season_title("ahl", 1936), "1936–37 AHL season")
        self.assertEqual(F.season_title("ahl", 1999), "1999–00 AHL season")
        self.assertEqual(F.playoffs_title("ahl", 2018), "2019 Calder Cup playoffs")
        self.assertEqual(F.years("ahl")[0], 1936)
        self.assertEqual(F.years("ahl")[-1], 2025)

    def test_templates_and_sections(self):
        self.assertEqual(F.template_titles("{{2005–06 AHL West Division standings}} {{x}}"), ["2005–06 AHL West Division standings"])
        self.assertEqual(F.section_pages("{{#section:2019 Calder Cup playoffs|2019bracket}}"), ["2019 Calder Cup playoffs"])


if __name__ == "__main__":
    unittest.main()
