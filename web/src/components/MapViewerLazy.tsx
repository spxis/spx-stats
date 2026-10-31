"use client";

import dynamic from "next/dynamic";
import { useSpeaker } from "./i18n/LocaleProvider";

function Loading() {
  const { say } = useSpeaker();
  return <p className="note" role="status">{say("load.loading")}</p>;
}

/**
 * The large map (MapViewer: d3-geo, the panel, the filters) for the dialogs that open from a small corner map. It is in a chunk of its own, fetched when a
 * dialog is opened and drawn in the browser only, so a page with a corner map does not download it until a reader asks for the large one.
 * A map drawn on the page itself (a venue's page, the city and venue explorers) imports MapViewer directly.
 */
export const MapViewerLazy = dynamic(() => import("./MapViewer").then((m) => m.MapViewer), { ssr: false, loading: () => <Loading /> });
