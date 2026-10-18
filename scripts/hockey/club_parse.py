#!/usr/bin/env python3
"""Parse a club-season article ("1974–75 Houston Aeros season", English Wikipedia wikitext, CC BY-SA 4.0): its game log and its player statistics.

What the WHA's club articles hold (checked on the 79 articles of 2026-10-18):
  * "Schedule and results": {{Game log start}} with a {{Game log section start|...|title=October...|<column names>}} ... {{Game log section end}} block per month
    (regular season) or per playoff series ("Quarterfinals vs. Cleveland Crusaders – Aeros win 4–1"). Two layouts, told by the column names:
      Game|Result|Date|Score|Opponent|Record   the club's own view: "October 16, 1974", score with the club's goals first ("2–3 OT" is a loss), "@ Opponent" = away;
      Game|Date|Visitor|Score|Home|...         both clubs named, "October 12" (no year: months from July on belong to the year the season starts in), the visitor's
                                               goals first, an optional OT column.
    Every game is on the logs of both clubs, so the loader merges the two copies (merge_games) and reports the ones only one log has.
  * "Player statistics": ";Scoring" (Player, Pos, GP, G, A, Pts, PIM, ...) and ";Goaltending" (Player, GP, Min, W, L, T, GA, SO, SV%, GAA) wikitables for the regular
    season and the playoffs; a player is {{Sortname|First|Last|Article}} (the article is the title of the page it links to; without it "First Last"), or a [[link]].
No other site is read: the references in these articles name sports sites, the tables are the article's own text.
"""
import importlib.util, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parse as P   # noqa: E402

DASH = P.DASH
SECTION = re.compile(r"\{\{\s*Game log section start\s*\|(.*?)\}\}\s*\n(.*?)\{\{\s*Game log section end\s*\}\}", re.S | re.I)
PLAYOFF_TITLE = re.compile(r"\bvs\.?\b|playoff|tie-?breaker|final|quarter|semi|preliminary", re.I)
ATTR = re.compile(r'^\s*(?:\w[\w-]*\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s|"\']+)\s*)+\|(?!\|)')


def cells_of(line):
    """The cells of one wikitext table row line ('| 1 || October 12 || [[A|B]] || 4 – 6'); an attribute prefix (align="left"|) is dropped."""
    body = line.strip()[1:]
    out = []
    for c in re.split(r"\|\|", body):
        c = ATTR.sub("", c, count=1) if not c.lstrip().startswith("[[") else c
        out.append(c.strip())
    return out


def header_of(params):
    """Column names of a section start: the parameters after title=, lower-cased ('game', 'date', 'visitor', ...)."""
    parts = re.split(r"\|", params)
    i = next((k for k, p in enumerate(parts) if p.strip().lower().startswith("title=")), None)
    return [p.strip().lower() for p in parts[i + 1:] if p.strip()] if i is not None else []


def section_title(params):
    m = re.search(r"title=(.*?)(?:\|(?:Game|\s*Game)\b|$)", params, re.S)
    return re.sub(r"<!--.*?-->|<ref.*?(?:</ref>|/>)", "", m.group(1) if m else "", flags=re.S).strip()


