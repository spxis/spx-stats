#!/usr/bin/env python3
"""Offline tests for scripts/ncaaf/parse.py, with short samples written in the articles' own wikitext shape.  python3 -I scripts/ncaaf/test_parse.py"""
import datetime, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse as P

D = datetime.date
fails = []
def eq(name, got, want):
    if got != want: fails.append(f"{name}: got {got!r}, want {want!r}")

STANDINGS = """{{CFB standings start|2005 Big 12 Conference football standings|Big 12 Conference football}}
{{CFB standings entry|division-name=North Division}}
{{CFB standings entry|[[2005 Colorado Buffaloes football team|Colorado]] | div-champ=yes |5|3|7|6}}
{{CFB standings entry|{{abbr|No.|Number}} 24 [[2005 Nebraska Cornhuskers football team|Nebraska]]|4|4|8|4}}
{{CFB standings entry|division-name=South Division}}
{{CFB standings entry|{{abbr|No.|Number}} 1 [[2005 Texas Longhorns football team|Texas]]|natl-champ=yes |div-champ=yes | conf-champ=yes |8|0|13|0}}
{{CFB standings end|conf-title-game=[[Big 12 Football Championship Game|Championship]]: [[2005 Big 12 Championship Game|'''Texas 70''', Colorado 3]]|BCS-champ=yes}}"""
MAC = """{{CFB standings start|2000 Mid-American Conference football standings|Mid-American Conference|div-standings=yes}}
{{CFB standings entry |division-name=East Division|div-standings=yes}}
{{CFB standings entry | [[2000 Marshall Thundering Herd football team|Marshall]] |div-standings=yes|conf-champ=yes|5|1|5|3|8|5}}
{{CFB standings end}}"""
IND = """{{CFB Standings Start|2000 NCAA Division I-A independents football records|NCAA Division I FBS independent schools}}
{{CFB Standings Entry |{{abbr|No.|Number}} 15 [[2000 Notre Dame Fighting Irish football team|Notre Dame]] |BCS-at-large=yes| | |9|3}}
{{CFB Standings End |BCS-at-large=yes}}"""
rows = P.parse_standings(STANDINGS, 2005, "Template:2005 Big 12 Conference football standings")
eq("standings count", len(rows), 3)
eq("standing team", (rows[0]["team_title"], rows[0]["team_text"], rows[0]["division"], rows[0]["conference"]), ("2005 Colorado Buffaloes football team", "Colorado", "North Division", "Big 12 Conference"))
eq("standing records", (rows[0]["cw"], rows[0]["cl"], rows[0]["w"], rows[0]["l"], rows[0]["div_champ"]), (5, 3, 7, 6, True))
eq("rank prefix dropped", (rows[1]["team_text"], rows[1]["rank"]), ("Nebraska", 2))
eq("flags", (rows[2]["natl_champ"], rows[2]["conf_champ"], rows[2]["division"], rows[2]["rank"]), (True, True, "South Division", 1))
mac = P.parse_standings(MAC, 2000, "Template:2000 Mid-American Conference football standings")
eq("division standings order", (mac[0]["dw"], mac[0]["dl"], mac[0]["cw"], mac[0]["cl"], mac[0]["w"], mac[0]["l"]), (5, 1, 5, 3, 8, 5))
ind = P.parse_standings(IND, 2000, "Template:2000 NCAA Division I-A independents football records")
eq("independents", (ind[0]["conference"], ind[0]["cw"], ind[0]["w"], ind[0]["l"]), ("Independents", None, 9, 3))
eq("conference name", P.conf_of_template("Template:2019 Big 12 Conference football standings"), "Big 12 Conference")

