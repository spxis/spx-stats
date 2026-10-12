"use client";

import { useState } from "react";

/** A ticket id that copies itself when pressed. */
export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => undefined);
  };
  return (
    <button type="button" className="tk-id" title="Copy the ticket id" onClick={copy}>
      {copied ? "copied" : id}
    </button>
  );
}
