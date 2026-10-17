#!/usr/bin/env python3
"""Turn each cached retired-number article into parsed JSON rows.

Nothing is invented: a row is kept only when the table names a number 0-99 and a
person or honour. A cell that is a note, a header, or empty is left out.

Usage: extract.py [--cache DIR] [--out DIR] [code ...]
"""
import argparse, datetime, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from titles import TITLES
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "wikipedia_awards"))
from wikitable import tables, clean

SKIP_SECTION = re.compile(
    r"unofficial|honou?red numbers|former retired|former honou?red|pending|"
    r"see also|references|external links|^notes$|^key$|^history$|"
    r"similar honors|alternative methods|broadcasters|owners and|umpires|"
    r"players who pre-date|numbers kept out",
    re.I,
)
LEAGUE_WIDE = re.compile(
    r"league[- ]wide|entire league|whole league|across the league|"
    r"^all (nhl|nba|nfl|mlb|cfl) teams$|^major league baseball$|"
    r"^national hockey league$|^national basketball association$",
    re.I,
)
NOT_PLAYER = re.compile(
    r"^(fans?|the fans|supporters?|audience|organisation|organization|the (team|club|city)|"
    r"in honour of|in honor of)$",
    re.I,
)
NUM_RE = re.compile(r"\b(\d{1,2})\b")
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})|(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})|([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})|(\d{4})")


def name_key(s):
    s = (s or "").lower()
    for a, b in zip(
        "àáâãäåāăąçćčďđéèêëēěęğíìîïīıłñńňóòôõöøōőřśšşșťţúùûüūůűýÿžźż",
        "aaaaaaaaacccddeeeeeeegiiiiiilnnnoooooooorssssttuuuuuuuyyzzz",
    ):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]", "", s)


def titles_in(text):
    """name_key -> English Wikipedia title, from [[Title|Label]] in the section."""
    out = {}
    for m in re.finditer(r"\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", text or ""):
        title = m.group(1).strip()
        label = (m.group(2) or title).strip()
        if title.lower().startswith(("file:", "image:", "category:", "wikipedia:")):
            continue
        out[name_key(clean(label))] = title
        out[name_key(title.split("(")[0])] = title
    return out


