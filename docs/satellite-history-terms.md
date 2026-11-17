# Satellite history: what Space-Track and CelesTrak allow (MODULES-1117)

Read on 2026-11-17, each page once, nothing fetched but the pages themselves (no data, no API query, no login). Question from John, 2026-11-11: may the full orbit histories of
famous satellites (historical element sets, launch and decay dates) be passed on in a public MIT npm data package with a citation, or must they stay inside the website only?

This is a reading of the published words, not legal advice. The pages say they can change without notice, so every quote below carries its address and the day it was read.

## The answer

**The package route is allowed for Space-Track's data, on one condition: an appropriate citation.** Space-Track gives a blanket approval to pass on its "basic SSA data", and its list of
basic data names exactly what a satellite history needs: element sets (TLE/OMM, which is what `gp_history` returns), the SATCAT (launch and decay dates) and decay/reentry data.
So history may go in a public package, and the website is not limited to keeping it private.

**CelesTrak gives no permission and no ban.** Its pages state no licence, no redistribution term and no citation rule (none of the six pages read contains the words redistribute,
licence, permission, attribution, citation or copyright). Its usage policy governs how to download, not what you may do with the data afterwards. CelesTrak's element sets come from
the same US Government source, and its SATCAT is its own curated copy that differs from Space-Track's. So **take the data from Space-Track only**, and do not copy CelesTrak's
SATCAT or archive into the package. If we ever want CelesTrak's own work, ask T.S. Kelso first (TS.Kelso@celestrak.org).

Keeping it inside the website only is therefore a choice, not a requirement. Recommended: the package route, sourced from Space-Track alone, with the conditions in "What the package must do" below.

## Space-Track

Page: https://www.space-track.org/documentation (a single-page document; the sections are reached as `#/odr` and `#/user_agree`). Read 2026-11-17.

### The clause that allows it

Section "SSA Sharing & Orbital Data Requests", part "Redistribution of Basic SSA Information" (`#/odr`):

> USSPACECOM has provided express blanket approval for transfer/redistribution of basic SSA data and services accessed via www.Space-Track.org conditioned on appropriate citation. Publications of analysis based on USSPACECOM data also require appropriate citations.

> Basic SSA data are Two-Line Elements (TLEs) and Orbital Mean-element Messages (OMMs); SATCAT; and Satellite Decay and Reentry Data.

The same part lists where the basic data sits on the Home panel: "ELSET Search", "SATCAT", "Decay/Reentry". The GP_History class is the complete set of historical element
sets in the OMM and TLE formats ("GP_History has the complete set of historical ephemerides, totaling over 138 Million elsets", from the API notes on the same page), so it is
TLE/OMM data and falls under the approval.

### The clause it is an exception to

User Agreement (`#/user_agree`), which the page marks "Current as of 1 August 2019":

> The User agrees not to transfer any data or technical information received from this website, or other U.S. Government source, including the analysis of data, to any other entity without prior express approval. See, 10 USC 2274(c)(2).

The blanket approval above is that "prior express approval", for the basic data only. Anything that is not basic SSA data stays under the ban (for example conjunction messages, CDM, which we do not want).

> The U.S. Government reserves the right to change or modify these terms and conditions at any time, and without prior notification.

The blanket approval carries no date on the page. It can be withdrawn, so a package release should re-read it (see the conditions).

> For permission to redistribute space-track data, information outside of what space-track provides, requests for launch support, and requests for Conjunction Assessment, please submit an Orbital Data Request.

("Contact Us" at the foot of the same page.) If John wants the permission in writing rather than read from a web page, an Orbital Data Request is the channel.

### How the data may be collected (it suits "collect once and keep")

API Use Guidelines (`#api-use-guidelines`):

> Limit API queries to less than 30 requests per 1 minute(s) and 300 requests per 1 hour(s)

> Do not use multiple space-track.org user accounts simultaneously to circumvent our API guidelines.

Table of retrieval rates, row GP_HISTORY (rate "1 / lifetime"):