def parse_games(text, club, season, names, aliases=None):
    """-> (games, unparsed, outside): `outside` are the games against a team that is not a club of the league (a Soviet or Czechoslovak side, whose names start with ~): not league games, but the published standings count them. Games of one article from this club's point of view; `club` is the standings name of the article's club, `names` the
    season's clubs. A game: dict(date, away, home, away_pts, home_pts, overtime, neutral, phase, round, raw, side) with side 'home' or 'away' for this club."""
    games, bad, outside = [], [], []
    for m in SECTION.finditer(text):
        params, body = m.group(1), m.group(2)
        title = section_title(params)
        hdr = header_of(params)
        phase = "playoffs" if PLAYOFF_TITLE.search(title) and not re.match(r"^(oct|nov|dec|jan|feb|mar|apr)", title, re.I) else "regular"
        rnd = re.split(r"\s+[–—-]\s+", title)[0] if phase == "playoffs" else None
        rnd = re.sub(r"\s+vs\.?.*$", "", rnd).strip() if rnd else rnd
        if "tiebreaker" in title.lower() or "tie-breaker" in title.lower():
            bad.append(("tiebreaker game, not a league game: " + title)); continue
        for line in body.splitlines():
            s = line.strip()
            if not s.startswith("|") or s.startswith(("|-", "|}")): continue
            c = cells_of(s)
            if len(c) < 4 or not re.match(r"^\d+$", P.tidy(c[0])): continue
            raw = " | ".join(P.tidy(x) for x in c)
            try:
                g = row(c, hdr, club, season, names, aliases)
            except (IndexError, ValueError):
                g = None
            if g is None: bad.append(f"{title}: {raw}"); continue
            g.update(phase=phase, round=rnd, raw=raw[:300])
            (outside if g["home"].startswith("~") or g["away"].startswith("~") else games).append(g)
    return games, bad, outside


def named(cell, club, names, aliases):
    t = re.sub(r"^@\s*", "", P.tidy(cell)).strip()
    t = re.sub(r"\s*\(\d{4}[–-]\d{2}\)$", "", t)
    return P.match_name(t, names) or alias_match(t, names, aliases) or ("~" + t if P.NOT_A_CLUB.search(t) else None)   # "~Soviet All-Stars": a team of no league here


def alias_match(t, names, aliases):
    for a, full in (aliases or {}).items():
        if P.norm(a) == P.norm(t): return full
    return None


def row(c, hdr, club, season, names, aliases):
    """One game row. The layout is read from the row (a few articles put a month's rows under the other layout's column names): a W, L or T in the
    second cell is the club's own view, a date there is Date, Visitor, Score, Home."""
    own = bool(re.fullmatch(r"[WLT]", P.tidy(c[1])))
    if own:
        dm = re.search(P.DATE_PAT, P.tidy(c[2]))
        if not dm: return None
        date = P.date_of(dm.group("m"), dm.group("d"), season, None)   # the year a log prints is not used: a month belongs to one year of a season (a typo "1978" in a 1977-78 log is common)
        sc = re.search(r"(\d+)\s*" + DASH + r"\s*(\d+)", P.tidy(c[3]))
        if not date or not sc: return None
        away = c[4].strip().startswith("@") or P.tidy(c[4]).startswith("@")
        opp = named(c[4], club, names, aliases)
        if not opp or opp == club: return None
        mine, theirs = int(sc.group(1)), int(sc.group(2))
        ot = bool(re.search(r"\bOT\b|overtime", P.tidy(c[3]), re.I))
        if away: h, a, hp, ap = opp, club, theirs, mine
        else: h, a, hp, ap = club, opp, mine, theirs
        return {"date": date, "home": h, "away": a, "home_pts": hp, "away_pts": ap, "overtime": ot, "neutral": False, "side": "away" if away else "home"}
    dm = re.search(P.DATE_PAT, P.tidy(c[1]))
    if not dm: return None
    date = P.date_of(dm.group("m"), dm.group("d"), season, None)   # the year a log prints is not used: a month belongs to one year of a season (a typo "1978" in a 1977-78 log is common)
    sc = re.search(r"(\d+)\s*" + DASH + r"\s*(\d+)", P.tidy(c[3]))
    if not date or not sc: return None
    a, h = named(c[2], club, names, aliases), named(c[4], club, names, aliases)
    if not a or not h: return None
    ot = bool(re.search(r"\bOT\b|overtime", P.tidy(c[3]), re.I)) or (len(hdr) > 5 and hdr[5] == "ot" and len(c) > 5 and bool(re.search(r"OT|overtime", P.tidy(c[5]), re.I)))
    return {"date": date, "home": h, "away": a, "home_pts": int(sc.group(2)), "away_pts": int(sc.group(1)), "overtime": ot, "neutral": False,
            "side": "home" if h == club else "away" if a == club else "other"}


