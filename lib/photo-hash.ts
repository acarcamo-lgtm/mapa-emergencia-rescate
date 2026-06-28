import { createHash } from "crypto";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ParsedPhotoDataUrl {
  bytes: Buffer;
  contentType: string;
  ext: "jpg" | "png" | "webp";
  hash: string;
}

export function hashPhotoBytes(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function parsePhotoDataUrl(uri: string): ParsedPhotoDataUrl | null {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(uri);
  if (!match) return null;

  const contentType = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(contentType)) return null;

  const base64 = match[2].replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return null;

  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  if (ext !== "jpg" && ext !== "png" && ext !== "webp") return null;

  return {
    bytes,
    contentType,
    ext,
    hash: hashPhotoBytes(bytes),
  };
}

export function photoHashKey(hash: string): string {
  return hash.replace(/^sha256:/, "");
}
