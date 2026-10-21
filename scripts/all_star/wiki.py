"""Small reader for English Wikipedia wikitext (CC BY-SA 4.0) used by the All-Star Game parser: tables that keep their links, templates, person cells, dates and scores.
Nothing here invents a value: what a reader cannot read comes back as None."""
import datetime, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "wikipedia_awards"))
import wikitable  # noqa: E402

MONTHS = {m: i + 1 for i, m in enumerate("January February March April May June July August September October November December".split())}
MONTH_RE = "(" + "|".join(MONTHS) + ")"
NOTE_TEMPLATES = r"(?:efn|efn-ua|efn-lr|refn|ref|ref label|note label|cite web|cite news|cite book|cite journal|cite press release|cite magazine|citation needed|cn|sfn|sfnp|r|cbignore)"


def drop_templates(s, names=NOTE_TEMPLATES):
    """s without {{name ...}} footnote and citation templates (nested braces handled)."""
    pat = re.compile(r"\{\{\s*" + names + r"\s*(?=[|}])", re.I)
    out, i = [], 0
    while True:
        m = pat.search(s, i)
        if not m:
            out.append(s[i:])
            return "".join(out)
        out.append(s[i:m.start()])
        depth, j = 0, m.start()
        while j < len(s):
            if s.startswith("{{", j):
                depth += 1; j += 2
            elif s.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0:
                    break
            else:
                j += 1
        i = j


def strip_markup(s):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref[^>]*?/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    return drop_templates(s)


def plain(raw):
    """A cell as plain text, footnotes and (n) counters left out."""
    t = wikitable.clean(strip_markup(raw or ""))
    t = re.sub(r"[\s*†‡§#]+$", "", t)
    return re.sub(r"\s*\(\d+\)\s*$", "", t).strip()


def txt(raw):
    """A cell as plain text, footnotes left out, a (n) at its end kept."""
    return wikitable.clean(strip_markup(raw or ""))


def norm_title(t):
    return t.replace("_", " ").split("#")[0].strip()


LINK = re.compile(r"\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]")


def links(raw):
    """[(article title, shown text)] of the [[links]] in raw, files and categories left out."""
    out = []
    for m in LINK.finditer(strip_markup(raw or "")):
        t = m.group(1).strip()
        if re.match(r"^(File|Image|Category|Media):", t, re.I):
            continue
        out.append((norm_title(t), wikitable.clean(m.group(2) if m.group(2) else t)))
    return out


def split_top(s, seps):
    return wikitable._split0(s, seps)


SORTNAME = re.compile(r"\{\{\s*sortname\s*\|([^{}]*)\}\}", re.I)


def person_of(seg):
    """The first person in a segment such as '[[Eddie Shack]], [[Toronto Maple Leafs]]' or '{{sortname|Jewell|Loyd}}, Seattle Storm':
    (name, article title or None, rest after the first comma). A sortname without nolink links to 'First Last' (or its third parameter)."""
    seg = strip_markup(seg or "").strip()
    parts = split_top(seg, [","])
    head, rest = parts[0], ",".join(parts[1:]).strip()
    m = SORTNAME.search(head)
    if m:
        a = [x.strip() for x in m.group(1).split("|")]
        pos = [x for x in a if "=" not in x]
        nolink = any(x.lower().startswith("nolink") and x.split("=")[-1].strip() not in ("", "0", "no") for x in a)
        name = " ".join(x for x in pos[:2] if x)
        title = None if nolink else (pos[2] if len(pos) > 2 and pos[2] else name)
        return name, norm_title(title) if title else None, rest
    ls = links(head)
    if ls:
        return ls[0][1], ls[0][0], rest
    return plain(head), None, rest


def team_of(rest):
    """(team text, team article title) from the part after a person's comma."""
    rest = strip_markup(rest or "")
    first = split_top(rest, [","])[0]
    ls = links(first)
    return plain(first) or None, (ls[0][0] if ls else None)


def parse_date(text, year=None):
    """'July 6, 1933', 'Friday, March 2, 1951', 'June 2' (with year) -> date or None."""
    m = re.search(MONTH_RE + r"\s+(\d{1,2})\b(?:,?\s*(\d{4}))?", wikitable.clean(strip_markup(text or "")))
    if not m:
        return None
    y = m.group(3) or year
    if not y:
        return None
    try:
        return datetime.date(int(y), MONTHS[m.group(1)], int(m.group(2)))
    except ValueError:
        return None


def date_range(text):
    """(first day, last day) of 'February 1 and 4, 2024', 'February 2-3, 2019', 'January 31 – February 2, 2020', 'July 6, 1933'."""
    t = wikitable.clean(strip_markup(text or "")).replace("&ndash;", "–")
    y = re.search(r"\b(1[89]\d\d|20\d\d)\b", t)
    if not y:
        return None, None
    year = int(y.group(1))
    a = re.search(MONTH_RE + r"\s+(\d{1,2})", t)
    if not a:
        return None, None
    try:
        d0 = datetime.date(year, MONTHS[a.group(1)], int(a.group(2)))
    except ValueError:
        return None, None
    rest = t[a.end():]
    b = re.match(r"\s*(?:[–—-]|and|&|to)\s*" + MONTH_RE + r"\s+(\d{1,2})", rest)
    c = re.match(r"\s*(?:[–—-]|and|&|to)\s*(\d{1,2})\b", rest)
    try:
        if b:
            return d0, datetime.date(year, MONTHS[b.group(1)], int(b.group(2)))
        if c:
            return d0, datetime.date(year, d0.month, int(c.group(1)))
    except ValueError:
        pass
    return d0, d0