def aliases_for(names):
    """Names a club that moved mid-season is called in the other clubs' logs: each half of 'NY Golden Blades / Jersey Knights', 'NY' as New York, 'Jersey' as New Jersey."""
    out = {}
    for n in names:
        if " / " not in n: continue
        for part in n.split(" / "):
            out[part] = n
            out[re.sub(r"^NY ", "New York ", re.sub(r"^Jersey ", "New Jersey ", part))] = n
        out["/".join(re.sub(r"^NY ", "New York ", re.sub(r"^Jersey ", "New Jersey ", p)) for p in n.split(" / "))] = n
    return out


def merge_games(per_club):
    """per_club: {club: [game]} -> (games merged, only-one-log list). The same game on the two clubs' logs is one game (phase, date, home, away, score)."""
    seen = {}
    for club, gs in per_club.items():
        for g in gs:
            k = (g["phase"], g["date"], g["home"], g["away"], g["home_pts"], g["away_pts"])
            if k in seen:
                seen[k]["logs"].add(club)
                if g["overtime"] and not seen[k]["overtime"]: seen[k]["overtime"] = True
            else:
                seen[k] = dict(g, logs={club})
    return list(seen.values())


# --------------------------------------------------------------------------------------------------------- reconcile with the standings
FIELDS = ("gp", "w", "l", "t", "gf", "ga")


def totals(games):
    tot = {}
    for g in games:
        for side, f, a in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            t = tot.setdefault(g[side], [0, 0, 0, 0, 0, 0])
            t[0] += 1; t[1 if f > a else 2 if f < a else 3] += 1; t[4] += f; t[5] += a
    return tot


def cost(games, standings):  # games: every game the standings count
    """How far the games' per-club sums are from the published standings: the sum of absolute differences over gp, w, l, t, gf, ga (a missing field is not compared)."""
    tot = totals(games)
    c = 0
    for r in standings:
        t = tot.get(r["team"], [0] * 6)
        pub = (r.get("gp"), r.get("w"), r.get("l"), r.get("t") or 0, r.get("gf"), r.get("ga"))
        c += sum(abs(a - b) for a, b in zip(t, pub) if b is not None)
    return c


def core(g):
    """A game without its date and who was at home: (phase, {club: goals}); what the standings can tell apart."""
    return (g["phase"], frozenset(((g["home"], g["home_pts"]), (g["away"], g["away_pts"]))))


