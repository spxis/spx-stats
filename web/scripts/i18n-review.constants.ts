/**
 * A literal reading of each machine-written Japanese line, returned to English, so a reader who does not read
 * Japanese can check the meaning against the English beside it. Placeholders stay as written. A key the sheet
 * lists without a reading here fails `pnpm test:i18n`.
 */
export const READBACK: Readonly<Record<string, string>> = {
  "nav.teams": "Teams.",
  "nav.soccer": "Soccer (the sport).",
  "nav.players": "Players (the word for an athlete).",
  "nav.venues": "Home grounds (the word for the place a team is based and plays).",
  "nav.countries": "By country (the word for the countries players come from).",
  "nav.aboutPage": "About this site.",
  "nav.privacy": "Privacy.",
  "nav.terms": "Rules of use (the usual word for terms of service).",
  "nav.about": "About the data.",
  "nav.sources": "Information sources.",
  "nav.quality": "Quality of the data.",
  "nav.logos": "Logos.",
  "nav.allTime": "Total / cumulative (through all years).",
  "footer.language": "Language.",
  "footer.colLeagues": "Leagues.",
  "footer.colData": "About SPXN.",
  "footer.colLegal": "Rules and privacy.",
  "footer.version": "Version {version}",
  "footer.archive":
    "The games and odds from 2002 to 2013 are SPX's own data (SportsInteractive.com, 1997 to 2013). The other seasons come from open data sources, and the source is written beside each piece of data.",
  "footer.retro":
    "The information used here was provided free of charge by Retrosheet, and the copyright belongs to Retrosheet. Anyone interested, please contact Retrosheet from {link}.",
  "footer.sources":
    "NFL data is from {nflverse} (CC BY 4.0). NHL results and standings outside SPX's seasons are from the NHL. Award names and winners are from {wikidata} (CC0).",
  "footer.logos":
    "Team logos are trademarks of their respective owners and are shown only to identify each team. SPXN is not partnered with any team or league. {link}.",
  "footer.unofficial":
    "SPXN is a non-official fan project. It is not partnered with, and has not been approved by, the NHL, NBA, MLB, NFL, CFL, or any team or league.",
  "footer.unofficialLink":
    "Notice about the logos.",
  "footer.aboutLogos": "About the logos.",
  "footer.credits": "Notices about data sources, licences and logos are posted on {link}.",
  "legal.updated": "Last update date: {date}",
  "about.eyebrow": "SPX Network (a name; not translated).",
  "about.title": "About SPXN.",
  "about.metaDesc": "What SPXN is, where the data comes from, and about the people who run it.",
  "about.lede":
    "SPXN is a record of the history of the NHL, NBA, MLB, NFL and CFL. You can look at game results, standings, championship teams and awards.",
  "about.whatTitle": "What SPXN is.",
  "about.what":
    "On SPXN (SPX Network) you can look up the history of five leagues by season, team, game and player. There are no accounts and no sign-up.",
  "about.dataTitle": "Where the data comes from.",
  "about.base":
    "The foundation is the SPX archive (SportsInteractive.com, 1997 to 2013). Where SPX has a value, we use SPX's value.",
  "about.gaps":
    "The missing parts are filled in from open data sources whose use is permitted. Starting from SPX's seasons, we widen the range a little at a time, backward and forward. The ones used are Retrosheet, Lahman, nflverse, the NHL, Wikipedia and Wikidata. Logos are taken from Wikimedia Commons.",
  "about.checks":
    "When another data source matches SPX, the value is shown as \"confirmed\". When they do not match, we record the difference and keep using SPX's value as it is.",
  "about.holes":
    "There are games and seasons that are missing. Where the data has a hole, we do not guess; we leave it blank.",
  "credit.wikipediaLink":
    "English-language Wikipedia.",
  "credit.wikipedia":
    "Data such as personal information is taken from {reuse} and used under the {licence} licence.",
  "about.more":
    "For the licence and source of each, see {sources}; for what we check and the known problems, see {quality}; for the reason team logos are shown, see {logos}.",
  "about.ownerTitle": "The operator.",
  "about.owner": "The owner of SPXN is John Morris. It is not partnered with any team or league.",
  "about.contactTitle": "If you find a mistake.",
  "about.contact":
    "Please create a GitHub Issue (a request or report) and let us know: {link}. The site's code is also public there.",
  "about.contactLink": "github.com/spxis/spx-stats (an address; not translated).",
  "about.wiki":
    "Some recent scores are still missing. If you want to improve Wikipedia, please see {link}.",
  "about.wikiLink": "Fill in the blanks of Wikipedia.",
  "brand.title": "SPXIS's marks (the word for a logo or symbol).",
  "brand.lede": "SPXN was born from SportsInteractive, established in 1997. Please look at the marks of each period.",
  "brand.y1997": "SportsInteractive's shield, established 1997.",
  "brand.y2006": "spxn.com, the sportsinteractive network that uses the swoosh.",
  "brand.y2006shield": "spxn's shield, established 1997.",
  "brand.y2007": "SPX Interactive Software, which uses the swoosh.",
  "brand.y2019": "SPXIS's shield, established 1997.",
  "brand.licence":
    "These are SPXIS's marks and are © SportsInteractive. They are not covered by the licences that apply to the site's data.",
  "brand.swooshTitle": "The swoosh and the star.",
  "brand.swRed": "Red centre (as in the original design).",
  "brand.swBright": "Brighter centre (for small sizes).",
  "brand.swSolid": "Single colour.",
  "brand.star": "Star.",
  "brand.swSport": "On a league's pages the centre becomes that league's colour (one colour per sport). On the home page and pages that belong to no particular sport it stays red.",
  "brand.shieldTitle": "The shield as a container (a thing that holds something).",
  "brand.shieldText":
    "The empty shield can hold a team's logo or abbreviation, in team colours or SPXN navy. This is a preview and is not yet used on any page.",
  "brand.exLogoTeam": "Logo, team colours.",
  "brand.exAbbrTeam": "Abbreviation, team colours.",
  "brand.exLogoNavy": "Logo, SPXN navy.",
  "brand.exAbbrNavy": "Abbreviation, SPXN navy, league name in the band.",
  "footer.brand": "SportsInteractive, established 1997. SPXIS's marks are © SportsInteractive. {link}",
  "footer.brandLink": "About the marks.",
  "terms.eyebrow": "SPX Network (a name; not translated).",
  "terms.title": "Rules of use and licence.",
  "terms.metaDesc": "The simple rules for using SPXN, and the licence and source of the data.",
  "terms.lede": "The simple rules for using SPXN, and the sources and licences of the data.",
  "terms.useTitle": "About using the site.",
  "terms.use":
    "SPXN can be looked at for free. You are free to put a link to it or quote a very small part. When you do, please give SPXN's name. If you copy more than that, such as a whole table or a whole season, or use it inside a product, please create an Issue first and ask (see below).",
  "terms.outside":
    "Data that came from another data source stays under that source's licence. If you reuse it, follow that licence, and state the original source too, not only SPXN.",
  "terms.bots":
    "Search engines are welcome. In the site's robots.txt we ask AI-training crawlers and bulk-collection tools not to access it. Please do not copy the site in bulk with automatic tools.",
  "terms.asisTitle": "Provided as it is; no guarantee.",
  "terms.asis":
    "SPXN is provided as it is, and does not promise that the content is complete, correct or the latest. Old records have gaps, data sources can contradict each other, and mistakes can creep in. Known problems are recorded on {quality}. Please use it at your own responsibility. To the extent the law permits, the owner takes no responsibility for damage that arises from use.",
  "terms.unofficialTitle":
    "This is a non-official site.",
  "terms.marks":
    "The names, logos and other trademarks of teams and leagues belong to their respective owners. They are shown only to indicate which team's or league's data it is.",
  "terms.errors":
    "To report a mistake, ask about reusing content, or ask for a logo to be deleted, please create an Issue on GitHub: {link}.",
  "terms.creditsTitle": "Data sources and credits.",
  "terms.lahman":
    "For baseball data we also use the Lahman Baseball Database. Its licence and credit are posted on {sources}.",
  "terms.wikipedia":
    "The notes about shortened seasons are made on the basis of Wikipedia (CC BY-SA 4.0). Each note has a link to the original Wikipedia article.",
  "address.credit": "The addresses are formatted using {link}.",
  "credit.maps": "Map: {chizu}, from {naturalEarth}.",
  "credit.flags": "Flags: {hata}; the designs are from {commons}.",
  "credit.surfaces": "Playing surfaces: {kyogijo}.",
  "credit.emblems": "Trophies and medals: {dougu}.",
  "credit.brackets": "Layout of the tournament chart: {taisen}.",
  "credit.jerseys": "Retired-number banners: {senshu}.",
  "credit.logos": "Some historic logos: {sportslogos}; they are shown small to identify the team ({link}).",
  "credit.logosLink": "about the logos",
  "terms.wikiTitle":
    "Text from Wikipedia.",
  "terms.wikiShare":
    "Part of the text on this site is based on English-language Wikipedia: notes about seasons that were shortened or cancelled, notes about awards that were not given, head coaches, venue information (surface, roof, size of the field), basketball players' statistics, and the birthplaces of some players. The {licence} licence still applies to this text, and people who reuse it are required to cite Wikipedia as the source and share it under the same licence. Where a matching Wikipedia article exists, the note links to that article.",
  "terms.fullList":
    "The list of sources, and the licence and credit of each, are on {sources}.",
  "terms.logosTitle": "Logos and names.",
  "terms.logosRemoval":
    "If you hold the rights to a logo shown here and wish it deleted, please create an Issue. We will delete it promptly: {link}.",
  "terms.ownerTitle": "The owner.",
  "terms.owner": "The owner of SPXN is John Morris.",
  "terms.notLegal": "This page is an explanation written to be easy to understand, and is not legal advice.",
  "privacy.eyebrow": "SPX Network (a name; not translated).",
  "privacy.title": "Privacy.",
  "privacy.metaDesc":
    "What SPXN saves on your device, what it does not collect, and the third parties that can see your visit.",
  "privacy.lede":
    "In short: SPXN has no accounts, no ads and no tracking. This page explains, as it is, what the site actually does.",
  "privacy.accountsTitle": "There are no accounts.",
  "privacy.accounts":
    "You never log in, and we never ask for information such as your name or email address. We do not collect member data (accounts, bets, bulletin boards, surveys). We also do not collect or display delicate personal information such as race and ethnicity, religion, health, family and politics.",
  "privacy.cookiesTitle": "Cookies and saved settings.",
  "privacy.cookie":
    "There is only one cookie, spxn-locale. It is for remembering your language (EN, FR, Japanese) for one year. It is set only when you choose a language at the bottom of a page, and its contents are only the language code.",
  "privacy.theme":
    "When you use the light/dark switch, the setting you chose is saved in the browser's local storage (spxn-theme). It is kept only inside the device and is never sent to the site.",
  "privacy.browserLanguage":
    "If you have not chosen a language, we display to match your browser's language setting. Nothing is saved for that.",
  "privacy.trackingTitle": "No ads and no tracking.",
  "privacy.tracking":
    "SPXN has no ads, no access analysis, and no tracking cookies or scripts. The scripts, fonts, maps and flags that a page loads are served from the site itself.",
  "privacy.visitsTitle":
    "Home grounds you have visited.",
  "privacy.visits":
    "On the home-ground list page you can put a mark on the grounds you have visited, and you can also keep a date and a note. This list is saved only in the browser (localStorage); because it is never sent to spxn.com or to anyone else, we cannot see it. If you clear this site's data in the browser, the list disappears too. If you use the export and import buttons, you can also move it to a different browser yourself.",
  "privacy.logosTitle": "Team logos.",
  "privacy.logos":
    "Team logos are loaded directly from Wikimedia Commons. When one is loaded, the IP address and browser information reach Wikimedia. This is the same whichever site you view. We attach no referring-page information when loading logos, so Wikimedia cannot tell which SPXN page is being viewed.",
  "privacy.hostTitle": "Hosting and data.",
  "privacy.host":
    "SPXN is hosted on Vercel. Like many hosting companies, Vercel keeps ordinary server logs such as the IP address, the requested page, the time and the type of browser. For details, please see {link}.",
  "privacy.hostLink": "Vercel's privacy policy.",
  "privacy.database":
    "The data on game results, standings and awards is kept in a Supabase database. SPXN's server reads it with a read-only key, and the contents are only sports records. Your browser never connects to the database, and no information about you is sent to it.",
  "privacy.questionsTitle": "Questions (polite form).",
  "privacy.questions":
    "Please create an Issue on GitHub and ask: {link}. When this page changes, the date below changes too.",
  "privacy.notLegal": "This page is an explanation written to be easy to understand, and is not legal advice.",

  "result.otl": "Extra-time loss (short form).",
  "result.lostOt": "Lost in extended play.",
  "split.road": "Visitor (the word borrowed from English \"visitor\").",
  "season.defending": "Last year's champion.",
  "team.reigning": "Current champion · {season}",
  "fig.share": "Winning rate (the usual Japanese baseball term for win percentage).",
  "donut.share": "Winning rate.",
  "result.tie": "Draws.",
  "stat.otl.name": "Extra-time defeats.",
  "col.venue": "Venue.",
  "col.location": "Location / address.",
  "team.venues": "Home grounds (where the team is based).",
  "team.allTime": "Total record (through all years).",
  "h2h.link": "Head-to-head record.",
  "h2h.linkShort": "Head-to-head (short).",
  "h2h.title": "{a} versus {b}",
  "h2h.leads": "{team} leads.",
  "h2h.tip.lead": "{team} leads by {n} wins.",
  "playoffs.robin": "Round robin (the English word written in Japanese letters).",
  "resume.title": "Athletic career.",
  "resume.kind.draft": "Draft (the English word written in Japanese letters).",
  "awards.title": "Honours / citations.",
  "col.playoffs": "Playoffs.",
  "venues.tabs": "Map of home grounds.",
  "map.viewState": "State / province (the combined word for a US state and a Chinese-style province).",
  "h2h.pick.button": "Change the team: {team}",
  "h2h.pick.neverTitle": "Because they have no season in common, these 2 teams have not played each other.",
};

/**
 * Lines outside the About, Terms and Privacy pages and the footer that web/I18N_TODO.md lists as doubts
 * (hockey terms, "winning share", head-to-head, all-time, venues, awards, résumé). They already ship;
 * the sheet repeats them so the same reader can settle them in one sitting.
 */
export const TODO_KEYS: readonly string[] = [
  "result.otl",
  "result.lostOt",
  "stat.otl.name",
  "result.tie",
  "split.road",
  "season.defending",
  "team.reigning",
  "fig.share",
  "donut.share",
  "nav.allTime",
  "team.allTime",
  "col.playoffs",
  "col.venue",
  "col.location",
  "team.venues",
  "venues.tabs",
  "map.viewState",
  "h2h.link",
  "h2h.linkShort",
  "h2h.title",
  "h2h.leads",
  "h2h.tip.lead",
  "h2h.pick.button",
  "h2h.pick.neverTitle",
  "playoffs.robin",
  "resume.title",
  "resume.kind.draft",
  "awards.title",
];