TEAM = """{{Infobox college sports team season
|year=2005
|team=Texas Longhorns
|conference=Big 12 Conference
|division=South
|record=13–0
|bowl=[[2006 Rose Bowl|Rose Bowl]] ([[BCS National Championship Game|BCS NCG]])
|bowl_result= W 41–38 vs. [[2005 USC Trojans football team|USC]]
}}
{{CFB schedule
| rankyear = 2005

|{{CFB schedule entry
| date = September 3
| w/l = w
| opponent = [[2005 Louisiana–Lafayette Ragin' Cajuns football team|Louisiana–Lafayette]]
| score = 60–3
| attend = 82,519<ref name="s">{{cite web|url=http://www.espn.com/x|title=t}}</ref>
}}
|{{CFB schedule entry
| date = {{tooltip|September 10|Saturday}}
| w/l = l
| away = y
| opponent = [[2005 Ohio State Buckeyes football team|Ohio State]]
| score = {{URL|1=http://scores.espn.go.com/ncf/recap?gameId=1|2=22–25}}
}}
|{{CFB schedule entry
| date = September 17
| w/l = v
| opponent = {{cfb link|year=2005|team=Southern Utah Thunderbirds|title=Southern Utah}}
| score = 30–14
}}
|{{CFB schedule entry
| date = October 1
| w/l = Cancelled
| opponent = Rice
}}
|{{CFB schedule entry
| date = December 3
| w/l = w
| neutral = y
| opponent = Colorado
| gamename = [[2005 Big 12 Championship Game|Big 12 Championship Game]]
| score = 70–3
}}
|{{CFB schedule entry
| date = January 4, 2006
| w/l = w
| neutral = y
| opponent = [[2005 USC Trojans football team|USC]]
| gamename = [[2006 Rose Bowl|Rose Bowl]] - [[BCS National Championship Game]]
| score = 41–38
}}
|{{CFB schedule entry
| date = November 12
| w/l = w
| opponent = Kansas
| gamename = [[Iron Bowl]]
| score = 28–27 OT
}}
}}"""
info, views, bad = P.parse_team(TEAM, 2005, "2005 Texas Longhorns football team")
eq("infobox", (info["team"], info["conference"], info["record"]), ("Texas Longhorns", "Big 12 Conference", "13–0"))
eq("entries read", len(views), 6)
eq("first view", (views[0]["date"], views[0]["pts"], views[0]["opp_pts"], views[0]["loc"], views[0]["attend"], views[0]["opp_title"]),
   (D(2005, 9, 3), 60, 3, "home", 82519, "2005 Louisiana–Lafayette Ragin' Cajuns football team"))
eq("link in a score dropped, loss oriented by w/l", (views[1]["date"], views[1]["pts"], views[1]["opp_pts"], views[1]["loc"]), (D(2005, 9, 10), 22, 25, "away"))
eq("cfb link template", (views[2]["opp_title"], views[2]["opp_text"], views[2]["vacated"]), ("2005 Southern Utah Thunderbirds football team", "Southern Utah", True))
eq("cancelled is not a game", [v["date"] for v in views if v["opp_text"] == "Rice"], [])
eq("conference championship game is regular season", (views[3]["phase"], views[3]["loc"]), ("regular", "neutral"))
eq("bowl is playoffs, dated in the next year", (views[4]["date"], views[4]["phase"]), (D(2006, 1, 4), "playoffs"))
eq("rivalry named Bowl is regular", (views[5]["phase"], views[5]["ot"]), ("regular", True))
eq("nothing unparsed", bad, [])
for v in views: eq("no address kept", "http" in repr(v), False)

# pairing and conflict
season = P.Season(2005, [{"team_title": "2005 Texas Longhorns football team", "team_text": "Texas"}, {"team_title": "2005 Ohio State Buckeyes football team", "team_text": "Ohio State"},
                         {"team_title": "2005 Colorado Buffaloes football team", "team_text": "Colorado"}])
vt = [dict(views[1]), dict(views[4], opp_title=None, opp_text="Colorado")]
vo = [{"date": D(2005, 9, 11), "opp_title": "2005 Texas Longhorns football team", "opp_text": "Texas", "opp_link": None, "pts": 22, "opp_pts": 25, "wl": "l", "ot": False,
       "loc": "home", "gamename_raw": "", "gamename": None, "stadium": "Ohio Stadium", "attend": 105565, "nonconf": False, "vacated": False, "phase": "regular"}]
games, notes = P.pair(season, {"Texas Longhorns": vt[:1], "Ohio State Buckeyes": vo})
eq("one merged game", len(games), 1)
g = games[0]
eq("merged", (g["home"], g["away"], g["home_pts"], g["away_pts"], g["views"], g["neutral"], g["venue"]), ("Ohio State Buckeyes", "Texas Longhorns", 22, 25, 2, False, "Ohio Stadium"))
eq("date conflict noted", "dates" in (g["conflict"] or ""), True)
eq("outside opponent stands on one view", (lambda gg: (gg[0]["inside"], gg[0]["outside_team"], gg[0]["views"]))(P.pair(season, {"Texas Longhorns": [views[2]]})[0]), (False, "Southern Utah Thunderbirds", 1))
nt, _ = P.pair(season, {"Texas Longhorns": [vt[1]], "Colorado Buffaloes": [dict(vt[1], opp_title="2005 Texas Longhorns football team", opp_text="Texas", pts=3, opp_pts=70, wl="l")]})
eq("neutral game lists teams in name order", (nt[0]["away"], nt[0]["home"], nt[0]["neutral"]), ("Colorado Buffaloes", "Texas Longhorns", True))
eq("name of a title", P.team_name_of_title("2005 Louisiana–Lafayette Ragin' Cajuns football team"), "Louisiana–Lafayette Ragin' Cajuns")
eq("flat", P.flat("San José State"), "sanjosestate")
eq("score", P.parse_score("[[2005 Texas vs. Ohio State football game|25–22]]"), (25, 22, False))
eq("date, no year, before August", P.parse_date("January 2", 2005), D(2006, 1, 2))

if fails:
    print("\n".join("FAIL " + f for f in fails)); sys.exit(1)
print("ok: ncaaf parse tests")
