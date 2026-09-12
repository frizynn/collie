export const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src data:",
  "form-action 'none'",
  "frame-src data: blob:",
  "img-src data: blob:",
  "media-src data: blob:",
  "object-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "worker-src 'none'",
].join("; ");

/**
 * Parse without executing, then place our policy before every author-controlled node in <head>.
 * The caller must still use an opaque-origin sandbox: CSP limits resources; sandbox limits powers.
 */
export function htmlPreviewDocument(source: string): string {
  const document = new DOMParser().parseFromString(source, "text/html");
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = HTML_PREVIEW_CSP;
  document.head.prepend(policy);
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
