#!/usr/bin/env python3
"""The club leaders (passing, rushing, receiving) of CFL club-season articles on English Wikipedia (CC BY-SA 4.0), as written in the article.

  parse.py <raw dir> <out.sql> [<report.json>]    reads <raw dir>/fetched.json and the .wikitext files fetch.py saved, writes one rerunnable SQL file for
                                                  legacy_wikipedia_cfl_leaders (migration 174, DS1 only) and a report of what could not be read
  parse.py --report <raw dir>                     counts only; nothing is written

Two shapes of article carry them:
  * "Player stats" (or "Statistics") with a Passing, a Rushing and a Receiving sub-section, each one wikitable: the player, then his figures.
  * "Offensive leaders" (the BC Lions' articles 1958-81): one wikitable, a player and his passing, rushing and receiving yards and touchdowns.
A table is read as written: the order of the rows is the article's, a name is kept as text, a link is kept as the article title it names (never turned into a
person here: db/build/238 decides that), a figure the article leaves empty or writes as N/A is null. Nothing is dropped: a row whose cells do not fit its header is
still a line, and goes to `unparsed` as well. A section with no table, or a second table, goes to `unparsed`. Defence, kicking, punting and returns are not read.
"""
import html, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


WP = _load("wp_parse", os.path.join(HERE, "..", "rosters", "wp_parse.py"))

HEAD = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", re.M)
CATS = {"passing": "passing", "rushing": "rushing", "receiving": "receiving", "offensive leaders": "offence"}
TITLE = re.compile(r"^(\d{4}) (.+) season$")

# What each header becomes. A header not in the map keeps its own words as the key, and is reported.
KEYS = {
    "player": "player", "name": "player",
    "games played": "gp", "games": "gp", "gp": "gp", "g": "gp",
    "att": "att", "attempts": "att", "rushes": "att", "rushing attempts": "att", "car": "att", "carries": "att", "passing attempts": "att",
    "comp": "comp", "completions": "comp", "cmp": "comp", "pass completions": "comp",
    "%": "pct", "pct": "pct", "percentage": "pct", "comp %": "pct", "comp pct": "pct", "completion %": "pct",
    "yards": "yds", "yds": "yds",
    "td": "td", "tds": "td", "touchdowns": "td",
    "int": "int", "ints": "int", "interceptions": "int",
    "rating": "rating", "qb rating": "rating", "eff": "rating", "efficiency": "rating", "passer rating": "rating",
    "avg": "avg", "average": "avg", "yards per carry": "avg", "ypc": "avg",
    "long": "long", "longest": "long", "lg": "long",
    "no": "rec", "receptions": "rec", "rec": "rec", "catches": "rec",
    "fumbles": "fum", "fumble": "fum", "fum": "fum", "fumbles lost": "fumlost",
    "passing yds": "pass_yds", "passing yards": "pass_yds", "pass yds": "pass_yds", "rushing yds": "rush_yds", "rushing yards": "rush_yds",
    "rush yds": "rush_yds", "receiving yds": "rec_yds", "receiving yards": "rec_yds", "rec yds": "rec_yds",
}
EMPTY = {"", "n/a", "na", "-", "–", "—", "−", "?", "none"}


def clean(s):
    return html.unescape(WP._clean(s)).replace("\xa0", " ").strip()


def head_key(h):
    h = re.sub(r"\{\{abbr\|([^|}]*)\|[^}]*\}\}", r"\1", h, flags=re.I)
    h = clean(re.sub(r"<[^>]+>|'''|''", "", h))
    h = re.sub(r"\s+", " ", h).strip().lower().rstrip(".,:;")
    return KEYS.get(h, "x:" + re.sub(r"[^a-z0-9]+", "_", h).strip("_"))


def figure(c):
    """One cell as the article gives it: None when empty or N/A, a number without commas or a percent sign, else the text (73T)."""
    t = clean(re.sub(r"'''|''|<[^>]+>", "", WP.cell_text(c)))
    if t.lower() in EMPTY: return None
    n = t.replace(",", "").rstrip("%").strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", n): return n
    return t[:24]


def player(c):
    """(name, article title or None) of a name cell; the name has no footnote marks."""
    c = re.sub(r"<ref[^>]*?/>|<ref[^>]*?>.*?</ref>|<!--.*?-->|'''|''", "", c, flags=re.S).strip()
    name, title = WP.player_cell(WP.cell_text(c))
    name = html.unescape(name or "").replace("\xa0", " ")
    name = re.sub(r"\s*[*†‡§]+$", "", re.sub(r"\s+", " ", name)).strip()
    return name, (html.unescape(title).strip() if title else None)


