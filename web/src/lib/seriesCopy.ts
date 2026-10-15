import { fill, type Speaker, type Vars } from "@/lib/i18n/i18n";

/**
 * The words of the series pages and the playoff bracket, in English. Read through `seriesSay(speaker, key, vars)`:
 * numbers and dates come from the speaker's own formats, and a language with no entry here reads the English
 * (the same fallback the rest of the site's catalogue has). Team and league names, and the final's note from the
 * database, are shown as the data gives them.
 */
export const SERIES_COPY = {
  // rounds
  "round.n": "Round {n}",
  "round.semis": "Semifinals",
  "round.quarters": "Quarterfinals",
  "round.first": "First Round",
  "round.second": "Second Round",
  "round.prelim": "Preliminary Round",
  "round.qual": "Qualifying Round",
  "round.divSemis": "Division Semifinals",
  "round.divFinals": "Division Finals",
  "round.confQuarters": "Conference Quarterfinals",
  "round.confSemis": "Conference Semifinals",
  "round.confFinal": "Conference Final",
  "round.confFinals": "Conference Finals",
  "round.scSemis": "Stanley Cup Semifinals",
  "round.tiebreak": "Tiebreaker Game",
  "round.wcGame": "Wild Card Game",
  "round.wcSeries": "Wild Card Series",
  "round.ds": "Division Series",
  "round.lcs": "League Championship Series",
  "round.wildcard": "Wild Card",
  "round.divisional": "Divisional",
  "round.confChamp": "Conference Championship",
  "round.cflSemi": "Division Semi-Final",
  "round.cflFinal": "Division Final",
  "final.nhl": "Stanley Cup Final",
  "final.nba": "NBA Finals",
  "final.mlb": "World Series",
  "final.nfl": "Super Bowl {numeral}",
  "final.nflOld": "NFL Championship",
  "final.afl": "AFL Championship",
  "final.aafc": "AAFC Championship",
  "final.cfl": "Grey Cup",
  "final.other": "Final",
  "final.nflDated": "Super Bowl {numeral} ({year})",
  "round.dated": "{year} {name}",
  "round.datedLeague": "{year} {league} {name}",

  // the bracket and the cards
  "bracket.title": "Playoffs",
  "bracket.note": "{count} series, worked out from the playoff games. Press one for its game-by-game page.",
  "bracket.mine": "Playoff series",
  "card.title": "{a} against {b}: the series, game by game",
  "card.totalScore": "total score",
  "card.oneGame": "one game",
  "card.games": "{count} games",
  "card.notSettled": " · not settled",
  "card.live": " · in progress",

  // the page
  "page.playoffs": "Playoffs",
  "page.seasonLink": "{season} season",
  "page.aria": "{a} against {b}",
  "page.metaTitle": "{a} vs {b}, {round}",
  "page.metaBeat": "{a} beat {b} {score} in the {season} {round}: every game with its score, running series score and charts.",
  "page.metaMet": "{a} and {b} met in the {season} {round}: every game with its score and charts.",
  "page.ledeUnsettled": "{a} and {b} met in the {season} {round}, but the games on record do not settle it.",
  "page.ledeOne": "{a} beat {b} {score} in the {season} {round}, on {date}.",
  "page.ledeMany": "{a} beat {b} {words} in the {season} {round}, from {from} to {to}.",
  "page.ledeLive": "{a} lead {b} {x}–{y} in the {season} {round}. The next game is on {date}.",
  "page.ledeLevel": "{a} and {b} are level at {x}–{y} in the {season} {round}. The next game is on {date}.",
  "page.metaLive": "{a} lead {b} {x}–{y} in the {season} {round}: every game played so far and still to come, with scores and charts.",
  "page.metaLevel": "{a} and {b} are level at {x}–{y} in the {season} {round}: every game played so far and still to come, with scores and charts.",
  "score.gamesTo": "{a} games to {b}",
  "score.onTotal": "{a}–{b} on total score",
  "verdict.unsettled": "Not settled by these games",
  "verdict.total": "{team} win on total score",
  "verdict.one": "{team} win",
  "verdict.sweep": "{team} sweep",
  "verdict.inN": "{team} win in {count}",
  "verdict.noteTotal": "total score of the games",
  "verdict.noteOne": "one game",
  "verdict.noteGames": "{count} games",
  "verdict.noteGamesTied": "{count} games, {ties} tied",
  "verdict.noteLive": "Best of {bestOf} · {played} played",
  "score.aria": "Series score {a} to {b}",

  // the sides
  "side.champions": "{season} champions",
  "side.won": "Won the series",
  "side.record": "Regular season {record}",
  "side.pts": " · {pts} pts",
  "side.noRecord": "No regular-season record on file",
  "side.rank": "Ranked {place} of {total} in the {league}",
  "side.games": "{season} games",
  "side.games.title": "Every {team} game of {season}",
  "side.allSeasons": "All seasons",

  // the games
  "games.title": "Game by game",
  "games.note": "Every game of the series in the order played, with the series score after it. Press a date to open that day.",
  "games.theGame": "The game",
  "games.gameN": "Game {n}",
  "games.dayTitle": "Every game of that day",
  "games.atHome": "{team} at home",
  "games.tied": "Series tied {a}–{b}",
  "games.lead": "{team} lead {a}–{b}",
  "games.win": "{team} win {a}–{b}",
  "games.seriesLead": "Series: {team} lead {a}–{b}",
  "games.seriesTied": "Series tied {a}–{b}",
  "games.ifNeeded": "If necessary",
  "games.foot": "Away team first in each tile.",
  "games.source": "Source:",
  "ot": "OT",
  "extras": "Extras",

  // charts
  "charts.title": "How the series went",
  "charts.perGame": "{unit} per game",
  "charts.margin": "Margin of each game",
  "charts.soFar": "{unit} so far",
  "charts.won": "Games won",
  "chart.aria.scored": "{unit} scored by each team in each game of the series",
  "chart.aria.margin": "Margin of each game: above the line when the first team won, below when the other did",
  "chart.aria.total": "Total {unit} scored after each game",
  "chart.aria.won": "Games won after each game of the series",
  "chart.none": "No results to draw.",
  "chart.tipGame": "Game {n}",
  "chart.tipGameOt": "Game {n} (overtime)",
  "chart.tied": "Tied",
  "chart.by": "{team} by {n}",
  "chart.after": "After game {n}",
  "unit.nhl": "Goals",
  "unit.mlb": "Runs",
  "unit.other": "Points",

  // the regular season
  "cmp.title": "The regular season, side by side",
  "cmp.note": "How the two clubs finished the {season} regular season, before they met here.",
  "cmp.share": "Winning share",
  "cmp.points": "Points",
  "cmp.for": "{unit} for, per game",
  "cmp.against": "{unit} against, per game",
  "cmp.home": "At home",
  "cmp.road": "On the road",
  "h2h.title": "Head to head, regular season",
  "h2h.note": "{a} {aw}–{bw} {b} in {games}; {af}–{bf} in {unit}.",
  "h2h.games.one": "{count} regular-season game",
  "h2h.games.other": "{count} regular-season games",
  "h2h.none": "The two clubs did not meet in the {season} regular season on record.",
  "h2h.date": "Date",
  "h2h.away": "Away",
  "h2h.score": "Score",
  "h2h.home": "Home",

  // the road
  "road.title": "The road here",
  "road.note": "Each club's other playoff series that year. Press one to open it.",
} as const;

export type SeriesKey = keyof typeof SERIES_COPY;
export type Say = (key: SeriesKey, vars?: Vars) => string;

/** The series words in a reader's language (English until a dictionary has them), with `{placeholders}` filled. */
export const seriesSay = (_sp: Speaker, key: SeriesKey, vars?: Vars): string => fill(SERIES_COPY[key], vars);

/** `seriesSay` bound to one speaker. */
export const sayFor = (sp: Speaker): Say => (key, vars) => seriesSay(sp, key, vars);
