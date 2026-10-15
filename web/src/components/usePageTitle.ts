"use client";

import { useEffect } from "react";

/**
 * Writes the tab's title for a kept page whose title depends on a choice made in the browser (the address's filters), which the server's copy of the
 * page cannot know. The framework writes the page's own title again after the page is handed over to the browser and when the address is rewritten,
 * so the title is put back whenever it reads `plain` (what the server wrote); a title that reads anything else belongs to another page and is left alone.
 */
export function usePageTitle(title: string, plain: string) {
  useEffect(() => {
    const set = () => { if (document.title === plain && title !== plain) document.title = title; };
    document.title = title;
    const el = document.querySelector("head > title");
    if (!el) return;
    const watch = new MutationObserver(set);
    watch.observe(el, { childList: true, characterData: true, subtree: true });
    return () => watch.disconnect();
  }, [title, plain]);
}
