"""python3 -I scripts/logos/test_library.py

Builds index.html from a fake catalog. No DS1.
"""
import hashlib, os, sys, tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archive_library_gap
import archive_library_picks
import library

PAYLOAD = {
    "marks": [
        {"id": "commons:Example_Logo.svg", "league": "nhl", "club": "Toronto Arenas", "era": "1917–1919",
         "source": "wikimedia_commons", "licence": "Public domain", "klass": "pd", "format": "svg", "bytes": 120,
         "width": 64, "height": 64, "site": True, "file": "files/commons/Example_Logo.svg",
         "url": "https://upload.wikimedia.org/wikipedia/commons/Example_Logo.svg",
         "page": "https://commons.wikimedia.org/wiki/File:Example_Logo.svg", "kind": ""},
        {"id": "hot:only", "league": "mlb", "club": "Boston Americans", "era": "1901–1907", "source": "wikidata",
         "licence": "Public domain", "klass": "pd", "format": "png", "bytes": 10, "width": 8, "height": 8,
         "site": False, "file": "", "url": "https://example.test/only-url.png", "page": "", "kind": ""},
    ],
    "copied": 1, "pd": 2, "free": 0,
    "gaps": [{"league": "nhl", "club": "Hamilton Tigers", "variants": ["ham.1920.svg"]}],
    "capspace_names": ["mwn.1917.svg"],
}


def test_sql_guard():
    assert library.require_select("select 1") == "select 1"
    assert library.require_select("  SELECT 1").lower().startswith("select")
    assert library.require_select("with a as (select 1) select * from a").startswith("with")
    for bad in ("insert into t values (1)", "delete from t", "select 1; drop table t", "update t set a = 1"):
        try:
            library.require_select(bad)
        except SystemExit:
            continue
        raise AssertionError(bad)


def test_dest():
    home = Path.home() / "Projects/backups/spx-stats/logo-library"
    assert library.library_dest([], {}) == home
    assert library.library_dest(["--dest", "~/logo-lib-test"], {"SPX_LOGO_LIBRARY": "/tmp/ignored"}) == Path.home() / "logo-lib-test"
    assert library.library_dest([], {"SPX_LOGO_LIBRARY": "~/from-env"}) == Path.home() / "from-env"


def test_commons_name():
    thumb = "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Logo_of_Chicago_Bulls.svg/120px-Logo_of_Chicago_Bulls.svg.png?u=1"
    assert library._commons_name(thumb) == "Logo_of_Chicago_Bulls.svg"
    original = "https://upload.wikimedia.org/wikipedia/commons/1/16/Argonauts_Logo.svg"
    assert library._commons_name(original) == "Argonauts_Logo.svg"
    assert library._commons_name("/team-logos/sl/6099.gif") == ""


def test_index():
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)
        library.write_index(dest, PAYLOAD)
        html = (dest / "index.html").read_text(encoding="utf-8")
        assert not (dest / "catalog.json").exists()
    assert "Toronto Arenas" in html
    assert "files/commons/Example_Logo.svg" in html
    assert "https://example.test/only-url.png" in html
    assert "Hamilton Tigers" in html
    assert "mwn.1917.svg" in html
    assert "Site uses this file" in html
    assert 'id="f-league"' in html and 'id="f-club"' in html and 'id="f-era"' in html
    assert 'id="f-source"' in html and 'id="f-licence"' in html and 'id="f-format"' in html
    assert "fetch(" not in html
    assert "/Users/" not in html
    assert "img.src = m.file" in html
    assert 'src="https://example.test/only-url.png"' not in html
    assert 'src="mwn.1917.svg"' not in html
    # the catalog is inside the page, not a sibling the page would have to request
    assert html.index("Example_Logo.svg") < html.index("</html>")


def test_source_has_no_home_folder():
    text = Path(library.__file__).read_text(encoding="utf-8")
    assert "/Users/" not in text
    gap = Path(archive_library_gap.__file__).read_text(encoding="utf-8")
    assert "/Users/" not in gap
    picks = Path(archive_library_picks.__file__).read_text(encoding="utf-8")
    assert "/Users/" not in picks


