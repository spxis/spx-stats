import ErrorScene from "@/components/ErrorScene";
import Link from "@/components/Link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

export async function generateMetadata() {
  const { say } = await currentSpeaker();
  return { title: say("notFound.title"), robots: { index: false } };
}

export default async function NotFound() {
  const { say } = await currentSpeaker();
  return (
    <ErrorScene art="404" title={say("notFound.title")} lede={say("notFound.lede")}>
      <Link href="/">{say("notFound.back")}</Link>
    </ErrorScene>
  );
}
