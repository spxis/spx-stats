"use client";

import ErrorScene from "@/components/ErrorScene";
import Link from "@/components/Link";
import { useSpeaker } from "@/components/i18n/LocaleProvider";

/** The note shown where a read of the archive failed: the small puck, a retry button and a way home. */
export default function LoadNote({ text }: { text?: string }) {
  const { say } = useSpeaker();
  return (
    <ErrorScene art="load" small role="alert" title={text ?? say("load.failed")} lede={say("load.hint")}>
      <button type="button" onClick={() => window.location.reload()}>{say("load.retry")}</button>
      <Link href="/">{say("notFound.back")}</Link>
    </ErrorScene>
  );
}
