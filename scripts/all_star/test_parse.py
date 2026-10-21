#!/usr/bin/env python3
"""Tests for the All-Star Game readers on short samples in the articles' own wikitext shape. Run: python3 -I scripts/all_star/test_parse.py"""
import datetime, os, sys, tempfile, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import game  # noqa: E402
import lists  # noqa: E402
import parse as P  # noqa: E402
import wiki  # noqa: E402

TODAY = datetime.date(2026, 10, 20)

NHL = """==Results==
{| class="wikitable sortable"
|+
! Game (Year) !! scope="col" class=unsortable | Result !! Host team !! Host arena !! Host city !! scope="col" class=unsortable | Game MVP, Team
|-
| [[1st National Hockey League All-Star Game|1st]] (1947) || '''All–Stars''' 4 – Maple Leafs 3 || [[Toronto Maple Leafs]]{{efn|name=SCHost|By design the champions hosted.}} || [[Maple Leaf Gardens]] || [[Toronto, Ontario]] || {{n/a|Not yet awarded}}
|-
| [[16th National Hockey League All-Star Game|16th]] (1962) || '''Maple Leafs''' 4 – All–Stars 1 || Toronto Maple Leafs (4){{efn|name=SCHost}} || Maple Leaf Gardens (4) || Toronto, Ontario (4) || [[Eddie Shack]], [[Toronto Maple Leafs]]
|-
| (1966) || colspan="5" style="text-align:center;"|No game was held in calendar 1966 as the event was shifted from the 1966 to the 1967 portion of the season.
|-
| [[1986 National Hockey League All-Star Game|1986]] || '''Wales''' 4 – Campbell 3 (OT) || [[Hartford Whalers]] || [[Hartford Civic Center]] || [[Hartford, Connecticut]] || [[Grant Fuhr]], [[Edmonton Oilers]]
|-
| (1995) || colspan="5" style="text-align:center;"|'''Game canceled''' due to the [[1994–95 NHL lockout]].<br>Game was originally set to play at the [[San Jose Arena]].
|-
| [[2024 National Hockey League All-Star Game|2024]] || '''Team McDavid''' 4 – Team MacKinnon 3<br>'''Team Matthews''' 6 – Team Hughes 5<br>'''Team Matthews''' 7 – Team McDavid 4 || Toronto Maple Leafs (9) || [[Scotiabank Arena]] (2) || Toronto, Ontario (9) || [[Auston Matthews]], Toronto Maple Leafs
|-
| [[2027 National Hockey League All-Star Game|2027]] || TBD || New York Islanders (2) || [[UBS Arena]] || [[Elmont, New York]] || TBD
|}
"""

NBA = """==All-Star Game results==
{| class="wikitable mw-datatable sortable"
! Year
! Result
! Host arena
! Host city
! [[NBA All-Star Game Most Valuable Player Award|Game MVP]]
|-
| [[1954 NBA All-Star Game|1954]] || style="background:#d0e7ff;"|'''East 98''' – 93 West<br>{{small|(Overtime)}} || [[Madison Square Garden (1925)|Madison Square Garden III]]** || [[New York City, NY]] || [[Bob Cousy]]<br>{{small|[[Boston Celtics]]}}
|-
| [[1959 NBA All-Star Game|1959]] || '''West 124''' – 108 East || [[Detroit Olympia|Olympia Stadium]] || [[Detroit, MI]] || [[Elgin Baylor]]<br>{{small|[[Minneapolis Lakers]]}}<hr>[[Bob Pettit]] (3)<br>{{small|[[St. Louis Hawks]]}}
|-
| [[1981 NBA All-Star Game|1981]] || '''East 123''' – 120 West || [[Richfield Coliseum|Coliseum at Richfield]] || [[Richfield, OH]] || [[Nate Archibald]]<br>{{small|[[Boston Celtics]]}}
|-
| [[1982 NBA All-Star Game|1982]] || '''East 120''' – 118 West || [[Meadowlands Arena|Brendan Byrne Arena]] || [[East Rutherford, NJ]] || [[Larry Bird]],<br>{{small|[[Boston Celtics]]}}
|-
| [[2025 NBA All-Star Game|2025]] || {{small|Semifinal 1}}<br>'''Chuck's Global Stars 41''' – 32 Kenny's Young Stars<hr>{{small|Championship}}<br>'''Shaq's OGs 41''' – 25 Chuck's Global Stars || [[Chase Center]]<ref>{{Cite web|title=x|url=https://example.com}}</ref> || [[San Francisco, CA]] || [[Stephen Curry]] (2)<br>{{small|[[Golden State Warriors]]}}
|-
| [[2027 NBA All-Star Game|2027]] || United States vs. Rest of the World || [[Mortgage Matchup Center]] (3) || [[Phoenix, AZ]] (4) ||
|}
"""

