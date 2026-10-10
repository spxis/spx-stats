"use client";

import { useSyncExternalStore } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";

const subscribe = (notify: () => void) => {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", notify);
  window.addEventListener("spxn-theme", notify);
  return () => {
    mq.removeEventListener("change", notify);
    window.removeEventListener("spxn-theme", notify);
  };
};

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

/** Light/dark switch. The choice is saved in localStorage; an inline script in <head> applies it before paint. */
export function ThemeToggle() {
  const { say } = useSpeaker();
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("spxn-theme", next); } catch { /* storage may be blocked */ }
    window.dispatchEvent(new Event("spxn-theme"));
  };
  return (
    <button className="theme" id="theme" type="button" aria-label={say("theme.switch")} aria-pressed={dark} onClick={toggle}>
      {dark ? say("theme.light") : say("theme.dark")}
    </button>
  );
}
