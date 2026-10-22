#!/usr/bin/env python3
"""Team names: one league's current clubs (from DS1, cached) and the matching of Wikipedia's spellings to them.

Wikipedia spells a club many ways inside one table ("Montreal", "NY Rangers", "Yankees", "at Houston Texans",
a link to "2026–27 Montreal Canadiens season"). Roster.resolve() settles a cell to one franchise or to None; a None
is reported as an unmatched team, never guessed.
"""
import csv, io, json, os, re, subprocess, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DS1 = os.path.join(HERE, "ds1.sh")


def ds1_csv(sql):
    """Rows (dicts) of a read-only query against DS1. Raises RuntimeError when DS1 cannot be reached."""
    p = subprocess.run([DS1, "--csv", "-c", sql], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError("DS1: " + (p.stderr.strip().splitlines() or ["query failed"])[-1])
    return list(csv.DictReader(io.StringIO(p.stdout)))


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


# Spellings Wikipedia's editors got wrong, seen in real articles (normalised form -> what norm() gives the club).
TYPOS = {"colombus": "columbus"}     # NHL: the San Jose Sharks article, March 13


def unaccent(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


class Roster:
    """The clubs of one league. Each club: dict(fid, name, location, nickname, abbr, fkey)."""

    def __init__(self, league, clubs):
        self.league = league
        self.clubs = clubs
        self.by_name = {norm(c["name"]): c for c in clubs}
        self.by_abbr = {c["abbr"].upper(): c for c in clubs if c.get("abbr")}
        self._nick, self._loc = {}, {}
        for c in clubs:
            self._nick.setdefault(norm(c["nickname"]), []).append(c)
            self._loc.setdefault(norm(c["location"]), []).append(c)

    def names(self): return [c["name"] for c in self.clubs]

    def resolve(self, text, link=None):
        """-> club dict or None. `link` is a wiki link target (a season article or the club's own article)."""
        for cand in (link, text):
            if not cand: continue
            t = re.sub(r"^\d{4}(?:\s*[–—-]\s*\d{2,4})?\s+", "", cand.strip())
            t = re.sub(r"\s+season$", "", t, flags=re.I)
            t = re.sub(r"^(?:at|vs\.?|v\.?|@)\s+", "", t, flags=re.I)
            n = norm(t)
            if not n: continue
            n = TYPOS.get(n, n)
            if n in self.by_name: return self.by_name[n]
            n2 = re.sub(r"^ny ", "new york ", n)
            n2 = re.sub(r"^la ", "los angeles ", n2)
            if n2 in self.by_name: return self.by_name[n2]
            if len(self._nick.get(n, [])) == 1: return self._nick[n][0]
            if len(self._loc.get(n, [])) == 1: return self._loc[n][0]
            for sep in (n2,):
                hit = [c for c in self.clubs if norm(c["name"]).startswith(sep + " ") or norm(c["name"]).endswith(" " + sep)]
                if len(hit) == 1: return hit[0]
            if t.upper() in self.by_abbr: return self.by_abbr[t.upper()]
        return None

    def by_abbreviation(self, abbr):
        return self.by_abbr.get((abbr or "").upper())


def load_rosters(leagues, cache_path=None):
    """{league: Roster} from DS1 (current franchise names); written to / read back from `cache_path`."""
    # fkey: the franchise key ('<source code>:<source key>', e.g. spx_database:26) that observations carry instead of database ids
    sql = ("select fl.league_code, fi.franchise_id, fi.full_name, fi.location, fi.nickname, coalesce(fi.abbreviation,'') abbr, s.code || ':' || f.source_key as fkey "
           "from core.franchise_league fl join core.franchise_identity fi on fi.franchise_id = fl.franchise_id and fi.valid_during @> current_date "
           "join core.franchise f on f.franchise_id = fl.franchise_id join meta.source s on s.source_id = f.source_id "
           "where fl.valid_during @> current_date and fl.league_code in (%s) order by 1, 3" % ",".join("'%s'" % x for x in leagues))
    try:
        rows = ds1_csv(sql)
        if cache_path:
            os.makedirs(os.path.dirname(os.path.abspath(cache_path)), exist_ok=True)
            kept = []       # a run limited to some leagues (run.py --league) must not drop the others' clubs from the cache
            try:
                with open(cache_path, encoding="utf-8") as f: kept = [r for r in json.load(f) if r.get("league_code") not in leagues]
            except (OSError, ValueError): pass
            with open(cache_path, "w", encoding="utf-8") as f: json.dump(kept + rows, f, ensure_ascii=False)
        src = "DS1"
    except RuntimeError:
        if not cache_path or not os.path.exists(cache_path): raise
        with open(cache_path, encoding="utf-8") as f: rows = json.load(f)
        if any("fkey" not in r for r in rows): raise RuntimeError("DS1 is needed once to cache the franchise keys (the cached club list predates them)")
        src = "cache"
    out = {}
    for lg in leagues:
        out[lg] = Roster(lg, [dict(fid=int(r["franchise_id"]), name=r["full_name"], location=r["location"], nickname=r["nickname"], abbr=r["abbr"], fkey=r["fkey"])
                              for r in rows if r["league_code"] == lg])
    return out, src
