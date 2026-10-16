"""Local logo library on this Mac, outside the repository.

Reads DS1 with SELECT only (bash scripts/daily/ds1.sh) and writes a folder of logo
files plus one index.html. Archived bytes are copied as stored. Hotlinked marks are
recorded by URL. The page embeds the catalog: a file:// page cannot fetch a sibling
JSON file. Nothing here writes DS1 or production.

Usage:
  python3 scripts/logos/library.py [--dest PATH] [--no-collect]
  SPX_LOGO_LIBRARY overrides the destination when --dest is omitted.
  Default destination: ~/Projects/backups/spx-stats/logo-library
"""
import base64, csv, hashlib, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commons_report
import commons_sweep

ROOT = Path(__file__).resolve().parents[2]
DS1 = ROOT / "scripts" / "daily" / "ds1.sh"
EXTRA = ROOT / "db" / "seed" / "logo_extra.csv"
CAPSPACE = Path(os.environ.get("SPX_CAPSPACE_SRC", "/tmp/capspace-src"))
MIME_EXT = {"image/gif": "gif", "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp"}
SL_CODE = {
    "National Hockey League": "nhl",
    "Major League Baseball": "mlb",
    "National Basketball Association": "nba",
    "National Football League": "nfl",
    "Canadian Football League": "cfl",
    "Pacific Coast Hockey Association": "pcha",
    "Western Canada Hockey League": "wchl",
    "Federal League": "federal",
}
PARENT_LG = {"nha": "other:hockey", "pcha": "other:hockey", "wchl": "other:hockey", "wha": "other:hockey", "afl": "nfl", "aafc": "nfl"}


def require_select(sql):
    """Refuse anything that is not a single SELECT or WITH statement."""
    text = sql.strip()
    head = text.split(None, 1)[0].lower() if text else ""
    if head not in ("select", "with"):
        raise SystemExit("library: refusing SQL that does not start with select or with")
    body = text[:-1] if text.endswith(";") else text
    if ";" in body:
        raise SystemExit("library: refusing SQL that does not start with select or with")
    return text


def library_dest(argv=None, env=None):
    if argv is None:
        argv = sys.argv[1:]
    if env is None:
        env = os.environ
    if "--dest" in argv:
        i = argv.index("--dest")
        if i + 1 >= len(argv):
            raise SystemExit("library: --dest needs a path")
        chosen = argv[i + 1]
    elif (env.get("SPX_LOGO_LIBRARY") or "").strip():
        chosen = env["SPX_LOGO_LIBRARY"].strip()
    else:
        chosen = str(Path.home() / "Projects/backups/spx-stats/logo-library")
    return Path(os.path.expanduser(chosen))


def ds1(sql):
    sql = require_select(sql)
    p = subprocess.run(["bash", str(DS1), "-X", "-q", "-At", "-F", "\t", "-c", sql], capture_output=True, text=True, cwd=ROOT)
    if p.returncode:
        raise SystemExit("library: ds1 failed: " + p.stderr.strip()[-400:])
    return [line.split("\t") for line in p.stdout.splitlines() if line]


def num(s):
    s = (s or "").strip()
    return int(s) if s else None


def era_label(y0, y1):
    a, b = (y0 or "").strip(), (y1 or "").strip()
    if a and b:
        return f"{a}–{b}"
    if a:
        return f"{a}–"
    if b:
        return f"–{b}"
    return ""


def fmt_of(name, mime):
    ext = Path(name).suffix.lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    if ext in ("svg", "png", "gif", "jpg", "webp"):
        return ext
    return MIME_EXT.get(mime or "", ext or "other")


def klass_of(licence, non_free=False):
    if non_free or commons_report.NON_FREE.search(licence or ""):
        return "non-free"
    return commons_report.licence_class({"LicenseShortName": licence or "", "UsageTerms": "", "License": ""})


def mentions(text, phrase):
    phrase = commons_report.norm(phrase or "")
    if len(phrase.split()) < 2:
        return False
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", commons_report.norm(text or "")) is not None


def safe_name(name):
    name = name.replace("\\", "/").split("/")[-1].strip()
    if not name or name in (".", "..") or "\x00" in name:
        raise SystemExit("library: bad file name")
    return name


