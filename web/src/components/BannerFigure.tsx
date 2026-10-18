"use client";

import { useEffect, useRef, useState } from "react";

/** One banner image with its caption. When the image fails to load nothing is drawn, so no alt text or caption is left behind. */
export function BannerFigure({ src, alt, width, height, cap, className }: { src: string; alt: string; width: number; height: number; cap: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // The image may have failed before this component was hydrated, when no error event reaches React.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return null;
  return (
    <li>
      {/* eslint-disable-next-line @next/next/no-img-element -- kept SVG from this app, not a remote bitmap */}
      <img ref={img} className={className} src={src} alt={alt} width={width} height={height} loading="lazy" onError={() => setFailed(true)} />
      <span className="retired-cap">{cap}</span>
    </li>
  );
}
