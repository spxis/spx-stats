"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "@/components/Link";

const SCALE = 1.9;

/** One retired banner. It grows and sways while hovered, focused or tapped (a second tap closes it); a tap on the name always follows the link. */
export function RetiredBannerItem({ src, alt, label, cap, href, width, height }: {
  src: string; alt: string; label: string; cap: string; href: string | null; width: number; height: number;
}) {
  const [zoom, setZoom] = useState(false);
  const [dx, setDx] = useState(0);
  const li = useRef<HTMLLIElement>(null);
  const touch = useRef(false);

  const show = () => {
    const r = li.current?.getBoundingClientRect();
    if (r) {
      const half = (r.width * SCALE - r.width) / 2;
      const left = r.left - half;
      const right = r.right + half;
      setDx(left < 6 ? 6 - left : right > innerWidth - 6 ? innerWidth - 6 - right : 0);
    }
    setZoom(true);
  };

  useEffect(() => {
    if (!zoom) return;
    const out = (e: Event) => { if (!li.current?.contains(e.target as Node)) setZoom(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); };
  }, [zoom]);

  const tap = (e: MouseEvent) => {
    if (!touch.current) return;
    touch.current = false;
    e.preventDefault();
    if (zoom) setZoom(false); else show();
  };
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- kept SVG from this app, not a remote bitmap
    <img className="retired-banner" src={src} alt={alt} width={width} height={height} loading="lazy" />
  );
  const common = {
    className: "retired-pic",
    title: label,
    onPointerDown: (e: React.PointerEvent) => { touch.current = e.pointerType === "touch" || e.pointerType === "pen"; },
    onClick: tap,
    onFocus: (e: React.FocusEvent) => { if (e.currentTarget.matches(":focus-visible")) show(); },
    onBlur: () => setZoom(false),
  };
  return (
    <li
      ref={li}
      className="retired-item"
      data-zoom={zoom ? "1" : undefined}
      style={zoom ? { "--dx": `${dx}px` } as React.CSSProperties : undefined}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setZoom(false); }}
    >
      {href ? <Link href={href} prefetch={false} {...common}>{img}</Link> : <span tabIndex={0} {...common} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (zoom) setZoom(false); else show(); } }}>{img}</span>}
      {href ? <Link href={href} prefetch={false} className="retired-cap" title={label} tabIndex={-1}>{cap}</Link> : <span className="retired-cap">{cap}</span>}
    </li>
  );
}