def _commons_name(url):
    path = urllib.parse.unquote(urllib.parse.urlparse(url or "").path)
    m = re.search(r"/thumb/(?:.*/)?([^/]+)/\d+px-", path)
    if m:
        return safe_name(m.group(1)) if m.group(1) not in (".", "..") else ""
    if "/team-logos/" in path:
        return ""
    leaf = path.split("/")[-1]
    return leaf if leaf and "." in leaf else ""


def blank_mark(id_, source):
    return {"id": id_, "leagues": set(), "clubs": set(), "eras": set(), "source": source, "licence": "", "klass": "unknown",
            "format": "", "bytes": None, "width": None, "height": None, "site": False, "file": "", "url": "", "page": "", "kind": ""}


def add_use(mark, league, club, y0, y1, kind=""):
    for part in (league or "").split(","):
        if part:
            mark["leagues"].add(part)
    if club:
        mark["clubs"].add(club)
    label = era_label(y0, y1)
    if label:
        mark["eras"].add(label)
    if kind and not mark["kind"]:
        mark["kind"] = kind


def finish(mark):
    return {"id": mark["id"], "league": ",".join(sorted(mark["leagues"])), "club": " · ".join(sorted(mark["clubs"])),
            "era": ", ".join(sorted(mark["eras"])), "source": mark["source"], "licence": mark["licence"], "klass": mark["klass"],
            "format": mark["format"], "bytes": mark["bytes"], "width": mark["width"], "height": mark["height"], "site": mark["site"],
            "file": mark["file"], "url": mark["url"], "page": mark["page"], "kind": mark["kind"]}


BRANDS = """
select b.franchise_id::text,
       coalesce((select string_agg(distinct l.league_code, ',' order by l.league_code) from core.franchise_league l where l.franchise_id = b.franchise_id), 'other'),
       coalesce((select string_agg(distinct i.full_name, ' | ' order by i.full_name)
                 from core.franchise_identity i where i.franchise_id = b.franchise_id and i.valid_during && b.valid_during), ''),
       coalesce(extract(year from lower(b.valid_during))::text, ''),
       coalesce(extract(year from upper(b.valid_during))::text, ''),
       b.logo_url, coalesce(replace(replace(b.logo_licence, chr(9), ' '), chr(10), ' '), ''),
       coalesce(b.logo_page, ''), s.code
from core.franchise_brand b
join meta.source s on s.source_id = b.source_id
where b.logo_url is not null
order by 1, 6
"""

COMMONS = """
select file, coalesce(page_url, ''), coalesce(file_url, ''), coalesce(mime, ''),
       coalesce(width::text, ''), coalesce(height::text, ''), coalesce(bytes::text, ''),
       coalesce(replace(replace(licence, chr(9), ' '), chr(10), ' '), ''), licence_class,
       coalesce(years_from::text, ''), coalesce(years_to::text, ''), coalesce(archive_name, '')
from legacy_team_brand.commons_logo
order by file
"""

SPORTS = """
select l.sl_logo_key, coalesce(t.league_name, ''), coalesce(replace(replace(t.name, chr(9), ' '), chr(10), ' '), ''),
       coalesce(l.kind, ''), coalesce(l.year_from::text, ''), coalesce(l.year_to::text, ''), coalesce(l.mime, ''),
       coalesce(l.width::text, ''), coalesce(l.height::text, ''), coalesce(l.bytes::text, ''),
       coalesce(l.hosted_path, ''), coalesce(l.archive_name, ''), coalesce(l.page_url, ''), coalesce(l.sha256, '')
from legacy_sportslogos.logo l
join legacy_sportslogos.team t on t.sl_team_id = l.sl_team_id
order by l.sl_logo_key
"""

TEAM_LOGOS = """
select tl.file,
       coalesce((select string_agg(distinct t.league_code, ',' order by t.league_code) from legacy_team_brand.team t where t.qid = tl.qid), ''),
       coalesce((select string_agg(distinct t.label, ' | ' order by t.label) from legacy_team_brand.team t where t.qid = tl.qid), ''),
       coalesce(tl.starts_on::text, ''), coalesce(tl.ends_on::text, ''),
       coalesce(tl.file_url, ''), coalesce(tl.thumb_url, ''), coalesce(tl.page_url, ''),
       coalesce(replace(replace(tl.licence, chr(9), ' '), chr(10), ' '), ''), coalesce(tl.licence_code, '')
from legacy_team_brand.team_logo tl
order by tl.file
"""

