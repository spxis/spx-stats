"""CFL team season yards from English Wikipedia club-season wikitext (CC BY-SA 4.0).

Only figures the article publishes as a *team* total. Player passing/rushing/receiving
tables are ignored: they are incomplete (leaders, not the club) and summing them would
guess. A "Team" / "Totals" footer on those tables is kept when it is labelled that way.

Accepted shapes, the same keys as nflverse in core.team_season_stat:
  * NFL-style Team / Opp columns with the stat name in the first column
    (Total yards, Passing yards, Rushing yards → yds, pass_yds, rush_yds, yds_against)
  * One row per club (Team + yards columns), for a league-season table
  * An explicit Team / Totals / Team totals row on a yards table

Nothing is derived. A hole is a hole. Not used: CFL.ca, CFLdb, CFLapedia, ESPN,
Sports Reference.

Usage: cfl_wp_parse.py [wikitext file ...]   prints season/club/stats or "none"
"""
import os, re, sys

STAT_KEY = {
    "total yards": "yds", "tot yds": "yds", "net yards": "yds", "net offence": "yds",
    "net offense": "yds", "yards": "yds", "yds": "yds", "offence yards": "yds",
    "offense yards": "yds",
    "passing yards": "pass_yds", "pass yards": "pass_yds", "pass yds": "pass_yds",
    "net passing yards": "pass_yds", "net passing": "pass_yds",
    "rushing yards": "rush_yds", "rush yards": "rush_yds", "rush yds": "rush_yds",
    "net rushing yards": "rush_yds", "net rushing": "rush_yds",
    "yards allowed": "yds_against", "yds allowed": "yds_against",
    "total yards allowed": "yds_against", "yards against": "yds_against",
    "games": "games_played", "gp": "games_played", "games played": "games_played",
}
AGAINST = re.compile(r"\b(allowed|against|opp|opponent)\b", re.I)
PLAYER_HEAD = re.compile(r"^(player|name)$", re.I)
TEAM_HEAD = re.compile(r"^(team|club)$", re.I)
OPP_HEAD = re.compile(r"^(opp|opponent|against)$", re.I)
TOTAL_NAME = re.compile(r"^(team|totals?|team totals?|club)$", re.I)
HEAD = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$")
NUM = re.compile(r"^-?[0-9][0-9,]*$")


