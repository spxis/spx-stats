import { currentSpeaker } from "@/lib/i18n/currentLocale";
import "./spinner.css";

/** What a detail page shows from the moment a link is pressed until its data arrives (used by loading.tsx). */
export async function PageSpinner() {
  const { say } = await currentSpeaker();
  return (
    <div className="pagespin" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{say("load.loading")}</span>
    </div>
  );
}