def template_bodies(text, name):
    """The text inside each {{name ...}} (outer braces removed), nested templates kept, in page order."""
    out, i = [], 0
    pat = re.compile(r"\{\{\s*" + name + r"\s*(?=[|\n}])", re.I)
    while True:
        m = pat.search(text, i)
        if not m:
            return out
        depth, j = 0, m.start()
        while j < len(text):
            if text.startswith("{{", j):
                depth += 1; j += 2
            elif text.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0:
                    break
            else:
                j += 1
        out.append(text[m.end():j - 2])
        i = j


def params(body):
    """{key: value} of the |key=value parameters at the top level of a template body."""
    out = {}
    for p in split_top(body, ["|"])[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            out[k.strip()] = v.strip()
    return out


class Table:
    def __init__(self, attrs, path):
        self.attrs, self.caption, self.rows, self.path = attrs, "", [[]], path

    def clean_rows(self):
        return [r for r in self.rows if r]


def _cell(piece):
    parts = split_top(piece, ["|"])
    if len(parts) > 1 and ("=" in parts[0] or not parts[0].strip()):
        return parts[0], "|".join(parts[1:])
    return "", piece


def raw_tables(text):
    """Every table of the page as Table(attrs, caption, rows, path): a row is a list of (cell attributes, raw cell text), '!' header cells read like '|' ones.
    path is the headings above it, outermost first, as plain text."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref[^>]*?/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    heads, stack, done = [], [], []
    last = None
    for ln in text.split("\n"):
        s = ln.strip()
        hm = re.match(r"^(={2,6})\s*(.*?)\s*\1\s*$", s)
        if hm and not stack:
            lvl = len(hm.group(1))
            heads = [h for h in heads if h[0] < lvl] + [(lvl, wikitable.clean(hm.group(2)))]
            last = None
            continue
        if s.startswith("{|"):
            stack.append(Table(s[2:], tuple(h[1] for h in heads)))
            last = None
            continue
        if not stack:
            continue
        t = stack[-1]
        if s.startswith("|}"):
            done.append(stack.pop())
            last = None
            continue
        if s.startswith("|+"):
            t.caption = plain(_cell(s[2:])[1])
            continue
        if s.startswith("|-"):
            if t.rows[-1]:
                t.rows.append([])
            last = None
            continue
        if s and s[0] in "|!":
            seps = ["||", "!!"] if s[0] == "!" else ["||"]
            for piece in split_top(s[1:], seps):
                a, b = _cell(piece)
                t.rows[-1].append([a, b])
            last = t.rows[-1][-1] if t.rows[-1] else None
            continue
        if last is not None:
            last[1] += "\n" + ln
    done.extend(reversed(stack))
    for t in done:
        t.rows = [[(a, b) for a, b in r] for r in t.rows if r]
    return done


def lines_of(raw):
    """A cell split on <br> and <hr> into its lines."""
    return [x.strip() for x in re.split(r"<br\s*/?>|<hr\s*/?>", strip_markup(raw or ""), flags=re.I) if x.strip()]


OPPOSITE = {"afc": "NFC", "nfc": "AFC", "american conference": "National Conference", "national conference": "American Conference", "east": "West", "west": "East",
            "american": "National", "national": "American", "american league": "National League", "national league": "American League",
            "eastern conference": "Western Conference", "western conference": "Eastern Conference", "wales": "Campbell", "campbell": "Wales",
            "eastern": "Western", "western": "Eastern"}


def decided_by(text):
    t = text or ""
    if re.search(r"\bSO\b|shoot-?out", t, re.I):
        return "SO"
    if re.search(r"\bOT\b|overtime|\bextra innings\b|\b\d+OT\b", t, re.I):
        return "OT"
    return None


def parse_result(text):
    """'East 111 – 94 West', 'Wales 6 – Campbell 3 (OT)', 'West 79, East 61', 'Giants 13, NFL All-Stars 10', 'NFC, 27–6' ->
    (side1, score1, side2, score2, decided_by); None when no two scores can be read. The first side is the one printed first."""
    t = wikitable.clean(strip_markup(text or ""))
    t = t.replace("–", "–").replace("—", "–")
    t = re.sub(r"\((?:tie|draw)\)", "", t, flags=re.I).strip()
    by = decided_by(t)
    core_t = re.sub(r"\s*\((?:[^()]*(?:OT|SO|overtime|shootout)[^()]*)\)", "", t, flags=re.I).strip()
    core_t = re.sub(r"\s*\(?\bOvertime\b\)?\s*$", "", core_t, flags=re.I).strip()
    m = re.match(r"^(?P<a>.+?)\s+(?P<sa>\d+)\s*[–-]\s*(?P<sb>\d+)\s+(?P<b>[^\d].*)$", core_t)
    if m:
        return m.group("a").strip(" ,"), int(m.group("sa")), m.group("b").strip(" ,"), int(m.group("sb")), by
    m = re.match(r"^(?P<a>[^\d]+?)\s+(?P<sa>\d+)\s*(?:[–-]|,)\s*(?P<b>[^\d].*?)\s+(?P<sb>\d+)\s*$", core_t)
    if m:
        return m.group("a").strip(" ,"), int(m.group("sa")), m.group("b").strip(" ,"), int(m.group("sb")), by
    m = re.match(r"^(?P<a>[^\d]+?)[,\s]+(?P<sa>\d+)\s*[–-]\s*(?P<sb>\d+)\s*$", core_t)
    if m:
        a = m.group("a").strip(" ,")
        b = OPPOSITE.get(a.lower())
        if b:
            return a, int(m.group("sa")), b, int(m.group("sb")), by
    return None


def int_of(text):
    m = re.search(r"\d[\d,]*", text or "")
    return int(m.group(0).replace(",", "")) if m else None
