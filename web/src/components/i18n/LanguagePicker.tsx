"use client";

import { useState } from "react";
import { LOCALE_DISPLAY, LOCALES, type Locale } from "@/lib/locale";
import { useSpeaker } from "./LocaleProvider";

/**
 * "EN · FR · 日本語" in the footer. The chosen language is a plain label; the others are buttons. A choice is
 * written to the cookie through /api/locale and the page is then reloaded in full (not navigated to), so the
 * router cannot answer from a copy it drew in the language the reader has just left.
 */
export function LanguagePicker() {
  const { locale, say } = useSpeaker();
  const [saving, setSaving] = useState<Locale | null>(null);

  async function choose(next: Locale) {
    if (next === locale || saving) return;
    setSaving(next);
    try {
      await fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: next }) });
    } finally {
      window.location.reload();
    }
  }

  return (
    <nav className="langpick" aria-label={say("footer.language")}>
      {LOCALES.map((l, i) => (
        <span key={l}>
          {i ? <span className="sep" aria-hidden="true"> · </span> : null}
          {l === locale ? (
            <span lang={l} aria-current="true" className="here">{LOCALE_DISPLAY[l]}</span>
          ) : (
            <button type="button" lang={l} disabled={saving !== null} onClick={() => void choose(l)}>
              {saving === l ? "…" : LOCALE_DISPLAY[l]}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
