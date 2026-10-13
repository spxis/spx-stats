// Generated from db/seed/person_review.csv by scripts/people/review_to_ts.py; do not edit by hand.
// web/scripts/personReview.test.ts checks that the two agree.
// Admin only: it is read by /admin/people, which answers 404 to anyone else, and is part of no public page or API.
export interface ReviewSide {
  id: number;
  name: string;
  kind: string;
  sources: string;
  league: string;
  born: string | null;
  from: number | null;
  to: number | null;
  clubs: string | null;
}

export interface ReviewPair {
  lean: "possibly one person" | "unknown" | "probably two people";
  why: string;
  a: ReviewSide;
  b: ReviewSide;
}

export const PERSON_REVIEW: readonly ReviewPair[] = [
 {
  "lean": "possibly one person",
  "why": "same franchise (Colorado Avalanche) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3312,
   "name": "Andre Savard",
   "kind": "player",
   "sources": "nhl_api:8451144",
   "league": "nhl",
   "born": null,
   "from": 1973,
   "to": 1984,
   "clubs": "Boston Bruins; Buffalo Sabres; Colorado Avalanche"
  },
  "b": {
   "id": 57788,
   "name": "Andre Savard",
   "kind": "coach",
   "sources": "wikipedia:Andre Savard",
   "league": "nhl",
   "born": null,
   "from": 1987,
   "to": 1987,
   "clubs": "Colorado Avalanche"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (St. Louis Blues) but no season, birth date or other id in common; one is a player record, the other a coach; also paired with person 57791 57792",
  "a": {
   "id": 3372,
   "name": "Andrew Murray",
   "kind": "player",
   "sources": "nhl_api:8469685",
   "league": "nhl",
   "born": null,
   "from": 2007,
   "to": 2012,
   "clubs": "Columbus Blue Jackets; San Jose Sharks; St. Louis Blues"
  },
  "b": {
   "id": 57792,
   "name": "Andy Murray",
   "kind": "coach",
   "sources": "wikipedia:Andy Murray (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1999,
   "to": 2008,
   "clubs": "Los Angeles Kings; St. Louis Blues"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Brooklyn Americans) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3473,
   "name": "Art Chapman",
   "kind": "player",
   "sources": "nhl_api:8445362",
   "league": "nhl",
   "born": null,
   "from": 1930,
   "to": 1939,
   "clubs": "Boston Bruins; Brooklyn Americans"
  },
  "b": {
   "id": 57796,
   "name": "Art Chapman",
   "kind": "coach",
   "sources": "wikipedia:Art Chapman (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1940,
   "to": 1941,
   "clubs": "Brooklyn Americans"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Utah Mammoth) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3544,
   "name": "Barry Long",
   "kind": "player",
   "sources": "nhl_api:8448876",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1981,
   "clubs": "Detroit Red Wings; Los Angeles Kings; Utah Mammoth"
  },
  "b": {
   "id": 57802,
   "name": "Barry Long",
   "kind": "coach",
   "sources": "wikipedia:Barry Long (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1984,
   "to": 1985,
   "clubs": "Utah Mammoth"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Boston Bruins) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3606,
   "name": "Bep Guidolin",
   "kind": "player",
   "sources": "nhl_api:8446656",
   "league": "nhl",
   "born": null,
   "from": 1942,
   "to": 1951,
   "clubs": "Boston Bruins; Chicago Blackhawks; Detroit Red Wings"
  },
  "b": {
   "id": 57806,
   "name": "Bep Guidolin",
   "kind": "coach",
   "sources": "wikipedia:Bep Guidolin",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1975,
   "clubs": "Boston Bruins; New Jersey Devils"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (St. Louis Blues) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3681,
   "name": "Bill McCreary Sr.",
   "kind": "player",
   "sources": "nhl_api:8447717",
   "league": "nhl",
   "born": null,
   "from": 1953,
   "to": 1970,
   "clubs": "Detroit Red Wings; Montréal Canadiens; New York Rangers; St. Louis Blues"
  },
  "b": {
   "id": 57819,
   "name": "Bill McCreary Sr.",
   "kind": "coach",
   "sources": "wikipedia:Bill McCreary Sr.",
   "league": "nhl",
   "born": null,
   "from": 1971,
   "to": 1973,
   "clubs": "St. Louis Blues; Vancouver Canucks"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Detroit Red Wings) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3719,
   "name": "Billy Dea",
   "kind": "player",
   "sources": "nhl_api:8445855",
   "league": "nhl",
   "born": null,
   "from": 1953,
   "to": 1970,
   "clubs": "Chicago Blackhawks; Detroit Red Wings; New York Rangers; Pittsburgh Penguins"
  },
  "b": {
   "id": 57827,
   "name": "Billy Dea",
   "kind": "coach",
   "sources": "wikipedia:Billy Dea",
   "league": "nhl",
   "born": null,
   "from": 1981,
   "to": 1981,
   "clubs": "Detroit Red Wings"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Buffalo Sabres) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3723,
   "name": "Billy Inglis",
   "kind": "player",
   "sources": "nhl_api:8448162",
   "league": "nhl",
   "born": null,
   "from": 1967,
   "to": 1970,
   "clubs": "Buffalo Sabres; Los Angeles Kings"
  },
  "b": {
   "id": 57829,
   "name": "Billy Inglis",
   "kind": "coach",
   "sources": "wikipedia:Billy Inglis",
   "league": "nhl",
   "born": null,
   "from": 1978,
   "to": 1978,
   "clubs": "Buffalo Sabres"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Los Angeles Kings, Montréal Canadiens) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3774,
   "name": "Bob Berry",
   "kind": "player",
   "sources": "nhl_api:8445072",
   "league": "nhl",
   "born": null,
   "from": 1968,
   "to": 1976,
   "clubs": "Los Angeles Kings; Montréal Canadiens"
  },
  "b": {
   "id": 57833,
   "name": "Bob Berry",
   "kind": "coach",
   "sources": "wikipedia:Bob Berry (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1978,
   "to": 1993,
   "clubs": "Los Angeles Kings; Montréal Canadiens; Pittsburgh Penguins; St. Louis Blues"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Pittsburgh Penguins) but no season, birth date or other id in common; one is a player record, the other a coach; also paired with person 57843 57844",
  "a": {
   "id": 3821,
   "name": "Bob Johnson",
   "kind": "player",
   "sources": "nhl_api:8450004",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1974,
   "clubs": "Pittsburgh Penguins; St. Louis Blues"
  },
  "b": {
   "id": 57844,
   "name": "Bob Johnson",
   "kind": "coach",
   "sources": "wikipedia:Bob Johnson (ice hockey, born 1931)",
   "league": "nhl",
   "born": null,
   "from": 1982,
   "to": 1990,
   "clubs": "Calgary Flames; Pittsburgh Penguins"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Seattle Kraken) but no season, birth date or other id in common",
  "a": {
   "id": 3998,
   "name": "Brandon Montour",
   "kind": "player",
   "sources": "nhl_api:8477986",
   "league": "nhl",
   "born": null,
   "from": 2016,
   "to": 2025,
   "clubs": "Anaheim Ducks; Buffalo Sabres; Florida Panthers; Seattle Kraken"
  },
  "b": {
   "id": 57863,
   "name": "Brandon Montour",
   "kind": "player",
   "sources": "wikipedia:Brandon Montour",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Seattle Kraken"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (New York Mets) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 48488,
   "name": "Carlos Mendoza",
   "kind": "player",
   "sources": "lahman:mendoca01",
   "league": "mlb",
   "born": "1974-11-04",
   "from": 1997,
   "to": 2000,
   "clubs": "Colorado Rockies; New York Mets"
  },
  "b": {
   "id": 58543,
   "name": "Carlos Enrique Mendoza",
   "kind": "coach",
   "sources": "retrosheet:mendc801",
   "league": "mlb",
   "born": null,
   "from": 2020,
   "to": 2025,
   "clubs": "New York Mets; New York Yankees"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Columbus Blue Jackets) but no season, birth date or other id in common",
  "a": {
   "id": 4376,
   "name": "Charlie Coyle",
   "kind": "player",
   "sources": "nhl_api:8475745",
   "league": "nhl",
   "born": null,
   "from": 2012,
   "to": 2025,
   "clubs": "Boston Bruins; Colorado Avalanche; Columbus Blue Jackets; Minnesota Wild"
  },
  "b": {
   "id": 57908,
   "name": "Charlie Coyle",
   "kind": "player",
   "sources": "wikipedia:Charlie Coyle",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Columbus Blue Jackets"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Columbus Blue Jackets) but no season, birth date or other id in common",
  "a": {
   "id": 4595,
   "name": "Cole Sillinger",
   "kind": "player",
   "sources": "nhl_api:8482705",
   "league": "nhl",
   "born": null,
   "from": 2021,
   "to": 2025,
   "clubs": "Columbus Blue Jackets"
  },
  "b": {
   "id": 58102,
   "name": "Cole Sillinger",
   "kind": "player",
   "sources": "wikipedia:Cole Sillinger",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Columbus Blue Jackets"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Philadelphia Flyers, Toronto Maple Leafs) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 4673,
   "name": "Craig Berube",
   "kind": "player",
   "sources": "nhl_api:8445440",
   "league": "nhl",
   "born": null,
   "from": 1986,
   "to": 2002,
   "clubs": "Calgary Flames; New York Islanders; Philadelphia Flyers; Toronto Maple Leafs; Washington Capitals"
  },
  "b": {
   "id": 58110,
   "name": "Craig Berube",
   "kind": "coach",
   "sources": "wikipedia:Craig Berube",
   "league": "nhl",
   "born": null,
   "from": 2013,
   "to": 2025,
   "clubs": "Philadelphia Flyers; St. Louis Blues; Toronto Maple Leafs"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Miami Marlins) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 44836,
   "name": "Dan Jennings",
   "kind": "player",
   "sources": "lahman:jennida01",
   "league": "mlb",
   "born": "1987-04-17",
   "from": 2012,
   "to": 2019,
   "clubs": "Chicago White Sox; Miami Marlins; Milwaukee Brewers; Tampa Bay Rays; Washington Nationals"
  },
  "b": {
   "id": 58359,
   "name": "Dan Jennings",
   "kind": "coach",
   "sources": "retrosheet:jennd801",
   "league": "mlb",
   "born": null,
   "from": 2015,
   "to": 2015,
   "clubs": "Miami Marlins"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Detroit Red Wings) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5337,
   "name": "Doug Barkley",
   "kind": "player",
   "sources": "nhl_api:8445020",
   "league": "nhl",
   "born": null,
   "from": 1957,
   "to": 1965,
   "clubs": "Chicago Blackhawks; Detroit Red Wings"
  },
  "b": {
   "id": 58181,
   "name": "Doug Barkley",
   "kind": "coach",
   "sources": "wikipedia:Doug Barkley",
   "league": "nhl",
   "born": null,
   "from": 1970,
   "to": 1975,
   "clubs": "Detroit Red Wings"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Vancouver Canucks) but no season, birth date or other id in common",
  "a": {
   "id": 5410,
   "name": "Drew O'Connor",
   "kind": "player",
   "sources": "nhl_api:8482055",
   "league": "nhl",
   "born": null,
   "from": 2020,
   "to": 2025,
   "clubs": "Pittsburgh Penguins; Vancouver Canucks"
  },
  "b": {
   "id": 58191,
   "name": "Drew O'Connor",
   "kind": "player",
   "sources": "wikipedia:Drew O'Connor",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Vancouver Canucks"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (St. Louis Blues) but no season, birth date or other id in common",
  "a": {
   "id": 5462,
   "name": "Dylan Holloway",
   "kind": "player",
   "sources": "nhl_api:8482077",
   "league": "nhl",
   "born": null,
   "from": 2021,
   "to": 2025,
   "clubs": "Edmonton Oilers; St. Louis Blues"
  },
  "b": {
   "id": 58196,
   "name": "Dylan Holloway",
   "kind": "player",
   "sources": "wikipedia:Dylan Holloway",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "St. Louis Blues"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (New York Rangers) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5574,
   "name": "Emile Francis",
   "kind": "player",
   "sources": "nhl_api:8449922",
   "league": "nhl",
   "born": null,
   "from": 1946,
   "to": 1951,
   "clubs": "Chicago Blackhawks; New York Rangers"
  },
  "b": {
   "id": 58615,
   "name": "Emile Francis",
   "kind": "coach",
   "sources": "wikipedia:name:Emile Francis",
   "league": "nhl",
   "born": null,
   "from": 1965,
   "to": 1982,
   "clubs": "New York Rangers; St. Louis Blues"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Edmonton Oilers) but no season, birth date or other id in common",
  "a": {
   "id": 5660,
   "name": "Evan Bouchard",
   "kind": "player",
   "sources": "nhl_api:8480803",
   "league": "nhl",
   "born": null,
   "from": 2018,
   "to": 2025,
   "clubs": "Edmonton Oilers"
  },
  "b": {
   "id": 58223,
   "name": "Evan Bouchard",
   "kind": "player",
   "sources": "wikipedia:Evan Bouchard",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Edmonton Oilers"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Pittsburgh Penguins) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5911,
   "name": "Gene Ubriaco",
   "kind": "player",
   "sources": "nhl_api:8449273",
   "league": "nhl",
   "born": null,
   "from": 1967,
   "to": 1969,
   "clubs": "Chicago Blackhawks; Cleveland Barons; Pittsburgh Penguins"
  },
  "b": {
   "id": 58262,
   "name": "Gene Ubriaco",
   "kind": "coach",
   "sources": "wikipedia:Gene Ubriaco",
   "league": "nhl",
   "born": null,
   "from": 1988,
   "to": 1989,
   "clubs": "Pittsburgh Penguins"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Ottawa Senators) but no season, birth date or other id in common",
  "a": {
   "id": 6566,
   "name": "Jake Sanderson",
   "kind": "player",
   "sources": "nhl_api:8482105",
   "league": "nhl",
   "born": null,
   "from": 2022,
   "to": 2025,
   "clubs": "Ottawa Senators"
  },
  "b": {
   "id": 58341,
   "name": "Jake Sanderson",
   "kind": "player",
   "sources": "wikipedia:Jake Sanderson",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Ottawa Senators"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Los Angeles Kings) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6970,
   "name": "Jim Hiller",
   "kind": "player",
   "sources": "nhl_api:8456597",
   "league": "nhl",
   "born": null,
   "from": 1992,
   "to": 1993,
   "clubs": "Detroit Red Wings; Los Angeles Kings; New York Rangers"
  },
  "b": {
   "id": 58378,
   "name": "Jim Hiller",
   "kind": "coach",
   "sources": "wikipedia:Jim Hiller",
   "league": "nhl",
   "born": null,
   "from": 2023,
   "to": 2026,
   "clubs": "Los Angeles Kings; Toronto Maple Leafs"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Toronto Maple Leafs) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7094,
   "name": "Joe Crozier",
   "kind": "player",
   "sources": "nhl_api:8445819",
   "league": "nhl",
   "born": null,
   "from": 1959,
   "to": 1959,
   "clubs": "Toronto Maple Leafs"
  },
  "b": {
   "id": 58394,
   "name": "Joe Crozier",
   "kind": "coach",
   "sources": "wikipedia:Joe Crozier",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1980,
   "clubs": "Buffalo Sabres; Toronto Maple Leafs"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Brooklyn Americans) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7133,
   "name": "Joe Simpson",
   "kind": "player",
   "sources": "nhl_api:8449045",
   "league": "nhl",
   "born": null,
   "from": 1925,
   "to": 1930,
   "clubs": "Brooklyn Americans"
  },
  "b": {
   "id": 58405,
   "name": "Joe Simpson",
   "kind": "coach",
   "sources": "wikipedia:Joe Simpson (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1932,
   "to": 1934,
   "clubs": "Brooklyn Americans"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Toronto Maple Leafs) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7267,
   "name": "John McLellan",
   "kind": "player",
   "sources": "nhl_api:8447798",
   "league": "nhl",
   "born": null,
   "from": 1951,
   "to": 1951,
   "clubs": "Toronto Maple Leafs"
  },
  "b": {
   "id": 58424,
   "name": "John McLellan",
   "kind": "coach",
   "sources": "wikipedia:John McLellan (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1969,
   "to": 1972,
   "clubs": "Toronto Maple Leafs"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Philadelphia Flyers) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7297,
   "name": "John Stevens",
   "kind": "player",
   "sources": "nhl_api:8451710",
   "league": "nhl",
   "born": null,
   "from": 1986,
   "to": 1993,
   "clubs": "Carolina Hurricanes; Philadelphia Flyers"
  },
  "b": {
   "id": 58437,
   "name": "John Stevens",
   "kind": "coach",
   "sources": "wikipedia:John Stevens (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2006,
   "to": 2018,
   "clubs": "Los Angeles Kings; Philadelphia Flyers"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Montréal Canadiens) but no season, birth date or other id in common",
  "a": {
   "id": 7426,
   "name": "Josh Anderson",
   "kind": "player",
   "sources": "nhl_api:8476981",
   "league": "nhl",
   "born": null,
   "from": 2014,
   "to": 2025,
   "clubs": "Columbus Blue Jackets; Montréal Canadiens"
  },
  "b": {
   "id": 58443,
   "name": "Josh Anderson",
   "kind": "player",
   "sources": "wikipedia:Josh Anderson (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Montréal Canadiens"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (New York Rangers) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7850,
   "name": "Larry Popein",
   "kind": "player",
   "sources": "nhl_api:8448177",
   "league": "nhl",
   "born": null,
   "from": 1954,
   "to": 1967,
   "clubs": "Cleveland Barons; New York Rangers"
  },
  "b": {
   "id": 58483,
   "name": "Larry Popein",
   "kind": "coach",
   "sources": "wikipedia:Larry Popein",
   "league": "nhl",
   "born": null,
   "from": 1973,
   "to": 1973,
   "clubs": "New York Rangers"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Vancouver Canucks) but no season, birth date or other id in common",
  "a": {
   "id": 7955,
   "name": "Linus Karlsson",
   "kind": "player",
   "sources": "nhl_api:8481024",
   "league": "nhl",
   "born": null,
   "from": 2023,
   "to": 2025,
   "clubs": "Vancouver Canucks"
  },
  "b": {
   "id": 58499,
   "name": "Linus Karlsson",
   "kind": "player",
   "sources": "wikipedia:Linus Karlsson (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Vancouver Canucks"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Columbus Blue Jackets) but no season, birth date or other id in common",
  "a": {
   "id": 8345,
   "name": "Mathieu Olivier",
   "kind": "player",
   "sources": "nhl_api:8479671",
   "league": "nhl",
   "born": null,
   "from": 2019,
   "to": 2025,
   "clubs": "Columbus Blue Jackets; Nashville Predators"
  },
  "b": {
   "id": 58525,
   "name": "Mathieu Olivier",
   "kind": "player",
   "sources": "wikipedia:Mathieu Olivier",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Columbus Blue Jackets"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Washington Capitals) but no season, birth date or other id in common",
  "a": {
   "id": 8417,
   "name": "Matt Roy",
   "kind": "player",
   "sources": "nhl_api:8478911",
   "league": "nhl",
   "born": null,
   "from": 2018,
   "to": 2025,
   "clubs": "Los Angeles Kings; Washington Capitals"
  },
  "b": {
   "id": 58528,
   "name": "Matt Roy",
   "kind": "player",
   "sources": "wikipedia:Matt Roy (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Washington Capitals"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Boston Bruins) but no season, birth date or other id in common; one is a player record, the other a coach; also paired with person 58562 58653",
  "a": {
   "id": 8735,
   "name": "Mike Milbury",
   "kind": "player",
   "sources": "nhl_api:8449617",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1986,
   "clubs": "Boston Bruins"
  },
  "b": {
   "id": 58562,
   "name": "Mike Milbury",
   "kind": "coach",
   "sources": "wikipedia:Mike Milbury",
   "league": "nhl",
   "born": null,
   "from": 1989,
   "to": 1990,
   "clubs": "Boston Bruins"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Boston Bruins) but no season, birth date or other id in common; one is a player record, the other a coach; also paired with person 58571 58654",
  "a": {
   "id": 8783,
   "name": "Mike Sullivan",
   "kind": "player",
   "sources": "nhl_api:8458155",
   "league": "nhl",
   "born": null,
   "from": 1991,
   "to": 2001,
   "clubs": "Boston Bruins; Calgary Flames; San Jose Sharks; Utah Mammoth"
  },
  "b": {
   "id": 58571,
   "name": "Mike Sullivan",
   "kind": "coach",
   "sources": "wikipedia:Mike Sullivan (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2003,
   "to": 2026,
   "clubs": "Boston Bruins; New York Rangers; Pittsburgh Penguins"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Dallas Stars) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 9205,
   "name": "Parker MacDonald",
   "kind": "player",
   "sources": "nhl_api:8447537",
   "league": "nhl",
   "born": null,
   "from": 1952,
   "to": 1968,
   "clubs": "Boston Bruins; Dallas Stars; Detroit Red Wings; New York Rangers; Toronto Maple Leafs"
  },
  "b": {
   "id": 58696,
   "name": "Parker MacDonald",
   "kind": "coach",
   "sources": "wikipedia:Parker MacDonald",
   "league": "nhl",
   "born": null,
   "from": 1973,
   "to": 1981,
   "clubs": "Dallas Stars; Los Angeles Kings"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Philadelphia Flyers) but no season, birth date or other id in common; one is a player record, the other a coach; also paired with person 58661 58700",
  "a": {
   "id": 9319,
   "name": "Paul Holmgren",
   "kind": "player",
   "sources": "nhl_api:8447934",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1984,
   "clubs": "Dallas Stars; Philadelphia Flyers"
  },
  "b": {
   "id": 58700,
   "name": "Paul Holmgren",
   "kind": "coach",
   "sources": "wikipedia:Paul Holmgren",
   "league": "nhl",
   "born": null,
   "from": 1988,
   "to": 1995,
   "clubs": "Carolina Hurricanes; Philadelphia Flyers"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (St. Louis Blues) but no season, birth date or other id in common",
  "a": {
   "id": 9527,
   "name": "Philip Broberg",
   "kind": "player",
   "sources": "nhl_api:8481598",
   "league": "nhl",
   "born": null,
   "from": 2021,
   "to": 2025,
   "clubs": "Edmonton Oilers; St. Louis Blues"
  },
  "b": {
   "id": 58721,
   "name": "Philip Broberg",
   "kind": "player",
   "sources": "wikipedia:Philip Broberg",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "St. Louis Blues"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Montréal Canadiens) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 9571,
   "name": "Pit Lepine",
   "kind": "player",
   "sources": "nhl_api:8447466",
   "league": "nhl",
   "born": null,
   "from": 1925,
   "to": 1937,
   "clubs": "Montréal Canadiens"
  },
  "b": {
   "id": 58730,
   "name": "Pit Lepine",
   "kind": "coach",
   "sources": "wikipedia:Pit Lepine",
   "league": "nhl",
   "born": null,
   "from": 1939,
   "to": 1939,
   "clubs": "Montréal Canadiens"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Utah Mammoth) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 9799,
   "name": "Rick Bowness",
   "kind": "player",
   "sources": "nhl_api:8445643",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1981,
   "clubs": "Calgary Flames; Detroit Red Wings; St. Louis Blues; Utah Mammoth"
  },
  "b": {
   "id": 58758,
   "name": "Rick Bowness",
   "kind": "coach",
   "sources": "wikipedia:Rick Bowness",
   "league": "nhl",
   "born": null,
   "from": 1988,
   "to": 2026,
   "clubs": "Boston Bruins; Columbus Blue Jackets; Dallas Stars; New York Islanders; Ottawa Senators"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Buffalo Sabres) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 9804,
   "name": "Rick Dudley",
   "kind": "player",
   "sources": "nhl_api:8446498",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1980,
   "clubs": "Buffalo Sabres; Utah Mammoth"
  },
  "b": {
   "id": 58760,
   "name": "Rick Dudley",
   "kind": "coach",
   "sources": "wikipedia:Rick Dudley",
   "league": "nhl",
   "born": null,
   "from": 1989,
   "to": 2003,
   "clubs": "Buffalo Sabres; Florida Panthers"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Toronto Maple Leafs) but no season, birth date or other id in common; one is a player record, the other a coach; person 58786 also paired with person 10039 10040",
  "a": {
   "id": 10040,
   "name": "Ron Wilson",
   "kind": "player",
   "sources": "nhl_api:8452484",
   "league": "nhl",
   "born": null,
   "from": 1977,
   "to": 1987,
   "clubs": "Dallas Stars; Toronto Maple Leafs"
  },
  "b": {
   "id": 58786,
   "name": "Ron Wilson",
   "kind": "coach",
   "sources": "wikipedia:Ron Wilson (ice hockey, born 1955)",
   "league": "nhl",
   "born": null,
   "from": 1993,
   "to": 2011,
   "clubs": "Anaheim Ducks; San Jose Sharks; Toronto Maple Leafs; Washington Capitals"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Brooklyn Americans) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10417,
   "name": "Shorty Green",
   "kind": "player",
   "sources": "nhl_api:8446644",
   "league": "nhl",
   "born": null,
   "from": 1923,
   "to": 1926,
   "clubs": "Brooklyn Americans"
  },
  "b": {
   "id": 58822,
   "name": "Shorty Green",
   "kind": "coach",
   "sources": "wikipedia:Shorty Green",
   "league": "nhl",
   "born": null,
   "from": 1927,
   "to": 1927,
   "clubs": "Brooklyn Americans"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Boston Bruins) but no season, birth date or other id in common",
  "a": {
   "id": 10636,
   "name": "Tanner Jeannot",
   "kind": "player",
   "sources": "nhl_api:8479661",
   "league": "nhl",
   "born": null,
   "from": 2020,
   "to": 2025,
   "clubs": "Boston Bruins; Los Angeles Kings; Nashville Predators; Tampa Bay Lightning"
  },
  "b": {
   "id": 58845,
   "name": "Tanner Jeannot",
   "kind": "player",
   "sources": "wikipedia:Tanner Jeannot",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Boston Bruins"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Philadelphia Flyers, Washington Capitals) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10696,
   "name": "Terry Murray",
   "kind": "player",
   "sources": "nhl_api:8449772",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1981,
   "clubs": "Cleveland Barons; Detroit Red Wings; Philadelphia Flyers; Washington Capitals"
  },
  "b": {
   "id": 58852,
   "name": "Terry Murray",
   "kind": "coach",
   "sources": "wikipedia:Terry Murray",
   "league": "nhl",
   "born": null,
   "from": 1989,
   "to": 2011,
   "clubs": "Florida Panthers; Los Angeles Kings; Philadelphia Flyers; Washington Capitals"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Ottawa Senators) but no season, birth date or other id in common",
  "a": {
   "id": 10765,
   "name": "Tim Stützle",
   "kind": "player",
   "sources": "nhl_api:8482116",
   "league": "nhl",
   "born": null,
   "from": 2020,
   "to": 2025,
   "clubs": "Ottawa Senators"
  },
  "b": {
   "id": 58866,
   "name": "Tim Stützle",
   "kind": "player",
   "sources": "wikipedia:Tim Stützle",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Ottawa Senators"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Chicago Blackhawks) but no season, birth date or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10975,
   "name": "Trent Yawney",
   "kind": "player",
   "sources": "nhl_api:8452556",
   "league": "nhl",
   "born": null,
   "from": 1987,
   "to": 1998,
   "clubs": "Calgary Flames; Chicago Blackhawks; St. Louis Blues"
  },
  "b": {
   "id": 58893,
   "name": "Trent Yawney",
   "kind": "coach",
   "sources": "wikipedia:Trent Yawney",
   "league": "nhl",
   "born": null,
   "from": 2005,
   "to": 2006,
   "clubs": "Chicago Blackhawks"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Seattle Kraken) but no season, birth date or other id in common",
  "a": {
   "id": 11155,
   "name": "Vince Dunn",
   "kind": "player",
   "sources": "nhl_api:8478407",
   "league": "nhl",
   "born": null,
   "from": 2017,
   "to": 2025,
   "clubs": "Seattle Kraken; St. Louis Blues"
  },
  "b": {
   "id": 58907,
   "name": "Vince Dunn",
   "kind": "player",
   "sources": "wikipedia:Vince Dunn",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Seattle Kraken"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Edmonton Oilers) but no season, birth date or other id in common",
  "a": {
   "id": 11368,
   "name": "Zach Hyman",
   "kind": "player",
   "sources": "nhl_api:8475786",
   "league": "nhl",
   "born": null,
   "from": 2015,
   "to": 2025,
   "clubs": "Edmonton Oilers; Toronto Maple Leafs"
  },
  "b": {
   "id": 58929,
   "name": "Zach Hyman",
   "kind": "player",
   "sources": "wikipedia:Zach Hyman",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Edmonton Oilers"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Calgary Flames) but no season, birth date or other id in common",
  "a": {
   "id": 11376,
   "name": "Zach Whitecloud",
   "kind": "player",
   "sources": "nhl_api:8480727",
   "league": "nhl",
   "born": null,
   "from": 2017,
   "to": 2025,
   "clubs": "Calgary Flames; Vegas Golden Knights"
  },
  "b": {
   "id": 58930,
   "name": "Zach Whitecloud",
   "kind": "player",
   "sources": "wikipedia:Zach Whitecloud",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Calgary Flames"
  }
 },
 {
  "lean": "possibly one person",
  "why": "same franchise (Vancouver Canucks) but no season, birth date or other id in common",
  "a": {
   "id": 11399,
   "name": "Zeev Buium",
   "kind": "player",
   "sources": "nhl_api:8484798",
   "league": "nhl",
   "born": null,
   "from": 2024,
   "to": 2025,
   "clubs": "Minnesota Wild; Vancouver Canucks"
  },
  "b": {
   "id": 58932,
   "name": "Zeev Buium",
   "kind": "player",
   "sources": "wikipedia:Zeev Buium",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Vancouver Canucks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3110,
   "name": "Alain Nasreddine",
   "kind": "player",
   "sources": "nhl_api:8459558",
   "league": "nhl",
   "born": null,
   "from": 1998,
   "to": 2007,
   "clubs": "Chicago Blackhawks; Montréal Canadiens; New York Islanders; Pittsburgh Penguins"
  },
  "b": {
   "id": 57769,
   "name": "Alain Nasreddine",
   "kind": "coach",
   "sources": "wikipedia:Alain Nasreddine",
   "league": "nhl",
   "born": null,
   "from": 2019,
   "to": 2019,
   "clubs": "New Jersey Devils"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3099,
   "name": "Al Sims",
   "kind": "player",
   "sources": "nhl_api:8451364",
   "league": "nhl",
   "born": null,
   "from": 1973,
   "to": 1982,
   "clubs": "Boston Bruins; Carolina Hurricanes; Los Angeles Kings"
  },
  "b": {
   "id": 57784,
   "name": "Al Sims",
   "kind": "coach",
   "sources": "wikipedia:Al Sims",
   "league": "nhl",
   "born": null,
   "from": 1996,
   "to": 1996,
   "clubs": "San Jose Sharks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 57791 57792",
  "a": {
   "id": 3372,
   "name": "Andrew Murray",
   "kind": "player",
   "sources": "nhl_api:8469685",
   "league": "nhl",
   "born": null,
   "from": 2007,
   "to": 2012,
   "clubs": "Columbus Blue Jackets; San Jose Sharks; St. Louis Blues"
  },
  "b": {
   "id": 57791,
   "name": "Andy Murray",
   "kind": "coach",
   "sources": "wikipedia:Andy Murray",
   "league": "nhl",
   "born": null,
   "from": 2000,
   "to": 2000,
   "clubs": "Los Angeles Kings"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3546,
   "name": "Barry Melrose",
   "kind": "player",
   "sources": "nhl_api:8449555",
   "league": "nhl",
   "born": null,
   "from": 1979,
   "to": 1985,
   "clubs": "Detroit Red Wings; Toronto Maple Leafs; Utah Mammoth"
  },
  "b": {
   "id": 57803,
   "name": "Barry Melrose",
   "kind": "coach",
   "sources": "wikipedia:Barry Melrose",
   "league": "nhl",
   "born": null,
   "from": 1992,
   "to": 2008,
   "clubs": "Los Angeles Kings; Tampa Bay Lightning"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 57822 57823",
  "a": {
   "id": 3700,
   "name": "Bill Stewart",
   "kind": "player",
   "sources": "nhl_api:8451732",
   "league": "nhl",
   "born": null,
   "from": 1977,
   "to": 1985,
   "clubs": "Buffalo Sabres; Dallas Stars; St. Louis Blues; Toronto Maple Leafs"
  },
  "b": {
   "id": 57822,
   "name": "Bill Stewart",
   "kind": "coach",
   "sources": "wikipedia:Bill Stewart (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1998,
   "to": 1998,
   "clubs": "New York Islanders"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 57822 57823",
  "a": {
   "id": 3700,
   "name": "Bill Stewart",
   "kind": "player",
   "sources": "nhl_api:8451732",
   "league": "nhl",
   "born": null,
   "from": 1977,
   "to": 1985,
   "clubs": "Buffalo Sabres; Dallas Stars; St. Louis Blues; Toronto Maple Leafs"
  },
  "b": {
   "id": 57823,
   "name": "Bill Stewart",
   "kind": "coach",
   "sources": "wikipedia:Bill Stewart (sports official)",
   "league": "nhl",
   "born": null,
   "from": 1937,
   "to": 1938,
   "clubs": "Chicago Blackhawks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 57843 57844",
  "a": {
   "id": 3821,
   "name": "Bob Johnson",
   "kind": "player",
   "sources": "nhl_api:8450004",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1974,
   "clubs": "Pittsburgh Penguins; St. Louis Blues"
  },
  "b": {
   "id": 57843,
   "name": "Bob Johnson",
   "kind": "coach",
   "sources": "wikipedia:Bob Johnson (ice hockey b. 1931)",
   "league": "nhl",
   "born": null,
   "from": 1985,
   "to": 1986,
   "clubs": "Calgary Flames"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; person 3841 also paired with person 518 57851",
  "a": {
   "id": 518,
   "name": "Bob Murdoch",
   "kind": "player",
   "sources": "wikidata:Q888155 wikipedia:Bob Murdoch (ice hockey, born 1946)",
   "league": "nhl",
   "born": "1946-11-20",
   "from": 1987,
   "to": 1989,
   "clubs": "Chicago Blackhawks; Utah Mammoth"
  },
  "b": {
   "id": 3841,
   "name": "Bob Murdoch",
   "kind": "player",
   "sources": "nhl_api:8449737",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1978,
   "clubs": "Cleveland Barons; St. Louis Blues"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 518 57851; person 57851 also paired with person 3841 3842",
  "a": {
   "id": 3841,
   "name": "Bob Murdoch",
   "kind": "player",
   "sources": "nhl_api:8449737",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1978,
   "clubs": "Cleveland Barons; St. Louis Blues"
  },
  "b": {
   "id": 57851,
   "name": "Bob Murdoch",
   "kind": "coach",
   "sources": "wikipedia:Bob Murdoch (ice hockey b. 1946)",
   "league": "nhl",
   "born": null,
   "from": 1990,
   "to": 1990,
   "clubs": "Utah Mammoth"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; person 57851 also paired with person 3841 3842",
  "a": {
   "id": 3842,
   "name": "Bob Murdoch",
   "kind": "player",
   "sources": "nhl_api:8449736",
   "league": "nhl",
   "born": null,
   "from": 1970,
   "to": 1981,
   "clubs": "Calgary Flames; Los Angeles Kings; Montréal Canadiens"
  },
  "b": {
   "id": 57851,
   "name": "Bob Murdoch",
   "kind": "coach",
   "sources": "wikipedia:Bob Murdoch (ice hockey b. 1946)",
   "league": "nhl",
   "born": null,
   "from": 1990,
   "to": 1990,
   "clubs": "Utah Mammoth"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 3938,
   "name": "Brad Larsen",
   "kind": "player",
   "sources": "nhl_api:8462082",
   "league": "nhl",
   "born": null,
   "from": 1997,
   "to": 2007,
   "clubs": "Colorado Avalanche; Winnipeg Jets"
  },
  "b": {
   "id": 57861,
   "name": "Brad Larsen",
   "kind": "coach",
   "sources": "wikipedia:Brad Larsen",
   "league": "nhl",
   "born": null,
   "from": 2021,
   "to": 2022,
   "clubs": "Columbus Blue Jackets"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 51332,
   "name": "Bryan Price",
   "kind": "player",
   "sources": "lahman:pricebr01",
   "league": "mlb",
   "born": "1986-11-13",
   "from": 2014,
   "to": 2014,
   "clubs": "Cleveland Guardians"
  },
  "b": {
   "id": 58735,
   "name": "Bryan Price",
   "kind": "coach",
   "sources": "retrosheet:pricb801",
   "league": "mlb",
   "born": null,
   "from": 2014,
   "to": 2018,
   "clubs": "Cincinnati Reds"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 4541,
   "name": "Claude Noel",
   "kind": "player",
   "sources": "nhl_api:8449889",
   "league": "nhl",
   "born": null,
   "from": 1979,
   "to": 1979,
   "clubs": "Washington Capitals"
  },
  "b": {
   "id": 57920,
   "name": "Claude Noel",
   "kind": "coach",
   "sources": "wikipedia:Claude Noël",
   "league": "nhl",
   "born": null,
   "from": 2009,
   "to": 2013,
   "clubs": "Columbus Blue Jackets; Winnipeg Jets"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 4713,
   "name": "Curt Fraser",
   "kind": "player",
   "sources": "nhl_api:8446957",
   "league": "nhl",
   "born": null,
   "from": 1978,
   "to": 1989,
   "clubs": "Chicago Blackhawks; Dallas Stars; Vancouver Canucks"
  },
  "b": {
   "id": 58115,
   "name": "Curt Fraser",
   "kind": "coach",
   "sources": "wikipedia:Curt Fraser",
   "league": "nhl",
   "born": null,
   "from": 1999,
   "to": 2002,
   "clubs": "Winnipeg Jets"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 4757,
   "name": "Dallas Eakins",
   "kind": "player",
   "sources": "nhl_api:8456153",
   "league": "nhl",
   "born": null,
   "from": 1992,
   "to": 2001,
   "clubs": "Calgary Flames; Florida Panthers; New York Islanders; New York Rangers; St. Louis Blues"
  },
  "b": {
   "id": 58117,
   "name": "Dallas Eakins",
   "kind": "coach",
   "sources": "wikipedia:Dallas Eakins",
   "league": "nhl",
   "born": null,
   "from": 2013,
   "to": 2022,
   "clubs": "Anaheim Ducks; Edmonton Oilers"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 4863,
   "name": "Danny Belisle",
   "kind": "player",
   "sources": "nhl_api:8445043",
   "league": "nhl",
   "born": null,
   "from": 1960,
   "to": 1960,
   "clubs": "New York Rangers"
  },
  "b": {
   "id": 58124,
   "name": "Danny Belisle",
   "kind": "coach",
   "sources": "wikipedia:Danny Belisle",
   "league": "nhl",
   "born": null,
   "from": 1978,
   "to": 1979,
   "clubs": "Washington Capitals"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 4939,
   "name": "Dave Allison",
   "kind": "player",
   "sources": "nhl_api:8444917",
   "league": "nhl",
   "born": null,
   "from": 1983,
   "to": 1983,
   "clubs": "Montréal Canadiens"
  },
  "b": {
   "id": 58130,
   "name": "Dave Allison",
   "kind": "coach",
   "sources": "wikipedia:Dave Allison",
   "league": "nhl",
   "born": null,
   "from": 1995,
   "to": 1995,
   "clubs": "Ottawa Senators"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 4949,
   "name": "Dave Cameron",
   "kind": "player",
   "sources": "nhl_api:8445878",
   "league": "nhl",
   "born": null,
   "from": 1981,
   "to": 1983,
   "clubs": "New Jersey Devils"
  },
  "b": {
   "id": 58131,
   "name": "Dave Cameron",
   "kind": "coach",
   "sources": "wikipedia:Dave Cameron (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2014,
   "to": 2015,
   "clubs": "Ottawa Senators"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5103,
   "name": "Davis Payne",
   "kind": "player",
   "sources": "nhl_api:8457636",
   "league": "nhl",
   "born": null,
   "from": 1995,
   "to": 1996,
   "clubs": "Boston Bruins"
  },
  "b": {
   "id": 58148,
   "name": "Davis Payne",
   "kind": "coach",
   "sources": "wikipedia:Davis Payne",
   "league": "nhl",
   "born": null,
   "from": 2009,
   "to": 2011,
   "clubs": "St. Louis Blues"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5183,
   "name": "Derek King",
   "kind": "player",
   "sources": "nhl_api:8448489",
   "league": "nhl",
   "born": null,
   "from": 1986,
   "to": 1999,
   "clubs": "Carolina Hurricanes; New York Islanders; St. Louis Blues; Toronto Maple Leafs"
  },
  "b": {
   "id": 58153,
   "name": "Derek King",
   "kind": "coach",
   "sources": "wikipedia:Derek King",
   "league": "nhl",
   "born": null,
   "from": 2021,
   "to": 2021,
   "clubs": "Chicago Blackhawks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5282,
   "name": "Don Blackburn",
   "kind": "player",
   "sources": "nhl_api:8445084",
   "league": "nhl",
   "born": null,
   "from": 1962,
   "to": 1972,
   "clubs": "Boston Bruins; Dallas Stars; New York Islanders; New York Rangers; Philadelphia Flyers"
  },
  "b": {
   "id": 58169,
   "name": "Don Blackburn",
   "kind": "coach",
   "sources": "wikipedia:Don Blackburn",
   "league": "nhl",
   "born": null,
   "from": 1979,
   "to": 1980,
   "clubs": "Carolina Hurricanes"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5319,
   "name": "Don Waddell",
   "kind": "player",
   "sources": "nhl_api:8452243",
   "league": "nhl",
   "born": null,
   "from": 1980,
   "to": 1980,
   "clubs": "Los Angeles Kings"
  },
  "b": {
   "id": 58180,
   "name": "Don Waddell",
   "kind": "coach",
   "sources": "wikipedia:Don Waddell",
   "league": "nhl",
   "born": null,
   "from": 2002,
   "to": 2007,
   "clubs": "Winnipeg Jets"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5400,
   "name": "Drew Bannister",
   "kind": "player",
   "sources": "nhl_api:8458962",
   "league": "nhl",
   "born": null,
   "from": 1995,
   "to": 2001,
   "clubs": "Anaheim Ducks; Edmonton Oilers; New York Rangers; Tampa Bay Lightning"
  },
  "b": {
   "id": 58190,
   "name": "Drew Bannister",
   "kind": "coach",
   "sources": "wikipedia:Drew Bannister",
   "league": "nhl",
   "born": null,
   "from": 2023,
   "to": 2024,
   "clubs": "St. Louis Blues"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 5520,
   "name": "Eddie Bush",
   "kind": "player",
   "sources": "nhl_api:8445295",
   "league": "nhl",
   "born": null,
   "from": 1938,
   "to": 1941,
   "clubs": "Detroit Red Wings"
  },
  "b": {
   "id": 58203,
   "name": "Eddie Bush",
   "kind": "coach",
   "sources": "wikipedia:Eddie Bush",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1975,
   "clubs": "New Jersey Devils"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6029,
   "name": "Glen Hanlon",
   "kind": "player",
   "sources": "nhl_api:8447505",
   "league": "nhl",
   "born": null,
   "from": 1977,
   "to": 1990,
   "clubs": "Detroit Red Wings; New York Rangers; St. Louis Blues; Vancouver Canucks"
  },
  "b": {
   "id": 58279,
   "name": "Glen Hanlon",
   "kind": "coach",
   "sources": "wikipedia:Glen Hanlon",
   "league": "nhl",
   "born": null,
   "from": 2003,
   "to": 2007,
   "clubs": "Washington Capitals"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6038,
   "name": "Glen Sonmor",
   "kind": "player",
   "sources": "nhl_api:8449127",
   "league": "nhl",
   "born": null,
   "from": 1953,
   "to": 1954,
   "clubs": "New York Rangers"
  },
  "b": {
   "id": 58281,
   "name": "Glen Sonmor",
   "kind": "coach",
   "sources": "wikipedia:Glen Sonmor",
   "league": "nhl",
   "born": null,
   "from": 1978,
   "to": 1986,
   "clubs": "Dallas Stars"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6207,
   "name": "Hal Laycoe",
   "kind": "player",
   "sources": "nhl_api:8447349",
   "league": "nhl",
   "born": null,
   "from": 1945,
   "to": 1955,
   "clubs": "Boston Bruins; Montréal Canadiens; New York Rangers"
  },
  "b": {
   "id": 58294,
   "name": "Hal Laycoe",
   "kind": "coach",
   "sources": "wikipedia:Hal Laycoe",
   "league": "nhl",
   "born": null,
   "from": 1969,
   "to": 1971,
   "clubs": "Los Angeles Kings; Vancouver Canucks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6411,
   "name": "Ivan Hlinka",
   "kind": "player",
   "sources": "nhl_api:8447868",
   "league": "nhl",
   "born": null,
   "from": 1981,
   "to": 1982,
   "clubs": "Vancouver Canucks"
  },
  "b": {
   "id": 58325,
   "name": "Ivan Hlinka",
   "kind": "coach",
   "sources": "wikipedia:Ivan Hlinka",
   "league": "nhl",
   "born": null,
   "from": 2000,
   "to": 2001,
   "clubs": "Pittsburgh Penguins"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6443,
   "name": "Jack Capuano",
   "kind": "player",
   "sources": "nhl_api:8445917",
   "league": "nhl",
   "born": null,
   "from": 1989,
   "to": 1991,
   "clubs": "Boston Bruins; Toronto Maple Leafs; Vancouver Canucks"
  },
  "b": {
   "id": 58326,
   "name": "Jack Capuano",
   "kind": "coach",
   "sources": "wikipedia:Jack Capuano",
   "league": "nhl",
   "born": null,
   "from": 2010,
   "to": 2016,
   "clubs": "New York Islanders"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common",
  "a": {
   "id": 6450,
   "name": "Jack Drury",
   "kind": "player",
   "sources": "nhl_api:8480835",
   "league": "nhl",
   "born": null,
   "from": 2021,
   "to": 2025,
   "clubs": "Carolina Hurricanes; Colorado Avalanche"
  },
  "b": {
   "id": 58327,
   "name": "Jack Drury",
   "kind": "player",
   "sources": "wikipedia:Jack Drury",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Nashville Predators"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58330 58625",
  "a": {
   "id": 6457,
   "name": "Jack Gordon",
   "kind": "player",
   "sources": "nhl_api:8446615",
   "league": "nhl",
   "born": null,
   "from": 1948,
   "to": 1950,
   "clubs": "New York Rangers"
  },
  "b": {
   "id": 58330,
   "name": "Jack Gordon",
   "kind": "coach",
   "sources": "wikipedia:Jack Gordon (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1970,
   "to": 1973,
   "clubs": "Dallas Stars"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58330 58625",
  "a": {
   "id": 6457,
   "name": "Jack Gordon",
   "kind": "player",
   "sources": "nhl_api:8446615",
   "league": "nhl",
   "born": null,
   "from": 1948,
   "to": 1950,
   "clubs": "New York Rangers"
  },
  "b": {
   "id": 58625,
   "name": "Jack Gordon",
   "kind": "coach",
   "sources": "wikipedia:name:Jack Gordon",
   "league": "nhl",
   "born": null,
   "from": 1974,
   "to": 1974,
   "clubs": "Dallas Stars"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6895,
   "name": "Jeremy Colliton",
   "kind": "player",
   "sources": "nhl_api:8470651",
   "league": "nhl",
   "born": null,
   "from": 2005,
   "to": 2010,
   "clubs": "New York Islanders"
  },
  "b": {
   "id": 58360,
   "name": "Jeremy Colliton",
   "kind": "coach",
   "sources": "wikipedia:Jeremy Colliton",
   "league": "nhl",
   "born": null,
   "from": 2018,
   "to": 2021,
   "clubs": "Chicago Blackhawks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 6943,
   "name": "Jim Anderson",
   "kind": "player",
   "sources": "nhl_api:8444924",
   "league": "nhl",
   "born": null,
   "from": 1967,
   "to": 1967,
   "clubs": "Los Angeles Kings"
  },
  "b": {
   "id": 58367,
   "name": "Jim Anderson",
   "kind": "coach",
   "sources": "wikipedia:Jim Anderson (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1974,
   "to": 1974,
   "clubs": "Washington Capitals"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common",
  "a": {
   "id": 2398,
   "name": "Jim Leyland",
   "kind": "coach",
   "sources": "wikidata:Q2746376",
   "league": "mlb",
   "born": "1944-12-15",
   "from": 1990,
   "to": 2006,
   "clubs": null
  },
  "b": {
   "id": 58495,
   "name": "Jim Leyland",
   "kind": "coach",
   "sources": "retrosheet:leylj801",
   "league": "mlb",
   "born": null,
   "from": 1985,
   "to": 2013,
   "clubs": "Chicago White Sox; Colorado Rockies; Detroit Tigers; Miami Marlins; Pittsburgh Pirates"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7007,
   "name": "Jim Playfair",
   "kind": "player",
   "sources": "nhl_api:8450470",
   "league": "nhl",
   "born": null,
   "from": 1983,
   "to": 1988,
   "clubs": "Chicago Blackhawks; Edmonton Oilers"
  },
  "b": {
   "id": 58385,
   "name": "Jim Playfair",
   "kind": "coach",
   "sources": "wikipedia:Jim Playfair",
   "league": "nhl",
   "born": null,
   "from": 2006,
   "to": 2006,
   "clubs": "Calgary Flames"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7023,
   "name": "Jim Wiley",
   "kind": "player",
   "sources": "nhl_api:8452365",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1976,
   "clubs": "Pittsburgh Penguins; Vancouver Canucks"
  },
  "b": {
   "id": 58390,
   "name": "Jim Wiley",
   "kind": "coach",
   "sources": "wikipedia:Jim Wiley",
   "league": "nhl",
   "born": null,
   "from": 1995,
   "to": 1995,
   "clubs": "San Jose Sharks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7130,
   "name": "Joe Sacco",
   "kind": "player",
   "sources": "nhl_api:8451093",
   "league": "nhl",
   "born": null,
   "from": 1990,
   "to": 2002,
   "clubs": "Anaheim Ducks; New York Islanders; Philadelphia Flyers; Toronto Maple Leafs; Washington Capitals"
  },
  "b": {
   "id": 58403,
   "name": "Joe Sacco",
   "kind": "coach",
   "sources": "wikipedia:Joe Sacco (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2009,
   "to": 2024,
   "clubs": "Boston Bruins; Colorado Avalanche"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; person 58624 also paired with person 7191 7192",
  "a": {
   "id": 7191,
   "name": "John Adams",
   "kind": "player",
   "sources": "nhl_api:8444862",
   "league": "nhl",
   "born": null,
   "from": 1940,
   "to": 1940,
   "clubs": "Montréal Canadiens"
  },
  "b": {
   "id": 58624,
   "name": "Jack Adams",
   "kind": "coach",
   "sources": "wikipedia:name:Jack Adams",
   "league": "nhl",
   "born": null,
   "from": 1927,
   "to": 1946,
   "clubs": "Detroit Red Wings"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; person 58624 also paired with person 7191 7192",
  "a": {
   "id": 7192,
   "name": "John Adams",
   "kind": "player",
   "sources": "nhl_api:8449783",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1974,
   "clubs": "Boston Bruins; Washington Capitals"
  },
  "b": {
   "id": 58624,
   "name": "Jack Adams",
   "kind": "coach",
   "sources": "wikipedia:name:Jack Adams",
   "league": "nhl",
   "born": null,
   "from": 1927,
   "to": 1946,
   "clubs": "Detroit Red Wings"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7194,
   "name": "John Anderson",
   "kind": "player",
   "sources": "nhl_api:8444944",
   "league": "nhl",
   "born": null,
   "from": 1977,
   "to": 1988,
   "clubs": "Carolina Hurricanes; Colorado Avalanche; Toronto Maple Leafs"
  },
  "b": {
   "id": 58407,
   "name": "John Anderson",
   "kind": "coach",
   "sources": "wikipedia:John Anderson (ice hockey, born 1957)",
   "league": "nhl",
   "born": null,
   "from": 2008,
   "to": 2009,
   "clubs": "Winnipeg Jets"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58433 58640",
  "a": {
   "id": 7279,
   "name": "John Paddock",
   "kind": "player",
   "sources": "nhl_api:8450090",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1982,
   "clubs": "Colorado Avalanche; Philadelphia Flyers; Washington Capitals"
  },
  "b": {
   "id": 58433,
   "name": "John Paddock",
   "kind": "coach",
   "sources": "wikipedia:John Paddock",
   "league": "nhl",
   "born": null,
   "from": 1991,
   "to": 2007,
   "clubs": "Ottawa Senators; Utah Mammoth"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58433 58640",
  "a": {
   "id": 7279,
   "name": "John Paddock",
   "kind": "player",
   "sources": "nhl_api:8450090",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1982,
   "clubs": "Colorado Avalanche; Philadelphia Flyers; Washington Capitals"
  },
  "b": {
   "id": 58640,
   "name": "John Paddock",
   "kind": "coach",
   "sources": "wikipedia:name:John Paddock",
   "league": "nhl",
   "born": null,
   "from": 1993,
   "to": 1994,
   "clubs": "Utah Mammoth"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7280,
   "name": "John Paul Evans",
   "kind": "player",
   "sources": "nhl_api:8446741",
   "league": "nhl",
   "born": null,
   "from": 1978,
   "to": 1982,
   "clubs": "Philadelphia Flyers"
  },
  "b": {
   "id": 58328,
   "name": "Jack Evans",
   "kind": "coach",
   "sources": "wikipedia:Jack Evans (hockey)",
   "league": "nhl",
   "born": null,
   "from": 1976,
   "to": 1976,
   "clubs": "Cleveland Barons"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 7814,
   "name": "Lane Lambert",
   "kind": "player",
   "sources": "nhl_api:8448655",
   "league": "nhl",
   "born": null,
   "from": 1983,
   "to": 1988,
   "clubs": "Colorado Avalanche; Detroit Red Wings; New York Rangers"
  },
  "b": {
   "id": 58475,
   "name": "Lane Lambert",
   "kind": "coach",
   "sources": "wikipedia:Lane Lambert",
   "league": "nhl",
   "born": null,
   "from": 2022,
   "to": 2026,
   "clubs": "New York Islanders; Seattle Kraken"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 2238,
   "name": "Larry Regan",
   "kind": "player",
   "sources": "nhl_api:8448299 wikidata:Q3218094",
   "league": "nhl",
   "born": "1930-08-09",
   "from": 1956,
   "to": 1960,
   "clubs": "Boston Bruins; Toronto Maple Leafs"
  },
  "b": {
   "id": 58642,
   "name": "Larry Regan",
   "kind": "coach",
   "sources": "wikipedia:name:Larry Regan",
   "league": "nhl",
   "born": null,
   "from": 1970,
   "to": 1971,
   "clubs": "Los Angeles Kings"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 8097,
   "name": "Marc Boileau",
   "kind": "player",
   "sources": "nhl_api:8445108",
   "league": "nhl",
   "born": null,
   "from": 1961,
   "to": 1961,
   "clubs": "Detroit Red Wings"
  },
  "b": {
   "id": 58517,
   "name": "Marc Boileau",
   "kind": "coach",
   "sources": "wikipedia:Marc Boileau",
   "league": "nhl",
   "born": null,
   "from": 1973,
   "to": 1975,
   "clubs": "Pittsburgh Penguins"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58549 58550",
  "a": {
   "id": 8601,
   "name": "Michel Bergeron",
   "kind": "player",
   "sources": "nhl_api:8445430",
   "league": "nhl",
   "born": null,
   "from": 1974,
   "to": 1978,
   "clubs": "Detroit Red Wings; New York Islanders; Washington Capitals"
  },
  "b": {
   "id": 58549,
   "name": "Michel Bergeron",
   "kind": "coach",
   "sources": "wikipedia:Michel Bergeron (hockey coach)",
   "league": "nhl",
   "born": null,
   "from": 1981,
   "to": 1989,
   "clubs": "Colorado Avalanche; New York Rangers"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58549 58550",
  "a": {
   "id": 8601,
   "name": "Michel Bergeron",
   "kind": "player",
   "sources": "nhl_api:8445430",
   "league": "nhl",
   "born": null,
   "from": 1974,
   "to": 1978,
   "clubs": "Detroit Red Wings; New York Islanders; Washington Capitals"
  },
  "b": {
   "id": 58550,
   "name": "Michel Bergeron",
   "kind": "coach",
   "sources": "wikipedia:Michel Bergeron (ice hockey, born 1946)",
   "league": "nhl",
   "born": null,
   "from": 1980,
   "to": 1986,
   "clubs": "Colorado Avalanche"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 8709,
   "name": "Mike Kitchen",
   "kind": "player",
   "sources": "nhl_api:8448498",
   "league": "nhl",
   "born": null,
   "from": 1976,
   "to": 1983,
   "clubs": "New Jersey Devils"
  },
  "b": {
   "id": 58561,
   "name": "Mike Kitchen",
   "kind": "coach",
   "sources": "wikipedia:Mike Kitchen",
   "league": "nhl",
   "born": null,
   "from": 2003,
   "to": 2006,
   "clubs": "St. Louis Blues"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58562 58653",
  "a": {
   "id": 8735,
   "name": "Mike Milbury",
   "kind": "player",
   "sources": "nhl_api:8449617",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1986,
   "clubs": "Boston Bruins"
  },
  "b": {
   "id": 58653,
   "name": "Mike Milbury",
   "kind": "coach",
   "sources": "wikipedia:name:Mike Milbury",
   "league": "nhl",
   "born": null,
   "from": 1995,
   "to": 1998,
   "clubs": "New York Islanders"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 2036,
   "name": "Mike Miller",
   "kind": "player",
   "sources": "wikidata:Q380541",
   "league": "nba",
   "born": "1980-02-19",
   "from": 2000,
   "to": 2005,
   "clubs": "Memphis Grizzlies; Orlando Magic"
  },
  "b": {
   "id": 58563,
   "name": "Mike Miller",
   "kind": "coach",
   "sources": "wikipedia:Mike Miller (basketball, born 1964)",
   "league": "nba",
   "born": null,
   "from": 2019,
   "to": 2019,
   "clubs": "New York Knicks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common",
  "a": {
   "id": 2239,
   "name": "Mike Shildt",
   "kind": "coach",
   "sources": "wikidata:Q6848807",
   "league": "mlb",
   "born": "1968-08-09",
   "from": 2019,
   "to": 2019,
   "clubs": null
  },
  "b": {
   "id": 58821,
   "name": "Mike Shildt",
   "kind": "coach",
   "sources": "retrosheet:shilm801",
   "league": "mlb",
   "born": null,
   "from": 2018,
   "to": 2025,
   "clubs": "San Diego Padres; St. Louis Cardinals"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 2138,
   "name": "Mike Singletary",
   "kind": "player",
   "sources": "wikidata:Q1777632",
   "league": "nfl",
   "born": "1958-10-09",
   "from": 1985,
   "to": 1988,
   "clubs": null
  },
  "b": {
   "id": 58057,
   "name": "Mike Singletary",
   "kind": "coach",
   "sources": "nflverse:coach:Mike Singletary",
   "league": "nfl",
   "born": null,
   "from": 2008,
   "to": 2010,
   "clubs": "San Francisco 49ers"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58571 58654",
  "a": {
   "id": 8783,
   "name": "Mike Sullivan",
   "kind": "player",
   "sources": "nhl_api:8458155",
   "league": "nhl",
   "born": null,
   "from": 1991,
   "to": 2001,
   "clubs": "Boston Bruins; Calgary Flames; San Jose Sharks; Utah Mammoth"
  },
  "b": {
   "id": 58654,
   "name": "Mike Sullivan",
   "kind": "coach",
   "sources": "wikipedia:name:Mike Sullivan",
   "league": "nhl",
   "born": null,
   "from": 2015,
   "to": 2015,
   "clubs": "Pittsburgh Penguins"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; person 58581 also paired with person 1885 49435 49436",
  "a": {
   "id": 1885,
   "name": "Pat Murphy",
   "kind": "player",
   "sources": "wikidata:Q2394087",
   "league": "mlb",
   "born": "1958-11-28",
   "from": 2024,
   "to": 2025,
   "clubs": null
  },
  "b": {
   "id": 58581,
   "name": "Pat Murphy",
   "kind": "coach",
   "sources": "retrosheet:murpp801",
   "league": "mlb",
   "born": null,
   "from": 2015,
   "to": 2025,
   "clubs": "Milwaukee Brewers; San Diego Padres"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; person 58581 also paired with person 1885 49435 49436",
  "a": {
   "id": 49436,
   "name": "Patrick Murphy",
   "kind": "player",
   "sources": "lahman:murphpa02",
   "league": "mlb",
   "born": "1995-06-10",
   "from": 2020,
   "to": 2022,
   "clubs": "Toronto Blue Jays; Washington Nationals"
  },
  "b": {
   "id": 58581,
   "name": "Pat Murphy",
   "kind": "coach",
   "sources": "retrosheet:murpp801",
   "league": "mlb",
   "born": null,
   "from": 2015,
   "to": 2025,
   "clubs": "Milwaukee Brewers; San Diego Padres"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 54845,
   "name": "Pat Sullivan",
   "kind": "player",
   "sources": "lahman:sullipa01",
   "league": "mlb",
   "born": "1861-08-18",
   "from": 1884,
   "to": 1884,
   "clubs": "Kansas City Cowboys"
  },
  "b": {
   "id": 58843,
   "name": "Pat Sullivan",
   "kind": "coach",
   "sources": "retrosheet:sullp801",
   "league": "mlb",
   "born": null,
   "from": 1890,
   "to": 1890,
   "clubs": "Columbus Colts"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58661 58700",
  "a": {
   "id": 9319,
   "name": "Paul Holmgren",
   "kind": "player",
   "sources": "nhl_api:8447934",
   "league": "nhl",
   "born": null,
   "from": 1975,
   "to": 1984,
   "clubs": "Dallas Stars; Philadelphia Flyers"
  },
  "b": {
   "id": 58661,
   "name": "Paul Holmgren",
   "kind": "coach",
   "sources": "wikipedia:name:Paul Holmgren",
   "league": "nhl",
   "born": null,
   "from": 1993,
   "to": 1993,
   "clubs": "Carolina Hurricanes"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 9361,
   "name": "Paul Thompson",
   "kind": "player",
   "sources": "nhl_api:8476200",
   "league": "nhl",
   "born": null,
   "from": 2015,
   "to": 2016,
   "clubs": "Florida Panthers; New Jersey Devils"
  },
  "b": {
   "id": 58705,
   "name": "Paul Thompson",
   "kind": "coach",
   "sources": "wikipedia:Paul Thompson (ice hockey b. 1906)",
   "league": "nhl",
   "born": null,
   "from": 1940,
   "to": 1944,
   "clubs": "Chicago Blackhawks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58665 58725",
  "a": {
   "id": 9516,
   "name": "Phil Maloney",
   "kind": "player",
   "sources": "nhl_api:8447595",
   "league": "nhl",
   "born": null,
   "from": 1949,
   "to": 1959,
   "clubs": "Boston Bruins; Chicago Blackhawks; Toronto Maple Leafs"
  },
  "b": {
   "id": 58665,
   "name": "Phil Maloney",
   "kind": "coach",
   "sources": "wikipedia:name:Phil Maloney",
   "league": "nhl",
   "born": null,
   "from": 1974,
   "to": 1976,
   "clubs": "Vancouver Canucks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; also paired with person 58665 58725",
  "a": {
   "id": 9516,
   "name": "Phil Maloney",
   "kind": "player",
   "sources": "nhl_api:8447595",
   "league": "nhl",
   "born": null,
   "from": 1949,
   "to": 1959,
   "clubs": "Boston Bruins; Chicago Blackhawks; Toronto Maple Leafs"
  },
  "b": {
   "id": 58725,
   "name": "Phil Maloney",
   "kind": "coach",
   "sources": "wikipedia:Phil Maloney",
   "league": "nhl",
   "born": null,
   "from": 1973,
   "to": 1973,
   "clubs": "Vancouver Canucks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10031,
   "name": "Ron Smith",
   "kind": "player",
   "sources": "nhl_api:8449083",
   "league": "nhl",
   "born": null,
   "from": 1972,
   "to": 1972,
   "clubs": "New York Islanders"
  },
  "b": {
   "id": 58784,
   "name": "Ron Smith",
   "kind": "coach",
   "sources": "wikipedia:Ron Smith (ice hockey, born 1944)",
   "league": "nhl",
   "born": null,
   "from": 1992,
   "to": 1992,
   "clubs": "New York Rangers"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach; person 58786 also paired with person 10039 10040",
  "a": {
   "id": 10039,
   "name": "Ron Wilson",
   "kind": "player",
   "sources": "nhl_api:8452495",
   "league": "nhl",
   "born": null,
   "from": 1979,
   "to": 1993,
   "clubs": "Montréal Canadiens; St. Louis Blues; Utah Mammoth"
  },
  "b": {
   "id": 58786,
   "name": "Ron Wilson",
   "kind": "coach",
   "sources": "wikipedia:Ron Wilson (ice hockey, born 1955)",
   "league": "nhl",
   "born": null,
   "from": 1993,
   "to": 2011,
   "clubs": "Anaheim Ducks; San Jose Sharks; Toronto Maple Leafs; Washington Capitals"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10106,
   "name": "Ryan Craig",
   "kind": "player",
   "sources": "nhl_api:8470065",
   "league": "nhl",
   "born": null,
   "from": 2005,
   "to": 2014,
   "clubs": "Columbus Blue Jackets; Pittsburgh Penguins; Tampa Bay Lightning"
  },
  "b": {
   "id": 58794,
   "name": "Ryan Craig",
   "kind": "coach",
   "sources": "wikipedia:Ryan Craig",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Vegas Golden Knights"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10119,
   "name": "Ryan Huska",
   "kind": "player",
   "sources": "nhl_api:8459497",
   "league": "nhl",
   "born": null,
   "from": 1997,
   "to": 1997,
   "clubs": "Chicago Blackhawks"
  },
  "b": {
   "id": 58796,
   "name": "Ryan Huska",
   "kind": "coach",
   "sources": "wikipedia:Ryan Huska",
   "league": "nhl",
   "born": null,
   "from": 2023,
   "to": 2026,
   "clubs": "Calgary Flames"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10233,
   "name": "Scott Arniel",
   "kind": "player",
   "sources": "nhl_api:8445088",
   "league": "nhl",
   "born": null,
   "from": 1981,
   "to": 1991,
   "clubs": "Boston Bruins; Buffalo Sabres; Utah Mammoth"
  },
  "b": {
   "id": 58808,
   "name": "Scott Arniel",
   "kind": "coach",
   "sources": "wikipedia:Scott Arniel",
   "league": "nhl",
   "born": null,
   "from": 2010,
   "to": 2026,
   "clubs": "Columbus Blue Jackets; Winnipeg Jets"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10247,
   "name": "Scott Gordon",
   "kind": "player",
   "sources": "nhl_api:8447291",
   "league": "nhl",
   "born": null,
   "from": 1989,
   "to": 1990,
   "clubs": "Colorado Avalanche"
  },
  "b": {
   "id": 58809,
   "name": "Scott Gordon",
   "kind": "coach",
   "sources": "wikipedia:Scott Gordon (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2008,
   "to": 2018,
   "clubs": "New York Islanders; Philadelphia Flyers"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common",
  "a": {
   "id": 10313,
   "name": "Sebastian Aho",
   "kind": "player",
   "sources": "nhl_api:8480222",
   "league": "nhl",
   "born": null,
   "from": 2017,
   "to": 2023,
   "clubs": "New York Islanders"
  },
  "b": {
   "id": 58813,
   "name": "Sebastian Aho",
   "kind": "player",
   "sources": "wikipedia:Sebastian Aho (ice hockey, born 1997)",
   "league": "nhl",
   "born": null,
   "from": 2026,
   "to": 2026,
   "clubs": "Carolina Hurricanes"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10411,
   "name": "Sheldon Keefe",
   "kind": "player",
   "sources": "nhl_api:8467920",
   "league": "nhl",
   "born": null,
   "from": 2000,
   "to": 2002,
   "clubs": "Tampa Bay Lightning"
  },
  "b": {
   "id": 58817,
   "name": "Sheldon Keefe",
   "kind": "coach",
   "sources": "wikipedia:Sheldon Keefe",
   "league": "nhl",
   "born": null,
   "from": 2019,
   "to": 2026,
   "clubs": "New Jersey Devils; Toronto Maple Leafs"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10545,
   "name": "Steve Ludzik",
   "kind": "player",
   "sources": "nhl_api:8448859",
   "league": "nhl",
   "born": null,
   "from": 1981,
   "to": 1989,
   "clubs": "Buffalo Sabres; Chicago Blackhawks"
  },
  "b": {
   "id": 58837,
   "name": "Steve Ludzik",
   "kind": "coach",
   "sources": "wikipedia:Steve Ludzik",
   "league": "nhl",
   "born": null,
   "from": 1999,
   "to": 2000,
   "clubs": "Tampa Bay Lightning"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10810,
   "name": "Todd Nelson",
   "kind": "player",
   "sources": "nhl_api:8457490",
   "league": "nhl",
   "born": null,
   "from": 1991,
   "to": 1993,
   "clubs": "Pittsburgh Penguins; Washington Capitals"
  },
  "b": {
   "id": 58871,
   "name": "Todd Nelson",
   "kind": "coach",
   "sources": "wikipedia:Todd Nelson (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2014,
   "to": 2014,
   "clubs": "Edmonton Oilers"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10812,
   "name": "Todd Reirden",
   "kind": "player",
   "sources": "nhl_api:8457783",
   "league": "nhl",
   "born": null,
   "from": 1998,
   "to": 2003,
   "clubs": "Edmonton Oilers; St. Louis Blues; Utah Mammoth; Winnipeg Jets"
  },
  "b": {
   "id": 58872,
   "name": "Todd Reirden",
   "kind": "coach",
   "sources": "wikipedia:Todd Reirden",
   "league": "nhl",
   "born": null,
   "from": 2018,
   "to": 2019,
   "clubs": "Washington Capitals"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10813,
   "name": "Todd Richards",
   "kind": "player",
   "sources": "nhl_api:8457800",
   "league": "nhl",
   "born": null,
   "from": 1990,
   "to": 1991,
   "clubs": "Carolina Hurricanes"
  },
  "b": {
   "id": 58873,
   "name": "Todd Richards",
   "kind": "coach",
   "sources": "wikipedia:Todd Richards (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 2009,
   "to": 2015,
   "clubs": "Columbus Blue Jackets; Minnesota Wild"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10866,
   "name": "Tom Webster",
   "kind": "player",
   "sources": "nhl_api:8452360",
   "league": "nhl",
   "born": null,
   "from": 1968,
   "to": 1979,
   "clubs": "Boston Bruins; Cleveland Barons; Detroit Red Wings"
  },
  "b": {
   "id": 58885,
   "name": "Tom Webster",
   "kind": "coach",
   "sources": "wikipedia:Tom Webster (ice hockey)",
   "league": "nhl",
   "born": null,
   "from": 1986,
   "to": 1991,
   "clubs": "Los Angeles Kings; New York Rangers"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10956,
   "name": "Travis Green",
   "kind": "player",
   "sources": "nhl_api:8456430",
   "league": "nhl",
   "born": null,
   "from": 1992,
   "to": 2006,
   "clubs": "Anaheim Ducks; Boston Bruins; New York Islanders; Toronto Maple Leafs; Utah Mammoth"
  },
  "b": {
   "id": 58890,
   "name": "Travis Green",
   "kind": "coach",
   "sources": "wikipedia:Travis Green",
   "league": "nhl",
   "born": null,
   "from": 2017,
   "to": 2026,
   "clubs": "New Jersey Devils; Ottawa Senators; Vancouver Canucks"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 10985,
   "name": "Trevor Letowski",
   "kind": "player",
   "sources": "nhl_api:8465189",
   "league": "nhl",
   "born": null,
   "from": 1998,
   "to": 2007,
   "clubs": "Carolina Hurricanes; Columbus Blue Jackets; Utah Mammoth; Vancouver Canucks"
  },
  "b": {
   "id": 58894,
   "name": "Trevor Letowski",
   "kind": "coach",
   "sources": "wikipedia:Trevor Letowski",
   "league": "nhl",
   "born": null,
   "from": 2023,
   "to": 2023,
   "clubs": "Montréal Canadiens"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 11256,
   "name": "Wayne Maxner",
   "kind": "player",
   "sources": "nhl_api:8447642",
   "league": "nhl",
   "born": null,
   "from": 1964,
   "to": 1965,
   "clubs": "Boston Bruins"
  },
  "b": {
   "id": 58916,
   "name": "Wayne Maxner",
   "kind": "coach",
   "sources": "wikipedia:Wayne Maxner",
   "league": "nhl",
   "born": null,
   "from": 1980,
   "to": 1981,
   "clubs": "Detroit Red Wings"
  }
 },
 {
  "lean": "unknown",
  "why": "only the names fit: no season, birth date, franchise or other id in common; one is a player record, the other a coach",
  "a": {
   "id": 11296,
   "name": "William McCreary",
   "kind": "player",
   "sources": "nhl_api:8449407",
   "league": "nhl",
   "born": null,
   "from": 1980,
   "to": 1980,
   "clubs": "Toronto Maple Leafs"
  },
  "b": {
   "id": 58591,
   "name": "Bill McCreary",
   "kind": "coach",
   "sources": "wikipedia:name:Bill McCreary",
   "league": "nhl",
   "born": null,
   "from": 1974,
   "to": 1974,
   "clubs": "Cleveland Barons"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 57443,
   "name": "Al Wright",
   "kind": "player",
   "sources": "lahman:wrighal01",
   "league": "mlb",
   "born": "1912-11-11",
   "from": 1933,
   "to": 1933,
   "clubs": "Atlanta Braves"
  },
  "b": {
   "id": 58927,
   "name": "Al Wright",
   "kind": "coach",
   "sources": "retrosheet:wriga801",
   "league": "mlb",
   "born": null,
   "from": 1876,
   "to": 1876,
   "clubs": "Philadelphia Athletics"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 55338,
   "name": "Andy Thompson",
   "kind": "player",
   "sources": "lahman:thompan02",
   "league": "mlb",
   "born": "1975-10-08",
   "from": 2000,
   "to": 2000,
   "clubs": "Toronto Blue Jays"
  },
  "b": {
   "id": 58858,
   "name": "Andrew Thompson",
   "kind": "coach",
   "sources": "retrosheet:thoma801",
   "league": "mlb",
   "born": null,
   "from": 1884,
   "to": 1884,
   "clubs": "St. Paul Saints"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 43584,
   "name": "Bill Henderson",
   "kind": "player",
   "sources": "lahman:hendebi01",
   "league": "mlb",
   "born": "1901-11-04",
   "from": 1930,
   "to": 1930,
   "clubs": "New York Yankees"
  },
  "b": {
   "id": 58306,
   "name": "Bill Henderson",
   "kind": "coach",
   "sources": "retrosheet:hendb801",
   "league": "mlb",
   "born": null,
   "from": 1884,
   "to": 1884,
   "clubs": "Baltimore Monumentals"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 55294,
   "name": "Fred Thomas",
   "kind": "player",
   "sources": "lahman:thomafr02",
   "league": "mlb",
   "born": "1892-12-19",
   "from": 1918,
   "to": 1920,
   "clubs": "Boston Red Sox; Minnesota Twins; Sacramento Athletics"
  },
  "b": {
   "id": 58859,
   "name": "Fred Thomas",
   "kind": "coach",
   "sources": "retrosheet:thomf801",
   "league": "mlb",
   "born": null,
   "from": 1887,
   "to": 1887,
   "clubs": "Indianapolis Hoosiers"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 41470,
   "name": "George Frazier",
   "kind": "player",
   "sources": "lahman:frazige01",
   "league": "mlb",
   "born": "1954-10-13",
   "from": 1978,
   "to": 1987,
   "clubs": "Chicago Cubs; Cleveland Guardians; Minnesota Twins; New York Yankees; St. Louis Cardinals"
  },
  "b": {
   "id": 58240,
   "name": "George Frazier",
   "kind": "coach",
   "sources": "retrosheet:frazg801",
   "league": "mlb",
   "born": null,
   "from": 1890,
   "to": 1890,
   "clubs": "Syracuse Stars"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 45572,
   "name": "Jim Kennedy",
   "kind": "player",
   "sources": "lahman:kenneji01",
   "league": "mlb",
   "born": "1946-11-01",
   "from": 1970,
   "to": 1970,
   "clubs": "St. Louis Cardinals"
  },
  "b": {
   "id": 58459,
   "name": "Jim Kennedy",
   "kind": "coach",
   "sources": "retrosheet:kennj801",
   "league": "mlb",
   "born": null,
   "from": 1890,
   "to": 1890,
   "clubs": "Los Angeles Dodgers"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach; person 58303 also paired with person 43298 43308",
  "a": {
   "id": 43298,
   "name": "Jimmy Hart",
   "kind": "player",
   "sources": "lahman:hartbu01",
   "league": "mlb",
   "born": "1875-11-27",
   "from": 1901,
   "to": 1901,
   "clubs": "New York Yankees"
  },
  "b": {
   "id": 58303,
   "name": "Jim Hart",
   "kind": "coach",
   "sources": "retrosheet:hartj802",
   "league": "mlb",
   "born": null,
   "from": 1885,
   "to": 1889,
   "clubs": "Atlanta Braves; Louisville Colonels"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach; person 58924 also paired with person 57012 57014",
  "a": {
   "id": 57012,
   "name": "Jimmy Williams",
   "kind": "player",
   "sources": "lahman:williji01",
   "league": "mlb",
   "born": "1876-12-20",
   "from": 1899,
   "to": 1909,
   "clubs": "Baltimore Orioles; New York Yankees; Pittsburgh Pirates"
  },
  "b": {
   "id": 58924,
   "name": "Jimmy Williams",
   "kind": "coach",
   "sources": "retrosheet:willj801",
   "league": "mlb",
   "born": null,
   "from": 1884,
   "to": 1888,
   "clubs": "Cleveland Spiders; St. Louis Cardinals"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 51334,
   "name": "Jim Price",
   "kind": "player",
   "sources": "lahman:priceji01",
   "league": "mlb",
   "born": "1941-10-13",
   "from": 1967,
   "to": 1971,
   "clubs": "Detroit Tigers"
  },
  "b": {
   "id": 58736,
   "name": "Jim Price",
   "kind": "coach",
   "sources": "retrosheet:pricj801",
   "league": "mlb",
   "born": null,
   "from": 1884,
   "to": 1884,
   "clubs": "San Francisco Giants"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach; person 58303 also paired with person 43298 43308",
  "a": {
   "id": 43308,
   "name": "Jim Ray Hart",
   "kind": "player",
   "sources": "lahman:hartji01",
   "league": "mlb",
   "born": "1941-10-30",
   "from": 1963,
   "to": 1974,
   "clubs": "New York Yankees; San Francisco Giants"
  },
  "b": {
   "id": 58303,
   "name": "Jim Hart",
   "kind": "coach",
   "sources": "retrosheet:hartj802",
   "league": "mlb",
   "born": null,
   "from": 1885,
   "to": 1889,
   "clubs": "Atlanta Braves; Louisville Colonels"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach; person 58924 also paired with person 57012 57014",
  "a": {
   "id": 57014,
   "name": "Jim Williams",
   "kind": "player",
   "sources": "lahman:williji04",
   "league": "mlb",
   "born": "1947-04-29",
   "from": 1969,
   "to": 1970,
   "clubs": "San Diego Padres"
  },
  "b": {
   "id": 58924,
   "name": "Jimmy Williams",
   "kind": "coach",
   "sources": "retrosheet:willj801",
   "league": "mlb",
   "born": null,
   "from": 1884,
   "to": 1888,
   "clubs": "Cleveland Spiders; St. Louis Cardinals"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach; person 58532 also paired with person 47938 47940",
  "a": {
   "id": 47938,
   "name": "Joe McCarthy",
   "kind": "player",
   "sources": "lahman:mccarjo02",
   "league": "mlb",
   "born": "1881-12-25",
   "from": 1905,
   "to": 1906,
   "clubs": "New York Yankees; St. Louis Cardinals"
  },
  "b": {
   "id": 58532,
   "name": "Joe McCarthy",
   "kind": "coach",
   "sources": "retrosheet:mccaj802",
   "league": "mlb",
   "born": null,
   "from": 1926,
   "to": 1950,
   "clubs": "Boston Red Sox; Chicago Cubs; New York Yankees"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach; person 58532 also paired with person 47938 47940",
  "a": {
   "id": 47940,
   "name": "Joe McCarthy",
   "kind": "player",
   "sources": "lahman:mccarjo04",
   "league": "mlb",
   "born": "1994-02-23",
   "from": 2020,
   "to": 2020,
   "clubs": "San Francisco Giants"
  },
  "b": {
   "id": 58532,
   "name": "Joe McCarthy",
   "kind": "coach",
   "sources": "retrosheet:mccaj802",
   "league": "mlb",
   "born": null,
   "from": 1926,
   "to": 1950,
   "clubs": "Boston Red Sox; Chicago Cubs; New York Yankees"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach; person 58581 also paired with person 1885 49435 49436",
  "a": {
   "id": 49435,
   "name": "Pat Murphy",
   "kind": "player",
   "sources": "lahman:murphpa01",
   "league": "mlb",
   "born": "1857-01-02",
   "from": 1887,
   "to": 1890,
   "clubs": "San Francisco Giants"
  },
  "b": {
   "id": 58581,
   "name": "Pat Murphy",
   "kind": "coach",
   "sources": "retrosheet:murpp801",
   "league": "mlb",
   "born": null,
   "from": 2015,
   "to": 2025,
   "clubs": "Milwaukee Brewers; San Diego Padres"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 48752,
   "name": "Ray Miller",
   "kind": "player",
   "sources": "lahman:millera02",
   "league": "mlb",
   "born": "1888-02-12",
   "from": 1917,
   "to": 1917,
   "clubs": "Cleveland Guardians; Pittsburgh Pirates"
  },
  "b": {
   "id": 58576,
   "name": "Ray Miller",
   "kind": "coach",
   "sources": "retrosheet:millr801",
   "league": "mlb",
   "born": null,
   "from": 1985,
   "to": 1999,
   "clubs": "Baltimore Orioles; Minnesota Twins"
  }
 },
 {
  "lean": "probably two people",
  "why": "seasons fall outside the life of the other: a birth or death date rules them out; one is a player record, the other a coach",
  "a": {
   "id": 55734,
   "name": "Ted Turner",
   "kind": "player",
   "sources": "lahman:turnete02",
   "league": "mlb",
   "born": "1892-05-04",
   "from": 1920,
   "to": 1920,
   "clubs": "Chicago Cubs"
  },
  "b": {
   "id": 58897,
   "name": "Ted Turner",
   "kind": "coach",
   "sources": "retrosheet:turnt801",
   "league": "mlb",
   "born": null,
   "from": 1977,
   "to": 1977,
   "clubs": "Atlanta Braves"
  }
 }
];