MLB = """==Game results==
{| class="wikitable sortable" style="text-align:center"
! Date
! Winning League (All-Time Record)
! Score
! Venue
! Host Team
! Attendance
! MVP
! Winning pitcher
! Losing pitcher
|-
|[[1933 Major League Baseball All-Star Game|July 6, 1933]]
|bgcolor=#ffcccc|[[American League|American]]<br /><small>(1–0–0 AL)</small>
|4–2
|[[Comiskey Park]]
|[[Chicago White Sox]]
|47,595
|
|[[Lefty Gomez]], [[New York Yankees|New York]] (AL)
|[[Bill Hallahan]], [[St. Louis Cardinals|St. Louis]] (NL)
|-
|[[1945 Major League Baseball All-Star Game|July 10, 1945]]
|colspan="8" align="center"|'''Game canceled''' due to [[World War II]]-related travel restrictions.
|-
|[[1961 Major League Baseball All-Star Game (second game)|July 31, 1961]]
|bgcolor="#E0D0F0"|TIE<br /><small>(16–14–1 AL)</small>
|1–1
|[[Fenway Park]]
|[[Boston Red Sox]]
|31,851
|N/A
|colspan=3|N/A
|-
|[[1962 Major League Baseball All-Star Game (first game)|July 10, 1962]]
|bgcolor=#D0E7FF|[[National League (baseball)|National]]<br /><small>(18–17–1 AL)</small>
|3–1
|[[D.C. Stadium]]
|[[Washington Senators (1961–1971)|Washington Senators]]
|45,480
|[[Maury Wills]], [[Los Angeles Dodgers|Los Angeles]] (NL)
|x
|y
|-
|[[1962 Major League Baseball All-Star Game (second game)|July 30, 1962]]
|bgcolor=#ffcccc|[[American League|American]]<br /><small>(19–17–1 AL)</small>
|9–4
|[[Wrigley Field]]
|[[Chicago Cubs]]
|38,359
|[[Leon Wagner]], [[Los Angeles Angels|Los Angeles]] (AL)
|x
|y
|}
"""

NFL = """==Game results==
===NFL Pro Bowls (1950–1969)===
{|class="wikitable"
|-
! Season !! Date !! Score !! Series !! Most Valuable Players !! Venue<ref name="Venue">{{cite news |url=http://example.com |title=x}}</ref>!! Attendance !! Head coaches !! Network
|- style="background:#fcc"
| {{nfly|1950}} || January 14, 1951 || [[1951 Pro Bowl|American Conference 28, National Conference 27]] || AC, 1–0 || [[Otto Graham]], [[Cleveland Browns]], [[Quarterback]] || [[Los Angeles Memorial Coliseum]] || 53,676 || AC: [[Paul Brown]] ||
|- style="background:#d0e7ff"
| {{nfly|1956}} || January 13, 1957 || [[1957 Pro Bowl|West 19, East 10]] || West, 4–3 || '''Back:''' [[Bert Rechichar]], [[Baltimore Colts]]<br />'''Lineman:''' [[Ernie Stautner]], [[Pittsburgh Steelers]] || Los Angeles Memorial Coliseum || 44,177 || EC: x ||
|}
===AFC–NFC Pro Bowls (1970–2012)===
{|class="wikitable"
|-
! Season !! Date !! Score !! Series !! Most Valuable Player(s) !! Venue !! Attendance !! Head coaches !! Network
|- style="background:#d0e7ff"
| {{nfly|1970}} || January 24, 1971 || [[1971 Pro Bowl|NFC, 27–6]] || [[National Football Conference|NFC]], 1–0 || '''Lineman:''' [[Fred Carr]], [[Green Bay Packers|Packers]]<br />'''Back:''' [[Mel Renfro]], [[Dallas Cowboys|Cowboys]] || Los Angeles Memorial Coliseum || 48,222 || x || NBC
|}
===Pro Bowl Games (2022–2026)===
{|class="wikitable"
|-
! Season !! Date !! Score !! Series !! Most Valuable Player(s) !! Venue !! Attendance !! Head coaches !! Network
|-
| {{nfly|2023}} || February 1 and 4, 2024 || [[2024 Pro Bowl Games|NFC 64–59]] ||AFC, 26–25 || '''Offensive:'''<br /> [[Baker Mayfield]], [[2023 Tampa Bay Buccaneers season|Tampa Bay]], Quarterback || [[Camping World Stadium]]|| 55,709 || AFC: Peyton Manning
|}
"""