def reconcile(sure, maybe, standings, extra=(), limit=18):
    """sure: games both clubs' logs show (plus `extra`, the games against teams of no club of the league, which the standings count); maybe: games only one
    log shows (the other log has a typo there, or none). Try every subset of `maybe` (at most `limit` games) and keep the one whose per-club sums equal the
    published standings. -> dict(games, distance, solutions, unique, loose). `distance` is 0 when the games add up exactly; `solutions` how many subsets do;
    `unique` is False when two solutions differ in more than a game's date or host (nothing decides, so the caller keeps none); `loose` lists the kept games
    whose date or host differs between solutions (the clubs' logs disagree and the standings cannot say which is right): each gets a note, a host that is
    disputed makes it a neutral-site game, and of two dates the one in the home club's log is kept."""
    base = totals(list(sure) + list(extra))
    want = {r["team"]: (r.get("gp"), r.get("w"), r.get("l"), r.get("t") or 0, r.get("gf"), r.get("ga")) for r in standings}
    if len(maybe) > limit: return {"games": None, "distance": None, "solutions": 0, "unique": False, "loose": []}
    deltas = []
    for g in maybe:
        d = {}
        for side, f, a in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            t = d.setdefault(g[side], [0] * 6)
            t[0] += 1; t[1 if f > a else 2 if f < a else 3] += 1; t[4] += f; t[5] += a
        deltas.append(d)

    def dist(tot):
        c = 0
        for k, pub in want.items():
            t = tot.get(k, [0] * 6)
            c += sum(abs(x - y) for x, y in zip(t, pub) if y is not None)
        return c
    best, found = None, []
    n = len(maybe)
    for mask in range(1 << n):
        tot = {k: list(v) for k, v in base.items()}
        for i in range(n):
            if mask >> i & 1:
                for k, v in deltas[i].items():
                    t = tot.setdefault(k, [0] * 6)
                    for j in range(6): t[j] += v[j]
        c = dist(tot)
        if best is None or c < best: best, found = c, [mask]
        elif c == best: found.append(mask)

    def cores(m): return sorted(repr((c[0], sorted(c[1]))) for c in (core(maybe[i]) for i in range(n) if m >> i & 1))
    unique = len({tuple(cores(m)) for m in found}) == 1
    if not unique: return {"games": None, "distance": best, "solutions": len(found), "unique": False, "loose": []}

    def home_logged(m): return sum(1 for i in range(n) if m >> i & 1 and maybe[i]["logs"] == {maybe[i]["home"]})
    m0 = max(found, key=lambda m: (home_logged(m), -m))
    loose = []
    if len(found) > 1:
        for i in range(n):
            if m0 >> i & 1 and any(not m >> i & 1 for m in found):
                g = dict(maybe[i])
                hosts = {x["home"] for m in found for x in (maybe[j] for j in range(n) if m >> j & 1) if core(x) == core(g)}
                g["disputed"] = "host" if len(hosts) > 1 else "date"
                loose.append(g)
    kept = list(sure) + [g for i, g in enumerate(maybe) if m0 >> i & 1]
    return {"games": kept, "distance": best, "solutions": len(found), "unique": True, "loose": loose}


# --------------------------------------------------------------------------------------------------------- playoffs against the bracket
def reconcile_series(playoff, series):
    """playoff: the playoff games of both clubs' logs (merge_games); series: [(round, winner, loser, winner wins, loser wins)] from the season article's bracket.
    A series' games are kept only when ww + lw of them, taken from what the two clubs' logs show, give the bracket's wins and no other choice does: every
    way of picking that many games is tried (at most 16 candidates); picks that are the same games (the same scores, whoever was at home and a few days
    either way) count as one, and two different picks keep none. Where the clubs' logs differ in host or date for a kept game, a host that is disputed makes
    it a neutral-site game with a note and of two dates the one in the home club's log is kept. -> (games kept, holes: [text])."""
    import itertools
    kept, holes = [], []
    pairs = {}
    for g in playoff: pairs.setdefault(frozenset((g["home"], g["away"])), []).append(g)
    done = set()

    def key(g): return (g["date"], core(g))
    for rnd, w, l, ww, lw in series:
        k = frozenset((w, l))
        if k in done: continue
        done.add(k)
        gs = pairs.get(k, [])
        label = f"playoffs {rnd}: {w} {ww}-{lw} {l}"
        if not gs: holes.append(f"{label}: no game on either club's log"); continue
        if len(gs) > 16: holes.append(f"{label}: too many candidate games ({len(gs)})"); continue
        want = ww + lw

        def wins(sel):
            c = {w: 0, l: 0}
            for g in sel: c[g["home"] if g["home_pts"] > g["away_pts"] else g["away"]] += 1
            return c
        classes = {}
        for sel in itertools.combinations(gs, want):
            if any(core(x) == core(y) and not (x["logs"] & y["logs"]) and abs(_days(x["date"], y["date"])) <= 3 for x, y in itertools.combinations(sel, 2)): continue   # one game, told twice
            c = wins(sel)
            if c[w] == ww and c[l] == lw:
                classes.setdefault(tuple(sorted(repr(sorted(core(g)[1])) for g in sel)), []).append(sel)
        if len(classes) != 1:
            c = wins(gs)
            holes.append(f"{label}: the clubs' logs hold {len(gs)} games ({c[w]}-{c[l]}) and " + ("more than one way of picking the series from them" if classes else "no way of picking it from them") + "; games left out")
            continue
        fits = next(iter(classes.values()))
        chosen = list(fits[0])
        for g in chosen:
            same = [x for x in gs if core(x) == core(g) and abs(_days(x["date"], g["date"])) <= 3]
            hosts = {x["home"] for x in same}
            if len(hosts) > 1:
                g = dict(g, neutral=True, note="the two clubs' logs name each other as host; no home side settled")
            elif len({x["date"] for x in same}) > 1:
                hl = [x for x in same if x["logs"] == {x["home"]}]
                g = dict(g, date=(hl or same)[0]["date"], note="the two clubs' logs give dates a day or so apart; the home club's date is kept")
            kept.append(g)
    for k, gs in pairs.items():
        if k not in done: holes.append("playoff games between " + " and ".join(sorted(k)) + f" ({len(gs)}) are in no bracket series; left out")
    return kept, holes


