"""What a rendered English Wikipedia "<year> Major League Soccer season" article (the API's parse of it: wikitext and HTML) holds that the
loader keeps: the teams and their stadiums, the conference and overall tables, the statistical leaders, the individual awards, and the
infobox. Links in the rendered HTML carry the article each name leads to AFTER redirects, so a club that was renamed has one title."""
import re
import wikihtml as W


def season_teams(season):
    """[(club article, name shown that year, stadium article or None, stadium shown)] from the season's 'Team | Stadium' table(s)."""
    rows = []
    for t in W.tables(season["text"]):
        g = W.grid(t)
        hi = next((i for i, r in enumerate(g[:3]) if any(c["text"].lower().startswith("team") for c in r)
                   and any(c["text"].lower().startswith("stadium") for c in r)), None)
        if hi is None:
            continue
        head = [c["text"].lower() for c in g[hi]]
        ti = next(i for i, h in enumerate(head) if h.startswith("team"))
        si = next(i for i, h in enumerate(head) if h.startswith("stadium"))
        for r in g[hi + 1:]:
            if len(r) <= max(ti, si) or not r[ti]["links"]:
                continue
            tl = r[ti]["links"][0]
            sl = r[si]["links"][0] if r[si]["links"] else (None, r[si]["text"])
            rows.append((tl[0], r[ti]["text"] or tl[1], sl[0], r[si]["text"] or sl[1]))
    return rows


HEADER = {"pos": "pos", "pos.": "pos", "team": "team", "pld": "played", "gp": "played", "p": "played", "w": "wins", "sow": "shootout_wins",
          "sw": "shootout_wins", "l": "losses", "t": "draws", "d": "draws", "gf": "gf", "ga": "ga", "gd": "gd", "pts": "points", "ppg": "ppg",
          "qualification": "qualification"}


def _int(s):
    s = (s or "").replace("−", "-").replace("–", "-").replace("+", "").replace(",", "").strip()
    return int(s) if re.fullmatch(r"-?\d+", s) else None


def standings(season):
    """[{kind: eastern|western|overall, caption, heading, rows: [{pos, team_link, team_shown, marker, played, wins, shootout_wins, draws, losses,
    gf, ga, gd, points, ppg, qualification, cells}]}]. A table is recognised by its header (Pos, Team, Pld ... Pts) and its heading or caption."""
    out = []
    for t in W.tables(season["text"]):
        g = W.grid(t)
        if not g:
            continue
        head = [re.sub(r"vte$", "", c["text"].strip().lower()) for c in g[0]]
        cols = {}
        for i, h in enumerate(head):
            k = HEADER.get(h)
            if k and k not in cols:
                cols[k] = i
        if not ({"team", "played", "points"} <= set(cols)) or "pos" not in cols:
            continue
        label = f"{t['heading']} {t['caption']}".lower()
        if re.search(r"group", label) or "attendance" in label:
            continue
        kind = "eastern" if "eastern" in label else "western" if "western" in label else "overall" if re.search(r"overall|regular season", label) else None
        if kind is None:
            continue
        rows = []
        for r in g[1:]:
            if len(r) <= max(cols.values()) or not r[cols["team"]]["links"]:
                continue
            cell = r[cols["team"]]
            m = re.search(r"\(([A-Za-z]{1,2}(?:,\s*[A-Za-z]{1,2})*)\)\s*$", cell["text"])
            row = {"pos": _int(r[cols["pos"]]["text"]), "team_link": cell["links"][0][0], "team_shown": cell["links"][0][1] or cell["text"],
                   "marker": m.group(1) if m else None, "cells": {head[i]: r[i]["text"] for i in range(min(len(head), len(r)))}}
            for k in ("played", "wins", "shootout_wins", "draws", "losses", "gf", "ga", "gd", "points"):
                row[k] = _int(r[cols[k]]["text"]) if k in cols else None
            row["ppg"] = r[cols["ppg"]]["text"] if "ppg" in cols else None
            row["qualification"] = r[cols["qualification"]]["text"] or None if "qualification" in cols else None
            rows.append(row)
        if rows:
            out.append({"kind": kind, "caption": t["caption"], "heading": t["heading"], "rows": rows})
    return out


