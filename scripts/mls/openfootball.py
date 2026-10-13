"""Parser for openfootball/world north-america/major-league-soccer/<year>_mls.txt (Football.TXT, CC0).
parse_file(text, year) -> (matches, unread, cancelled). A match is a dict:
  stage   the heading after the bullet: "Matchday 5", "Playoffs, Round 1", "MLS is Back Tournament, Group A"
  date    ISO date (the file's own calendar date; kick-offs are Eastern time as the file prints them)
  time    "19:30" or None (a line without a time repeats the one above)
  team1, team2   as the file spells them (team1 is the home side)
  score1, score2 the score at the end of play (extra time included); None where the file gives only a shootout score and no other
                 (the "(0-0)" in the brackets is then a half-time or 90-minute score, not trusted as the final)
  aet     True when the line says a.e.t.
  pens1, pens2   shootout score, else None
  score90 / ht   the bracket's numbers: (90-minute score, half-time score) as written, each "a-b" or None
A line it cannot read is returned in `unread`, never guessed."""
import re
from datetime import datetime

MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
HEAD = re.compile(r"^▪\s*(.+?)\s*$")
DATE = re.compile(r"^\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$")
LINE = re.compile(r"^\s+(?:(\d\d:\d\d)\s+)?(.+?)\s+v\s+(.+?)\s+(\d+)-(\d+)"          # time, teams, first score
                  r"(?:\s+pen\.)?(?:\s+(\d+)-(\d+)\s+a\.e\.t\.|\s+a\.e\.t\.)?"        # pens (first score) and/or extra time
                  r"(?:\s+\(([^)]*)\))?\s*$")


def parse_file(text, year):
    matches, unread, cancelled = [], [], []
    stage = date = None
    for raw in text.splitlines():
        if not raw.strip() or raw.startswith("#") or raw.startswith("="):
            continue
        h = HEAD.match(raw)
        if h:
            stage = h.group(1); continue
        d = DATE.match(raw)
        if d:
            date = datetime(int(d.group(3) or year), MONTHS[d.group(1)], int(d.group(2))).date().isoformat(); continue
        if raw.rstrip().endswith("[cancelled]"):
            cancelled.append(raw.strip()); continue
        m = LINE.match(raw)
        if not m or not stage or not date:
            unread.append(raw); continue
        time, t1, t2, a, b, e1, e2, br = m.groups()
        has_pen = " pen." in raw
        has_aet = "a.e.t." in raw
        inner = [x.strip() for x in br.split(",")] if br else []
        score1, score2, pens1, pens2 = int(a), int(b), None, None
        if has_pen:
            pens1, pens2 = int(a), int(b)
            if e1 is not None:
                score1, score2 = int(e1), int(e2)
            else:
                score1 = score2 = None
        elif has_aet and e1 is not None:
            score1, score2 = int(e1), int(e2)   # not produced by the pattern for plain a.e.t.; kept for safety
        ok = lambda v: v if v and re.fullmatch(r"\d+-\d+", v) else None
        matches.append({"stage": stage, "date": date, "time": time, "team1": t1.strip(), "team2": t2.strip(), "score1": score1, "score2": score2,
                        "aet": has_aet, "pens1": pens1, "pens2": pens2,
                        "score90": ok(inner[0]) if len(inner) == 2 else None, "ht": ok(inner[-1]) if inner else None, "raw": raw.strip()})
    return matches, unread, cancelled


def final_from_pen_line_without_aet(m):
    """A 'p-q pen. (x-y)' line (2023-): the final score is not stated. A drawn shootout means the score was level, so x-y of the 90-minute
    bracket (two numbers) is the best reading; with one number it is the half-time score and the final is unknown."""
    return m["score90"] if m["score90"] else None
