import type { TranscriptPart } from "./types.ts";

// Keep transcript images self-contained and safe for the browser. Agent logs can mention arbitrary
// filesystem paths and remote URLs, but neither is a serving authority. The harness itself already
// persists the exact bytes it read/generated as a data URL (Codex) or a base64 source (Claude), so
// only those embedded bytes cross the bridge.
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\r\n]+$/i;
const MAX_IMAGE_URL_CHARS = 14 * 1024 * 1024;

export function inlineImage(url: unknown, alt = "Image"): Extract<TranscriptPart, { kind: "image" }> | null {
  if (typeof url !== "string" || url.length > MAX_IMAGE_URL_CHARS || !DATA_IMAGE_RE.test(url)) return null;
  return { kind: "image", url, alt };
}

export function base64Image(source: unknown, alt = "Image"): Extract<TranscriptPart, { kind: "image" }> | null {
  if (source === null || typeof source !== "object") return null;
  const value = source as Record<string, unknown>;
  if (value.type !== "base64" || typeof value.media_type !== "string" || typeof value.data !== "string") {
    return null;
  }
  return inlineImage(`data:${value.media_type};base64,${value.data}`, alt);
}