WIKI = """
select file, league_code, replace(replace(title, chr(9), ' '), chr(10), ' '),
       coalesce(file_url, ''), thumb_url, page_url,
       coalesce(replace(replace(licence, chr(9), ' '), chr(10), ' '), ''), non_free::text
from legacy_team_brand.wikipedia_logo
order by file
"""

IDENTS = """
select i.franchise_identity_id::text, i.franchise_id::text,
       coalesce((select string_agg(distinct l.league_code, ',' order by l.league_code) from core.franchise_league l where l.franchise_id = i.franchise_id), 'other'),
       replace(replace(i.full_name, chr(9), ' '), chr(10), ' '),
       coalesce(replace(replace(i.location, chr(9), ' '), chr(10), ' '), ''),
       coalesce(replace(replace(i.nickname, chr(9), ' '), chr(10), ' '), ''),
       coalesce(extract(year from lower(i.valid_during))::text, ''),
       coalesce(extract(year from upper(i.valid_during))::text, ''),
       case when exists (select 1 from core.franchise_brand b where b.franchise_id = i.franchise_id and b.logo_url is not null) then '1' else '0' end
from core.franchise_identity i
order by 2, 4
"""

BYTES = """
select kind, key, sha, replace(encode(data, 'base64'), chr(10), '') from (
  select 'commons'::text as kind, c.file as key, a.sha256 as sha, a.data as data
  from legacy_team_brand.commons_logo c
  join legacy_files.raw_archive a on a.name = c.archive_name
  where c.archive_name is not null
  union all
  select 'sportslogos', l.sl_logo_key, a.sha256, a.data
  from legacy_sportslogos.logo l
  join legacy_files.raw_archive a on a.name = l.archive_name
  where l.archive_name is not null
) archived
order by 1, 2
"""


def load_catalog():
    marks = {}
    for row in ds1(COMMONS):
        file, page, url, mime, w, h, size, licence, klass, y0, y1, _arch = row
        m = blank_mark("commons:" + file, "wikimedia_commons")
        m.update(licence=licence, klass=klass or klass_of(licence), format=fmt_of(file, mime), bytes=num(size), width=num(w), height=num(h), url=url, page=page)
        add_use(m, "", "", y0, y1)
        marks[m["id"]] = m
    sport_sha = {}
    for row in ds1(SPORTS):
        key, league, club, kind, y0, y1, mime, w, h, size, hosted, _arch, page, sha = row
        m = blank_mark("sportslogos:" + key, "sportslogos")
        ext = Path(hosted).suffix or ("." + MIME_EXT.get(mime, "gif"))
        m.update(licence="Fair use, via SportsLogos.Net", klass="non-free", format=fmt_of(hosted or ext, mime),
                 bytes=num(size), width=num(w), height=num(h), url="", page=page, kind=kind)
        add_use(m, SL_CODE.get(league, league.lower().replace(" ", "-") if league else ""), club, y0, y1, kind)
        marks[m["id"]] = m
        sport_sha[key] = sha
    for row in ds1(TEAM_LOGOS):
        file, league, club, start, end, url, thumb, page, licence, code = row
        id_ = "commons:" + file
        m = marks.get(id_)
        if m is None:
            m = blank_mark("wikidata:" + file, "wikidata")
            m.update(licence=licence, klass=klass_of(licence or code), format=fmt_of(file, ""), url=url or thumb, page=page)
            marks[m["id"]] = m
        elif not m["url"]:
            m["url"] = url or thumb
        add_use(m, league, club, start[:4] if start else "", end[:4] if end else "")
    for row in ds1(WIKI):
        file, league, title, url, thumb, page, licence, non_free = row
        m = marks.get("commons:" + file) or marks.get("wikidata:" + file) or marks.get("wikipedia:" + file)
        if m is None:
            m = blank_mark("wikipedia:" + file, "wikipedia")
            m.update(licence=licence, klass="non-free" if non_free == "true" else klass_of(licence), format=fmt_of(file, ""),
                     url=url or thumb, page=page)
            marks[m["id"]] = m
        add_use(m, league, title, "", "")
    by_url = {}
    for m in marks.values():
        if m["url"]:
            by_url[m["url"]] = m
        name = m["id"].split(":", 1)[-1]
        by_url.setdefault(name, m)
    for row in ds1(BRANDS):
        _fid, league, clubs, y0, y1, url, licence, page, source = row
        m = None
        if url.startswith("/team-logos/sl/"):
            m = marks.get("sportslogos:" + Path(url).stem)
        else:
            name = _commons_name(url)
            if name:
                m = marks.get("commons:" + name) or marks.get("wikidata:" + name) or marks.get("wikipedia:" + name)
            m = m or by_url.get(url)
        if m is None:
            leaf = _commons_name(url) or Path(urllib.parse.urlparse(url).path).name or url
            m = blank_mark(source + ":" + leaf, source)
            m.update(licence=licence, klass=klass_of(licence), format=fmt_of(leaf, ""), url=url, page=page)
            marks[m["id"]] = m
        m["site"] = True
        if licence and not m["licence"]:
            m["licence"] = licence
            m["klass"] = klass_of(licence)
        if page and not m["page"]:
            m["page"] = page
        for club in [c.strip() for c in clubs.split("|") if c.strip()]:
            add_use(m, league, club, y0, y1)
    return marks, sport_sha