def player_name(raw):
    s = clean(raw or "")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[*†‡^~#§+]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    return s or None


def parse_number(raw):
    s = clean(raw or "")
    if not s or re.search(r"not retired|unofficial|no number|n/?a|^[—–-]+$", s, re.I):
        return None
    if re.match(r"^00$", s.strip()):
        return 0
    m = NUM_RE.search(s)
    if not m:
        return None
    n = int(m.group(1))
    return n if 0 <= n <= 99 else None


def parse_date(raw):
    s = clean(raw or "")
    if not s:
        return None, None
    m = DATE_RE.search(s)
    if not m:
        return None, s
    if m.group(1):
        return m.group(1), s
    text = m.group(2) or m.group(3)
    if text:
        for fmt in ("%d %B %Y", "%d %b %Y", "%B %d %Y", "%B %d, %Y", "%b %d %Y", "%b %d, %Y"):
            try:
                return datetime.datetime.strptime(text.replace(",", ""), fmt.replace(",", "")).date().isoformat(), s
            except ValueError:
                continue
    if m.group(4) and len(m.group(4)) == 4:
        return None, s
    return None, s


def col_kind(header):
    h = name_key(header)
    if h in ("no", "num", "number", "jersey", "jerseynumber", "sweater", "n"):
        return "number"
    if h in ("player", "name", "person", "honouree", "honoree", "retiree", "for",
             "playerorotherfigure", "playerotherfigure"):
        return "player"
    if h in ("team", "club", "franchise"):
        return "team"
    if "retired" in h or h in ("date", "dateofretirement", "retirementdate"):
        return "date"
    if h in ("tenure", "years", "yearsplayed", "played", "withteam", "seasons"):
        return "tenure"
    if h in ("notes", "note", "reason", "honour", "honor"):
        return "notes"
    return None


def map_header(row):
    kinds = [col_kind(c) for c in row]
    if "number" in kinds and ("player" in kinds or "team" in kinds):
        return kinds
    return None


def sections(text):
    """Yield (heading, body) from wikitext. The lead is ('', lead)."""
    parts = re.split(r"\n(?==+[^=].*?=+)", text)
    if not parts:
        return
    yield "", parts[0]
    for p in parts[1:]:
        m = re.match(r"(=+)\s*(.*?)\s*\1", p)
        if not m:
            continue
        yield clean(m.group(2)), p[m.end():]


def is_league_wide(heading, team_name):
    blob = f"{heading} {team_name or ''}"
    return bool(LEAGUE_WIDE.search(blob))


def preprocess(text):
    """Turn {{dts|Y|M|D}} into an ISO date so the table reader keeps the day."""
    def dts(m):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
        return m.group(0)
    return re.sub(r"\{\{dts\|(\d{4})\|(\d{1,2})\|(\d{1,2})\}\}", dts, text, flags=re.I)


def extract_article(code, league, text, meta):
    rows = []
    n = 0
    text = preprocess(text)
    for heading, body in sections(text):
        if heading and SKIP_SECTION.search(heading):
            continue
        heading_team = None
        if heading and not LEAGUE_WIDE.search(heading) and "retired" not in heading.lower() and heading.lower() not in ("list", "list of all-time retired numbers"):
            heading_team = heading
        linked = titles_in(body)
        for tbl in tables(body):
            header_map = None
            for raw_row in tbl["rows"]:
                cells = raw_row["cells"] if isinstance(raw_row, dict) else raw_row
                if header_map is None:
                    kinds = map_header(cells)
                    if kinds:
                        header_map = kinds
                        continue
                    continue
                if len(cells) < 2:
                    continue
                got = {}
                for i, kind in enumerate(header_map):
                    if kind and i < len(cells):
                        got[kind] = cells[i]
                number = parse_number(got.get("number", ""))
                if number is None:
                    continue
                raw_player = got.get("player") or ""
                name = player_name(raw_player)
                title = linked.get(name_key(name or "")) or linked.get(name_key(raw_player))
                team_name = player_name(got.get("team", "")) or heading_team
                if team_name and LEAGUE_WIDE.search(team_name):
                    team_name = None
                    league_wide = True
                else:
                    league_wide = is_league_wide(heading, team_name) or (not team_name and bool(heading and LEAGUE_WIDE.search(heading)))
                if not name and not title:
                    continue
                if name and NOT_PLAYER.match(name) and not title:
                    honor = name
                    name = None
                else:
                    honor = None
                retired_on, retired_text = parse_date(got.get("date", ""))
                n += 1
                rows.append({
                    "row_number": n,
                    "league_code": league,
                    "team_name": None if league_wide else team_name,
                    "team_key": None if league_wide or not team_name else name_key(team_name),
                    "jersey_number": number,
                    "player_name": name or honor,
                    "player_title": title,
                    "player_key": name_key(name) if name else None,
                    "tenure_text": clean(got.get("tenure", "")) or None,
                    "retired_on": retired_on,
                    "retired_text": retired_text,
                    "league_wide": league_wide,
                    "notes": clean(got.get("notes", "")) or None,
                })
    return {
        "article_code": code,
        "league": league,
        "title": meta.get("title") or TITLES[code][1],
        "url": meta.get("url") or ("https://en.wikipedia.org/wiki/" + TITLES[code][1].replace(" ", "_")),
        "revision_id": meta.get("revision_id"),
        "fetched": datetime.date.today().isoformat(),
        "licence": "CC BY-SA 4.0",
        "rows": rows,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="raw/wikipedia_jersey/cache")
    ap.add_argument("--out", default="raw/wikipedia_jersey/parsed")
    ap.add_argument("codes", nargs="*")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for code in a.codes or TITLES:
        league, title = TITLES[code]
        src = os.path.join(a.cache, code + ".wikitext")
        meta_path = os.path.join(a.cache, code + ".meta.json")
        if not os.path.exists(src):
            print("missing cache", code, file=sys.stderr)
            sys.exit(1)
        text = open(src, encoding="utf-8").read()
        meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {"title": title}
        if meta.get("missing") or not text.strip():
            out = {"article_code": code, "league": league, "title": title, "url": meta.get("url"),
                   "revision_id": None, "fetched": datetime.date.today().isoformat(),
                   "licence": "CC BY-SA 4.0", "rows": [], "missing": True}
        else:
            out = extract_article(code, league, text, meta)
        dest = os.path.join(a.out, code + ".json")
        json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(code, len(out["rows"]), "rows")
