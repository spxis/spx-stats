"""python3 -I scripts/spx_extras/test_efl.py: the parser reads both row shapes, cp1252 names, '-' scores and a kick-off time; it reports a bad line instead of guessing."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import efl

raw = ("#,GameDate,AwayTeam,AwayScore,HomeTeam,HomeScore,GameStatus\n"
       "91,3/17/2004,Real Madrid,2,Real Zaragoza,3,Final\n"
       "252,7/31/2004,Arbroath,-,Peterhead,-,Final\n"
       "339,11/23/2004 11:45,Colchester,,Mansfield\n"
       "7,12/1/2004,M\xfcnchen 1860,1,K\xf6ln,0,Postponed\n"
       "x,not a row\n").encode("cp1252")
rows, bad = efl.parse(raw)
assert len(rows) == 4 and len(bad) == 1, (len(rows), bad)
assert rows[0]["game_date"] == "2004-03-17 00:00:00" and rows[0]["home_score"] == 3 and rows[0]["status"] == "Final"
assert rows[1]["away_score"] is None and rows[1]["home_score"] is None
assert rows[2]["game_date"] == "2004-11-23 11:45:00" and rows[2]["status"] is None and rows[2]["home_score"] is None
assert rows[3]["away"] == "München 1860" and rows[3]["home"] == "Köln"
assert "insert into legacy_spx_extras.efl_result" in efl.sql(rows, "x") and "delete from legacy_spx_extras.efl_result where source_file = 'x'" in efl.sql(rows, "x")
print("ok")
