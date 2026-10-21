#!/usr/bin/env python3
"""Parse NWSL wikitext (English Wikipedia) into games and standings.

Club-season articles log matches as {{football box}} / {{Football box}} (the same boxes MLS
reads). A game appears in both clubs' articles: games_from_boxes() keeps one row. Playoff
boxes on the season article or playoff page are kept too. Challenge Cup, pre-season and
exhibition sections are skipped. Rows nothing here can read come back as unparsed.
Recap URLs are not followed.
"""
import datetime, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mls"))
import wikibox as B  # noqa: E402

SKIP_HEAD = re.compile(
    r"pre-?season|exhibition|friendli|challenge cup|summer cup|liga mx|"
    r"women.?s cup|concacaf|champions cup|w champions|invitational|college draft|allocation",
    re.I)
PLAYOFF_HEAD = re.compile(r"playoff|post-?\s?season|championship|semi-?final|quarter-?final|\bfinals?\b", re.I)
SEASON_TEAM = re.compile(r"^(\d{4}) (.+) season$")


def club_from(link, text):
    """Canonical club name: the '<year> <club> season' title, else the cell's display text.

    A piped link such as [[Gotham FC|Sky Blue FC]] keeps Sky Blue FC (the name that season),
    not the current article title.
    """
    if link:
        m = SEASON_TEAM.match(link.strip())
        if m: return " ".join(m.group(2).replace("\xa0", " ").split())
    t = re.sub(r"\s+", " ", (text or "").replace("\xa0", " ").strip().strip("."))
    t = re.sub(r"\s*\([^)]*\)\s*$", "", t)
    t = re.sub(r"^#\d+\s+", "", t)   # a playoff seed in front of the name
    if t: return t
    if link:
        t = re.sub(r"\s*\([^)]*\)\s*$", "", link.strip())
        if t and "season" not in t.lower() and "NWSL" not in t and "National Women's" not in t:
            return " ".join(t.replace("\xa0", " ").split())
    return None


def phase_of(path, round_name, src_name=""):
    blob = " ".join(path) + " " + (round_name or "") + " " + (src_name or "")
    if SKIP_HEAD.search(blob): return None
    if PLAYOFF_HEAD.search(blob): return "playoffs"
    return "regular"


def games_from_boxes(boxes, src_name=""):
    """One game dict per football box that has a date, two clubs and a score. Skip Challenge Cup etc."""
    games, bad = [], []
    for b in boxes:
        path = b.get("path") or []
        phase = phase_of(path, b.get("round"), src_name)
        if phase is None: continue
        if b.get("series"): continue
        d = b.get("date")
        if not d:
            if b.get("score1") is not None: bad.append((src_name, "no date " + (b.get("score_raw") or "")[:80]))
            continue
        yr = int(src_name[:4]) if re.match(r"^\d{4} ", src_name or "") else None
        if yr and d[:4] != str(yr):
            bad.append((src_name, f"date {d} outside the {yr} season: " + (b.get("score_raw") or "")[:60]))
            continue
        home = club_from(b["team1"].get("link"), b["team1"].get("text"))
        away = club_from(b["team2"].get("link"), b["team2"].get("text"))
        s1, s2 = b.get("score1"), b.get("score2")
        if not home or not away:
            bad.append((src_name, "clubs " + (b.get("score_raw") or "")[:80])); continue
        if s1 is None or s2 is None:
            raw = (b.get("score_raw") or "")
            if re.search(r"TBD|cancelled|canceled|postponed|PPD|^\s*P\s*[–-]\s*P\s*$|v\s*$|–\s*$", raw, re.I) or not raw.strip():
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
    """The same match listed on two club pages (or the season page) is one game.

    Two logs that share the date and the two clubs are one game even when they
    disagree on the score: the home club's own article wins, and the other line
    is kept in conflict.
    """
    groups, order = {}, []
    for g in rows:
        k = (g["phase"], g["date"], g["home"], g["away"])
        if k not in groups and (g["phase"], g["date"], g["away"], g["home"]) in groups:
            # the two articles name opposite home clubs for one match: keep the first article's side, turn this view round
            g = dict(g, home=g["away"], away=g["home"], home_pts=g["away_pts"], away_pts=g["home_pts"],
                     conflict=((g.get("conflict") + "; ") if g.get("conflict") else "") + "Wikipedia logs name opposite home clubs")
            k = (g["phase"], g["date"], g["home"], g["away"])
        if k not in groups:
            groups[k] = dict(g)
            groups[k]["views"] = g.get("views") or 1
            order.append(k)
            continue
        cur = groups[k]
        cur["views"] = cur.get("views") or 1
        cur["views"] += 1
        if g.get("round") and not cur.get("round"):
            cur["round"] = g["round"]
        same = (g["home_pts"], g["away_pts"], bool(g.get("ot")), bool(g.get("so"))) == (
            cur["home_pts"], cur["away_pts"], bool(cur.get("ot")), bool(cur.get("so")))
        if same:
            if g.get("conflict") and not cur.get("conflict"):
                cur["conflict"] = g["conflict"]
            continue
        # Prefer the home club's season article when the two scores disagree.
        take_g = g["home"] in (g.get("src") or "") and g["home"] not in (cur.get("src") or "")
        kept, dropped = (g, cur) if take_g else (cur, g)
        note = (f"Wikipedia logs disagree: {dropped['home_pts']}–{dropped['away_pts']} "
                f"vs {kept['home_pts']}–{kept['away_pts']}")
        if take_g:
            for field in ("home_pts", "away_pts", "ot", "so", "src"):
                cur[field] = g[field]
            if g.get("conflict"):
                cur["conflict"] = g["conflict"]
        cur["conflict"] = (cur["conflict"] + "; " if cur.get("conflict") else "") + note
    return _one_playoff_game_per_pair(_merge_close_dates([groups[k] for k in order]))


