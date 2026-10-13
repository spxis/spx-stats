"""Parse openfootball/worldcup (CC0) cup.txt and cup_finals.txt files (the Football.TXT format) into match and goal records.
Used by load.py and by the second check; no database. A line it cannot read is returned in `unread`, never guessed.

Match line:  [(73)] [13:00 [UTC-6]] [16 June] Team1  2-1 [a.e.t.] (1-0[, 1-1]) [, 4-3 pen.]  Team2  @ Stadium, City
Goal lines follow in parentheses: (Home scorers; Away scorers), each `Name 9', 45+2' (pen.)`. A date line (`Thu June 11`, `July 13`) sets the day."""
import re

MONTHS = {m: i + 1 for i, m in enumerate("January February March April May June July August September October November December".split())}
MONTHS.update({m[:3]: i for m, i in list(MONTHS.items())})
MONTHS["Sept"] = 9
DAY = r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?"
MON = r"(?:" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\.?"
DATE_LINE = re.compile(rf"^\s*(?:{DAY}\s+)?(?:(?P<d1>\d{{1,2}})\s+(?P<m1>{MON})|(?P<m2>{MON})\s+(?P<d2>\d{{1,2}}))(?:\s*[-–]\s*\d{{1,2}}(?:\s+{MON})?)?\s*$")
TIME = re.compile(r"^(\d{1,2})[:.](\d{2})(?:\s+UTC([+-]\d{1,2})(?::(\d{2}))?)?\s+")
NUM = re.compile(r"^\((\d+)\)\s+")
DATE_PREFIX = re.compile(rf"^(?:{DAY}\s+)?(?:(?P<d>\d{{1,2}})\s+(?P<m>{MON})|(?P<m2>{MON})\s+(?P<d2>\d{{1,2}}))\s+")
SCORE = re.compile(r"\s(\d+)-(\d+)(?=\s|$)")
TOKENS = re.compile(r"\s*(?:(a\.e\.t\.?)|\(([^)]*)\)|,|(\d+)-(\d+)\s+pen\.?)")
FLAG = r"(?:\s*(?:\((?:pen\.?|p|og|o\.g\.)\)|(?:pen|og)(?![A-Za-z])))"
GOAL = re.compile(rf"(?P<name>[^\d;,()]+?)\s+(?P<min>\d+(?:\+\d+)?)'(?P<rest>{FLAG}?)", re.I)
MIN = re.compile(rf"\s*,?\s*(\d+(?:\+\d+)?)'({FLAG}?)", re.I)


def goals_of(text):
    """'Home goals; Away goals' -> [(side, name, minute label, kind)]; kind is '', 'pen' or 'og'. Names may carry initials (L. Laurent)."""
    out = []
    parts = text.split(";")
    for side, part in zip(("home", "away"), parts[:2]):
        pos = 0
        part = part.strip()
        while pos < len(part):
            m = GOAL.match(part, pos)
            if not m:
                break
            name = m.group("name").strip().rstrip(",")
            minutes = [(m.group("min"), m.group("rest"))]
            pos = m.end()
            while True:
                n = MIN.match(part, pos)
                if not n:
                    break
                minutes.append((n.group(1), n.group(2)))
                pos = n.end()
            for mi, flag in minutes:
                f = flag.lower()
                kind = "og" if "og" in f or "o.g." in f else ("pen" if f.strip() else "")
                out.append((side, name, mi, kind))
            pos = max(pos, 0)
            while pos < len(part) and part[pos] in " ,":
                pos += 1
        if pos < len(part):
            out.append((side, None, part[pos:], "unread"))
    return out


