#!/usr/bin/env python3
"""Tests for the parts of parse.py and season.py that read the CFL's early seasons (1958-1987). No network, no database.
  python3 scripts/wikipedia/test_cfl_early.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse as P, season as S

SEASON_1965 = """==Grey Cup playoffs==
''Note: All dates in 1965''

===Conference Semi-Finals===
{| class="wikitable"
|+ '''Eastern Semi-Finals'''
! colspan="3" | [[Montreal Alouettes]] @ [[Ottawa Rough Riders]]
|-
! Date !! Away !! Home
|-
| November 6 || [[Montreal Alouettes]] 7 || '''[[Ottawa Rough Riders]] 36'''
|}

===Conference Finals===
{| class="wikitable"
|+ '''Western-Finals'''
! colspan="4" |[[Winnipeg Blue Bombers]] vs [[Calgary Stampeders]]
|-
!Game
! Date !! Away !! Home
|-
|1
| November 13 ||[[Winnipeg Blue Bombers]] 9 || '''[[Calgary Stampeders]] 27'''
|-
|2
|November 17
|[[Calgary Stampeders]] 11
|'''[[Winnipeg Blue Bombers]] 15'''
|}

==Playoff bracket==
"""

def t(ok, what):
    print(("ok   " if ok else "FAIL ") + what)
    return ok

def st(team, gp, w, l, tie=0): return dict(team=team, gp=gp, w=w, l=l, t=tie)

def view(team, opp, loc, result, mine, theirs, day):
    import datetime
    return dict(season=1975, team=team, opponent=opp, location=loc, result=result, team_pts=mine, opp_pts=theirs,
                game_date=datetime.date(1975, 8, day), week=None, overtime=False, src="x")

def main():
    ok = True
    g = P.playoff_table_games(SEASON_1965, 1965)
    ok &= t(len(g) == 3, f"1965 tables give 3 playoff games (got {len(g)})")
    first = next((x for x in g if str(x["game_date"]) == "1965-11-06"), None)
    ok &= t(bool(first) and first["home"] == "Ottawa Rough Riders" and first["home_pts"] == 36 and first["away_pts"] == 7, "Eastern semi-final: Ottawa at home, 36-7")
    ok &= t(any(x["home"] == "Calgary Stampeders" and x["home_pts"] == 27 for x in g), "Western final game 1 is at Calgary")
    # a club whose schedule matches its standings is complete; a game only it lists is trusted unless the opponent also is complete
    v = [view("A", "B", "home", "W", 10, 3, 1), view("A", "C", "away", "L", 3, 9, 8)]
    sts = [st("A", 2, 1, 1), st("B", 5, 2, 3)]
    comp = P.complete_schedules(v, sts)
    ok &= t(comp == {"a"}, "club A is complete (2 games, 1-1), B is not listed")
    merged = P.merge_views(v)
    good = P.trusted_singles(merged, comp, sts)
    ok &= t(len(good) == 2, "both single-page games of the complete club are trusted")
    ok &= t(len(P.trusted_singles(merged, {"a", "b"}, sts)) == 1, "the game a complete opponent does not list is not trusted")
    ok &= t(len(P.trusted_singles(merged, {"a"}, [st("A", 2, 1, 1), st("B", 5, 5, 0)])) == 1, "a game that gives a club more losses than published is dropped")
    ok &= t(S.redirect_target("#REDIRECT [[Edmonton Eskimos seasons (1970\u20131979)#1971]]") == "Edmonton Eskimos seasons (1970\u20131979)", "redirect to a multi-season page")
    ok &= t(S.redirect_target("{{Infobox NFL team season}}") is None, "an article is not a redirect")
    sys.exit(0 if ok else 1)

main()