def _one_playoff_game_per_pair(games):
    """An NWSL playoff round is one game: the same two clubs in the playoffs of a season are one game
    whatever date a club article gives it. The row both articles agree on (most views) is kept."""
    keep, drop = {}, set()
    for i, g in enumerate(games):
        if g["phase"] != "playoffs": continue
        k = frozenset((g["home"], g["away"]))
        j = keep.get(k)
        if j is None:
            keep[k] = i; continue
        a, b = games[j], g
        if (b.get("views") or 1) > (a.get("views") or 1):
            keep[k] = i; drop.add(j)
        else:
            drop.add(i)
    return [g for i, g in enumerate(games) if i not in drop]


def _merge_close_dates(games, days=3, wide=10):
    """Two club pages often disagree by a day (late kickoff / time zone). Same clubs + close dates are one game."""
    used, out = set(), []
    for i, a in enumerate(games):
        if i in used: continue
        for j, b in enumerate(games):
            if j <= i or j in used: continue
            if (a["phase"], a["home"], a["away"]) != (b["phase"], b["home"], b["away"]): continue
            if (a.get("views") or 1) > 1 or (b.get("views") or 1) > 1: continue   # a match both articles agree on is a match of its own
            if a.get("src") == b.get("src"): continue
            try:
                da, db = datetime.date.fromisoformat(a["date"]), datetime.date.fromisoformat(b["date"])
            except ValueError:
                continue
            gap = abs((da - db).days)
            # a game each club logs on its own date a week apart, same score, is one rescheduled game
            same_score = (a["home_pts"], a["away_pts"]) == (b["home_pts"], b["away_pts"])
            if gap > days and not (gap <= wide and same_score and a["phase"] == "regular"): continue
            take_b = b["home"] in (b.get("src") or "") and b["home"] not in (a.get("src") or "")
            score_diff = (b["home_pts"], b["away_pts"]) != (a["home_pts"], a["away_pts"])
            note_scores = (b["home_pts"], b["away_pts"], a["home_pts"], a["away_pts"], b["date"], a["date"])
            if take_b:
                for field in ("date", "home_pts", "away_pts", "ot", "so", "src", "round"):
                    if b.get(field) not in (None, ""): a[field] = b[field]
            a["views"] = (a.get("views") or 1) + (b.get("views") or 1)
            if score_diff:
                note = (f"Wikipedia dates {note_scores[4]} / {note_scores[5]} "
                        f"scores {note_scores[0]}–{note_scores[1]} vs {note_scores[2]}–{note_scores[3]}")
                a["conflict"] = (a["conflict"] + "; " if a.get("conflict") else "") + note
            used.add(j)
        out.append(a)
    return out


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
        m = re.search(r"^\s*\|\s*winners?\s*=\s*(.+)$", text, re.I | re.M)
    if not m:
        m = re.search(r"^\s*\|\s*finals_champ\s*=\s*(.+)$", text, re.I | re.M)
    if not m: return None
    t = m.group(1).strip()
    t = re.sub(r"\{\{\s*nowrap\s*\|([^{}]*)\}\}", r"\1", t, flags=re.I)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\{\{[^}]*\}\}|<[^>]*>|'''|''", "", t)
    t = re.sub(r"\s*\([^)]*\)\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip(" |")
    if re.fullmatch(r"cancell?ed|not awarded|none", t, re.I): return None
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
