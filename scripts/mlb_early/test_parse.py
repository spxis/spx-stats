#!/usr/bin/env python3
"""Checks for scripts/mlb_early/parse.py. Pure: no network, no database.
Run:  python3 -I -m unittest discover -s scripts/mlb_early -p 'test_*.py'     (from the repo root)
The wikitext is written for the test in the layouts the articles use; it is not article text."""
import os, sys, tempfile, unittest, csv, io
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parse as P   # noqa: E402

BOX = """{{Infobox sports season
| title = %(y)s MLB season
| conf1 = AA
| conf1_champ = [[%(y)s St. Louis Browns season|St. Louis Browns]]
| conf2 = NL
| conf2_champ = [[%(y)s Chicago White Stockings season|Chicago White Stockings]]
| finals = World's Championship Series
| finals_champ = %(champ)s
| finals_runner-up = %(ru)s
}}
text"""

LIST = """==Champions from 1876 to 1904==
{| class="wikitable"
|-
! Year
|-
| {{by|1886}}
| align=left|[[1886 St. Louis Browns season|St. Louis Browns]] (AA)
| align=center| 93–46
| bgcolor=eeeeee| 4&ndash;2
| align=left|[[1886 Chicago White Stockings season|Chicago White Stockings]] (NL)
|-
| bgcolor=honeydew|''{{by|1885}}''
| align=left|''[[1885 Chicago White Stockings season|Chicago White Stockings]] (NL)''
| align=center| 87–25
| bgcolor=honeydew|''3&ndash;3&ndash;(1)*''
| bgcolor=fdfef2 align=left|''[[1885 St. Louis Browns season|St. Louis Browns]] (AA)''
|}
==Totals==
"""

NA = """==Champions before 1876==
| {{by|1872}}
| align=left| [[1872 Boston Red Stockings season|Boston Red Stockings]]
|-
| {{by|1871}}
| align=left|[[1871 Philadelphia Athletics season|Athletic of Philadelphia]]
==Champions from 1876 to 1904==
"""

class Parse(unittest.TestCase):
    def raw(self, **kw):
        d = tempfile.mkdtemp()
        open(os.path.join(d, "list.wikitext"), "w", encoding="utf-8").write(NA + LIST.split("==Champions from 1876 to 1904==")[1])
        for y in (1885, 1886):
            body = BOX % dict(y=y, champ=kw.get("champ%d" % y), ru=kw.get("ru%d" % y, ""))
            open(os.path.join(d, "s%d.wikitext" % y), "w", encoding="utf-8").write(body)
        return d

    def test_infobox_pennants_and_series(self):
        d = self.raw(champ1886="[[1886 St. Louis Browns season|St. Louis Browns]]", ru1886="[[1886 Chicago White Stockings season|Chicago White Stockings]]",
                     champ1885="''Series ended in a tie''", ru1885="[[1885 St. Louis Browns season|St. Louis Browns]] / [[1885 Chicago White Stockings season|Chicago White Stockings]]")
        rows = P.rows(d)
        by = {(r[0], r[1], r[2]): r for r in rows}
        self.assertEqual(by[(1886, "pennant", "AA")][4], "St. Louis Browns")
        self.assertEqual(by[(1886, "pennant", "NL")][4], "Chicago White Stockings")
        s86 = by[(1886, "series", "")]
        self.assertEqual((s86[3], s86[4], s86[5], s86[6], s86[7]), ("World's Championship Series", "St. Louis Browns", "Chicago White Stockings", "4–2", "true"))
        s85 = by[(1885, "series", "")]
        self.assertEqual((s85[4], s85[6], s85[8]), ("St. Louis Browns / Chicago White Stockings", "3–3–(1)*", "The series ended in a tie."))
        self.assertEqual(by[(1886, "pennant", "NL")][7], "false")   # a series was played: the series row names the champion

    def test_national_association_years(self):
        rows = P.rows(self.raw(champ1886="", ru1886="", champ1885="", ru1885=""))
        na = {r[0]: r[4] for r in rows if r[2] == "NA"}
        self.assertEqual(na, {1871: "Philadelphia Athletics", 1872: "Boston Red Stockings"})
        self.assertTrue(all(r[7] == "true" for r in rows if r[2] == "NA"))

    def test_csv_carries_the_core_name(self):
        d = self.raw(champ1886="[[1886 St. Louis Browns season|St. Louis Browns]]", ru1886="[[1886 Chicago White Stockings season|Chicago White Stockings]]", champ1885="", ru1885="")
        out = os.path.join(d, "o.csv")
        P.main(d, out)
        rec = [r for r in csv.DictReader(open(out, encoding="utf-8")) if r["year"] == "1886" and r["role"] == "series"][0]
        self.assertEqual(rec["core_club"], "St. Louis Cardinals")

if __name__ == "__main__":
    unittest.main()
