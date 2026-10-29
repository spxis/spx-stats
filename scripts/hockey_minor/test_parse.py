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


# ---------------------------------------------------------------------------------------------------------------- the ECHL's shapes
LINKED_HEAD = """== Standings ==<!-- note to editors -->
;Eastern Conference
{| class="wikitable sortable" style="text-align:center"
|-
!  style="width:30%;" class="unsortable"| North Division
!  style="width:5%;"| {{abbr|GP|Games played}}
!  style="width:5%;"| {{abbr|W|Wins}}
!  style="width:5%;"| {{abbr|L|Losses}}
!  style="width:5%;"| {{abbr|[[Overtime (ice hockey)|OTL]]|Overtime losses}}
!  style="width:5%;"| {{abbr|[[Overtime (ice hockey)|SOL]]|Shootout loss}}
!  style="width:5%;"| {{abbr|GF|Goals for}}
!  style="width:5%;"| {{abbr|GA|Goals against}}
!  style="width:5%;"| {{abbr|[[Ice hockey#Periods and overtime|PTS]]|Points}}
|- bgcolor=#ffeeaa
|align=left| '''y''' – [[Newfoundland Growlers]] ([[Toronto Maple Leafs|TOR]]) ||72||43||21||4||4||258||207||'''94'''
|- bgcolor=
|align=left| [[Reading Royals]] ([[Philadelphia Flyers|PHI]]/[[Toronto Maple Leafs|TOR]])||72||34||28||4||6||229||229||'''78'''
|-
|align=left| [[Maine Mariners (ECHL)|Maine Mariners]] (independent)||72||37||32||2||1||221||247||'''77'''
|}
"""

NESTED = """== Regular season ==
=== Standings ===
==== By division ====
'''Eastern Conference'''<br>
{| border="0" cellspacing="0" cellpadding="0"
|-
| colspan="2" |
{| class="wikitable sortable"
|+ Atlantic Division
! style="width 5em;" |
! style="width:20em;" class="unsortable" |
! {{abbr|GP|Games played}}
! {{abbr|W|Wins}}
! {{abbr|L|Losses}}
! {{abbr|OTL|Overtime losses}}
! {{abbr|SOL|Shootout losses}}
! {{abbr|GF|Goals for}}
! {{abbr|GA|Goals against}}
! {{abbr|Pts|Points}}

|- style="text-align: center;"
|| 1
| align=left|[[Elmira Jackals]] ([[Anaheim Ducks|ANA]]/[[Ottawa Senators|OTT]]) || 72 || 45 || 22 || 2 || 3 || 228 || 204 || '''95'''

|- style="text-align: center;"
|| 2
| align=left|[[Wheeling Nailers]] ([[Montreal Canadiens|MTL]]) || 72 || 37 || 26 || 4 || 5 || 219 || 202 || '''83'''
|}
|}
==== By conference ====
{| class="wikitable"
! Eastern Conference
! GP !! W !! L !! OTL !! SOL !! GF !! GA !! PTS
|-
| [[Elmira Jackals]] || 72 || 45 || 22 || 2 || 3 || 228 || 204 || 95
|}
"""

TABLES = """===Kelly Cup finals===
{| cellspacing="10"
| valign="top" |
{| class="wikitable"
! bgcolor="#DDDDDD" colspan="4" | Kelly Cup Finals (1) Atlantic City vs. (2) Columbia
|-
! Date !! Away !! Home
|-
| May 7 || align="right" | '''Atlantic City 1''' || Columbia 0
|-
| May 9 || align="right" | Columbia 2 || '''3 Atlantic City''' || OT
|- align="center"
| colspan="4" | '''''Atlantic City wins series and [[Kelly Cup]] 2&ndash;0'''''
|}
|}
"""

BLOCKS = """== First round ==
=== American Conference quarterfinals ===
==== (1) Charlotte Checkers vs. (8) Toledo Walleye ====
{{NHLPlayoffs
|team1= Charlotte Checkers
|team2= Toledo Walleye
|date1= April 2
|home1= 1
|score1= 3 &ndash; 1
|won1= 1
|date2= April 3
|home2= 2
|score2= 2 &ndash; 4
|won2= 1
|series= Charlotte wins series 3 &ndash; 1}}
== Conference Finals ==
=== American Conference ===
==== (1) Charlotte Checkers vs. (2) Reading Royals ====
{{NHLPlayoffs
|team1= Charlotte Checkers
|team2= Reading Royals
|series= Reading wins series 4-3}}
"""