def label_from_names(marks, idents):
    for m in marks.values():
        blob = m["id"] + " " + m["url"]
        for ident in idents:
            if mentions(blob, ident["name"]):
                add_use(m, ident["lg"], ident["name"], ident["y0"], ident["y1"])


def apply_seed(marks, extra):
    missing = []
    for row in extra:
        key = row["file_key"]
        m = marks.get("commons:" + key) or marks.get("sportslogos:" + key)
        if m is None:
            missing.append(row)
            continue
        add_use(m, row["league"], row["team"], row["from_year"], row["to_year"])
    return missing


def _seed_klass(note):
    text = (note or "").lower()
    if "fair use" in text:
        return "non-free", "Fair use, via SportsLogos.Net"
    if "cc by" in text:
        return "free", note
    return "pd", note or "Public domain"


def attach_local(dest, marks, missing):
    """A seed file that is already in the library, before DS1 has its legacy row."""
    dest = Path(dest)
    n = 0
    for row in missing:
        key = row["file_key"]
        source = row["source"]
        if source == "wikimedia_commons":
            path = dest / "files" / "commons" / safe_name(key)
            folder = "commons"
            mark_id = "commons:" + key
        elif source == "sportslogos":
            folder_path = dest / "files" / "sportslogos"
            hits = sorted(folder_path.glob(safe_name(key) + ".*")) if folder_path.is_dir() else []
            path = hits[0] if hits else None
            folder = "sportslogos"
            mark_id = "sportslogos:" + key
        else:
            continue
        if path is None or not path.is_file() or path.stat().st_size == 0:
            continue
        rel = f"files/{folder}/{path.name}"
        m = marks.get(mark_id)
        if m is None:
            klass, licence = _seed_klass(row.get("note"))
            m = blank_mark(mark_id, "wikimedia_commons" if source == "wikimedia_commons" else "sportslogos")
            m.update(licence=licence, klass=klass, format=fmt_of(path.name, ""), bytes=path.stat().st_size, file=rel)
            marks[mark_id] = m
            n += 1
        elif not m["file"]:
            m["file"] = rel
            m["bytes"] = path.stat().st_size
        add_use(m, row["league"], row["team"], row["from_year"], row["to_year"])
    return n


def copy_archived(dest, marks, sport_sha):
    copied = 0
    for kind, key, sha, b64 in ds1(BYTES):
        data = base64.b64decode(b64)
        digest = hashlib.sha256(data).hexdigest()
        if digest != sha:
            raise SystemExit(f"library: {key}: archived bytes do not match their sha256")
        if kind == "sportslogos" and sport_sha.get(key) and sport_sha[key] != digest:
            raise SystemExit(f"library: {key}: archived bytes do not match legacy_sportslogos.logo.sha256")
        m = marks.get(("commons:" if kind == "commons" else "sportslogos:") + key)
        if m is None:
            continue
        ext = "." + m["format"] if m["format"] and m["format"] != "other" else ""
        if kind == "sportslogos" and not key.endswith(ext):
            leaf = safe_name(key + ext)
            folder = "sportslogos"
        else:
            leaf = safe_name(key)
            folder = "commons"
        rel = f"files/{folder}/{leaf}"
        path = dest / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        m["file"] = rel
        m["bytes"] = len(data)
        copied += 1
    return copied


