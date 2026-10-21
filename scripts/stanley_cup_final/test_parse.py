#!/usr/bin/env python3
"""Tests for parse.py on short samples in the articles' own wikitext shape. Run: python3 -I scripts/stanley_cup_final/test_parse.py"""
import datetime, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse as P  # noqa: E402

INFO = {"revid": 1, "fetched": "2026-10-20"}

# Infobox in the 1971 shape: the winner is team1 (bold), location1 is the other club's arena, a star after a score is an overtime period.
S1971 = """{{Infobox Stanley Cup Final
|year=1971
|team1='''[[1970–71 Montreal Canadiens season|Montreal Canadiens]]'''
|team2=[[1970–71 Chicago Black Hawks season|Chicago Black Hawks]]
|team1_1=1*
|team1_2=3
|team1_3='''4'''
|team1_tot=2
|team2_1='''2'''*
|team2_2='''5'''
|team2_3=2
|team2_tot=1
|dates=May 4–9, 1971
|location1=[[Chicago]]: [[Chicago Stadium]] (1, 2)
|location2=[[Montreal]]: [[Montreal Forum]] (3)
|mvp=[[Ken Dryden]] (Canadiens)
|series_winner=[[Henri Richard]] (2:34, third)
}}
{{NHLPlayoffs
|team1=Montreal Canadiens
|team2=Chicago Black Hawks
|stadium1=[[Chicago Stadium]]
|date1       =May 4
|score1      =1–2
|ot1         =2
|won1        =2
|recap1      =www.nhl.com/gamecenter/example
}}
{{NHLPlayoffs
|team1=Montreal Canadiens
|team2=Chicago Black Hawks
|date1       =May 4
|score1      =3–5
|won1        =2
}}
{{NHLPlayoffs
|team1=Chicago Black Hawks
|team2=Montreal Canadiens
|stadium1=[[Montreal Forum]]
|date1       =May 9
|score1      =2–4
|won1        =2
}}
"""

# Two games in one template of the 1930 shape (stadium1 and stadium2 are the clubs' arenas, not the games'), the venue from the infobox lines, a suburb arena.
S1983 = """{{Infobox Stanley Cup Final
|team1='''[[1982–83 New York Islanders season|New York Islanders]]'''
|team2=[[1982–83 Edmonton Oilers season|Edmonton Oilers]]
|team1_1='''2'''
|team2_1=0
|team1_2='''6'''***
|team2_2=3
|team1_tot=2
|team2_tot=0
|dates=May 10 – 12, 1983
|location1=[[Uniondale, New York|Uniondale]]: [[Nassau Veterans Memorial Coliseum]] (1–2)
|location2=[[Edmonton]]: [[Northlands Coliseum]] (3–4)
}}
{{NHLPlayoffs
|team1=Edmonton Oilers
|team2=New York Islanders
|date1=May 10
|score1=0–2
|won1=2
|date2=May 12
|score2=3–6
|won2=2
}}
"""


def check_1971():
    f, g, issues = P.parse_article(S1971, 1971, INFO)
    assert (f["team1"], f["team2"], f["winner"], f["team1_games"], f["team2_games"]) == ("Montreal Canadiens", "Chicago Black Hawks", "Montreal Canadiens", 2, 1)
    assert f["team1_article"] == "1970–71 Montreal Canadiens season"
    assert (f["conn_smythe"], f["conn_smythe_team"]) == ("Ken Dryden", "Canadiens")
    assert (f["cup_goal_by"], f["cup_goal_detail"]) == ("Henri Richard", "2:34, third")
    assert (f["first_day"], f["last_day"]) == (datetime.date(1971, 5, 4), datetime.date(1971, 5, 9))
    assert [x["team1_score"] for x in g] == [1, 3, 4] and [x["team2_score"] for x in g] == [2, 5, 2]
    assert g[0]["overtime_periods"] == 2                      # two stars in neither cell, one in each: the summary's ot1 = 2 wins
    assert g[0]["played_on"] == datetime.date(1971, 5, 4)
    assert g[1]["played_on"] is None                          # the same day as game 1: left empty
    assert any("game 2" in w and "not after game 1" in d for w, d in issues)
    assert g[2]["played_on"] == datetime.date(1971, 5, 9)
    assert [x["venue"] for x in g] == ["Chicago Stadium", "Chicago Stadium", "Montreal Forum"]
    assert [x["home_side"] for x in g] == [2, 2, 1]           # Chicago is team2, Montreal team1: the arena's city names the home club
    assert not any("recap" in str(x) for x in g)


def check_1983():
    f, g, issues = P.parse_article(S1983, 1983, INFO)
    assert [x["overtime_periods"] for x in g] == [0, 3]
    assert [x["home_side"] for x in g] == [1, 1]              # Uniondale is the Islanders' arena (an alias), not named in "New York Islanders"
    assert g[1]["venue"] == "Nassau Veterans Memorial Coliseum" and g[1]["city"] == "Uniondale"
    assert [x["played_on"] for x in g] == [datetime.date(1983, 5, 10), datetime.date(1983, 5, 12)]
    assert f["format"] is None and f["conn_smythe"] is None and not any(w.startswith("game") for w, d in issues)


def check_helpers():
    assert P.params("X |a=[[b|c]] |d={{e|f}} |g=h") == {"a": "[[b|c]]", "d": "{{e|f}}", "g": "h"}
    assert P.template_bodies("x {{NHLPlayoffs |a={{b}} }} y {{NHLPlayoffs |a=1}}", "NHLPlayoffs") == ["|a={{b}} ", "|a=1"]
    assert P.score_cell("'''4'''***") == (4, 3) and P.score_cell("2") == (2, 0) and P.score_cell(None) == (None, 0)
    assert P.parse_day("June 2 (Tuesday)", 2008) == datetime.date(2008, 6, 2)
    assert P.parse_day("April 29, 1971", 1971) == datetime.date(1971, 4, 29)
    assert P.parse_range("May 24 – June 4, 2008", 2008) == (datetime.date(2008, 5, 24), datetime.date(2008, 6, 4))
    assert P.parse_range("April 8–20, 1958", 1958) == (datetime.date(1958, 4, 8), datetime.date(1958, 4, 20))
    assert P.home_of("Sunrise", "Florida Panthers", "Edmonton Oilers") == 1
    assert P.home_of("Edmonton", "Florida Panthers", "Edmonton Oilers") == 2
    assert P.home_of("Vancouver", "Ottawa Senators", "Edmonton Eskimos") is None   # a neutral ground


if __name__ == "__main__":
    check_helpers()
    check_1971()
    check_1983()
    print("ok")
