"""python3 -I scripts/logos/test_render_site.py   (the render tests need Pillow with WebP; without it they are skipped)

No network, no DS1: a fake fetcher and a temp web directory. The hash vectors are the ones in web/scripts/logoFiles.test.ts.
"""
import io, json, os, sys, tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_site as r

FAIL = 0


def check(name, ok):
    global FAIL
    print(("  ok   " if ok else "  FAIL ") + name)
    FAIL += 0 if ok else 1


VECTORS = [("commons:Example_Logo.svg", "5765c0f5"), ("en:Toronto_Raptors_logo.svg", "083756ab"),
           ("sl:5044.gif", "fa9942bd"), ("commons:Montréal_Canadiens.svg", "ce96a89b")]
check("hash matches the TypeScript vectors", all(r.logo_hash(k) == h for k, h in VECTORS))

u = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example_Logo.svg/120px-Example_Logo.svg.png"
check("key of a thumbnail", r.logo_key(u) == "commons:Example_Logo.svg")
check("key of an original", r.logo_key("https://upload.wikimedia.org/wikipedia/en/a/ab/X.png") == "en:X.png")
check("key of a hosted SportsLogos.Net file", r.logo_key("/team-logos/sl/5044.gif") == "sl:5044.gif")
check("no key for a foreign address", r.logo_key("https://example.test/a.png") is None and r.logo_key(None) is None)

check("tier_dims never enlarges", r.tier_dims(10, 10, 96) == (10, 10))
check("tier_dims fits the height", r.tier_dims(200, 200, 48) == (48, 48))
check("tier_dims caps a wordmark at 2.4 x the box", r.tier_dims(1000, 100, 48) == (115, 12))

c = r.wiki_candidates([u])
check("candidates: 250 px thumbnail first, original last",
      c[0].endswith("/thumb/a/ab/Example_Logo.svg/250px-Example_Logo.svg.png") and c[-1].endswith("/commons/a/ab/Example_Logo.svg"))
check("candidates: none for a foreign address", r.wiki_candidates(["https://example.test/a.png"]) == [])

check("unsafe SVG is caught", all(r.UNSAFE_SVG.search(s) for s in (b"<svg><script>x</script></svg>", b'<svg onload="x()"/>', b"<svg><image href='a'/></svg>")))
check("a plain SVG is safe", not r.UNSAFE_SVG.search(b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'))
check("tag changes with the bytes", r.tag_of(b"a") != r.tag_of(b"b") and r.tag_of(b"a") == r.tag_of(b"a"))

try:
    from PIL import Image, features
    have = features.check("webp")
except ImportError:
    have = False
if not have:
    print("  skip render tests: no Pillow with WebP")
else:
    def png(w, h, colour=(200, 20, 20, 255)):
        b = io.BytesIO()
        Image.new("RGBA", (w, h), colour).save(b, "PNG")
        return b.getvalue()

    out = r.render(png(300, 300))
    check("a 300 px source gets all three tiers", sorted(out) == [24, 48, 96])
    check("a 30 px source is not enlarged: no tier above its size", sorted(r.render(png(30, 30))) == [24, 48])
    im = Image.open(io.BytesIO(out[48]))
    check("a tier is a WebP at most 48 px high", im.format == "WEBP" and im.size[1] <= 48)

    class Fake:
        offline = False
        requests = 0

        def __init__(self, files):
            self.files = files
            self.asked = []

        def get(self, url):
            self.requests += 1
            self.asked.append(url)
            return self.files.get(url)

    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        web, lib = t / "web", t / "lib"
        (web / "public" / "team-logos" / "sl").mkdir(parents=True)
        (web / "public" / "team-logos" / "sl" / "5044.gif").write_bytes(b"GIF89a")  # unreadable as an image: left out
        keep = web / "public" / "team-logos" / "sl" / "keep.gif"
        keep.write_bytes(b"x")
        stale = web / "public" / "team-logos" / "deadbeef-123456-24.webp"
        stale.write_bytes(b"x")
        by_key = {
            "commons:Big.png": ["https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Big.png/120px-Big.png"],
            "sl:5044.gif": ["/team-logos/sl/5044.gif"],
            "commons:Gone.png": ["https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Gone.png/120px-Gone.png"],
        }
        fake = Fake({"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Big.png/250px-Big.png": png(250, 250)})
        orig = r.Fetcher
        r.Fetcher = lambda offline: fake
        try:
            manifest, files, left_out, _ = r.build(by_key, web, lib, False, False)
        finally:
            r.Fetcher = orig
        dest = web / "public" / "team-logos"
        h = r.logo_hash("commons:Big.png")
        check("the fetched logo is in the manifest with its tiers", h in manifest and manifest[h][1] == "webp" and manifest[h][2] == 96)
        check("its files are written", all((dest / n).is_file() for n in files) and len(files) == 3)
        check("an unreadable file and a missing one are left out (keep their hot link)", sorted(k for k, _ in left_out) == ["commons:Gone.png", "sl:5044.gif"])
        check("the manifest on disk matches", json.loads((dest / "manifest.json").read_text())["files"] == manifest)
        check("a stale rendered file is removed, hosted SportsLogos.Net files are not", not stale.exists() and keep.exists())
        check("the source is cached for the next run", (lib / "render-src" / f"{h}.src").is_file())
        fake.asked.clear()
        r.Fetcher = lambda offline: fake
        try:
            r.build(by_key, web, lib, False, False)
        finally:
            r.Fetcher = orig
        check("a second run reads the cache and fetches only what is still missing", fake.asked and not any("Big.png" in a for a in fake.asked))

print(f"{FAIL} failed")
sys.exit(1 if FAIL else 0)