def _days(a, b):
    import datetime
    return (datetime.date.fromisoformat(str(a)) - datetime.date.fromisoformat(str(b))).days


def club_games(arts, y, names, standings, series):
    """The games of one season from its club articles (the ones club_fetch.py saved): -> dict(games, holes, report). Regular season: both clubs' logs merged, the
    single-log games chosen by the published standings (reconcile); all or nothing: when the games do not add up exactly to every club's published line, none
    of the regular season is kept. Playoffs: per series against the bracket (reconcile_series)."""
    al = aliases_for(names)
    per, outside, bad, cites = {}, [], [], {}
    for a in arts:
        if a["season"] != y or a.get("missing"): continue
        g, b, o = parse_games(a["content"], a["club"], y, names, al)
        per[a["club"]] = g; outside += o; bad += [f"{a['club']}: {x}" for x in b]
        cites[a["club"]] = f"enwiki:{a['title']}@{a['revid']}"
    merged = merge_games(per)
    for g in merged: g["cite"] = "; ".join(cites[c] for c in sorted(g["logs"]))
    reg = [g for g in merged if g["phase"] == "regular"]; po = [g for g in merged if g["phase"] == "playoffs"]
    holes, rep = list(bad), {"logs": len(per), "clubs": len(names), "regular_both": 0, "regular_single": 0}
    kept = []
    sure = [g for g in reg if len(g["logs"]) > 1]; maybe = [g for g in reg if len(g["logs"]) == 1]
    rep.update(regular_both=len(sure), regular_single=len(maybe))
    if len(per) < len(names):
        holes.append(f"regular season not loaded: {len(names) - len(per)} of {len(names)} clubs have no club-season article")
    elif not reg:
        pass
    else:
        R = reconcile(sure, maybe, standings, [g for g in outside if g["phase"] == "regular"])
        rep.update(distance=R["distance"], solutions=R["solutions"])
        if R["games"] is None or not R["unique"] or R["distance"]:
            holes.append(f"regular season not loaded: the clubs' logs do not add up to the published standings (distance {R['distance']}, {R['solutions']} solutions)")
        else:
            kept = R["games"]
            loose = {(core(g), g["date"]): g for g in R["loose"]}
            for g in kept:
                x = loose.get((core(g), g["date"]))
                if x and x["disputed"] == "host":
                    g["neutral"] = True
                    g["note"] = "the two clubs' logs name each other as host; no home side settled"
                elif x:
                    g["note"] = "the two clubs' logs give dates a day or so apart; the home club's date is kept"
            rep["loose"] = len(R["loose"])
    pk, ph = reconcile_series(po, series)
    holes += ph
    kept += pk
    rep.update(playoff_games=len(pk), outside=len(outside))
    regular_kept = any(g["phase"] == "regular" for g in kept)
    return {"games": kept, "holes": holes, "report": rep, "outside": [g for g in outside if g["phase"] == "regular"] if regular_kept else []}
