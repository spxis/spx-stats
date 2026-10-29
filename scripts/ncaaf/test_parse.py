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

# the Playoff: the 2024 first round (a link "2024–25 College Football Playoff", named "CFP First Round"), a quarterfinal in {{nowrap}}, the rivalry trophy that is not a bowl
PLAYOFF = """{{CFB schedule
|{{CFB schedule entry
| date = {{tooltip|December 20, 2024|Friday}}
| w/l = w
| opponent = [[2024 Indiana Hoosiers football team|Indiana]]
| gamename = [[2024-25 College Football Playoff#Indiana at Notre Dame|CFP First Round]], ''College GameDay''
| score = 27–17
}}
|{{CFB schedule entry
| date = December 21
| w/l = w
| opponent = [[2024 Tennessee Volunteers football team|Tennessee]]
| gamename = {{nowrap|[[2024–25 College Football Playoff|CFP First Round]]}}
| score = 42–17
}}
|{{CFB schedule entry
| date = January 2, 2025
| w/l = l
| neutral = y
| opponent = [[2024 Notre Dame Fighting Irish football team|Notre Dame]]
| gamename = {{nowrap|[[2025 Sugar Bowl|Sugar Bowl–CFP Quarterfinal]]}}
| score = 10–23
}}
|{{CFB schedule entry
| date = December 19, 2020
| w/l = l
| away = y
| opponent = [[2020 LSU Tigers football team|LSU]]
| gamename = [[Magnolia Bowl]]
| score = 48–53
}}
|{{CFB schedule entry
| date = December 31, 2002
| w/l = w
| neutral = y
| opponent = [[2002 Georgia Tech Yellow Jackets football team|Georgia Tech]]
| gamename = [[2002 Silicon Valley Football Classic|Silicon Valley Football Classic]]
| score = 30–21
}}
}}"""
_, pv, pbad = P.parse_team(PLAYOFF, 2024, "2024 Georgia Bulldogs football team")
eq("playoff entries read", (len(pv), pbad), (5, []))
eq("2024 first round, Notre Dame at home: playoffs", (pv[0]["phase"], pv[0]["gamename"]), ("playoffs", "College Football Playoff (CFP First Round)"))
eq("2024 first round, a nowrap name: playoffs", (pv[1]["phase"], pv[1]["gamename"]), ("playoffs", "College Football Playoff (CFP First Round)"))
eq("Sugar Bowl, a CFP quarterfinal in nowrap, carries its round", (pv[2]["phase"], pv[2]["gamename"]), ("playoffs", "Sugar Bowl (CFP Quarterfinal)"))
eq("the Magnolia Bowl is a rivalry, regular season", pv[3]["phase"], "regular")
eq("a Classic in late December is a bowl", (pv[4]["phase"], pv[4]["gamename"]), ("playoffs", "Silicon Valley Football Classic"))
eq("nowrap keeps the whole link", P.clean("{{nowrap|[[2025 Sugar Bowl|Sugar Bowl–CFP Quarterfinal]]}}"), "Sugar Bowl–CFP Quarterfinal")
eq("ndash template in a score", P.parse_score("27{{ndash}}34"), (27, 34, False))

# a merged game keeps the round of the view that tags it, and one written twice with dates apart is one game
sg = P.Season(2024, [{"team_title": "2024 Georgia Bulldogs football team", "team_text": "Georgia"}, {"team_title": "2024 Notre Dame Fighting Irish football team", "team_text": "Notre Dame"}])
nd = dict(pv[2], opp_title="2024 Georgia Bulldogs football team", opp_text="Georgia", pts=23, opp_pts=10, wl="w", gamename="Sugar Bowl")
ga, _ = P.pair(sg, {"Georgia Bulldogs": [pv[2]], "Notre Dame Fighting Irish": [nd]})
eq("Sugar Bowl keeps its CFP quarterfinal tag when the other article lacks it", [(g["phase"], g["round"], g["views"]) for g in ga], [("playoffs", "Sugar Bowl (CFP Quarterfinal)", 2)])
def one(me, opp, d, pts, opp_pts, loc):
    return {"date": d, "opp_title": f"2005 {opp} football team", "opp_text": opp, "opp_link": None, "pts": pts, "opp_pts": opp_pts, "wl": "w" if pts > opp_pts else "l", "ot": False,
            "loc": loc, "gamename_raw": "", "gamename": None, "stadium": None, "attend": None, "nonconf": False, "vacated": False, "phase": "regular"}
