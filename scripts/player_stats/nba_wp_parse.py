"""Read the rendered "Player statistics" section of an NBA club-season article (English Wikipedia, CC BY-SA 4.0): a library for nba_wp_load.py.

  tables(html)  -> [ {phase, tbl, header: [text, ...], rows: [ {name, title, cells: {header: text}} ... ]} ... ]

HTML, not wikitext: the tables are drawn from many templates (sortname, Abbr, "NBA roster statistics start") and the rendered form is the same for all.
  * A statistics table is one whose header row (cells <th>, or <td> in tables drawn by hand) starts with a "Player" column and has at least two more; the legend table and the
    leaders tables (Category / Player / Statistic) have no such header or no games column and are skipped.
  * phase: from the headings above the table (phase_of): 'playoffs' under a Playoffs / Postseason heading, 'regular' under Season / Regular season / the
    section's own heading; Preseason, Summer League, Play-in, single playoff rounds, opponents, totals and leaders are skipped.
  * The first cell is the player: name = its text, title = the article its first link points to (the link's title, from /wiki/...), None for a red link
    (class "new": no such article) or plain text. A row with an empty name, or a "total(s)" row, is dropped.
  * cells keeps every cell as shown (header text -> cell text), footnote marks (<sup>) dropped; a header that repeats is numbered (GP, GP#2).
Nothing is interpreted here: the meaning of each header is db/seed/nba_stat_column.csv, read by db/build/181_stats_nba_wikipedia.sql."""
import html as H
import re
from html.parser import HTMLParser

class _P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.path = []             # the headings above the current place, outermost first: [(level, text), ...]
        self.in_h = None
        self.h_buf = ""
        self.tables = []           # finished tables
        self.stack = []            # open tables (nested tables are read too, flat)
        self.row = None
        self.cell = None
        self.sup = 0
        self.skip = 0              # inside <style>/<script>

    # -- helpers
    def _tbl(self): return self.stack[-1] if self.stack else None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("style", "script"): self.skip += 1
        if tag in ("h2", "h3", "h4", "h5"):
            self.in_h, self.h_buf = tag, ""
        elif tag == "table":
            self.stack.append({"path": [h[1] for h in self.path], "rows": []})
        elif tag == "tr" and self._tbl() is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = {"tag": tag, "text": "", "link": None, "red": False}
        elif tag == "sup":
            self.sup += 1
        elif tag == "a" and self.cell is not None and self.cell["link"] is None and not self.sup:
            href = a.get("href") or ""
            cls = a.get("class") or ""
            m = re.match(r"/wiki/([^#?]+)", href)
            if "new" in cls.split() or "redlink=1" in href:
                self.cell["red"] = True
                self.cell["link"] = ""      # a red link: names no article
            elif m and a.get("title"):
                if not re.match(r"(File|Category|Template|Help|Wikipedia|Special|Talk):", a["title"]):
                    self.cell["link"] = a["title"]
        elif tag == "br" and self.cell is not None:
            self.cell["text"] += " "

    def handle_endtag(self, tag):
        if tag in ("style", "script"): self.skip = max(0, self.skip - 1)
        if tag == self.in_h:
            level = int(self.in_h[1])
            self.path = [h for h in self.path if h[0] < level] + [(level, re.sub(r"\s+", " ", self.h_buf).strip())]
            self.in_h = None
        elif tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(self.cell); self.cell = None
        elif tag == "tr" and self.row is not None and self._tbl() is not None:
            if self.row: self._tbl()["rows"].append(self.row)
            self.row = None
        elif tag == "table" and self.stack:
            self.tables.append(self.stack.pop())
        elif tag == "sup":
            self.sup = max(0, self.sup - 1)

    def handle_data(self, data):
        if self.skip: return
        if self.in_h: self.h_buf += data
        if self.cell is not None and not self.sup: self.cell["text"] += data

def _txt(s):
    return re.sub(r"\s+", " ", s.replace("\xa0", " ").replace("​", "")).strip()