def clean(s):
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", s or "", flags=re.S | re.I)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    for _ in range(6):
        s = re.sub(r"\{\{\s*(?:small|nowrap|nobr|abbr|sort|sortname|flagicon|font)[^{}|]*\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&ndash;", "–").replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def fold(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def num(s):
    t = clean(s).replace(",", "").replace("−", "-")
    if not NUM.match(t):
        return None
    return int(t)


def stat_key(label, against=False):
    k = fold(label)
    k = re.sub(r"\s*rank$", "", k)
    if against or AGAINST.search(k):
        k = AGAINST.sub("", k)
        k = fold(k)
        mapped = STAT_KEY.get(k)
        if mapped == "yds":
            return "yds_against"
        if mapped == "pass_yds":
            return "pass_yds_against"
        if mapped == "rush_yds":
            return "rush_yds_against"
        return mapped
    return STAT_KEY.get(k)


def tables(text):
    """Yield (section, header_cells, data_rows) for each top-level wikitable. Cells are cleaned text."""
    h2 = h3 = ""
    depth, cur = 0, []
    for ln in text.split("\n"):
        m = HEAD.match(ln)
        if m and depth == 0:
            if len(m.group(1)) == 2:
                h2, h3 = clean(m.group(2)), ""
            else:
                h3 = clean(m.group(2))
            continue
        if ln.lstrip().startswith("{|"):
            depth += 1
        if depth:
            cur.append(ln)
        if ln.lstrip().startswith("|}") and depth:
            depth -= 1
            if depth == 0:
                sec = " / ".join(x for x in (h2, h3) if x)
                yield sec, _table_rows("\n".join(cur))
                cur = []


def _strip_attr(part):
    part = part.strip()
    if re.match(r"^[^\[\]{}|]*?\b\w+\s*=", part) and "|" in part:
        part = re.sub(r"^[^\[\]{}|]*?\b\w+\s*=\s*[^|\[\]{}]*\|(?!\|)", "", part)
    return part.strip()


def _table_rows(table):
    rows, cells, is_h = [], [], False

    def flush():
        if cells:
            rows.append((is_h, [clean(c) for c in cells if clean(c) or c == ""]))

    for ln in table.split("\n")[1:]:
        s = ln.strip()
        if s.startswith("|-"):
            flush(); cells, is_h = [], False
            continue
        if s.startswith("|}") or s.startswith("|+"):
            continue
        if s[:1] in "|!" and s:
            is_h = is_h or s.startswith("!")
            body = s[1:]
            for part in re.split(r"\|\||!!", body):
                cells.append(_strip_attr(part))
        elif cells:
            cells[-1] += " " + s
    flush()
    if not rows:
        return [], []
    header, data = [], []
    if rows[0][0] or (rows[0][1] and not num(rows[0][1][0] or "x")):
        header, data_src = rows[0][1], rows[1:]
    else:
        header, data_src = [], rows
    for _, cells in data_src:
        if any(c for c in cells):
            data.append(cells)
    return header, data


def _header_kinds(header):
    kinds = []
    for h in header:
        f = fold(h)
        if PLAYER_HEAD.match(f):
            kinds.append("player")
        elif TEAM_HEAD.match(f):
            kinds.append("team")
        elif OPP_HEAD.match(f):
            kinds.append("opp")
        else:
            kinds.append("stat")
    return kinds


def from_team_opp(header, rows):
    """Stat-name in column 0, Team and Opp columns: an NFL-style team statistics table."""
    kinds = _header_kinds(header)
    if "team" not in kinds or "opp" not in kinds:
        # header may be blank / "Team" / "Opp" only, with stat names on each row
        if len(header) >= 3 and fold(header[0]) in ("", "stat", "category"):
            kinds = ["label"] + kinds[1:]
        elif len(header) >= 2 and "team" in kinds:
            pass
        else:
            # row labels, columns Team / Opp with no first header
            if len(header) == 2 and "team" in kinds and "opp" in kinds:
                kinds = ["label", "team", "opp"]
            elif len(header) == 3 and kinds[1:] == ["team", "opp"]:
                kinds = ["label", "team", "opp"]
            else:
                return None
    try:
        ti, oi = kinds.index("team"), kinds.index("opp")
    except ValueError:
        return None
    out = {}
    for row in rows:
        label = row[0] if row else ""
        if len(row) <= max(ti, oi):
            continue
        k = stat_key(label)
        if k and k not in ("games_played",) and k.endswith("_against"):
            continue
        if k in ("yds", "pass_yds", "rush_yds"):
            v, a = num(row[ti]), num(row[oi])
            if v is not None:
                out[k] = v
            if a is not None:
                out["yds_against" if k == "yds" else k + "_against"] = a
        elif k == "games_played":
            v = num(row[ti])
            if v is not None:
                out["games_played"] = v
    return out or None


def from_team_rows(header, rows):
    """One row per club: Team + yard columns (a league-season table)."""
    kinds = _header_kinds(header)
    if "team" not in kinds or "player" in kinds:
        return None
    keys = []
    for h, kind in zip(header, kinds):
        if kind == "team":
            keys.append("team")
        else:
            keys.append(stat_key(h) or stat_key(h, against=AGAINST.search(h) is not None))
    if not any(k in ("yds", "pass_yds", "rush_yds", "yds_against") for k in keys):
        return None
    found = []
    for row in rows:
        rec = {}
        name = None
        for i, k in enumerate(keys):
            if i >= len(row) or k is None:
                continue
            if k == "team":
                name = row[i]
                continue
            v = num(row[i]) if k != "games_played" else num(row[i])
            if v is not None:
                rec[k] = v
        if name and rec:
            found.append({"team": name, "stats": rec, "games_played": rec.pop("games_played", None)})
    return found or None


def from_totals_row(header, rows):
    """A labelled Team / Totals footer. Player tables without that label are skipped."""
    kinds = _header_kinds(header)
    if "player" not in kinds:
        return None
    keys = [stat_key(h) for h in header]
    if not any(k in ("yds", "pass_yds", "rush_yds") for k in keys):
        return None
    for row in rows:
        if not row or not TOTAL_NAME.match(fold(row[0])):
            continue
        out = {}
        for i, k in enumerate(keys):
            if k is None or i >= len(row):
                continue
            v = num(row[i])
            if v is not None:
                out[k] = v
        return out or None
    return None


def parse_article(text):
    """A club-season article → {stats, games_played, how} or None. League tables return None here
    (several clubs); use parse_league() for those."""
    merged, how = {}, []
    gp = None
    for section, (header, rows) in tables(text):
        if not header or not rows:
            continue
        kinds = _header_kinds(header)
        if "player" in kinds:
            tot = from_totals_row(header, rows)
            if tot:
                for k, v in tot.items():
                    if k == "games_played":
                        gp = gp or v
                    elif k not in merged:
                        merged[k] = v
                how.append("totals:" + (section or ""))
            continue
        if "opp" in kinds or (len(header) >= 2 and "team" in kinds and not any(stat_key(h) in ("yds", "pass_yds", "rush_yds") for h in header)):
            one = from_team_opp(header, rows)
            if one:
                gp = gp or one.pop("games_played", None)
                for k, v in one.items():
                    if k not in merged:
                        merged[k] = v
                how.append("team_opp:" + (section or ""))
            continue
        many = from_team_rows(header, rows)
        if many and len(many) == 1:
            rec = many[0]
            gp = gp or rec.get("games_played")
            for k, v in rec["stats"].items():
                if k not in merged:
                    merged[k] = v
            how.append("one_team:" + (section or ""))
    if not merged:
        return None
    keep = {k: v for k, v in merged.items() if k in ("yds", "pass_yds", "rush_yds", "yds_against",
                                                      "pass_yds_against", "rush_yds_against")}
    if not keep:
        return None
    return {"stats": keep, "games_played": gp, "how": how}


def parse_league(text):
    """A league-season article → list of {team, stats, games_played} from team-row tables only."""
    out = []
    for section, (header, rows) in tables(text):
        many = from_team_rows(header, rows)
        if many:
            for rec in many:
                rec["section"] = section
            out.extend(many)
    return out


def title_club(title):
    """'2008 BC Lions season' → (2008, 'BC Lions')."""
    m = re.match(r"^(\d{4})\s+(.+?)\s+season$", title.strip(), re.I)
    return (int(m.group(1)), m.group(2).strip()) if m else (None, None)


def main(paths):
    n = 0
    for p in paths:
        text = open(p, encoding="utf-8").read()
        title = os.path.splitext(os.path.basename(p))[0].replace("_", " ")
        one = parse_article(text)
        if one:
            n += 1
            print(title, one["stats"], one.get("how"))
        else:
            print(title, "none")
    print(n, "of", len(paths), "had a team total", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:] or [])