CFL = """==List of games==
{| class="wikitable sortable" style="width:100%; text-align: center"
|-
!Season!! Date !! Day !!Venue !! City !! Visitor !! Score !! Home !! Attendance !! Ref
|-
| [[1955 in Canadian football|1955]] || December 3, 1955 || Saturday ||[[Varsity Stadium]] || [[Toronto]], [[Ontario|ON]] || [[Western Interprovincial Football Union|WIFU]] All-Stars || 6–6 (tie) || [[Interprovincial Rugby Football Union|IRFU]] All-Stars || 15,088 || <ref>{{cite web|url=http://example.com}}</ref>
|-
| [[1956 in Canadian football|1956]] || December 8, 1956 || Saturday ||[[Empire Stadium (Vancouver)|Empire Stadium]] || [[Vancouver]], [[British Columbia|BC]] || [[Interprovincial Rugby Football Union|IRFU]] All-Stars || 0–35 || '''[[Western Interprovincial Football Union|WIFU]] All-Stars''' || 13,546 || <ref>{{cite web|url=http://example.com}}</ref>
|}
"""

WNBA = """==All-Star Game results==
{| class="wikitable sortable"
! Year !! Result !! Host arena !! Host city !! [[WNBA All-Star Game Most Valuable Player Award|Game MVP]]
|-
|style="text-align: center"| [[1999 WNBA All-Star Game|1999]]
! style="background:#fcc;"|'''West''' '''79''', East 61<ref name="1999 Box Score"/>
| [[Madison Square Garden]]
| [[New York City|New York, New York]]
| [[Lisa Leslie]], [[Los Angeles Sparks]]
|-
|style="text-align: center"|2016
|style="text-align: center" colspan="4"|''No game due to the [[2016 Summer Olympics]]''
|-
|style="text-align: center"| [[2025 WNBA All-Star Game|2025]]
| '''Team Collier''' '''151''', Team Clark 131
| [[Gainbridge Fieldhouse]]
| [[Indianapolis|Indianapolis, Indiana]]
| {{sortname|Napheesa|Collier}}, Minnesota Lynx <small>(4)</small>
|}
"""

INFOBOX_ROSTER = """{{Infobox NBA All-Star Game
| name          = 1951 NBA All-Star Game
| date          = Friday, March 2, 1951
| arena         = [[Boston Garden]]
| city          = [[Boston]]
| attendance    = 10,094
}}
==Roster==
{{col-begin}}
{{col-2}}
{| class="wikitable"
|+Eastern All-Stars<ref name="gazette"/>
|-
!scope="col" width="30px"|Pos.
!scope="col" width="150px"|Player
!scope="col" width="150px"|Team
|-
!scope="col" colspan="3"|Starters
|-
|style="text-align:center"|G
|[[Bob Cousy]]
|[[Boston Celtics]]
|-
|style="text-align:center"|F/C
|{{sortname|Joe|Fulks}}
|[[Philadelphia Warriors]]
|-
!scope="col" colspan="3"|Reserves
|-
|style="text-align:center"|F/G
|[[Paul Arizin]]
|[[Philadelphia Warriors]]
|}
{{col-2}}
{| class="wikitable"
|+Western All-Stars
|-
!scope="col"|Pos.
!scope="col"|Player
!scope="col"|Team
|-
!scope="col" colspan="3"|Starters
|-
|C
|[[George Mikan]]
|[[Minneapolis Lakers]]
|}
"""

