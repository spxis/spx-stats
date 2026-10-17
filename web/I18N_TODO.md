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
- **Scoreboard start time.** FR "Début prévu" and JA "予定開始" for the scheduled-start tooltip. The clock itself is the reader's local time.

- **PWHL / Walter Cup.** FR keeps the English code "PWHL" in the site description (same as NHL/NBA there) and "Coupe Walter" for the trophy and final. JA keeps "PWHL" and "ウォルター・カップ" (Walter Cup). First-pass; not reviewed.
- **NWSL / NWSL Championship.** FR keeps the English code "NWSL" and "Championnat de la NWSL" for the trophy and final. JA keeps "NWSL" and "NWSLチャンピオンシップ" (NWSL Championship). First-pass; not reviewed.

- **Retired numbers.** FR "Numéros retirés" / "À l’échelle de la ligue"; JA "永久欠番" (retired number) / "リーグ全体" (league-wide). First-pass; not reviewed.

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

- Team, player, venue and league names; league codes (NHL, PWHL, NBA, WNBA, MLB, NFL, CFL, NWSL); official award names (Stanley Cup, Walter Cup, Grey Cup, Hart Trophy ...).
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

- **Seasons that were not played.** The article paragraphs (`db/seed/season_outage.csv`) and the page's own strings (`outage.*`) were drafted and checked by the French and Japanese reviewers. Choices worth a native read: FR "passe de deux lignes" (the two-line pass rule), "tirs de barrage" for shootouts, "ville hôte unique" for a hub city, "lock-out"; JA "労使協定" for the CBA, "基本合意" for a tentative agreement, "批准" (players ratified) against "承認" (owners approved), "ツーラインパス", "リジャイナ" (Regina). Team and award names are in katakana inside the Japanese article text but stay as the data gives them in tables and headings. The comparison measure is a "points share" where the league awards points, else a "win share": FR "pourcentage des points" / "pourcentage de victoires", JA "ポイント獲得率" / "勝率".

- **Titles not awarded.** The card shows the award name as stored ("Stanley Cup", "World Series", "Grey Cup", not translated) with the heading FR "Titre non décerné" / JA "優勝チームなし", while the stored Japanese reasons use katakana (グレイカップ, ワールドシリーズ). Worth a native read of the mixed display. Reasons are in `db/seed/title_not_awarded.csv`.

## About, Terms, Privacy and the footer

Review sheet: `docs/i18n-review.md`, generated by `pnpm i18n:review`; `pnpm test:i18n` fails on a missing key or a stale sheet. It lists each line in reading order with a literal English reading of the Japanese, and repeats the doubts above so they can be checked in one pass.

- **Plain translation, not reviewed legal copy:** Terms, Privacy, the credit lines and the logo notice.
- **French choices.** "Témoins" for cookies, "ticket (issue)" for a GitHub issue, "Mentions légales" for the footer's Legal column, "Conditions" for the nav link to Terms.
- **Japanese choices.** "利用規約" (rules of use) for Terms, "このサイトについて" for the About link, "規約・プライバシー" for the footer's Legal column, "Issue（課題）" for a GitHub issue, "自己責任" (at your own responsibility) for use at your own risk.

- **Venue facts and former names.** FR "{n} places", "ouvert en {year}", "toit rétractable", "avec dôme", "propriétaire : {owner}", "Aujourd’hui : {name}"; JA "{n}席", "{year}年開場" (opened), "開閉式屋根" (retractable roof), "ドーム", "所有者：{owner}", "現在の名称：{name}" (name now) are best guesses. Surface and owner names are Wikidata's English labels, shown as they are.

