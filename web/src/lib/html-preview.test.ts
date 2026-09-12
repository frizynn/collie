import { describe, expect, it } from "vitest";
import { HTML_PREVIEW_CSP, htmlPreviewDocument } from "./html-preview";

describe("HTML preview document", () => {
  it("installs the no-network policy before hostile markup without deleting the source", () => {
    const result = htmlPreviewDocument('<script>document.cookie="stolen"</script><h1>Hello</h1>');
    expect(result.indexOf("Content-Security-Policy")).toBeLessThan(result.indexOf("document.cookie"));
    expect(result).toContain("<h1>Hello</h1>");
  });

  it("permits inline rendering while denying network, forms, objects, workers and remote frames", () => {
    expect(HTML_PREVIEW_CSP).toContain("script-src 'unsafe-inline'");
    for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "object-src 'none'", "worker-src 'none'"]) {
      expect(HTML_PREVIEW_CSP).toContain(directive);
    }
    expect(HTML_PREVIEW_CSP).not.toContain("'self'");
    expect(HTML_PREVIEW_CSP).not.toMatch(/https?:/);
  });
});