def first_table(body):
    """(text of the first wikitable, how many tables the body holds); tables nest, so the opening and closing lines are counted."""
    depth, start, n, first, pos = 0, None, 0, None, 0
    for ln in body.splitlines(keepends=True):
        st = ln.lstrip()
        if st.startswith("{|"):
            if depth == 0: start = pos
            depth += 1
        elif st.startswith("|}") and depth:
            depth -= 1
            if depth == 0:
                n += 1
                if first is None: first = body[start:pos + len(ln)]
        pos += len(ln)
    return first, n


def table_lines(text):
    """-> (columns [key], rows [[cell text]]). The header is the row with a Player or Name cell; a row before it is ignored."""
    rows, header = [], None
    for chunk in re.split(r"^\|-.*$", text, flags=re.M):
        cells, hdr = [], False
        for ln in chunk.splitlines():
            s = ln.strip()
            if s.startswith("{|"): continue
            if s.startswith("!"):
                hdr = True
                cells += [y for x in WP.top_split(s[1:], "!!") for y in WP.top_split(x, "||")]
            elif s.startswith("|") and not s.startswith(("|}", "|+")):
                cells += WP.top_split(s[1:], "||")
        if not cells: continue
        if header is None:
            keys = [head_key(WP.cell_text(c)) for c in cells]
            if "player" in keys: header = keys
            continue
        if not hdr: rows.append(cells)
    return header, rows


def leaders(text):
    """The leader lines of one article's wikitext.
    -> (lines [dict(category, ord, name, title, stats {key: text or None})], unparsed [(section, text)], tables found)"""
    lines, unparsed, found = [], [], 0
    heads = [(m.start(), m.end(), len(m.group(1)), clean(re.sub(r"'''|''", "", m.group(2))).lower()) for m in HEAD.finditer(text)]
    for i, (s, e, lvl, name) in enumerate(heads):
        cat = CATS.get(name)
        if not cat: continue
        end = next((h[0] for h in heads[i + 1:] if h[2] <= lvl), len(text))
        body = text[e:end]
        tab, n = first_table(body)
        if tab is None:
            unparsed.append((name, "no table under this heading")); continue
        found += 1
        if n > 1: unparsed.append((name, f"{n} tables under this heading, the first is read"))
        header, rows = table_lines(tab)
        if not header or "player" not in header:
            unparsed.append((name, "table with no Player column")); continue
        if cat == "rushing" and "rec" in header and "att" not in header:
            header = ["att" if k == "rec" else k for k in header]   # a rushing table headed No.: the number of carries
        seen = {}
        for k in header:
            seen[k] = seen.get(k, 0) + 1
        for k, c in seen.items():
            if c > 1 and k != "player": unparsed.append((name, f"two columns read as {k}: the first is kept"))
        for k in header:
            if k.startswith("x:"): unparsed.append((name, f"column {k[2:]} is not read"))
        if not any(player(c[header.index("player")])[0] for c in rows if header.index("player") < len(c)):
            unparsed.append((name, "the table names no player"))
        o = 0
        for cells in rows:
            pi = header.index("player")
            if pi >= len(cells): continue
            nm, title = player(cells[pi])
            if not nm: continue
            stats = {}
            for k, c in zip(header, cells):
                if k == "player" or k.startswith("x:") or k in stats: continue
                stats[k] = figure(c)
            if len(cells) != len(header): unparsed.append((name, f"{nm}: {len(cells)} cells under {len(header)} headings"))
            lines.append(dict(category=cat, ord=o, name=nm, title=title, stats=stats))
            o += 1
    return lines, unparsed, found


def club_season(title):
    m = TITLE.match(title)
    return (int(m.group(1)), m.group(2)) if m else (None, None)


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def read_raw(raw):
    with open(os.path.join(raw, "fetched.json"), encoding="utf-8") as f: meta = json.load(f)
    for a in meta["articles"]:
        if a.get("missing"):
            a["text"] = None
            continue
        with open(os.path.join(raw, a["file"]), encoding="utf-8") as f: a["text"] = f.read()
    return meta


def build(raw):
    meta = read_raw(raw)
    arts, lines, unparsed = [], [], []
    for a in sorted(meta["articles"], key=lambda x: x["title"]):
        season, club = club_season(a["title"])
        if season is None: continue
        if a.get("missing") or a["text"].lstrip().lower().startswith("#redirect"):
            unparsed.append((season, club, "(article)", "no article or a redirect: " + a["title"])); continue
        ls, un, n = leaders(a["text"])
        arts.append(dict(season=season, club=club, title=a["title"], revid=a["revid"], revised_at=a["timestamp"], tables=n, lines=len(ls)))
        for l in ls: lines.append(dict(season=season, club=club, **l))
        unparsed += [(season, club, s, t) for s, t in un]
    return meta, arts, lines, unparsed