def read_extra():
    with EXTRA.open(newline="") as fh:
        return list(csv.DictReader(fh))


def read_idents():
    rows = []
    for iid, fid, lg, name, loc, nick, y0, y1, has in ds1(IDENTS):
        rows.append({"iid": int(iid), "fid": int(fid), "lg": lg, "name": name, "location": loc, "nickname": nick,
                     "y0": y0, "y1": y1, "has": has == "1"})
    return rows


def report_league(lg):
    codes = [c for c in (lg or "").split(",") if c]
    for c in ("nhl", "nba", "mlb", "nfl", "cfl"):
        if c in codes:
            return c
    for c in codes:
        if c in PARENT_LG:
            return PARENT_LG[c]
    return codes[0] if codes else "other"


def capspace_names(root=None):
    """Variant file names only. The drawings stay in CapSpace and are not copied."""
    root = Path(root) if root else CAPSPACE
    img = root / "app" / "static" / "img"
    if not img.is_dir():
        return [], {}
    names = sorted(p.name for p in img.iterdir() if re.fullmatch(r"[a-z0-9]+\.\d{4}\.(svg|png|gif)", p.name))
    by_club = {}
    sql = root / "data_starter" / "teams_and_seasons.sql"
    if sql.is_file():
        text = sql.read_text(errors="replace")
        for club, abbr, _year in re.findall(r"INSERT INTO team VALUES\(\d+,'([^']*)',NULL,NULL,'([A-Za-z0-9]+)',(\d+),", text):
            hits = [n for n in names if n.startswith(abbr.lower() + ".")]
            if hits:
                by_club.setdefault(club, []).extend(hits)
    return names, by_club


def covered(name, marks, extra_names):
    if commons_report.norm(name) in extra_names:
        return True
    want = commons_report.norm(name)
    for m in marks.values():
        if want and want in {commons_report.norm(c) for c in m["clubs"]}:
            return True
        if mentions(m["id"], name) or mentions(m.get("file", ""), name):
            return True
    return False


def gap_franchises(idents, marks, extra):
    extra_names = {commons_report.norm(r["team"]) for r in extra}
    by_fid = {}
    for ident in idents:
        by_fid.setdefault(ident["fid"], []).append(ident)
    gaps = []
    for fid, group in by_fid.items():
        if any(i["has"] for i in group):
            continue
        if any(covered(i["name"], marks, extra_names) for i in group):
            continue
        gaps.append(group)
    return gaps


