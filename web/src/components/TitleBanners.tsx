import { BannerFigure } from "@/components/BannerFigure";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

/** Championship pennant and garden flag next to the trophy strip. Nothing when the club has no titles. */
export async function TitleBanners({
  lg, f, name,
}: { lg: string; f: number; name: string }) {
  const { say } = await currentSpeaker();
  return (
    <ul className="title-banners">
      {(["pennant", "garden"] as const).map((kind) => {
        const cap = say(kind === "pennant" ? "team.titlePennant" : "team.titleGarden");
        return (
          <BannerFigure
            key={kind}
            className="title-banner"
            src={`/title-banner/${lg}/${f}/${kind}`}
            alt={`${cap} · ${name}`}
            width={160}
            height={kind === "garden" ? 272 : 240}
            cap={cap}
          />
        );
      })}
    </ul>
  );
}