OTHER = re.compile(r"pre-?season|summer league|play-?in|suspension|opponent|total|team|leader|vs\.|additions|subtractions|draft", re.I)
ROUND = re.compile(r"round|semi-?finals?|quarter-?finals?|\bfinals?\b", re.I)
PLAYOFF = re.compile(r"play-?offs?|post-?season", re.I)
REGULAR = re.compile(r"(regular|ragular) season( statistics)?|season|player stat(istic)?s|statistics|stats|overall", re.I)

def phase_of(path):
    """'regular', 'playoffs' or None (a table about something else) from the headings above a table, outermost first. Playoffs: a heading with playoff or
    postseason above it, unless the table's own heading is one round of them (First round, Conference semifinals ...: "Overall" is the whole run).
    Regular: the section's own heading or Season / Regular season / Overall. Preseason, Summer League, Play-in, the two halves of a suspended season,
    opponents and team totals are not used."""
    leaf = path[-1] if path else ""
    if OTHER.search(leaf): return None
    if any(PLAYOFF.search(h) for h in path):
        return None if ROUND.search(leaf) and not PLAYOFF.search(leaf) else "playoffs"
    return "regular" if REGULAR.fullmatch(leaf.strip()) else None

def tables(html):
    p = _P()
    p.feed(html)
    out, count = [], {}
    for t in p.tables:
        rows = t["rows"]
        # the header row: its first cell names the player column (cells are <th>, or <td> in the tables drawn by hand)
        hi = next((i for i, r in enumerate(rows) if len(r) >= 3 and _txt(r[0]["text"]).lower() in ("player", "name", "players")), None)
        if hi is None: continue
        header = [_txt(c["text"]) for c in rows[hi]]
        phase = phase_of(t["path"])
        if phase is None: continue
        count[phase] = count.get(phase, 0) + 1
        keys, seen = [], {}
        for x in header:
            seen[x] = seen.get(x, 0) + 1
            keys.append(x if seen[x] == 1 else f"{x}#{seen[x]}")
        data = []
        for r in rows[hi + 1:]:
            if _txt(r[0]["text"]).lower() in ("player", "name", "players"): continue     # a repeated header row
            name = _txt(r[0]["text"])
            if not name or re.fullmatch(r"(team )?totals?|totals?|team|opponents?", name, re.I): continue
            cells = {keys[i]: _txt(c["text"]) for i, c in enumerate(r) if i < len(keys)}
            data.append({"name": name, "title": (r[0]["link"] or None), "cells": cells})
        if data: out.append({"phase": phase, "tbl": count[phase], "header": header, "rows": data})
    return out

TEAM_ROW = re.compile(r"^(team )?(totals?|total|team)$", re.I)

def team_totals(html):
    """Published Team / Total rows of the same player-statistics tables (rare; most articles have none).

    Same phase rules as tables(). Opponents rows are not used. cells keeps every cell as shown, like tables()."""
    p = _P()
    p.feed(html)
    out, count = [], {}
    for t in p.tables:
        rows = t["rows"]
        hi = next((i for i, r in enumerate(rows) if len(r) >= 3 and _txt(r[0]["text"]).lower() in ("player", "name", "players")), None)
        if hi is None: continue
        phase = phase_of(t["path"])
        if phase is None: continue
        header = [_txt(c["text"]) for c in rows[hi]]
        keys, seen = [], {}
        for x in header:
            seen[x] = seen.get(x, 0) + 1
            keys.append(x if seen[x] == 1 else f"{x}#{seen[x]}")
        for r in rows[hi + 1:]:
            name = _txt(r[0]["text"])
            if not name or not TEAM_ROW.fullmatch(name): continue
            count[phase] = count.get(phase, 0) + 1
            cells = {keys[i]: _txt(c["text"]) for i, c in enumerate(r) if i < len(keys)}
            out.append({"phase": phase, "tbl": count[phase], "name": name, "header": header, "cells": cells})
    return out