> Do NOT use this class to retrieve current ephemerides; use the GP class. For queries of many objects or large date ranges, download TLEs bundled as zip files by year from our cloud storage site instead. Once you download an object's history, you need to store it on your own servers; do not download it again.

Row DECAY (rate "1 / day"):

> Once you download an object's decay history, you need to store it on your own servers; do not download it again.

Row SATCAT (rate "1 / day"):

> Once per day after 1700 (UTC) for SATCAT data.

Reading: Space-Track itself tells users to fetch a history once and keep it. A fixed, stored data package is the intended pattern. Each object's history is fetched once, never in
a loop and never on a timer; for many objects the yearly zip bundles are the route. An account is personal: "The User agrees not to share, assign or transfer his or her username or
password to another" (User Agreement), so the account used is John's own and its login never goes into the package or the repo.

### The warning to carry onto the history page

> TWO-LINE ELEMENT (TLE) SET IS THE MEAN KEPLERIAN ORBITAL ELEMENT AT A GIVEN POINT IN TIME FOR EACH SPACE OBJECT REPORTED. [...] A TLE AVAILABLE TO THE PUBLIC SHOULD NOT BE USED FOR CONJUNCTION ASSESSMENT PREDICTION.

(User Agreement page, same address.) Also "U.S. GOVERNMENT DOES NOT WARRANT THE ACCURACY OR COMPLETENESS OF THIS WEBSITE". A history page should say the elements are mean elements, good for the shape of an orbit over years and not for operations.

## CelesTrak

Read 2026-11-17, one request per page:

| Page | Address |
|---|---|
| Usage policy (updated 2026 Nov 16) | https://celestrak.org/usage-policy.php |
| GP data formats and FAQ | https://celestrak.org/NORAD/documentation/gp-data-formats.php |
| SATCAT and its formats | https://celestrak.org/satcat/ and https://celestrak.org/satcat/satcat-format.php |
| Historical archives request form | https://celestrak.org/NORAD/archives/request.php |
| Documentation index, data sources | https://celestrak.org/NORAD/documentation/ |

**No terms on passing data on.** None of these pages has a licence, a redistribution clause, a citation rule or a copyright line (searched for redistribut-, licen[cs]e, permission, attribut-, citation, copyright: no match). The footer links a "Simple Privacy Policy", which is about visitors and was not read as a licence.

