"""Tests for `batch.py apply`: python3 -m unittest scripts/i18n/test/test_apply.py (from the repo root).
Everything runs on a throw-away copy of a tiny dictionary tree; the real dictionaries are never touched."""

import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("batch", Path(__file__).resolve().parents[1] / "batch.py")
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)

NB = "\u00a0"
FR_FILE = f'''import type {{ Dictionary }} from "../dictionaries";

export const FR: Dictionary = {{
  // a comment
  "a.title": "Plus de titres{NB}: {{team}}, {{count}}",
  "b.same": "Texte",
  "c.ph": "Bonjour {{name}}",
  "d.stale": "Autre texte",
  "e.keep": "Intact",
}};
'''
JA_FILE = '''export const JA: Dictionary = {
  "a.title": "旧",
  "b.same": "同じ",
};
'''
SUB_FILE = '''export const GAME_EN = {
  "a.title": "English stays",
};

export const GAME_FR: Record<keyof typeof GAME_EN, string> = {
  "g.one": "Ancien",
};

export const GAME_JA: Record<keyof typeof GAME_EN, string> = {
  "g.one": "古い",
};
'''


def row(lang, key, cur, fix, en, verdict="fix", src="ph"):
    return {"lang": lang, "key": key, "cur": cur, "fix": fix, "en": en, "verdict": verdict, "src": src}


class ApplyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        d = self.root / batch.I18N_DIR
        (d / "dictionaries").mkdir(parents=True)
        (d / "dictionaries" / "fr.constants.ts").write_text(FR_FILE, encoding="utf-8")
        (d / "dictionaries" / "ja.constants.ts").write_text(JA_FILE, encoding="utf-8")
        (d / "game.constants.ts").write_text(SUB_FILE, encoding="utf-8")
        self.rows = [
            row("fr", "a.title", f"Plus de titres{NB}: {{team}}, {{count}}", "Plus grand nombre de titres : {team}, {count}", "Most titles: {team}, {count}"),
            row("fr", "b.same", "Texte", "Texte", "Text"),
            row("fr", "c.ph", "Bonjour {name}", "Bonjour", "Hello {name}"),
            row("fr", "d.stale", "Ce que le lot a vu", "Nouveau", "Other"),
            row("fr", "e.keep", "Intact", "Doute", "Keep", verdict="doubt"),
            row("fr", "g.one", "Ancien", "Nouveau", "Old"),
            row("ja", "a.title", "旧", "新", "Old"),
            row("ja", "b.same", "同じ", "同じ", "Same"),
            row("ja", "g.one", "古い", "新しい", "Old"),
            row("fr", "x.gone", "?", "!", "Gone"),
        ]

    def tearDown(self):
        self.tmp.cleanup()

    def plan(self):
        return batch.plan_apply(self.rows, self.root)

    def test_statuses(self):
        _files, decisions = self.plan()
        got = {(d["lang"], d["key"]): d["status"] for d in decisions}
        self.assertEqual(got, {
            ("fr", "a.title"): "applied", ("fr", "b.same"): "same", ("fr", "c.ph"): "placeholders",
            ("fr", "d.stale"): "stale", ("fr", "g.one"): "applied", ("fr", "x.gone"): "missing",
            ("ja", "a.title"): "applied", ("ja", "b.same"): "same", ("ja", "g.one"): "applied",
        })

    def test_a_doubt_is_never_applied(self):
        _files, decisions = self.plan()
        self.assertNotIn(("fr", "e.keep"), {(d["lang"], d["key"]) for d in decisions})

    def test_only_the_fixed_lines_change_and_the_format_is_kept(self):
        files, _ = self.plan()
        fr = files[self.root / batch.I18N_DIR / "dictionaries" / "fr.constants.ts"]
        old, new = FR_FILE.split("\n"), fr
        self.assertEqual(len(old), len(new))
        changed = [i for i, (a, b) in enumerate(zip(old, new)) if a != b]
        self.assertEqual(len(changed), 1)
        self.assertEqual(new[changed[0]], f'  "a.title": "Plus grand nombre de titres{NB}: {{team}}, {{count}}",')

    def test_no_break_space_kept_only_where_the_current_text_had_it(self):
        self.assertEqual(batch.keep_nbsp(f"A{NB}: b", "A : b ; c"), f"A{NB}: b ; c")
        self.assertEqual(batch.keep_nbsp("A: b", "A : b"), "A : b")

    def test_each_language_block_is_edited_in_its_own_language_and_english_is_untouched(self):
        files, _ = self.plan()
        sub = files[self.root / batch.I18N_DIR / "game.constants.ts"]
        text = "\n".join(sub)
        self.assertIn('"g.one": "Nouveau"', text)
        self.assertIn('"g.one": "新しい"', text)
        self.assertIn('"a.title": "English stays"', text)

    def test_write_is_byte_exact_apart_from_the_fixes(self):
        files, _ = self.plan()
        for f, lines in files.items():
            f.write_text("\n".join(lines), encoding="utf-8")
        ja = (self.root / batch.I18N_DIR / "dictionaries" / "ja.constants.ts").read_text(encoding="utf-8")
        self.assertEqual(ja, JA_FILE.replace('"旧"', '"新"'))

    def test_language_filter(self):
        _files, decisions = batch.plan_apply(self.rows, self.root, ("ja",))
        self.assertEqual({d["lang"] for d in decisions}, {"ja"})


if __name__ == "__main__":
    unittest.main()
