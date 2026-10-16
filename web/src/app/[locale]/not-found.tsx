import Link from "@/components/Link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

export async function generateMetadata() {
  const { say } = await currentSpeaker();
  return { title: say("notFound.title"), robots: { index: false } };
}

export default async function NotFound() {
  const { say } = await currentSpeaker();
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">404</span>
        <h1>{say("notFound.title")}</h1>
        <p className="lede">{say("notFound.lede")}</p>
      </section>
      <p><Link href="/">{say("notFound.back")}</Link></p>
    </>
  );
}