NHL_BULLETS = """{{Infobox ice hockey game
| date = October 13, 1947
| arena = [[Maple Leaf Gardens]]
| city = [[Toronto]]
| attendance = 14,169
}}
==Rosters==
{| class="wikitable" style="width:100%"
! !! Maple Leafs !! All-Stars
|-
! Head coach || {{flagicon|CAN}} [[Hap Day]] ([[Toronto Maple Leafs]]) || {{flagicon|CAN}} [[Dick Irvin]] ([[Montreal Canadiens]])
|-
! Lineup
|'''Maple Leafs''':
*{{flagicon|CAN}}  1 - G [[Turk Broda]]
*{{flagicon|CAN}}  10 - C [[Syl Apps]] (C)
|'''All-Stars''':
*{{flagicon|USA}}  1 - G [[Frank Brimsek]] ([[Boston Bruins]])
*{{flagicon|CAN}}  9 - RW [[Maurice Richard]] ([[Montreal Canadiens]])
|}
"""

GRID = """==Rosters==
===AFC===
{|class="wikitable"
|+ Offense
!Position
!Starter(s)
!Reserve(s)
!Alternate(s)
|-
|style="text-align:center"|[[Quarterback]]
|{{Small|1}} '''[[Tua Tagovailoa]]''', [[2023 Miami Dolphins season|Miami]]
|{{Small|8}} [[Lamar Jackson]], [[2023 Baltimore Ravens season|Baltimore]]{{ref label|declined|d|d}}<br />{{Small|15}} [[Patrick Mahomes]], [[2023 Kansas City Chiefs season|Kansas City]]
|{{Small|7}} '''[[C. J. Stroud]]''', [[2023 Houston Texans season|Houston]]
|}
"""

SORTNAME_ROSTER = """==Rosters==
===National League===
{| class="wikitable sortable plainrowheaders" style="text-align:center;"
|-
|+Elected starters
|-
!scope="col" | Position
!scope="col" style="width:150px;"|Player
!scope="col" style="width:100px;"|Team
!scope="col" | All-Star Games
|-
|[[Catcher|C]]
!scope="row" style="text-align:center"| {{sortname|William|Contreras}}
| [[Milwaukee Brewers|Brewers]] || 2
|-
|[[First baseman|1B]]
!scope="row" style="text-align:center"| {{sortname|Bryce|Harper}}{{dagger}}
| [[Philadelphia Phillies|Phillies]] || 8
|}
"""

fails = []


def check(name, got, want):
    if got != want:
        fails.append("%s: got %r, wanted %r" % (name, got, want))


def test_results():
    r = wiki.parse_result
    check("winner first, dash", r("'''East 111''' – 94 West"), ("East", 111, "West", 94, None))
    check("hockey overtime", r("'''Wales''' 6 – Campbell 5 (OT)")[4], "OT")
    check("shootout", r("West 6 – East 5 ([[Overtime (ice hockey)#Shootout|SO]])")[4], "SO")
    check("comma", r("'''West''' '''79''', East 61"), ("West", 79, "East", 61, None))
    check("club v all-stars", r("[[New York Giants]] 13, NFL All-Stars 10"), ("New York Giants", 13, "NFL All-Stars", 10, None))
    check("conference only", r("[[1971 Pro Bowl|NFC, 27–6]]"), ("NFC", 27, "AFC", 6, None))
    check("conference no comma", r("AFC 20–13"), ("AFC", 20, "NFC", 13, None))
    check("team names", r("Team Rice 22,<br />Team Sanders 21"), ("Team Rice", 22, "Team Sanders", 21, None))
    check("nothing", r("TBD"), None)


def test_dates():
    check("range and", wiki.date_range("February 1 and 4, 2024"), (datetime.date(2024, 2, 1), datetime.date(2024, 2, 4)))
    check("range dash", wiki.date_range("February 2–3, 2019"), (datetime.date(2019, 2, 2), datetime.date(2019, 2, 3)))
    check("one day", wiki.date_range("Friday, March 2, 1951"), (datetime.date(1951, 3, 2),) * 2)
    check("no day", wiki.date_range("sometime"), (None, None))


def ev_by(evs, year, no=1):
    return next(e for e in evs if e["year"] == year and e["event_no"] == no)