def _player_cell(cell):
    """(name, link title) of a player cell: the flag link comes first, the player's own link last."""
    links = [l for l in cell["links"] if l[0]]
    # a flag link leads to a country article; the player's is the last link whose shown text is part of the cell text
    for title, shown in reversed(links):
        if shown and shown in cell["text"] and not re.search(r"national|^\w+ men's", title):
            return cell["text"].strip(), title
    return cell["text"].strip(), (links[-1][0] if links else None)


def leaders(season):
    """[(category, rank, player, player_link, club_link, club_shown, value)] from the Goals / Assists / Shutouts (Clean sheets) tables."""
    out = []
    for t in W.tables(season["text"]):
        g = W.grid(t)
        if not g or len(g[0]) < 4:
            continue
        head = [c["text"].strip().lower() for c in g[0]]
        cat = {"goals": "goals", "assists": "assists", "shutouts": "shutouts", "clean sheets": "shutouts"}.get(head[-1])
        if cat is None or head[0] not in ("rank", "pos", "pos.", "#") or "player" not in head[1]:
            continue
        for r in g[1:]:
            rank, val = _int(r[0]["text"]), _int(r[-1]["text"])
            if rank is None or val is None or not r[1]["text"].strip():
                continue
            name, plink = _player_cell(r[1])
            cl = r[2]["links"][0] if r[2]["links"] else (None, r[2]["text"])
            out.append((cat, rank, name, plink, cl[0], r[2]["text"] or cl[1], val))
    return out


def awards(season):
    """[(award, player, player_link, club_link, club_shown)] from an 'Individual awards' / 'End-of-season awards' table of Award | Player | Club
    (or Award | Winner (club))."""
    out = []
    for t in W.tables(season["text"]):
        g = W.grid(t)
        if not g or not g[0]:
            continue
        head = [c["text"].strip().lower() for c in g[0]]
        if head[0] != "award" or not re.search(r"individual|end-of-season|awards", t["heading"], re.I):
            continue
        for r in g[1:]:
            if len(r) < 2 or not r[0]["text"].strip():
                continue
            award = r[0]["text"].strip()
            if len(r) >= 3 and head[1].startswith("player") and head[2].startswith("club"):
                name, plink = _player_cell(r[1])
                cl = r[2]["links"][0] if r[2]["links"] else (None, r[2]["text"])
                out.append((award, name, plink, cl[0], r[2]["text"] or cl[1]))
            elif head[1].startswith("winner"):
                cell = r[1]
                m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", cell["text"])
                links = cell["links"]
                if m and links:
                    out.append((award, m.group(1).strip(), links[0][0], links[-1][0] if len(links) > 1 else None, m.group(2).strip()))
    return out


def infobox(wikitext):
    """The infobox's parameters as raw text: {mlscup, shield, 'league topscorer', matches, 'total goals', attendance, ...}."""
    m = re.search(r"\{\{\s*Infobox football league season\s*\n(.*?)\n\}\}", wikitext, re.S | re.I)
    out = {}
    if m:
        for line in m.group(1).split("\n| ") if "\n| " in m.group(1) else m.group(1).split("\n|"):
            k, eq, v = line.strip().lstrip("|").partition("=")
            if eq:
                out[k.strip().lower()] = v.strip()
    return out


def club_rows(season):
    """The season's clubs: the stadium table's rows, then any club a league table lists that the stadium table does not (2013-2015 have no
    'Team | Stadium' table): [(club article, name shown that year, stadium article or None, stadium shown)]."""
    rows = season_teams(season)
    seen = {r[0] for r in rows}
    for tbl in standings(season):
        for r in tbl["rows"]:
            if r["team_link"] not in seen:
                seen.add(r["team_link"])
                rows.append((r["team_link"], r["team_shown"], None, ""))
    return rows
