import { currentSpeaker } from "@/lib/i18n/currentLocale";

/** Championship pennant and garden flag next to the trophy strip. Nothing when the club has no titles. */
export async function TitleBanners({
  lg, f, name,
}: { lg: string; f: number; name: string }) {
  const { say } = await currentSpeaker();
  return (
    <ul className="title-banners">
      {(["pennant", "garden"] as const).map((kind) => (
        <li key={kind}>
          {/* eslint-disable-next-line @next/next/no-img-element -- kept SVG from this app, not a remote bitmap */}
          <img
            className="title-banner"
            src={`/title-banner/${lg}/${f}/${kind}`}
            alt={`${say(kind === "pennant" ? "team.titlePennant" : "team.titleGarden")} · ${name}`}
            width={160}
            height={kind === "garden" ? 272 : 240}
            loading="lazy"
          />
          <span className="retired-cap">{say(kind === "pennant" ? "team.titlePennant" : "team.titleGarden")}</span>
        </li>
      ))}
    </ul>
  );
}