**The usage policy is about downloading** (https://celestrak.org/usage-policy.php):

> Only download the data you need, when you are going to use it, and only download data once per update.

> Bottom line: There is no way for CelesTrak to set up a system to manage millions of users without having to charge for access, which would immediately break our long tradition of making data freely available to all users.

"Freely available" is a tradition stated by the author, not a licence for redistribution. It also asks that machine software stop at any non-200 answer (HTTP 301, 403, 404, 50x), which applies to anything we ever run against it.

**Where its element sets come from** (https://celestrak.org/NORAD/documentation/gp-data-formats.php): "CelesTrak will work to ensure that all GP data received via 18 SPCS and Space Track will be ingested in a way that supports users requesting GP data in any of the TLE or OMM formats." So its GP data is the US Government data that Space-Track passes on, which is why the Space-Track rule is the one to follow for it.

**Its SATCAT is its own copy.** https://celestrak.org/satcat/ links "SATCAT Discrepancy Report: List of differences between Space Track (USSF) and CelesTrak SATCATs", and the format page gives the fields we would want (`LAUNCH_DATE` and `DECAY_DATE`, ISO 8601, "OWNER" for ownership). Because the two catalogues differ and CelesTrak states no terms, the package takes launch and decay dates from Space-Track's SATCAT and decay class, where the blanket approval clearly covers them.

**Its archive is not a bulk source.** https://celestrak.org/NORAD/archives/request.php: "Data is available for all unclassified objects from 1957 through the latest GP data update." and "Users are limited to 10 requests per 24-hour period (GP and SupGP combined). Each request may contain up to 100 satellites. A maximum of 20,000 GP or SupGP records will be returned per request. If you require large bulk requests (e.g., all of the GP data for large constellations like Starlink), you should consider using Space Track." The form is an e-mail request with a CAPTCHA, and it says scripted requests "will be added to the firewall". Not a route for collecting; a person may use it for a few satellites.

## What the package must do (conditions of the allowed route)

1. **Source: Space-Track only** (element-set histories from `gp_history`, launch and decay dates from SATCAT and decay). Nothing from CelesTrak's SATCAT or archive.
2. **Cite, in the package and wherever its data is shown.** The page says "appropriate citation" and does not define it. Use the wording chikyu-earth already uses, so one credit reads the same everywhere: **"Data from Space-Track.org (USSPACECOM)"** (its NOTICE.md and `docs/satellite-sources.md`), with the retrieval date beside it. Put it in the package's README and NOTICE, in each data file's header, and on the site page that shows it. The same applies to any analysis built on it (a "height over the years" chart is analysis): "Publications of analysis based on USSPACECOM data also require appropriate citations."
3. **Say plainly the data is not ours to relicense.** The package's MIT licence covers our code; the data files are US Government data under the citation condition above. Say so in NOTICE, as the site footer already does ("data under each source's terms").
4. **Basic data only.** Elements, SATCAT fields, decay and reentry. No conjunction messages (CDM), no emergency or advanced services data, nothing from the Files panel.
5. **Collect once, politely.** One fetch per object's history, kept on our own storage, no loop, no timer, under 30 requests a minute and 300 an hour, on John's own account only; the yearly zips for bulk. Stop at the first error and look.
6. **Re-read before each package release.** The government may change the terms without notice and the approval is undated. Record the date read in the package's NOTICE each time. For a firm written permission, submit an Orbital Data Request first (optional; it is the page's own channel for "permission to redistribute").
7. **Show the caveat** that public elements are mean elements and not for conjunction assessment or operations.

## Earlier readings that agree

chikyu-earth read the same Space-Track page on 2026-11-08 and 2026-11-11 (`~/Projects/chikyu-earth/docs/satellite-sources.md`, "Space-Track in the build" and the Space Shuttle paragraph; `NOTICE.md`) and reached the same answer: basic SSA data, `gp_history` included, may be passed on with the citation. It already holds the `gp_history` sets of 134 Shuttle-flight craft as demo-site files (`demo/missions/*.json`, asked once on 2026-11-08 with John's own account, thinned to one set in three hours at most) and chose to keep them as **site files, not package data**, because "the package ships no elements" (a decision about size and policy, not a ban: "Redistribution of basic SSA data is allowed with the citation, so the package could carry them"). Two consequences for this ticket:

- Do not fetch again what is already held. Before any collection, list which of the ticket's first set (ISS 25544, Hubble 20580, Mir 16609, Skylab, Tiangong-1, Tiangong-2, Tiangong, Sputnik 1, Explorer 1, Vanguard 1) already has a `gp_history` file there; `gp_history` is one ask per object in its lifetime. Checked 2026-11-17 in `demo/missions`: Hubble (20580) is held only as 84 sets across 6 Shuttle visit windows, so its full 1990-to-now history is still to collect; the ISS (25544) and Mir (16609) are not held at all.
- The existing precedent is the site-files route. Choosing the package route for history would be a new decision to make on purpose, with the cost that every install of the package carries the files.

The site's own use of CelesTrak data (`satellites.json`, `satcat.json`, in spaceprogramx `docs/data.md`) is separate from this: it is the site serving its own copy with a credit, where CelesTrak states no licence. This note does not change that.

## What this changes for the tickets

- MODULES-1117 (this): the package route is open. The site-only route stays available and is simpler if John prefers (the website is not an npm package, so there is no licence question there either; the citation condition still applies to what the site shows).
- MODULES-1119 (the satellite history page) can read either from the package or from site-held files; the plan is on that ticket.
- Nothing has been fetched for this ticket, and none of the data may be fetched until John says to collect it.