def parse_match(line):
    """Returns a dict or None. Keys: number, time, utc, date_prefix, team1, team2, score1, score2, aet, ht, pens, venue, comment."""
    s = line.rstrip()
    comment = None
    if "##" in s:
        s, comment = s.split("##", 1)
        s, comment = s.rstrip(), comment.strip()
    if "@" not in s:
        return None
    s, venue = s.rsplit("@", 1)
    venue = venue.strip()
    rec = {"number": None, "time": None, "utc": None, "date_prefix": None, "comment": comment, "venue": venue}
    s = s.strip()
    m = NUM.match(s)
    if m:
        rec["number"] = int(m.group(1)); s = s[m.end():]
    for _ in range(2):
        m = DATE_PREFIX.match(s)
        if m:
            rec["date_prefix"] = (MONTHS[(m.group("m") or m.group("m2")).rstrip(".")], int(m.group("d") or m.group("d2"))); s = s[m.end():]
        m = TIME.match(s)
        if m:
            rec["time"] = f"{int(m.group(1)):02d}:{m.group(2)}"; rec["utc"] = m.group(3); s = s[m.end():]
    s = " " + s
    sm = SCORE.search(s)
    if not sm:
        return None
    rec["team1"] = s[:sm.start()].strip()
    if " v " in rec["team1"]:
        # "Brazil v Croatia  3-1": the teams come before the score
        rec["team1"], rec["team2_early"] = [x.strip() for x in rec["team1"].split(" v ", 1)]
    rec["score1"], rec["score2"] = int(sm.group(1)), int(sm.group(2))
    rest = s[sm.end():]
    pos, aet, ht, pens = 0, False, None, None
    early = re.match(r"\s*pen\.?\s+(\d+)-(\d+)", rest)
    if early:
        # "0-3 pen. 0-0 a.e.t. (0-0)": the shootout first, then the score
        pens = (rec["score1"], rec["score2"])
        rec["score1"], rec["score2"] = int(early.group(1)), int(early.group(2))
        rest = rest[early.end():]
    while True:
        t = TOKENS.match(rest, pos)
        if not t:
            break
        if t.group(1):
            aet = True
        elif t.group(2) is not None:
            ht = t.group(2).strip()
        elif t.group(3):
            pens = (int(t.group(3)), int(t.group(4)))
        pos = t.end()
    rec["team2"] = rec.pop("team2_early", None) or rest[pos:].strip()
    rec["aet"], rec["ht"], rec["pens"] = aet, ht, pens
    return rec if rec["team1"] and rec["team2"] else None


STAGE = re.compile(r"^\s*[▪»]\s*(?P<name>[^|]+?)\s*(?:\|.*)?$")


def parse_file(text, year):
    """-> (matches, unread). Each match is parse_match's dict plus stage, group, date (YYYY-MM-DD), goals [(side, name, minute, kind)]."""
    matches, unread = [], []
    stage, group, day, cur = None, None, None, None
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        i += 1
        s = raw.strip()
        if not s or s.startswith("#") or s.startswith("=") or s.startswith("Group ") and "|" in s:
            continue
        sm = STAGE.match(raw)
        if sm and not re.match(r"^Matchday", sm.group("name")):
            name = sm.group("name").strip()
            gm = re.match(r"^(Group\s+\S+)(?:\s+(.*))?$", name)
            if gm:
                stage, group = ("Group stage" if not gm.group(2) else gm.group(2)), gm.group(1)
            else:
                stage, group = name, None
            cur = None
            continue
        if sm:
            continue
        if s.startswith("(") and not re.match(r"^\(\d+\)\s", s):
            # a goal list: runs until the parentheses balance
            buf = s
            while buf.count("(") > buf.count(")") and i < len(lines):
                buf += " " + lines[i].strip(); i += 1
            if cur is not None:
                inner = buf.strip()
                inner = inner[1:-1] if inner.endswith(")") else inner[1:]
                cur["goals"] = goals_of(inner)
                if ";" not in inner and cur["score1"] == 0 and cur["score2"] > 0:
                    # nothing before the semicolon is left out when the home side did not score: the list is the away side's
                    cur["goals"] = [("away", n, m, k) for (_, n, m, k) in cur["goals"]]
                cur["goal_text"] = inner
            continue
        d = DATE_LINE.match(raw)
        if d and "@" not in raw:
            mo = MONTHS[(d.group("m1") or d.group("m2")).rstrip(".")]
            da = int(d.group("d1") or d.group("d2"))
            day = (mo, da)
            continue
        m = parse_match(raw)
        if m:
            if m["date_prefix"]:
                day = m["date_prefix"]
            if day is None:
                unread.append(raw); continue
            m["stage"], m["group"], m["date"] = stage, group, f"{year}-{day[0]:02d}-{day[1]:02d}"
            m["goals"], m["goal_text"] = [], None
            matches.append(m)
            cur = m
            continue
        unread.append(raw)
    return matches, unread
