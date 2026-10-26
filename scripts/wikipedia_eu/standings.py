"""What a rendered English Wikipedia season article of a European top division ("2005–06 FA Premier League", "2012–13 La Liga") holds that the loader keeps:
the final league table(s). Tables are read with scripts/mls/wikihtml.py. A table is recognised by its header (Pos, Team, Pld, ..., Pts); the links in the rendered
HTML carry the article each club leads to AFTER redirects, so a club that changed its name has one title.
standings(article) -> [{label, heading, caption, rows: [{pos, team_link, team_shown, marks, played, wins, draws, losses, gf, ga, gd, gr, points, ppg, qualification}]}]
`marks` is the bracket after the name: C champion, R relegated, P promoted, O play-off winner, Q qualified, X, T cup winners ... as Wikipedia writes them. A season played
as two groups or two rounds gives several tables; the build uses the season only when one table is the whole league."""
import os, re, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mls"))
import wikihtml as W

HEADER = {"pos": "pos", "pos.": "pos", "rank": "pos", "team": "team", "club": "team", "pld": "played", "gp": "played", "pl": "played", "p": "played", "w": "wins", "d": "draws", "t": "draws",
          "l": "losses", "gf": "gf", "f": "gf", "ga": "ga", "a": "ga", "gd": "gd", "gr": "gr", "ga.": "ga", "pts": "points", "pts.": "points", "pt": "points", "points": "points",
          "ppg": "ppg", "qualification or relegation": "qualification", "qualification": "qualification", "notes": "qualification", "qualification or relegation[a]": "qualification"}
SKIP = re.compile(r"attendance|scor|assist|fixtures|results|matrix|head-to-head|manager|stadium|season statistics|play-off|playoff|tiebreak|tie-break", re.I)


def _int(s):
    s = (s or "").replace("−", "-").replace("–", "-").replace("+", "").replace(",", "").strip()
    return int(s) if re.fullmatch(r"-?\d+", s) else None


def _num(s):
    s = (s or "").replace(",", ".").strip()
    return float(s) if re.fullmatch(r"\d+(?:\.\d+)?", s) else None


def standings(article):
    out = []
    for t in W.tables(article["text"]):
        g = W.grid(t)
        if not g:
            continue
        head = [re.sub(r"vte$", "", re.sub(r"\[[^\]]*\]", "", c["text"]).strip().lower()) for c in g[0]]
        cols = {}
        for i, h in enumerate(head):
            k = HEADER.get(h) or HEADER.get(re.sub(r"\W+$", "", h))
            if k and k not in cols:
                cols[k] = i
        if not ({"team", "played", "points"} <= set(cols)) or "pos" not in cols or len({"wins", "draws", "losses"} & set(cols)) < 3:
            continue
        label = f"{t['heading']} {t['caption']}".strip()
        rows = []
        for r in g[1:]:
            if len(r) <= max(cols.values()):
                continue
            cell = r[cols["team"]]
            if not cell["links"] and not cell["text"]:
                continue
            m = re.search(r"\(([A-Za-z]{1,2}(?:,\s*[A-Za-z]{1,2})*)\)\s*$", cell["text"])
            shown = re.sub(r"\s*\([A-Za-z]{1,2}(?:,\s*[A-Za-z]{1,2})*\)\s*$", "", cell["text"]).strip()
            link = next((l[0] for l in cell["links"] if l[1] and l[1].strip() and l[1].strip() in shown), None) or (cell["links"][0][0] if cell["links"] else None)
            rows.append({"pos": _int(r[cols["pos"]]["text"]), "team_link": link, "team_shown": shown,
                         "marks": [x.strip() for x in m.group(1).split(",")] if m else [],
                         "played": _int(r[cols["played"]]["text"]), "wins": _int(r[cols["wins"]]["text"]), "draws": _int(r[cols["draws"]]["text"]),
                         "losses": _int(r[cols["losses"]]["text"]), "gf": _int(r[cols["gf"]]["text"]) if "gf" in cols else None,
                         "ga": _int(r[cols["ga"]]["text"]) if "ga" in cols else None, "gd": _int(r[cols["gd"]]["text"]) if "gd" in cols else None,
                         "gr": _num(r[cols["gr"]]["text"]) if "gr" in cols else None, "points": _int(r[cols["points"]]["text"]),
                         "ppg": _num(r[cols["ppg"]]["text"]) if "ppg" in cols else None,
                         "qualification": (r[cols["qualification"]]["text"] or None) if "qualification" in cols else None})
        rows = [x for x in rows if x["team_shown"] and x["played"] is not None]
        if len(rows) >= 6:
            out.append({"label": label, "heading": t["heading"], "caption": t["caption"], "rows": rows})
    return out


def league_table(article, clubs=None):
    """The one table that is the whole league's final table, or None. The first table whose rows number the season's clubs, preferring the headings
    League table / Final table / Final classification / Standings; a table under a heading that mentions a group or a play-off is another table."""
    tables = standings(article)
    best = [t for t in tables if not SKIP.search(t["label"])]
    pref = [t for t in best if re.search(r"league table|final (?:table|classification|standings)|standings|classification|^table$|ranking", t["label"], re.I)]
    for t in pref or best:
        return t
    return None
