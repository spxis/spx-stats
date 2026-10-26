"""Parser for the openfootball club-league files (Football.TXT, CC0): the england, deutschland, espana, italy and europe repositories of the
openfootball organisation. parse_file(text, start_year) -> (matches, unread, unplayed, cancelled).
A match is a dict:
  stage    the heading after the bullet ("Matchday 5", "Playoffs", "Aufstieg, Final")
  date     ISO date; time "19:30" or None
  team1, team2   as the file spells them (team1 is the home side)
  score1, score2 the score at the end of play (extra time included, shootout not)
  aet      True when the line says a.e.t.;  pens1, pens2 the shootout, else None
  ht1, ht2 half-time score (not set for a match with extra time, where the bracket's single number is not told apart);  s90_1, s90_2 the 90-minute score of an a.e.t. match
  tag      "awarded" when the result was awarded, else None;  raw  the line
Two line shapes are read: "Home  1-1 (0-1)  Away" (England before 2025) and "Home v Away  1-1 (0-1)" (the others). A fixture with no score is
returned in `unplayed`, one marked [cancelled], [postponed] or [abandoned] in `cancelled` (stage, date, teams, tag). A line it cannot read is returned
in `unread`, never guessed. The "-full" files (2025-26) are not read: the plain file of the same season holds the same results."""
import re
from datetime import datetime

MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
HEAD = re.compile(r"^[▪»]+\s*(.+?)\s*$")
DATE = re.compile(r"^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$")
TIME = re.compile(r"^(\d\d[:.]\d\d)\s+(.*)$")
TAG = re.compile(r"\s*\[([a-z]+)\]\s*$")
VENUE = re.compile(r"\s+@\s.*$")
RES = r"(?P<a>\d+)-(?P<b>\d+)(?P<pen>\s+pen\.)?(?:\s+(?P<e1>\d+)-(?P<e2>\d+)\s+a\.e\.t\.|\s+(?P<aet>a\.e\.t\.))?(?:\s+\((?P<br>[^)]*)\))?"
V_LINE = re.compile(r"^(?P<t1>.+?)\s+v\s+(?P<t2>.+?)\s+" + RES + r"$")
S_LINE = re.compile(r"^(?P<t1>.+?)\s+" + RES + r"\s+(?P<t2>.+?)$")
V_PLAIN = re.compile(r"^(?P<t1>.+?)\s+v\s+(?P<t2>.+?)$")
DASH = re.compile(r"^(?P<t1>.+?)\s+-\s+(?P<t2>.+?)$")


def _result(m):
    a, b = int(m.group("a")), int(m.group("b"))
    br = [x.strip() for x in m.group("br").split(",")] if m.group("br") else []
    ok = lambda v: tuple(int(x) for x in v.split("-")) if v and re.fullmatch(r"\d+-\d+", v) else None
    r = {"score1": a, "score2": b, "aet": bool(m.group("aet") or m.group("e1")), "pens1": None, "pens2": None,
         "ht1": None, "ht2": None, "s90_1": None, "s90_2": None}
    if m.group("pen"):
        r["pens1"], r["pens2"] = a, b
        r["score1"], r["score2"] = (int(m.group("e1")), int(m.group("e2"))) if m.group("e1") else (None, None)
    elif m.group("e1"):
        r["score1"], r["score2"] = int(m.group("e1")), int(m.group("e2"))
    if r["aet"]:
        if len(br) == 2 and ok(br[0]):
            r["s90_1"], r["s90_2"] = ok(br[0])
    elif br and ok(br[-1]):
        r["ht1"], r["ht2"] = ok(br[-1])
    return r


def parse_file(text, start_year):
    """start_year is the year the season starts; a date line without a year takes start_year for July to December and start_year + 1 for January to June."""
    matches, unread, unplayed, cancelled = [], [], [], []
    stage = date = None
    for raw in text.splitlines():
        s = raw.strip()
        if not s or s.startswith("#") or s.startswith("="):
            continue
        h = HEAD.match(raw)
        if h:
            stage = h.group(1); continue
        d = DATE.match(raw)
        if d:
            mon = MONTHS[d.group(1)]
            y = int(d.group(3)) if d.group(3) else (start_year if mon >= 7 else start_year + 1)
            date = datetime(y, mon, int(d.group(2))).date().isoformat(); continue
        if not raw.startswith((" ", "\t")):
            unread.append(raw); continue
        body = VENUE.sub("", s)
        if re.match(r"^[(\[]", body) or body.endswith((";", "')")):
            continue                                      # the goals of the match above (openliga files)
        tag = TAG.search(body)
        if tag:
            body = body[:tag.start()]
        time = None
        t = TIME.match(body)
        if t:
            time, body = t.group(1).replace(".", ":"), t.group(2)
        m = V_LINE.match(body) or S_LINE.match(body)
        if m and stage and date:
            r = _result(m)
            r.update({"stage": stage, "date": date, "time": time, "team1": m.group("t1").strip(), "team2": m.group("t2").strip(),
                      "tag": tag.group(1) if tag and tag.group(1) == "awarded" else None, "raw": s})
            matches.append(r); continue
        if tag and stage and date and tag.group(1) in ("cancelled", "postponed", "abandoned"):
            c = V_PLAIN.match(body) or DASH.match(body)
            if c:
                cancelled.append({"stage": stage, "date": date, "team1": c.group("t1").strip(), "team2": c.group("t2").strip(), "tag": tag.group(1)}); continue
        p = V_PLAIN.match(body) if not tag else None
        if p and stage and date:
            unplayed.append({"stage": stage, "date": date, "team1": p.group("t1").strip(), "team2": p.group("t2").strip()}); continue
        if re.search(r"\d'", s):
            continue                                      # a goal list that runs over a line
        unread.append(raw)
    return matches, unread, unplayed, cancelled