- **Home year range.** FR "Années affichées" / "Année de début" / "Année de fin" / "Réinitialiser"; JA "表示する年" (years shown), "開始年" (start year), "終了年" (end year), "リセット" are best guesses.
- **Home year range shortcuts.** FR "Tout" / "10 dernières années" / "Depuis {year}" / "Années SPX" / "Périodes rapides"; JA "すべて" (all), "直近10年" (the latest 10 years), "{year}年以降" (from {year} on), "SPXの期間" (SPX's period, 1997–2013), "期間のショートカット" (range shortcuts) are best guesses.

- **Position names (ref.position).** Reviewed once for Canadian French and Japanese; two doubts remain. CFL slotback is shown as "Slotback" (no established French term found), and football fullback as "Arrière". Japanese hockey wings are written 左ウイング / 右ウイング (left / right wing); レフトウイング is also in use.

- **Admin confirmation dialogs** (`confirm.*`). FR: release is "version", the background program is "exécuteur", rollback is "retour en arrière", a board ticket is "billet" (the GitHub issue elsewhere stays "ticket (issue)"). JA: one release on hold is 保留, the all-auto-approval switch is 止める / 再開; ランナー for the runner.


- **Player statistics board.** Baseball terms in French (reviewed once, a Québec baseball reader should confirm): "Moyenne de puissance" (slugging), "Pourcentage de présence sur les buts" (on-base), "Simples" (singles), "Retraits sur prises" (strikeouts). The percentile lines ("Parmi les 6 % meilleurs attaquants", "Devant 40 % des frappeurs") and the Japanese "{who}の上位{pct}%" / "{who}の{pct}%を上回る" are built from a noun {who} (forwards, hitters ...); check each noun reads in both slots.
- **Soccer / World Cup.** FR "Soccer" (not "football"), "ronde" for stages, "tirs au but", "prolongation", table headers MJ/V/N/D/BP/BC, "Pays d’accueil" for the
  host(s), "Formations" for lineups and "Effectifs" for squads; no gendered forms for players ("Départs", "entrée", "sortie", "Date de naissance"). JA サッカー,
  ワールドカップ, 代表チーム, 得点王, 先発メンバー / 登録メンバー, 途中出場 / 途中交代, 2次リーグ (second group stage) and 決勝リーグ (the 1950 final round),
  アウェー for away (soccer) where the other sports say ビジター. A national team's name is the browser's own country name (Intl.DisplayNames) for FR and JA
  (so the United States reads アメリカ合衆国, as elsewhere on the site); the four home nations and states that no longer exist are written out in
  `src/lib/soccerNames.ts` ("RD Congo", "Taipei chinois" are the FIFA forms). The credit sentence (`wc.credit`) names the dataset's author and its CC BY-SA 4.0 licence
  and deserves a native read. Both languages were checked by the language reviewers on 2026-10-13.
- **Seasons with no regular-season record (`team.bare*`, `team.ledeBare*`) and the city page's range and map texts (`city.range*`, `city.map*`).** Best-guess FR and JA, not reviewed. FR "Séries de la Coupe Stanley seulement" for "Stanley Cup playoffs only"; JA スタンレー・カップのプレーオフのみ. The JA lede reads "{seasons}分の結果" like the existing `team.lede`.
- **Stanley Cup before the NHL (`cup.*`).** Best-guess FR and JA, not reviewed. FR "Coupe Stanley", "avant la NHL"; JA スタンレーカップ, "NHL以前". The JA note (`cup.note`) says the Cup was won by clubs of other leagues from {first} to {last}, that a club has a title for each year it won a Cup series or a league title while holding the Cup, and that NHL franchises link to their page.

- **A game's page (`gm.*`, `src/lib/i18n/game.constants.ts`).** Best-guess FR and JA, not reviewed. FR "Fiche" for a record going in or out, "Face à face" for head to head, "Confrontation" for a meeting, "Concessions" for franchises; JA 試合前の成績, 直接対決, 対戦 (a meeting), 第{n}戦 (game N), @ for away at home as elsewhere. "Standing: {place} of {total}" is "{total}チーム中{place}位" in JA. The sentence about the missing box score (`gm.noBox`) deserves a native read.

- **Venue surface, roof and status (`venuesPage.surface*`, `venuesPage.state*`, `venues.demolished`, `venue.period*`).** Best-guess FR and JA, not reviewed. Surface words: FR "Gazon naturel", "Gazon artificiel", "Gazon hybride", "Glace", "Plancher de bois" (parquet is the hockey/basketball term, but "plancher de bois" also covers a court), "Plusieurs surfaces" (the convertible ice-and-floor code `multi`), "Autre"; JA 天然芝, 人工芝, ハイブリッド芝, 氷, 木の床, 複数の競技面, その他. Status: FR "Fermé" / "Démoli", JA 閉場 / 取り壊し済み ("démoli" and 取り壊し済み are also used inside the map panel's facts line, lower case). The history section's heading is FR "Surface et toit au fil des ans", JA 競技面と屋根の変遷; product names (AstroTurf, FieldTurf, "Kevlar roof") are shown as the source wrote them and are not translated.

- **Soccer position names and the position key (`SOCCER_POSITIONS` in `src/lib/positions.ts`, `poskey.*`).** Best-guess FR and JA, not reviewed. The archive sends soccer positions as a code and an English word only, so the names of GK, DF, MF, FW and the finer line-up codes (CB, LB, RB, DM, CM, AM, LM, RM, CF, LF, RF, LW, RW, SS) live in the site. FR: "Gardien de but", "Défenseur", "Milieu de terrain", "Attaquant", "Défenseur central", "Arrière gauche/droit", "Milieu défensif/central/offensif", "Avant-centre", "Ailier gauche/droit", "Second attaquant". JA: ゴールキーパー, ディフェンダー, ミッドフィールダー, フォワード, センターバック, 左/右サイドバック, 守備的/攻撃的ミッドフィールダー, センターフォワード, 左/右ウイング, セカンドストライカー. The key's heading and note (`poskey.title`, `poskey.note`) are FR "Légende des positions" and JA ポジション凡例. Hockey, baseball, basketball and football names come from api.position (reviewed above).

- **The link to a bracket file (`playoffs.file`).** Shown only without script, under a bracket. Best-guess FR "Ouvrir le tableau en image", JA ブラケットを画像で開く ("bracket" is the loanword, as elsewhere on the season page); not reviewed.

- **The World Cup strip and map (`wc.map.*`, `wc.strip.*`).** Best-guess FR and JA, not reviewed. "Round of 32 or 16" is FR "Seizièmes ou huitièmes de finale", JA ラウンド32・16 (the early knockout tier of the map's legend; the other tiers reuse the stage words). The squad jump is FR "Aller à l'effectif", JA 登録メンバーへ (as `wc.t.squads`); the hover line reads like the match banner's record (`wc.sd.record`).

- **Basketball and football statistics on the player page (`src/lib/i18n/playerstats.constants.ts`).** Checked by the French and Japanese reviewers on 2026-10-14, native read still advisable. FR follows Quebec football (verges, touché, placement, converti, dégagement, plaqué, sac); open doubts: "VGS" or "VG" for yards, "PDV / Passes déviées" for passes defended (also "bloquées" or "défendues"), "quarts-arrières" for passers, and that `stat.att` ("TENT", "Tentatives") is shared by passing and rushing (a separate rushing key would say "Courses"). JA: radar axes are written "X/試合" like the existing ones, tooltips "1試合あたりのX"; `stat.att.name` is the neutral 試行数 because passing and rushing share the key; ボールキャリア for rushers; spellings to check against NFL Japan: ファンブルフォース, ファンブルリカバリー, ロスタックル, エキストラポイント. `radar.int_pg` is one neutral label for passers (interceptions thrown, lower is better) and defenders (interceptions made).

- **The filter suffix of the Players and Teams headings (`players.fromCountry`, `list.filtered`).** Best-guess FR and JA, not reviewed. The heading keeps its page word and the filters follow it ("Players · NHL · from Russia"). FR cannot say "from Russia" without the country's article ("de Russie", "du Canada", "des États-Unis"), so it reads "Pays : Russie" like the chips below; JA is {country}出身. The screen reader sentence is FR "Joueurs, filtré : NHL, Pays : Russie", JA "選手、絞り込み：NHL, ロシア出身". The status words (`teams.statusActive`, `teams.statusDefunct`) are FR Actives / Disparues, JA 現存 / 消滅.

- **/admin/ops (`ops.*`, `confirm.opsSnapshot|opsPause|opsResume.*`).** Best-guess FR and JA, not reviewed. FR "moissonneur" for the harvester, "chien de garde" for the watchdog, "exécuteur" for the runner and "instantané" for a snapshot (as the release dialogs say "exécuteur"); JA ハーベスター, ウォッチドッグ, ランナー, スナップショット. The JA sentence about what Pause does (`confirm.opsPause.body`) deserves a native read.

- **The link back from a team's full list of seasons (`team.backToTeam`).** Best-guess FR "Retour à {name}", JA {name}のページに戻る; not reviewed.

- **A game not yet played (`game.scheduled`).** Best-guess FR "Prévu", JA 予定; not reviewed. It takes the place of `game.noResult` ("no result") in a game row and in a team's season table when the game's status is scheduled. The archive holds no start time for the NHL, NBA, MLB, NFL or CFL games, so the word stands alone.

- **Links to a league's own site (`scores.box`, `scores.notes`, `scores.dayScores`, `scores.leagueSite`).** Best-guess FR and JA, not reviewed. FR "Feuille de match", "Notes de match", "Pointages du jour", "Site de la ligue". JA ボックススコア, 試合ノート, この日の結果, 公式サイト. The words are the link text; the addresses are built in the browser.

- **The AFL and a club's other league (`rnd.afl`, `team.otherLeague`, `team.otherLeagueLink`).** Best-guess FR "Championnat de l'AFL", "Le club a aussi joué en {league}", "Historique en {league}"; JA AFLチャンピオンシップ, "このクラブは{league}でもプレーしました", "{league}での歴史". Not reviewed.

- **The AAFC (`rnd.aafc`, its season notes).** Best-guess FR "Championnat de l'AAFC", JA AAFCチャンピオンシップ; the five AAFC and the 1946 NFL season notes in `db/seed/season_note.csv` have best-guess FR and JA. Not reviewed.

- **Rival leagues under their parent (`nav.crumbs`, `league.otherLeagues`, `league.otherNote`, `rnd.nha`, `rnd.pcha`, `rnd.wchl`, `rnd.wha`, the 13 hockey season notes in `db/seed/season_note.csv`).** Best-guess FR "Fil d'Ariane", "Autres ligues", "Championnat de la NHA/PCHA/WCHL", "Finale de la Coupe Avco"; JA パンくずリスト, ほかのリーグ, NHA/PCHA/WCHLチャンピオンシップ, アブコカップ決勝. Not reviewed.

- **Roster titles (`titles.col`, `titles.career`, `roster.cupWinners`, `roster.cupWinnersNote`).** Best-guess FR and JA, not reviewed. The column is the career total. FR "Titres", "Vainqueurs de coupe"; JA 優勝 (same word as the player page's championships fact), 優勝経験者 for players on the roster who have won one. The note says the count is the whole career, not only this season.