def test_nhl():
    evs, iss = lists.read_list("nhl", NHL, TODAY)
    check("nhl years", [e["year"] for e in evs], [1947, 1962, 1986, 1995, 2024])
    e = ev_by(evs, 1947)
    check("nhl 1947 article", e["article"], "1st National Hockey League All-Star Game")
    check("nhl 1947 game", (e["games"][0]["side1"], e["games"][0]["score1"], e["games"][0]["side2"], e["games"][0]["score2"]), ("All–Stars", 4, "Maple Leafs", 3))
    check("nhl 1947 no mvp (not yet awarded)", e["mvps"], [])
    check("nhl 1947 venue", (e["venue_name"], e["venue_title"], e["city_text"], e["host_name"]), ("Maple Leaf Gardens", "Maple Leaf Gardens", "Toronto, Ontario", "Toronto Maple Leafs"))
    e = ev_by(evs, 1962)
    check("nhl counter dropped", (e["venue_name"], e["city_text"], e["host_name"]), ("Maple Leaf Gardens", "Toronto, Ontario", "Toronto Maple Leafs"))
    check("nhl mvp", [(m["name"], m["title"], m["team_name"]) for m in e["mvps"]], [("Eddie Shack", "Eddie Shack", "Toronto Maple Leafs")])
    check("nhl overtime", ev_by(evs, 1986)["games"][0]["decided_by"], "OT")
    e = ev_by(evs, 1995)
    check("nhl cancelled", (e["status"], e["status_reason"], e["games"]), ("cancelled", "lockout", []))
    e = ev_by(evs, 2024)
    check("nhl tournament stages", [(g["stage"], g["side1"], g["score1"]) for g in e["games"]], [("semifinal", "Team McDavid", 4), ("semifinal", "Team Matthews", 6), ("final", "Team Matthews", 7)])
    check("nhl 1966 shifted game is not an event, 2027 is not yet", 1966 in [x["year"] for x in evs] or 2027 in [x["year"] for x in evs], False)


def test_nba():
    evs, iss = lists.read_list("nba", NBA, TODAY)
    check("nba years", [e["year"] for e in evs], [1954, 1959, 1981, 1982, 2025])
    e = ev_by(evs, 1954)
    check("nba overtime", (e["games"][0]["side1"], e["games"][0]["score1"], e["games"][0]["score2"], e["games"][0]["decided_by"]), ("East", 98, 93, "OT"))
    check("nba venue marks dropped", (e["venue_name"], e["venue_title"]), ("Madison Square Garden III", "Madison Square Garden (1925)"))
    check("nba mvp team", [(m["name"], m["team_name"]) for m in e["mvps"]], [("Bob Cousy", "Boston Celtics")])
    check("nba two mvps", [(m["name"], m["team_name"]) for m in ev_by(evs, 1959)["mvps"]], [("Elgin Baylor", "Minneapolis Lakers"), ("Bob Pettit", "St. Louis Hawks")])
    check("nba mvp whose name starts with Na", [m["name"] for m in ev_by(evs, 1981)["mvps"]], ["Nate Archibald"])
    check("nba trailing comma", [(m["name"], m["team_name"]) for m in ev_by(evs, 1982)["mvps"]], [("Larry Bird", "Boston Celtics")])
    e = ev_by(evs, 2025)
    check("nba 2025 games", [(g["stage"], g["side1"], g["score1"], g["side2"], g["score2"]) for g in e["games"]],
          [("semifinal 1", "Chuck's Global Stars", 41, "Kenny's Young Stars", 32), ("championship", "Shaq's OGs", 41, "Chuck's Global Stars", 25)])
    check("nba reference dropped from the venue", e["venue_name"], "Chase Center")


