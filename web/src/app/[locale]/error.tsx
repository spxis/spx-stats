"use client";

import { useSpeaker } from "@/components/i18n/LocaleProvider";

/** Anything a page did not handle itself: the same inline note as a failed read, with a button to try again. */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { say } = useSpeaker();
  return (
    <>
      <p className="note">{say("load.failed")}</p>
      <p><button type="button" onClick={() => retry()}>{say("load.retry")}</button></p>
    </>
  );
}