s5 = P.Season(2005, [{"team_title": "2005 Alabama Crimson Tide football team", "team_text": "Alabama"}, {"team_title": "2005 Utah State Aggies football team", "team_text": "Utah State"}])
dd, _ = P.pair(s5, {"Alabama Crimson Tide": [one("a", "Utah State Aggies", D(2005, 10, 29), 35, 3, "home")], "Utah State Aggies": [one("u", "Alabama Crimson Tide", D(2005, 9, 15), 3, 35, "away")]})
eq("one game told twice with dates six weeks apart is one game, on the home side's date", [(g["date"], g["views"]) for g in dd], [(D(2005, 10, 29), 2)])
yy, _ = P.pair(s5, {"Alabama Crimson Tide": [one("a", "Utah State Aggies", D(2005, 10, 29), 35, 3, "home")], "Utah State Aggies": [one("u", "Alabama Crimson Tide", D(2006, 10, 29), 3, 35, "away")]})
eq("a year typo keeps the date inside the season", [g["date"] for g in yy], [D(2005, 10, 29)])
two, _ = P.pair(s5, {"Alabama Crimson Tide": [one("a", "Utah State Aggies", D(2005, 10, 29), 35, 3, "home")],
                     "Utah State Aggies": [one("u", "Alabama Crimson Tide", D(2005, 9, 15), 3, 30, "away")]})
eq("two different scores weeks apart stay two games", len(two), 2)

