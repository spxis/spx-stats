#!/bin/bash
# Seasons in John's order: SPX's gaps (2011-12, 2012-13, then 2002-2010 playoffs), 2013-14 to 2025-26, then 2001-02 back to 1946-47.
cd "$(dirname "$0")"
ORDER="${ORDER:-2011 2012 2002 2003 2004 2005 2006 2007 2008 2009 2010 $(seq -s' ' 2013 2025) $(seq -s' ' 2001 -1 1946)}"
for y in $ORDER; do
  python3 season.py $y > /home/user/spxwork/nba/season_$y.log 2>&1 || echo "FAILED $y"
  grep -E "^[0-9]{4}:| (matched|filled|confirmed|disputed|added|standings|unmatched)" /home/user/spxwork/nba/season_$y.log
  tail -1 /home/user/spxwork/nba/season_$y.log | grep -i "error" 
done
