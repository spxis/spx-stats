# Languages: EN, FR, JA

The French (Canada) and Japanese text is machine-drafted. English is the source: `src/lib/i18n/phrases.constants.ts`.
French is `src/lib/i18n/dictionaries/fr.constants.ts`, Japanese is `ja.constants.ts`. A key a dictionary lacks falls back to English,
so a string added in English alone still shows.

## Choices I was unsure of

- **Hockey and sports terms.** FR "Séries éliminatoires" (playoffs), "Défaite en prolongation" (shown "DP"), "Visiteur" for road/away,
  "matchs nuls"; JA "延敗" for an overtime loss, "ビジター" for road, "前年王者" for defending champion, "現王者" for reigning champions.
  Column abbreviations (FR PJ/V/D/N/DP/PP/PC, JA 試合/勝/敗/分) are my best guess at what each league's own tables use.
- **"Winning share".** FR "Pourcentage de victoires" and JA "勝率" for the table column; "Taux de victoire" in the donut.
- **Plurals.** French counts use "match(s)" and "titre(s)" for "game" and "championship"; Japanese counters (試合, シーズン, 回, 件) are one form for every number.
- **Legal and licensing text** (logos page, footer, "fair use / fair dealing" wording) is a plain translation, not reviewed as legal copy.
- **Japanese `@`** stands for "at" between away and home team in game rows and tooltips, because Japanese has no short "at".
- **Country names** on a team's flag (Canada, United States, Mexico) are translated as ordinary words; the flag drawings themselves have no text.
- **Season labels** read "2010-11年シーズン" in Japanese and "Saison 2010-11" in French.

- **Player statistics.** Column abbreviations (FR PJ/B/A/V/D/N/DP/MBC/%A/BL for hockey; AB/CS/CC/PP/BV/MAB/MPB/MP/MJ/MPM for baseball; JA 試合/勝/敗/打率/防御率 and so on)
  are my best guess at what each league's own French and Japanese tables use. Slugging is "PUIS" (moyenne de puissance) so it does not clash with "MP" (minutes de pénalité). "Parcours sportif" for the sports résumé, "Repêchage" for the draft.

- **Short-season notes.** FR "lock-out" and "grève des joueurs", JA "ロックアウト" and "選手会のストライキ" (players' union strike); the JA team-count
  sentence puts the count first ("…届かなかったのは2チームです"). Source link text is "Source : Wikipédia" / "出典：Wikipedia".

- **Awards stat.** The short label "Awards" reuses the section heading wording: FR "Récompenses", JA "表彰" (same as awards.title).

## Left as the data gives it (not translated on purpose)

- Team, player, venue and league names; league codes (NHL, NBA, MLB, NFL, CFL); official award names (Stanley Cup, Grey Cup, Hart Trophy ...).
- Text that comes from the database rather than the site: a champion's "final" note, an award's note, a source's licence/attribution/notes
  (Sources page), and the issue and resolution text on the Data quality page. These are English until the data itself is translated.
- The SPX row of the Sources page (licence and notes) *is* the site's own text and is translated; its credit line "SPX (SportsInteractive.com), 1997–2013" is a name and stays.
- Percentages and winning shares keep sports style (0.530, 12.3%).

## Formats

Numbers and dates use `Intl` with en-CA, fr-CA and ja-JP (`src/lib/i18n/formats.ts`). Month and weekday names come from the browser/Node ICU,
so a very old browser may spell an abbreviation differently from the server.

- **Playoff bracket and earlier meetings.** FR "Tournoi à la ronde" and JA "ラウンドロビン" for the 2019-20 NHL seeding round robin; FR "ronde" / JA "ラウンド" for a playoff round; FR "duels" for matchups.
  The earlier-meetings sentences ("lead their earlier playoff series 3-2", "In games: ...") are my best guess at natural phrasing.