def test_mlb():
    evs, iss = lists.read_list("mlb", MLB, TODAY)
    check("mlb events", [(e["year"], e["event_no"], e["status"]) for e in evs], [(1933, 1, "played"), (1945, 1, "cancelled"), (1961, 1, "played"), (1962, 1, "played"), (1962, 2, "played")])
    check("mlb 1933", (ev_by(evs, 1933)["played_on"], ev_by(evs, 1933)["games"][0]["side1"], ev_by(evs, 1933)["attendance"], ev_by(evs, 1933)["host_name"]),
          (datetime.date(1933, 7, 6), "American League", 47595, "Chicago White Sox"))
    check("mlb 1933 mvp none yet, pitchers are not mvps", ev_by(evs, 1933)["mvps"], [])
    t = ev_by(evs, 1961)
    check("mlb tie", (t["games"][0]["score1"], t["games"][0]["score2"], t["games"][0]["side1"], t["mvps"]), (1, 1, "American League", []))
    check("mlb two games a year", [(e["year"], e["event_no"], e["article"]) for e in evs if e["year"] == 1962],
          [(1962, 1, "1962 Major League Baseball All-Star Game (first game)"), (1962, 2, "1962 Major League Baseball All-Star Game (second game)")])
    check("mlb mvp", [(m["name"], m["title"]) for m in ev_by(evs, 1962, 1)["mvps"]], [("Maury Wills", "Maury Wills")])
    check("mlb winner is the second league", ev_by(evs, 1962, 1)["games"][0]["side1"], "National League")
    c = next(e for e in evs if e["status"] == "cancelled")
    check("mlb cancelled", (c["year"], c["status_reason"], c["played_on"]), (1945, "war", None))


def test_nfl():
    evs, iss = lists.read_list("nfl", NFL, TODAY)
    check("nfl years", [(e["year"], e["event_no"]) for e in evs], [(1951, 1), (1957, 1), (1971, 1), (2024, 1)])
    e = ev_by(evs, 1951)
    check("nfl 1951", (e["played_on"], e["games"][0]["side1"], e["games"][0]["score1"], e["venue_name"], e["attendance"]), (datetime.date(1951, 1, 14), "American Conference", 28, "Los Angeles Memorial Coliseum", 53676))
    check("nfl mvp with position", [(m["name"], m["team_name"]) for m in e["mvps"]], [("Otto Graham", "Cleveland Browns")])
    check("nfl mvp kinds", [(m["kind"], m["name"]) for m in ev_by(evs, 1957)["mvps"]], [("back", "Bert Rechichar"), ("lineman", "Ernie Stautner")])
    check("nfl conference only", (ev_by(evs, 1971)["games"][0]["side1"], ev_by(evs, 1971)["games"][0]["side2"]), ("NFC", "AFC"))
    e = ev_by(evs, 2024)
    check("nfl two-day event", (e["played_on"], e["last_day"]), (datetime.date(2024, 2, 1), datetime.date(2024, 2, 4)))


def test_cfl_wnba():
    evs, iss = lists.read_list("cfl", CFL, TODAY)
    check("cfl", [(e["year"], e["played_on"], e["games"][0]["side1"], e["games"][0]["score1"], e["games"][0]["score2"], e["attendance"]) for e in evs],
          [(1955, datetime.date(1955, 12, 3), "WIFU All-Stars", 6, 6, 15088), (1956, datetime.date(1956, 12, 8), "IRFU All-Stars", 0, 35, 13546)])
    check("cfl venue and city", (evs[0]["venue_name"], evs[0]["city_text"]), ("Varsity Stadium", "Toronto, ON"))
    evs, iss = lists.read_list("wnba", WNBA, TODAY)
    check("wnba years", [(e["year"], e["status"]) for e in evs], [(1999, "played"), (2016, "cancelled"), (2025, "played")])
    check("wnba header cell result", (evs[0]["games"][0]["side1"], evs[0]["games"][0]["score1"], evs[0]["games"][0]["score2"]), ("West", 79, 61))
    check("wnba reason", evs[1]["status_reason"], "olympics")
    check("wnba sortname mvp links to First Last", [(m["name"], m["title"], m["team_name"]) for m in evs[2]["mvps"]], [("Napheesa Collier", "Napheesa Collier", "Minnesota Lynx")])


