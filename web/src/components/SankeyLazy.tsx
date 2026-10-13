"use client";

import dynamic from "next/dynamic";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./sankey.css";

function Loading() {
  const { say } = useSpeaker();
  return <div className="sk-skeleton" role="status">{say("sankey.loading")}</div>;
}

/**
 * The Sankey diagram, fetched when a page that shows one is opened and drawn in the browser only: d3-sankey and the diagram are in
 * their own chunk, so no other page pays for them.
 */
export const SankeyLazy = dynamic(() => import("./Sankey"), { ssr: false, loading: () => <Loading /> });
