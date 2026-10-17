/** Encode fetched logo bytes for a hanging banner: SVG markup, or a raster data URI.
 *  Wikimedia thumbs are often `File.svg/250px-File.svg.png`; sniff the bytes, never the path. */
export function logoPayload(buf: Uint8Array, contentType: string): string | undefined {
  if (buf.length < 32 || buf.length > 180_000) return undefined;
  const type = (contentType || "").split(";")[0]!.trim().toLowerCase();
  const kind = sniffImage(buf) ?? mimeKind(type);
  if (kind === "svg") {
    const text = Buffer.from(buf).toString("utf8").trim();
    return /<svg[\s>]/i.test(text) ? text : undefined;
  }
  if (kind === "png" || kind === "jpeg" || kind === "gif" || kind === "webp") {
    const mime = kind === "jpeg" ? "image/jpeg" : `image/${kind}`;
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  }
  return undefined;
}

function mimeKind(type: string): "png" | "jpeg" | "gif" | "webp" | "svg" | undefined {
  if (type.includes("svg")) return "svg";
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg") return "jpeg";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return undefined;
}

function sniffImage(buf: Uint8Array): "png" | "jpeg" | "gif" | "webp" | "svg" | undefined {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "webp";
  const head = Buffer.from(buf.subarray(0, 160)).toString("utf8").trimStart();
  if (/^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return "svg";
  return undefined;
}