def test_archive_gap_sql():
    assert len(archive_library_gap.FILES) == 10
    assert len(set(archive_library_gap.FILES)) == 10
    data = b"\x00\xffGIF"
    sql = archive_library_gap.statement(archive_library_gap.FILES[0], data)
    assert sql.startswith("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ")
    assert f"commons-logos/2026-10-15/files/{archive_library_gap.FILES[0]}" in sql
    assert hashlib.sha256(data).hexdigest() in sql
    assert f"decode('{data.hex()}', 'hex')" in sql
    assert sql.endswith("on conflict (name) do nothing;")
    try:
        archive_library_gap.statement("not-one-of-the-ten.svg", data)
    except SystemExit:
        pass
    else:
        raise AssertionError("extra file")
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        for leaf in archive_library_gap.FILES:
            (folder / leaf).write_bytes(leaf.encode())
        dest = folder / "out.sql"
        assert archive_library_gap.write_sql(folder, dest) == 10
        text = dest.read_text()
        assert text.count("insert into legacy_files.raw_archive") == 10
        assert "begin" not in text.lower() and "commit" not in text.lower()
        for leaf in archive_library_gap.FILES:
            assert f"commons-logos/2026-10-15/files/{leaf}" in text


def test_attach_local():
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp)
        (dest / "files" / "commons").mkdir(parents=True)
        (dest / "files" / "sportslogos").mkdir()
        (dest / "files" / "commons" / "ToledoT.svg").write_bytes(b"<svg></svg>")
        (dest / "files" / "sportslogos" / "493255251943.gif").write_bytes(b"GIF89a")
        marks = {}
        missing = [
            {"league": "nfl", "team": "Toledo Maroons", "from_year": "", "to_year": "", "source": "wikimedia_commons",
             "file_key": "ToledoT.svg", "note": "Commons Public domain; undated"},
            {"league": "nfl", "team": "Phil-Pitt Steagles", "from_year": "", "to_year": "", "source": "sportslogos",
             "file_key": "493255251943", "note": "SportsLogos.Net Primary logo 1943-1943, fair use"},
        ]
        assert library.attach_local(dest, marks, missing) == 2
        assert marks["commons:ToledoT.svg"]["file"] == "files/commons/ToledoT.svg"
        assert marks["commons:ToledoT.svg"]["klass"] == "pd"
        assert "Toledo Maroons" in marks["commons:ToledoT.svg"]["clubs"]
        assert marks["sportslogos:493255251943"]["klass"] == "non-free"
        assert library.attach_local(dest, marks, missing) == 0


def test_archive_picks_sql():
    assert set(archive_library_picks.NEW_FILES).isdisjoint(archive_library_gap.FILES)
    assert len(archive_library_picks.NEW_FILES) == 5
    assert len(archive_library_picks.CATALOG) == 13
    new = {row["file"] for row in archive_library_picks.CATALOG if row["new"]}
    assert new == set(archive_library_picks.NEW_FILES)
    try:
        archive_library_picks.raw_statement(archive_library_gap.FILES[0], b"nope")
    except SystemExit:
        pass
    else:
        raise AssertionError("re-inserted one of the ten")
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        for leaf in archive_library_picks.NEW_FILES:
            (folder / leaf).write_bytes(leaf.encode())
        dest = folder / "out.sql"
        n_raw, n_logo = archive_library_picks.write_sql(folder, dest)
        assert (n_raw, n_logo) == (5, 13)
        text = dest.read_text()
        assert text.count("insert into legacy_files.raw_archive") == 5
        assert text.count("insert into legacy_team_brand.commons_logo") == 13
        assert "on conflict (name) do nothing;" in text
        assert "on conflict (file) do nothing;" in text
        for leaf in archive_library_gap.FILES:
            assert f"decode(" not in text or leaf not in text.split("insert into legacy_team_brand.commons_logo")[0]
        for leaf in archive_library_gap.FILES:
            assert f"commons-logos/2026-10-15/files/{leaf}', '{archive_library_picks.DAY}'" not in text


if __name__ == "__main__":
    test_sql_guard()
    test_dest()
    test_commons_name()
    test_index()
    test_source_has_no_home_folder()
    test_archive_gap_sql()
    test_attach_local()
    test_archive_picks_sql()
    print("ok")