class Echl(unittest.TestCase):
    def test_header_cells_with_links_and_a_comment_after_the_heading(self):
        rows, bad = P.parse_standings(P.strip_comments(LINKED_HEAD), v2=True)
        self.assertEqual([r["team"] for r in rows], ["Newfoundland Growlers", "Reading Royals", "Maine Mariners"])
        self.assertEqual((rows[0]["otl"], rows[0]["sol"], rows[0]["pts"], rows[0]["gf"]), (4, 4, 94, 258))
        self.assertEqual(rows[0]["conference"], "Eastern Conference")        # a ';Eastern Conference' line, not a heading
        self.assertEqual(rows[0]["division"], "North Division")
        self.assertEqual([(r["affiliation"], r["affiliation_links"]) for r in rows],
                         [("TOR", "Toronto Maple Leafs"), ("PHI/TOR", "Philadelphia Flyers/Toronto Maple Leafs"), ("independent", None)])

    def test_a_table_in_a_table_with_a_rank_column_and_a_conference_table_left_out(self):
        rows, bad = P.parse_standings(NESTED, v2=True)
        self.assertEqual([(r["team"], r["division"], r["conference"], r["gp"], r["pts"]) for r in rows],
                         [("Elmira Jackals", "Atlantic Division", "Eastern Conference", 72, 95), ("Wheeling Nailers", "Atlantic Division", "Eastern Conference", 72, 83)])
        self.assertEqual(rows[0]["affiliation_links"], "Anaheim Ducks/Ottawa Senators")

    def test_footnote_marks_and_ind_are_not_affiliations(self):
        self.assertEqual(P.affiliation_of("[[Columbia Inferno]] (z)"), (None, None))
        self.assertEqual(P.affiliation_of("[[Utah Grizzlies]] (Ind.)"), ("independent", None))
        self.assertEqual(P.affiliation_of("[[Rapid City Rush]] ({{abbr|Ind.|Independent}})"), ("independent", None))
        self.assertEqual(P.affiliation_of("[[Toledo Storm]] ([[Detroit Red Wings|DET]]/[[San Jose Sharks|SJS)]]"), ("DET/SJS", "Detroit Red Wings/San Jose Sharks"))

    def test_game_tables_give_games_and_series_with_the_round_in_the_title(self):
        series, games, bad = P.table_games(TABLES, 2002)
        self.assertEqual(bad, [])
        self.assertEqual([(s["round"], s["team1"], s["team2"], s["wins1"], s["wins2"]) for s in series], [("Kelly Cup Finals", "Atlantic City", "Columbia", 2, 0)])
        self.assertEqual([(g["date"], g["home"], g["away"], g["home_pts"], g["away_pts"], g["overtime"]) for g in games],
                         [(datetime.date(2003, 5, 7), "Columbia", "Atlantic City", 0, 1, False), (datetime.date(2003, 5, 9), "Atlantic City", "Columbia", 3, 2, True)])

    def test_game_blocks_give_a_series_under_its_round(self):
        series, bad = P.block_series(BLOCKS)
        self.assertEqual(bad, [])
        self.assertEqual([(s["round"], s["group"], s["wins1"], s["wins2"]) for s in series], [("American Conference quarterfinals", "First round", 3, 1), ("Conference Finals", "Conference Finals", 3, 4)])

    def test_rounds_are_tidied_and_staged(self):
        self.assertEqual(P.tidy_round("Divisional Semifinals <br/> April 2–8"), "Division Semifinals")
        self.assertEqual(P.tidy_round("Conference Quarterfinals (Best of 5)"), "Conference Quarterfinals")
        self.assertEqual(P.tidy_round("Kelley Cup Finals"), "Kelly Cup Finals")
        self.assertEqual([P.round_stage(x) for x in ("Division Wild Card", "Conference First Round", "Conference Quarterfinals", "Division Semifinals", "Division Finals", "Conference Finals", "Kelly Cup Finals", "Riley Cup Final", "Riley Cup")], [0, 1, 2, 3, 4, 5, 6, 6, 6])
        self.assertIsNone(P.round_stage("Playoffs"))

    def test_a_bracket_template_is_read_from_its_own_page(self):
        tpl = {"2013 Kelly Cup Playoffs": "<noinclude>doc</noinclude>{{4TeamBracket | RD1=Semis | RD1-team01=A | RD1-score01=4 | RD1-team02=B | RD1-score02=1}}"}
        out = P.expand_named("==Bracket==\n{{2013 Kelly Cup Playoffs}}\n", tpl)
        self.assertIn("4TeamBracket", out)
        self.assertNotIn("doc", out)
        self.assertEqual(P.bracket_series(out)[0], [("Semis", "A", None, 4, "B", None, 1)])

    def test_the_list_of_seasons_names_the_champion(self):
        lst = """{| class="wikitable"
|-
! No. !! Season !! Teams !! Games !! Start !! Finish !! Top !! Champion
|-
|1
|[[1988–89 ECHL season|1988–89]]
|5
|60
|
|April 12
|[[Erie Panthers]] <small>(37–20–3)</small>
|[[Carolina Thunderbirds]]
|}"""
        self.assertEqual(P.listed_champions(lst), {1988: ("Carolina Thunderbirds", "Carolina Thunderbirds")})

    def test_fetch_titles_and_templates(self):
        self.assertEqual(F.season_title("echl", 1988), "1988–89 ECHL season")
        self.assertEqual(F.playoffs_title("echl", 2018), "2019 Kelly Cup playoffs")
        self.assertEqual((F.years("echl")[0], F.years("echl")[-1]), (1988, 2025))
        self.assertEqual(F.bracket_templates("{{2013 Kelly Cup Playoffs}} {{2005 Riley Cup playoffs}} {{x}}"), ["2005 Riley Cup playoffs", "2013 Kelly Cup Playoffs"])


if __name__ == "__main__":
    unittest.main()
