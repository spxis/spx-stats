#!/usr/bin/env python3
"""Tests for parse.py on a short sample in the article's own wikitext shape. Run: python3 -I scripts/mlb_schedule/test_parse.py"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse as P  # noqa: E402


def table(rows):
    return '{| class="wikitable"\n!Start year\n!Total Games\n!Schedule\n' + "".join("|-\n|%s\n|%s\n|text\n" % r for r in rows) + "|}\n"


SAMPLE = (
    "==19th century==\n===National League (first 25 years of 1876–present)===\n" + table([(1876, 70), (1877, 60), (1879, 84), (1883, 98), (1884, 112), (1886, 126), (1888, 140), (1892, 154)])
    + "===American Association (1882–1891)===\n" + table([(1882, 80), (1883, 98), (1884, 110), (1885, 112), (1886, 140)])
    + ":1884: 112 games = 16 games × 7 opponents\n:1890: 140 games = 20 games × 7 opponents\n"
    + "==20th & 21st centuries ==\n===National League===\n" + table([(1900, 140), (1904, 154), (1919, 140), (1920, 154), (1962, 162), ("1999<!--includes 2000-->", 162)])
    + "===American League===\n" + table([(1901, 140), (1904, 154), (1919, 140), (1920, 154), (1961, 162), (1999, 162)])
    + "The schedules for 1995 were revised and shortened from 162 to 144 games, after late resolution\n"
    + "===2020===\nEach team would only play 60 games this season and every game will be against\n"
)


def main():
    res, why = P.season_lengths(SAMPLE)
    assert res[1876] == 70 and res[1878] == 60 and res[1879] == 84
    assert res[1883] == 98                      # NL and AA agree
    assert 1882 not in res and 1884 not in res and 1886 not in res   # leagues differ
    assert res[1885] == 112
    assert res[1889] == 140 and res[1890] == 140   # NL, AA and the Players' League agree
    assert res[1892] == 154
    assert res[1901] == 140 and res[1918] == 154 and res[1919] == 140
    assert 1961 not in res and why[1961] == {"NL": 154, "AL": 162}
    assert res[1962] == 162 and res[2012] == 162 and res[2019] == 162
    assert res[1995] == 144 and res[2020] == 60
    assert 1871 not in res and 1914 not in res and 1915 not in res   # leagues the article does not list
    print("ok")


if __name__ == "__main__":
    main()
