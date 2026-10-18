"use client";

import ErrorScene from "@/components/ErrorScene";
import Link from "@/components/Link";
import { useSpeaker } from "@/components/i18n/LocaleProvider";

/** Anything a page did not handle itself: the puck referee, a button to try again and a way home. */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { say } = useSpeaker();
  return (
    <ErrorScene art="500" role="alert" title={say("error.title")} lede={say("error.lede")}>
      <button type="button" onClick={() => retry()}>{say("load.retry")}</button>
      <Link href="/">{say("notFound.back")}</Link>
    </ErrorScene>
  );
}