def links(raw):
    """The titles a leader line links to, and what Wikidata item each is (fetch.py titles writes titles-NNN.json)."""
    out = {}
    for f in sorted(os.listdir(raw)):
        if not f.startswith("titles-"): continue
        with open(os.path.join(raw, f), encoding="utf-8") as fh: d = json.load(fh)
        norm = {n["from"]: n["to"] for n in d.get("normalized", [])}
        redir = {n["from"]: n["to"] for n in d.get("redirects", [])}
        pages = {p["title"]: p for p in d["pages"]}
        for t in d["requested"]:
            r = norm.get(t, t); r = redir.get(r, r)
            p = pages.get(r)
            out[t] = (r, p.get("qid") if p else None, bool(p and p.get("disambiguation")), bool(not p or p.get("missing")))
    return out


def sql(raw, out):
    meta, arts, lines, unparsed = build(raw)
    lk = links(raw)
    o = ["-- legacy_wikipedia_cfl_leaders: the club leaders of CFL club-season articles on English Wikipedia (CC BY-SA 4.0), generated by scripts/cfl_leaders/parse.py.",
         "-- Whole-table replace, rerunnable; DS1 only. Raw wikitext is archived first (legacy_files.raw_archive, wikipedia-cfl-leaders/).", "begin;",
         "delete from legacy_wikipedia_cfl_leaders.line; delete from legacy_wikipedia_cfl_leaders.link_title; delete from legacy_wikipedia_cfl_leaders.unparsed; delete from legacy_wikipedia_cfl_leaders.article;"]
    fetched_on = meta["fetched_on"]
    for a in arts:
        o.append("insert into legacy_wikipedia_cfl_leaders.article (season, club, page_title, revid, revised_at, fetched_on, tables_read, lines_read) values "
                 f"({a['season']}, {q(a['club'])}, {q(a['title'])}, {a['revid']}, {q(a['revised_at'])}, {q(fetched_on)}, {a['tables']}, {a['lines']});")
    for l in lines:
        o.append("insert into legacy_wikipedia_cfl_leaders.line (season, club, category, ord, name, link_title, stats) values "
                 f"({l['season']}, {q(l['club'])}, {q(l['category'])}, {l['ord']}, {q(l['name'])}, {q(l['title'])}, {q(json.dumps(l['stats'], sort_keys=True))}::jsonb);")
    want = sorted({l["title"] for l in lines if l["title"]})
    for t in want:
        r, qid, dis, miss = lk.get(t, (None, None, False, False))
        o.append("insert into legacy_wikipedia_cfl_leaders.link_title (title, resolved_title, qid, disambiguation, missing, looked_up) values "
                 f"({q(t)}, {q(r)}, {q(qid)}, {str(dis).lower()}, {str(miss).lower()}, {str(t in lk).lower()});")
    for season, club, s, t in unparsed:
        o.append("insert into legacy_wikipedia_cfl_leaders.unparsed (season, club, section, note) values "
                 f"({season or 'null'}, {q(club)}, {q(s)}, {q(t)});")
    o.append("commit;")
    with open(out, "w", encoding="utf-8") as f: f.write("\n".join(o) + "\n")
    return arts, lines, unparsed, want, lk


def report(raw):
    meta, arts, lines, unparsed = build(raw)
    with_lines = [a for a in arts if a["lines"]]
    print(f"{len(arts)} articles read, {len(with_lines)} with leaders, {len(lines)} lines, {sum(1 for l in lines if l['title'])} with a link, {len(unparsed)} notes")
    by = {}
    for l in lines: by[l["category"]] = by.get(l["category"], 0) + 1
    print("lines by category:", by)
    return meta, arts, lines, unparsed


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == "--report":
        report(os.path.expanduser(a[1])); sys.exit()
    if len(a) < 2: sys.exit(__doc__)
    arts, lines, unparsed, want, lk = sql(os.path.expanduser(a[0]), os.path.expanduser(a[1]))
    print(f"{len([x for x in arts if x['lines']])} club seasons with leaders, {len(lines)} lines, {len(want)} linked titles ({sum(1 for t in want if t in lk)} looked up), {len(unparsed)} notes")
    if len(a) > 2:
        json.dump({"articles": arts, "unparsed": unparsed}, open(os.path.expanduser(a[2]), "w"), indent=1)
