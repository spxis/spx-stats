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

- **Result filter on a team's games.** FR "Victoires / Défaites / Matchs nuls / Défaites en prolongation"; JA "勝ち / 負け / 引き分け / 延長負け"
  (the table cells keep the short 勝/敗/分/延敗).

- **Head-to-head page.** The word for the link and page: EN "Head-to-head" (short "H2H"), FR "Face-à-face" (short "F-à-F", the abbreviation is a guess),
  JA "対戦成績" (short "対戦"). FR "{a} c. {b}" for "vs" (hockey/Quebec press style); JA "{a} 対 {b}". "{team} mène" / "{team}がリード" for "lead".
  JA "{n}勝リード" in the chart tooltip counts wins.

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

- **All-time records.** FR "Dossier historique" (page) and "Historique" (nav link), JA "通算成績" and "通算". FR "concession" for franchise, JA "球団". Column heads: FR "Pourc." (win share) and "Séries" (playoff appearances); JA "勝率", "PO" (playoff appearances) and "得失差" (goal, run or point difference). FR "Points (courses)" for MLB runs is a stopgap.

- **Season leaders.** FR "meneurs" (leaders), "Pourcentage de victoires" for win share, "n° 2 sur 105 saisons" for "#2 of 105 seasons", "Tous temps" for the all-time column, "Buts pour / contre" and "Différentiel";
  JA "リーダー", "勝率" for win share, "得失点差" for differential, "歴代" for all-time, "開催中" for a season in progress. The long explanatory notes under the charts are plain machine drafts.

- **Repeat champions.** FR "Champion en titre (3×)" and JA "前年王者（3連覇）" for a defending champion with three titles in a row; "連覇" (consecutive titles) is my best guess at the natural counter. The team-page badge reads FR "Champions en titre (2×)" and JA "現王者（2連覇）".

- **Current season link.** FR "Voir la saison en cours", JA "現在のシーズンを見る".

- **Home venues.** FR "Enceintes à domicile" / "Enceinte" / "Lieu" and "Domicile : {venue}"; JA "本拠地" (home ground), "会場" (venue), "所在地" (location). The API has no city field, so the location column shows the country and the venue's coordinates.

- **Team and venue maps.** FR "État / province", "Conférence", "Enceintes historiques"; JA "州・省" (state / province), "地区" (division), "過去の本拠地" (former home grounds). The zoom hint in both is a best guess.

- **Head-to-head team picker.** FR "Changer d’équipe" / "Jamais affrontées", JA "チームを変更" / "対戦なし" (never met) and "旧名" (former name) are best guesses.

## About, Terms, Privacy and the footer

Review sheet: `docs/i18n-review.md`, generated by `pnpm i18n:review`; `pnpm test:i18n` fails on a missing key or a stale sheet. It lists each line in reading order with a literal English reading of the Japanese, and repeats the doubts above so they can be checked in one pass.

- **Plain translation, not reviewed legal copy:** Terms, Privacy, the credit lines and the logo notice.
- **French choices.** "Témoins" for cookies, "ticket (issue)" for a GitHub issue, "Mentions légales" for the footer's Legal column, "Conditions" for the nav link to Terms.
- **Japanese choices.** "利用規約" (rules of use) for Terms, "このサイトについて" for the About link, "規約・プライバシー" for the footer's Legal column, "Issue（課題）" for a GitHub issue, "自己責任" (at your own responsibility) for use at your own risk.
