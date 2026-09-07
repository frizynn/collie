import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreviewContent, previewBody } from "./preview-content";

describe("PreviewContent", () => {
  it("removes a complete outer widget frame and renders its Markdown as native prose", () => {
    const { container } = render(<PreviewContent lines={["┌───────────────────┐", "│ **Readable** text │", "└───────────────────┘"]} />);
    expect(screen.getByText("Readable").tagName).toBe("STRONG");
    expect(container.textContent).not.toContain("│");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("keeps authored diagrams as snippet content and treats markup as text", () => {
    const { container } = render(<PreviewContent lines={["┌──────────────────────────┐", "│ +-----+                  │", "│ | HI |                  │", "│ <img src=x onerror=bad>  │", "└──────────────────────────┘"]} />);
    expect(container.querySelector("code")?.textContent).toContain("+-----+");
    expect(container.querySelector("code")?.textContent).toContain("<img src=x onerror=bad>");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("preserves incomplete or mixed frames rather than deleting unrecognised content", () => {
    const content = ["┌──────┐", "important text without a border", "└──────┘"];
    expect(previewBody(content)).toBe(content.join("\n"));
  });
});
