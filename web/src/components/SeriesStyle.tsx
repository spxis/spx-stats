import type { SideLook } from "@/lib/seriesLooks";

const hex = (h: string) => (/^[0-9a-f]{6}$/i.test(h) ? `#${h}` : "#888888");

/**
 * The two teams' colours as page variables: --ca/--cb (lines and bars, per theme), --ba/--bb (the team blocks)
 * and --ia/--ib (text on them). Every value is a six-digit hex from lib/seriesLooks, checked again here.
 */
export function SeriesStyle({ a, b }: { a: SideLook; b: SideLook }) {
  const common = `--ba:${hex(a.block)};--bb:${hex(b.block)};--ia:${hex(a.on)};--ib:${hex(b.on)};`;
  const light = `--ca:${hex(a.light)};--cb:${hex(b.light)};`;
  const dark = `--ca:${hex(a.dark)};--cb:${hex(b.dark)};`;
  const css = `:root:root{${common}${light}}@media (prefers-color-scheme:dark){:root:root:not([data-theme="light"]){${dark}}}:root:root[data-theme="dark"]{${dark}}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
