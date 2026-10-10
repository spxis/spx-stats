import type { LeagueCode } from "@/lib/leagues";

/**
 * Sets the page's one accent colour: the league's colour, or on a team page the first team colour
 * that reads on the page background (worked out for both themes, so the switch needs no script).
 * It renders a <style> for the page, which Next removes again when the reader leaves it.
 * The values are hex strings validated by the Zod schema; the league is a known code.
 */
export function AccentStyle({ league, team }: { league: LeagueCode; team?: { light: string | null; dark: string | null } }) {
  const lightHex = team?.light && `#${team.light}`;
  const darkHex = team?.dark && `#${team.dark}`;
  const css = [
    `:root:root{--accent:var(--${league})}`,
    lightHex ? `:root:root{--accent:${lightHex}}` : "",
    darkHex ? `@media (prefers-color-scheme:dark){:root:root:not([data-theme="light"]){--accent:${darkHex}}}` : "",
    lightHex || darkHex ? `:root:root[data-theme="dark"]{--accent:${darkHex || `var(--${league})`}}` : "",
    lightHex && !darkHex ? `@media (prefers-color-scheme:dark){:root:root:not([data-theme="light"]){--accent:var(--${league})}}` : "",
  ].join("");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
