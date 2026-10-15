import { SHIELD } from "@/lib/brandShield";
import { fitSize, PLATE, SAFE, SHIELD_BOX, SPXN_SHIELD, type ShieldColours } from "@/lib/shieldFit";

export type ShieldContent = { logo: string; alt?: string } | { abbr: string };

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;

/**
 * The SPXIS shield, empty, as a container: its rim, ring and field in the colours given, and a team's logo (contained and padded inside the safe
 * area, on a light plate so a dark logo does not vanish) or a short abbreviation (in the site's display font, sized to fit) inside. `band` is an
 * optional short label (a league, a year) in the strip along the top. Not used on a public page yet; About and /admin/logos preview it.
 * The shield is a SPXIS mark, © SportsInteractive: not under the site's data licences.
 *
 * `size` is the width in px. `plate` is the logo's backing (null for none). A server component: the logo is a plain <img>, hot-linked as everywhere else.
 */
export function BrandShield({ content, colours = SPXN_SHIELD, size = 120, band, plate = "#ffffff", label }: {
  content: ShieldContent; colours?: ShieldColours; size?: number; band?: string; plate?: string | null; label?: string;
}) {
  const { w, h } = SHIELD_BOX;
  const fill: Record<string, string> = { rim: colours.rim, ring: colours.ring, field: colours.field };
  const word = "abbr" in content ? content.abbr.toUpperCase() : null;
  const box = plate ? { x: PLATE.cx - PLATE.side / 2, y: PLATE.cy - PLATE.side / 2, w: PLATE.side, h: PLATE.side } : SAFE.logo;
  const name = label ?? (word ?? ("logo" in content ? content.alt : undefined) ?? "");
  const fs = word ? fitSize(word, SAFE.text.w, 56) : 0;
  const bandWord = band?.toUpperCase();
  const bandFs = bandWord ? fitSize(bandWord, SAFE.band.w, SAFE.band.max, 0.1) : 0;
  return (
    <span className="shield" style={{ width: size }} role="img" aria-label={name || undefined}>
      <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
        {SHIELD.plates.map((p) => (
          <path key={p.id} fill={fill[p.id]} fillRule={p.id === "rim" || p.id === "ring" ? "evenodd" : undefined} d={p.d} />
        ))}
        {bandWord ? (
          <text x={SAFE.band.cx} y={SAFE.band.base} textAnchor="middle" fill={colours.ink} fontSize={bandFs} letterSpacing={`${(bandFs * 0.1).toFixed(2)}`}
            style={{ fontFamily: "var(--display)", fontWeight: 700 }}>{bandWord}</text>
        ) : null}
        {"logo" in content && plate ? <circle cx={PLATE.cx} cy={PLATE.cy} r={PLATE.r} fill={plate} /> : null}
        {word ? (
          <text x={SAFE.text.x + SAFE.text.w / 2} y={SAFE.text.y + SAFE.text.h / 2 + fs * 0.35} textAnchor="middle" fill={colours.ink} fontSize={fs}
            style={{ fontFamily: "var(--display)", fontWeight: 700 }}>{word}</text>
        ) : null}
      </svg>
      {"logo" in content ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote logos hot-linked as on every other page; next/image would proxy a third party's trademarks
        <img src={content.logo} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async"
          style={{ left: pct(box.x, w), top: pct(box.y, h), width: pct(box.w, w), height: pct(box.h, h) }} />
      ) : null}
    </span>
  );
}