def fetch_bytes(url, last):
    wait = commons_sweep.PAUSE - (time.time() - last[0])
    if wait > 0:
        time.sleep(wait)
    last[0] = time.time()
    req = urllib.request.Request(url, headers=commons_sweep.UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            ctype = r.headers.get("content-type", "")
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        print("download failed", getattr(e, "code", ""), url[:90], flush=True)
        return None
    last[0] = time.time()
    if "text/html" in ctype or data[:20].lstrip().lower().startswith(b"<!doctype") or data[:6].lower() == b"<html>":
        return None
    return data


def save_download(dest, folder, title, data):
    leaf = safe_name(title.removeprefix("File:").replace(" ", "_"))
    rel = f"files/{folder}/{leaf}"
    path = dest / rel
    if path.exists():
        return rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return rel


def collect(dest, gaps, marks):
    """Commons first, for clubs that still have no logo. New bytes stay in the library."""
    if not gaps:
        return 0
    folder = dest / "collect"
    folder.mkdir(parents=True, exist_ok=True)
    idents = []
    for group in gaps:
        for ident in group:
            nick = ident["nickname"] or (ident["name"].split()[-1] if ident["name"] else "")
            idents.append({"iid": ident["iid"], "fid": ident["fid"], "lg": report_league(ident["lg"]), "name": ident["name"],
                           "location": ident["location"], "nickname": nick, "y0": num(ident["y0"]), "y1": num(ident["y1"]),
                           "cur": None, "fr_logos": 0})
    ident_path = folder / "identities.json"
    ident_path.write_text(json.dumps(idents))
    print(f"collecting {len({i['name'] for i in idents})} club names from Commons", flush=True)
    commons_sweep.main(str(ident_path), str(folder))
    out_csv = folder / "candidates.csv"
    commons_report.main(str(ident_path), str(folder), str(out_csv))
    raw = json.loads((folder / "raw.json").read_text())
    info = raw.get("info") or {}
    saved = 0
    last = [0.0]
    seen = set()
    rows = list(csv.DictReader(out_csv.open()))
    found_names = set()
    for row in rows:
        title = row.get("best") or ""
        if not title:
            continue
        found_names.add(row["era"])
        if title in seen:
            continue
        meta = (info.get(title) or {})
        url = meta.get("url")
        leaf = safe_name(title.removeprefix("File:").replace(" ", "_"))
        rel = f"files/commons/{leaf}"
        path = dest / rel
        if path.is_file() and path.stat().st_size:
            data = path.read_bytes()
        else:
            if not url:
                continue
            data = fetch_bytes(url, last)
            if not data:
                continue
            rel = save_download(dest, "commons", title, data)
        seen.add(title)
        m = marks.get("commons:" + safe_name(title.removeprefix("File:").replace(" ", "_")))
        if m is None:
            m = blank_mark("commons:" + leaf, "wikimedia_commons")
            m.update(licence=row.get("best_licence") or "", klass=row.get("best_class") or "free", format=fmt_of(leaf, meta.get("mime") or ""),
                     bytes=len(data), width=meta.get("w"), height=meta.get("h"), url=url, page=meta.get("page") or row.get("best_page") or "", file=rel)
            marks[m["id"]] = m
        else:
            m["file"] = rel
            m["bytes"] = len(data)
        add_use(m, row.get("league") or "", row.get("era") or "", row.get("from") or "", row.get("to") or "")
        saved += 1
    for group in gaps:
        name = group[0]["name"]
        if any(mentions(n, name) or commons_report.norm(n) == commons_report.norm(name) for n in found_names):
            continue
        if any(covered(i["name"], marks, set()) for i in group):
            continue
        pick = nonfree_hit(name, info)
        if not pick:
            continue
        title, meta = pick
        url = meta.get("url")
        if title in seen:
            continue
        leaf = safe_name(title.removeprefix("File:").replace(" ", "_"))
        rel = f"files/nonfree/{leaf}"
        path = dest / rel
        if path.is_file() and path.stat().st_size:
            data = path.read_bytes()
        else:
            if not url:
                continue
            data = fetch_bytes(url, last)
            if not data:
                continue
            rel = save_download(dest, "nonfree", title, data)
        seen.add(title)
        m = blank_mark("commons:" + leaf, "wikimedia_commons")
        licence = (meta.get("meta") or {}).get("LicenseShortName") or "Non-free"
        m.update(licence=licence, klass="non-free", format=fmt_of(leaf, meta.get("mime") or ""), bytes=len(data),
                 width=meta.get("w"), height=meta.get("h"), url=url, page=meta.get("page") or "", file=rel)
        add_use(m, report_league(group[0]["lg"]), name, group[0]["y0"], group[0]["y1"])
        marks[m["id"]] = m
        saved += 1
    return saved


def nonfree_hit(name, info):
    hits = []
    for title, meta in info.items():
        if not meta or meta.get("missing") or not meta.get("url"):
            continue
        if commons_report.licence_class(meta.get("meta") or {}) != "non-free":
            continue
        if not mentions(title, name):
            continue
        text = commons_report.norm(title)
        if commons_report.NOT_LOGO.search(text) and "logo" not in text:
            continue
        hits.append((meta.get("bytes") or 10 ** 12, title, meta))
    if not hits:
        return None
    hits.sort()
    return hits[0][1], hits[0][2]


HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SPXN logo library</title>
<style>
  body { font: 15px/1.4 sans-serif; margin: 1.25rem; color: #172033; background: #f6f4ef; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  p { margin: .3rem 0 .8rem; }
  .filters { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
  label { display: flex; flex-direction: column; font-size: .75rem; gap: .15rem; }
  input, select { font: inherit; padding: .25rem .4rem; }
  .card { display: grid; grid-template-columns: 88px 1fr; gap: .75rem; background: #fff; border: 1px solid #ddd; padding: .6rem; margin: 0 0 .5rem; }
  img { width: 88px; height: 88px; object-fit: contain; background: #eee; }
  .meta { color: #444; font-size: .85rem; }
  .site { font-weight: 700; }
  a { word-break: break-all; }
  ul { padding-left: 1.1rem; }
</style>
</head>
<body>
<h1>SPXN logo library</h1>
<p id="lead"></p>
<div class="filters">
  <label>League <select id="f-league"></select></label>
  <label>Club <input id="f-club" type="search"></label>
  <label>Era <input id="f-era" type="search"></label>
  <label>Source <select id="f-source"></select></label>
  <label>Licence <select id="f-licence"></select></label>
  <label>Format <select id="f-format"></select></label>
  <label>Site <select id="f-site"><option value="">All</option><option value="yes">Site uses this file</option><option value="no">Not the site file</option></select></label>
</div>
<p id="shown"></p>
<div id="board"></div>
<h2>Still missing</h2>
<ul id="gaps"></ul>
<h2>CapSpace variant names</h2>
<p>File names only. Those marks are not copied into this library.</p>
<ul id="variants"></ul>
<script id="catalog" type="application/json">/*__DATA__*/</script>
<script>
const data = JSON.parse(document.getElementById("catalog").textContent);
const lead = document.getElementById("lead");
lead.textContent = data.marks.length + " marks · " + data.copied + " files copied · " + data.pd + " public domain · " + data.free + " other free licence. An open-source package needs John's yes.";
function fill(id, values) {
  const sel = document.getElementById(id);
  const first = document.createElement("option");
  first.value = ""; first.textContent = "All"; sel.appendChild(first);
  values.forEach(function (v) { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
}
function uniq(key) { return [...new Set(data.marks.map(function (m) { return m[key]; }).filter(Boolean))].sort(); }
fill("f-league", uniq("league").flatMap(function (v) { return v.split(","); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort());
fill("f-source", uniq("source"));
fill("f-licence", ["pd", "free", "non-free", "unknown"]);
fill("f-format", uniq("format"));
function size(n) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
function show() {
  const league = document.getElementById("f-league").value;
  const club = document.getElementById("f-club").value.trim().toLowerCase();
  const era = document.getElementById("f-era").value.trim().toLowerCase();
  const source = document.getElementById("f-source").value;
  const licence = document.getElementById("f-licence").value;
  const format = document.getElementById("f-format").value;
  const site = document.getElementById("f-site").value;
  const rows = data.marks.filter(function (m) {
    if (league && m.league.split(",").indexOf(league) < 0) return false;
    if (club && m.club.toLowerCase().indexOf(club) < 0) return false;
    if (era && m.era.toLowerCase().indexOf(era) < 0) return false;
    if (source && m.source !== source) return false;
    if (licence && m.klass !== licence) return false;
    if (format && m.format !== format) return false;
    if (site === "yes" && !m.site) return false;
    if (site === "no" && m.site) return false;
    return true;
  });
  const board = document.getElementById("board");
  board.textContent = "";
  document.getElementById("shown").textContent = rows.length + " shown";
  rows.forEach(function (m) {
    const card = document.createElement("article");
    card.className = "card";
    if (m.file) {
      const img = document.createElement("img");
      img.src = m.file;
      img.alt = m.club || m.id;
      card.appendChild(img);
    } else {
      const box = document.createElement("div");
      box.className = "meta";
      box.textContent = "URL only";
      card.appendChild(box);
    }
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = m.club || m.id;
    body.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "meta";
    const bits = [m.league, m.era, m.kind, m.source, m.format, m.licence, size(m.bytes)];
    if (m.width && m.height) bits.push(m.width + " × " + m.height);
    meta.textContent = bits.filter(Boolean).join(" · ");
    body.appendChild(meta);
    if (m.site) {
      const used = document.createElement("div");
      used.className = "site";
      used.textContent = "Site uses this file";
      body.appendChild(used);
    }
    if (!m.file && m.url) {
      const a = document.createElement("a");
      a.href = m.url;
      a.textContent = m.url;
      body.appendChild(a);
    }
    if (m.page) {
      const a = document.createElement("a");
      a.href = m.page;
      a.textContent = "File page";
      body.appendChild(document.createTextNode(" "));
      body.appendChild(a);
    }
    card.appendChild(body);
    board.appendChild(card);
  });
}
["f-league", "f-club", "f-era", "f-source", "f-licence", "f-format", "f-site"].forEach(function (id) {
  document.getElementById(id).addEventListener("input", show);
  document.getElementById(id).addEventListener("change", show);
});
const gaps = document.getElementById("gaps");
data.gaps.forEach(function (g) {
  const li = document.createElement("li");
  li.textContent = [g.league, g.club, g.variants.join(", ")].filter(Boolean).join(" · ");
  gaps.appendChild(li);
});
if (!data.gaps.length) gaps.appendChild(document.createElement("li")).textContent = "None.";
const variants = document.getElementById("variants");
data.capspace_names.forEach(function (n) {
  const li = document.createElement("li");
  li.textContent = n;
  variants.appendChild(li);
});
show();
</script>
</body>
</html>
"""


def index_html(payload):
    blob = json.dumps(payload, ensure_ascii=True).replace("<", "\\u003c")
    return HTML.replace("/*__DATA__*/", blob)


def write_index(dest, payload):
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "index.html").write_text(index_html(payload), encoding="utf-8")


def payload_for(marks, copied, gaps, capspace):
    finished = [finish(m) for m in marks.values()]
    finished.sort(key=lambda m: (m["league"], m["club"], m["era"], m["id"]))
    return {"marks": finished, "copied": copied, "pd": sum(1 for m in finished if m["klass"] == "pd"),
            "free": sum(1 for m in finished if m["klass"] == "free"), "gaps": gaps, "capspace_names": capspace}


def gap_rows(groups, by_club):
    rows = []
    seen = set()
    for group in groups:
        for ident in group:
            name = ident["name"]
            if name in seen:
                continue
            seen.add(name)
            variants = []
            for club, files in by_club.items():
                if mentions(club, name) or commons_report.norm(club) == commons_report.norm(name):
                    variants.extend(files)
            rows.append({"league": report_league(ident["lg"]), "club": name, "variants": sorted(set(variants))})
    rows.sort(key=lambda r: (r["league"], r["club"]))
    return rows


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    dest = library_dest(argv).resolve()
    print("reading DS1", flush=True)
    marks, sport_sha = load_catalog()
    extra = read_extra()
    idents = read_idents()
    label_from_names(marks, idents)
    seed_missing = apply_seed(marks, extra)
    copied = copy_archived(dest, marks, sport_sha)
    attached = attach_local(dest, marks, seed_missing)
    names, by_club = capspace_names()
    groups = gap_franchises(idents, marks, extra)
    gaps = gap_rows(groups, by_club)
    write_index(dest, payload_for(marks, copied, gaps, names))
    downloaded = 0
    if "--no-collect" not in argv and groups:
        downloaded = collect(dest, groups, marks)
        groups = gap_franchises(idents, marks, extra)
        gaps = gap_rows(groups, by_club)
        write_index(dest, payload_for(marks, copied + downloaded, gaps, names))
    finished = [finish(m) for m in marks.values()]
    pd = sum(1 for m in finished if m["klass"] == "pd")
    free = sum(1 for m in finished if m["klass"] == "free")
    print(f"dest {dest}")
    print(f"copied {copied}")
    print(f"attached {attached}")
    print(f"downloaded {downloaded}")
    print(f"marks {len(finished)}")
    print(f"pd {pd}")
    print(f"free {free}")
    print(f"hotlinked {sum(1 for m in finished if not m['file'])}")
    print(f"site {sum(1 for m in finished if m['site'])}")
    print(f"seed-missing {len(seed_missing)}")
    print(f"gaps {len(gaps)}")
    for g in gaps:
        print(f"gap {g['league']} {g['club']}")
    print("no new SportsLogos.Net crawl")
    return 0


if __name__ == "__main__":
    sys.exit(main())
