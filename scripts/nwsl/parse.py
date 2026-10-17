#!/usr/bin/env python3
"""Parse NWSL wikitext (English Wikipedia) into games and standings.

Club-season articles log matches as {{football box}} / {{Football box}} (the same boxes MLS
reads). A game appears in both clubs' articles: games_from_boxes() keeps one row. Playoff
boxes on the season article or playoff page are kept too. Challenge Cup, pre-season and
exhibition sections are skipped. Rows nothing here can read come back as unparsed.
Recap URLs are not followed.
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mls"))
import wikibox as B  # noqa: E402

SKIP_HEAD = re.compile(
    r"pre-?season|exhibition|friendly|challenge cup|summer cup|liga mx|college draft|allocation",
    re.I)
PLAYOFF_HEAD = re.compile(r"playoff|championship|semi-?final|quarter-?final|\bfinals?\b", re.I)
SEASON_TEAM = re.compile(r"^(\d{4}) (.+) season$")


def club_from(link, text):
    """Canonical club name: the '<year> <club> season' title, else the cell's plain text."""
    if link:
        m = SEASON_TEAM.match(link.strip())
        if m: return " ".join(m.group(2).replace("\xa0", " ").split())
        t = re.sub(r"\s*\([^)]*\)\s*$", "", link.strip())
        if t and "season" not in t.lower() and "NWSL" not in t and "National Women's" not in t:
            return " ".join(t.replace("\xa0", " ").split())
    t = re.sub(r"\s+", " ", (text or "").replace("\xa0", " ").strip().strip("."))
    t = re.sub(r"\s*\([^)]*\)\s*$", "", t)
    return t or None


def phase_of(path, round_name):
    blob = " ".join(path) + " " + (round_name or "")
    if SKIP_HEAD.search(blob): return None
    if PLAYOFF_HEAD.search(blob): return "playoffs"
    return "regular"


def games_from_boxes(boxes, src_name=""):
    """One game dict per football box that has a date, two clubs and a score. Skip Challenge Cup etc."""
    games, bad = [], []
    for b in boxes:
        path = b.get("path") or []
        phase = phase_of(path, b.get("round"))
        if phase is None: continue
        if b.get("series"): continue
        d = b.get("date")
        if not d:
            if b.get("score1") is not None: bad.append((src_name, "no date " + (b.get("score_raw") or "")[:80]))
            continue
        home = club_from(b["team1"].get("link"), b["team1"].get("text"))
        away = club_from(b["team2"].get("link"), b["team2"].get("text"))
        s1, s2 = b.get("score1"), b.get("score2")
        if not home or not away:
            bad.append((src_name, "clubs " + (b.get("score_raw") or "")[:80])); continue
        if s1 is None or s2 is None:
            raw = (b.get("score_raw") or "")
            if re.search(r"TBD|cancelled|canceled|postponed|v\s*$|–\s*$", raw, re.I) or not raw.strip():
                continue
            bad.append((src_name, raw[:120])); continue
        ot = bool(b.get("aet") or b.get("golden"))
        pens1, pens2 = b.get("pens1"), b.get("pens2")
        so = pens1 is not None and pens2 is not None and pens1 != pens2
        note = None
        hp, ap = s1, s2
        if so and hp == ap:
            # The archive's winner is read from the score. A penalty shoot-out that left the
            # 90+ET score level adds one to the side that won the kicks (as a hockey SO does).
            # The Wikipedia line stays in conflict.
            if pens1 > pens2: hp += 1
            else: ap += 1
            note = f"Wikipedia {s1}–{s2} a.e.t., {pens1}–{pens2} pens; winner stored +1"
        rnd = b.get("round") or next((p for p in reversed(path) if PLAYOFF_HEAD.search(p)), None)
        if rnd and phase == "regular": rnd = None
        games.append(dict(
            phase=phase, round=rnd, date=d, home=home, away=away,
            home_pts=hp, away_pts=ap, ot=ot, so=so, neutral=False, views=1,
            conflict=note, src=(src_name + " " + (b.get("score_raw") or ""))[:400]))
    return games, bad


def merge_games(rows):
    """The same match listed on two club pages (or the season page) is one game."""
    groups, order = {}, []
    for g in rows:
        k = (g["phase"], g["date"], g["home"], g["away"], g["home_pts"], g["away_pts"])
        if k not in groups:
            groups[k] = dict(g)
            order.append(k)
        else:
            groups[k]["views"] += 1
            if g.get("conflict") and not groups[k].get("conflict"):
                groups[k]["conflict"] = g["conflict"]
            if g.get("round") and not groups[k].get("round"):
                groups[k]["round"] = g["round"]
    return [groups[k] for k in order]


def parse_standings_module(text, src_name=""):
    """style=WDL (or WDL-style) sports-table: win / draw / loss / gf / ga."""
    rows = []
    for blk in re.finditer(r"\{\{#invoke:Sports table\|main\|(.*?)\n\}\}", text, re.S | re.I):
        body = blk.group(1)
        kv = {k: v.strip() for k, v in re.findall(r"\|?\s*([A-Za-z_0-9]+)\s*=\s*((?:\[\[[^\]]*\]\]|[^|\n])*)", body)}
        keys = []
        if kv.get("team_order"):
            keys = [x.strip() for x in kv["team_order"].split(",") if x.strip()]
        else:
            keys = [k[5:] for k in kv if re.fullmatch(r"name_.+", k)]
        for key in keys:
            nm = kv.get("name_" + key, key)
            link = re.search(r"\[\[([^\]|#]+)", nm)
            team = club_from(link.group(1) if link else None, re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", nm))
            if not team: continue
            w = _int(kv.get("win_" + key))
            d = _int(kv.get("draw_" + key))
            l = _int(kv.get("loss_" + key))
            if w is None or l is None: continue
            d = d or 0
            pts = _int(kv.get("points_" + key))
            if pts is None: pts = 3 * w + d
            rows.append({"team": team, "w": w, "d": d, "l": l, "pts": pts,
                         "gp": w + d + l, "gf": _int(kv.get("gf_" + key)), "ga": _int(kv.get("ga_" + key)),
                         "division": src_name or "NWSL standings", "src": f"{key} {w}-{d}-{l} {pts}"})
    return rows


def _int(s):
    if s is None or s == "": return None
    m = re.match(r"^\s*(-?\d+)", str(s))
    return int(m.group(1)) if m else None


def champion_of(text):
    m = re.search(r"^\s*\|\s*champions?\s*=\s*(.+)$", text, re.I | re.M)
    if not m:
        m = re.search(r"^\s*\|\s*finals_champ\s*=\s*(.+)$", text, re.I | re.M)
    if not m: return None
    t = m.group(1).strip()
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\{\{[^}]*\}\}|<[^>]*>|'''|''", "", t)
    t = re.sub(r"\s+", " ", t).strip(" |")
    return t or None


def check(games, std):
    """Published W-D-L against the regular-season games."""
    tot = {}
    for g in games:
        if g["phase"] != "regular": continue
        for side, pf, pa in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            t = tot.setdefault(g[side], [0, 0, 0])  # w, d, l
            if pf > pa: t[0] += 1
            elif pf == pa: t[1] += 1
            else: t[2] += 1
    out = []
    seen = set()
    for r in std:
        if r["team"] in seen: continue
        seen.add(r["team"])
        t = tot.get(r["team"], [0, 0, 0])
        pub = (r.get("w"), r.get("d"), r.get("l"))
        if tuple(t) != pub: out.append((r["team"], pub, tuple(t)))
    return out