def test_game():
    info, ros, iss = game.parse_game(INFOBOX_ROSTER)
    check("infobox", info, {"first_day": datetime.date(1951, 3, 2), "last_day": None, "venue_name": "Boston Garden", "venue_title": "Boston Garden", "city_text": "Boston", "city_title": "Boston", "attendance": 10094})
    check("table rosters", [(r["side"], r["role"], r["position"], r["name"], r["title"], r["team_name"]) for r in ros],
          [("Eastern", "starter", "G", "Bob Cousy", "Bob Cousy", "Boston Celtics"), ("Eastern", "starter", "F/C", "Joe Fulks", "Joe Fulks", "Philadelphia Warriors"),
           ("Eastern", "reserve", "F/G", "Paul Arizin", "Paul Arizin", "Philadelphia Warriors"), ("Western", "starter", "C", "George Mikan", "George Mikan", "Minneapolis Lakers")])
    info, ros, iss = game.parse_game(NHL_BULLETS)
    check("bullets", [(r["side"], r["position"], r["name"], r["team_name"]) for r in ros],
          [("Maple Leafs", "G", "Turk Broda", None), ("Maple Leafs", "C", "Syl Apps", None), ("All-Stars", "G", "Frank Brimsek", "Boston Bruins"), ("All-Stars", "RW", "Maurice Richard", "Montreal Canadiens")])
    check("bullets infobox", (info["first_day"], info["attendance"]), (datetime.date(1947, 10, 13), 14169))
    info, ros, iss = game.parse_game(GRID)
    check("pro bowl grid", [(r["side"], r["role"], r["group"], r["position"], r["name"], r["team_name"]) for r in ros],
          [("AFC", "starter", "Offense", "Quarterback", "Tua Tagovailoa", "Miami"), ("AFC", "reserve", "Offense", "Quarterback", "Lamar Jackson", "Baltimore"),
           ("AFC", "reserve", "Offense", "Quarterback", "Patrick Mahomes", "Kansas City"), ("AFC", "alternate", "Offense", "Quarterback", "C. J. Stroud", "Houston")])
    info, ros, iss = game.parse_game(SORTNAME_ROSTER)
    check("baseball sortname", [(r["side"], r["role"], r["position"], r["name"], r["title"], r["team_name"]) for r in ros],
          [("National League", "starter", "C", "William Contreras", "William Contreras", "Brewers"), ("National League", "starter", "1B", "Bryce Harper", "Bryce Harper", "Phillies")])
    info, ros, iss = game.parse_game("==Rosters==\nNothing readable here.\n")
    check("unreadable rosters are reported", (ros, iss), ([], [("rosters", "a Rosters section is on the page but no player could be read")]))


def test_sql():
    with tempfile.TemporaryDirectory() as d:
        evs, _ = lists.read_list("nhl", NHL, TODAY)
        for e in evs:
            e["article"] = None
        sql = os.path.join(d, "out.sql")
        P.write_sql(sql, {"NHL All-Star Game": dict(title="NHL All-Star Game", kind="list", league="nhl", revision_id=7, fetched_on="2026-10-20")}, evs,
                    [dict(league="nhl", year=1947, event_no=1, game_no=1, stage=None, side1="All-Stars", score1=4, side2="Maple Leafs", score2=3, decided_by=None)],
                    [dict(league="nhl", year=1962, event_no=1, seq=1, kind=None, name="Eddie Shack", title="Eddie Shack", team_name="Toronto Maple Leafs")],
                    [dict(league="nhl", year=1947, event_no=1, seq=1, side="Maple Leafs", role=None, group=None, position="G", name="Turk Broda", title="Turk Broda", team_name=None, team_title=None)],
                    [dict(league="nhl", year=None, what="date", detail="it's odd")])
        text = open(sql).read()
        check("sql deletes first", text.split("\n")[1].startswith("delete from legacy_wikipedia_all_star.unparsed"), True)
        check("sql quotes", "'it''s odd'" in text, True)
        check("sql cancelled event", "insert into legacy_wikipedia_all_star.event" in text and "'cancelled', 'lockout'" in text, True)
        check("sql rows", text.count("insert into legacy_wikipedia_all_star.event"), 5)


def main():
    for t in (test_results, test_dates, test_nhl, test_nba, test_mlb, test_nfl, test_cfl_wnba, test_game, test_sql):
        try:
            t()
        except Exception as e:  # noqa: BLE001
            import traceback
            fails.append("%s raised %r\n%s" % (t.__name__, e, traceback.format_exc()))
    if fails:
        print("\n".join(fails))
        sys.exit(1)
    print("all_star parser tests ok")


if __name__ == "__main__":
    main()