# the compact layout: the game's name in the opponent's cell, a {{cfb link}} opponent, "No. 15 (FCS)" in a cell before the opponent, lower case result, {{ndash}}
COMPACT = """{{CFB schedule
| September 2 | 12:00 p.m. | | {{cfb link|year=2021|team=Eastern Kentucky Colonels|title=Eastern Kentucky}} | [[Kelly/Shorts Stadium]] | Mount Pleasant, MI | [[ESPN+]] | W 42-28 | 18,613
| September 10 | 6:00 p.m. | No. 15 <small>([[2021 NCAA Division I FCS football rankings|FCS]])</small> | [[2021 Holy Cross Crusaders football team|Holy Cross]]<ncg> | [[University at Buffalo Stadium]] | Amherst, NY | ESPN+ | w 24–10 | 15,000
| October 22 | 1:00 p.m. | at | [[2021 Buffalo Bulls football team|Buffalo]] | [[University at Buffalo Stadium]] | Amherst, NY | ESPN+ |L 27{{ndash}}34 |14,190
| December 4 | 12:00 p.m. | vs. | Northern Illinois ([[2021 MAC Championship Game|MAC Championship Game]]) | [[Ford Field]] | Detroit, MI | ESPN | L 23–41 | 10,317
| December 18 | 5:45 p.m. | vs. | [[2021 Liberty Flames football team|Liberty]] ([[2021 LendingTree Bowl|LendingTree Bowl]]) | [[Hancock Whitney Stadium]] | Mobile, AL | ESPN | L 20–56 | 15,186
}}"""
_, cv, cbad = P.parse_team(COMPACT, 2021, "2021 Kent State Golden Flashes football team")
eq("compact rows read", (len(cv), cbad), (5, []))
eq("a cfb link opponent is the opponent, not the stadium", (cv[0]["opp_text"], cv[0]["pts"], cv[0]["opp_pts"]), ("Eastern Kentucky", 42, 28))
eq("an FCS rank cell before the opponent is skipped; lower case w", (cv[1]["opp_text"], cv[1]["pts"], cv[1]["opp_pts"], cv[1]["wl"]), ("Holy Cross", 24, 10, "w"))
eq("ndash template in a compact result", (cv[2]["opp_text"], cv[2]["pts"], cv[2]["opp_pts"]), ("Buffalo", 27, 34))
eq("the game's name in the opponent cell is not the opponent", (cv[3]["opp_text"], cv[3]["gamename"], cv[3]["phase"]), ("Northern Illinois", "MAC Championship Game", "regular"))
eq("a bowl named in the opponent cell", (cv[4]["opp_text"], cv[4]["gamename"], cv[4]["phase"]), ("Liberty", "LendingTree Bowl", "playoffs"))
# a team whose article has a compact schedule and the bowl as an entry reads both
MIXED = """{{CFB schedule
| September 2 | 12:00 p.m. | | [[2023 LIU Sharks football team|LIU]]<ncg> | [[Peden Stadium]] | Athens, OH | ESPN+ | W 27–10 | 18,453
|{{CFB schedule entry
| date = December 16
| w/l = w
| opponent = [[2023 Georgia Southern Eagles football team|Georgia Southern]]
| gamename = [[2023 Arizona Bowl|Arizona Bowl]]
| score = 41–21
}}
}}"""
_, mv, _ = P.parse_team(MIXED, 2023, "2023 Ohio Bobcats football team")
eq("an entry and the compact rows of one article are both read", sorted((v["date"], v["opp_text"]) for v in mv), [(D(2023, 9, 2), "LIU"), (D(2023, 12, 16), "Georgia Southern")])
# an opponent cell with an FCS tag in front of the link; the opponent in the ranking cell
eq("FCS tag before the opponent's link", P.opponent_of("([[Football Championship Subdivision|FCS]]) [[2009 Furman Paladins football team|Furman]]", 2009), ("2009 Furman Paladins football team", "Furman"))
SHIFT = """{{CFB schedule entry
| date = September 3
| w/l = w
| rank = 13
| opprank = 8 <small>([[Football Championship Subdivision|FCS]])</small> [[2016 South Dakota State Jackrabbits football team|South Dakota State]]
| score = 59—41
}}"""
_, sv, sbad = P.parse_team(SHIFT, 2016, "2016 TCU Horned Frogs football team")
eq("an opponent written in the ranking cell", ([(v["opp_text"], v["pts"], v["opp_pts"]) for v in sv], sbad), ([("South Dakota State", 59, 41)], []))
# standings with a blank cell before the conference record, and with blanks for the independents' conference record
BLANK1 = """{{CFB standings start|2014 Big 12 Conference football standings|Big 12 Conference}}
{{CFB standings entry|{{abbr|No.|Number}} 3 [[2014 TCU Horned Frogs football team|TCU]]||8|1|12|1}}
{{CFB standings end}}"""
BLANK2 = """{{CFB standings start|2019 NCAA Division I FBS independents football records|NCAA Division I FBS independent schools}}
{{CFB standings entry|[[2019 New Mexico State Aggies football team|New Mexico State]]||||2|10}}
{{CFB standings end}}"""
b1 = P.parse_standings(BLANK1, 2014, "Template:2014 Big 12 Conference football standings")
b2 = P.parse_standings(BLANK2, 2019, "Template:2019 NCAA Division I FBS independents football records")
eq("blank cell before the conference record", [(r["cw"], r["cl"], r["w"], r["l"]) for r in b1], [(8, 1, 12, 1)])
eq("independent with four blank cells", [(r["team_text"], r["cw"], r["w"], r["l"]) for r in b2], [("New Mexico State", None, 2, 10)])

if fails:
    print("\n".join("FAIL " + f for f in fails)); sys.exit(1)
print("ok: ncaaf parse tests")
