import { localFilePath } from "./file-links";
import { parseInline } from "./markdown";

describe("local document links", () => {
  it.each(["./docs/guide.md", "report.pdf", "/project/file.ts:42", "<docs/My Report.md>", "docs/a.md#L8-L12"])("recognizes %s", (path) => {
    expect(localFilePath(path)).not.toBeNull();
  });
  it.each(["https://example.com/a.pdf", "//example.com/a.pdf", "javascript:alert.md", "data:text/plain,a.md", "%2f%2fevil/a.pdf", "foo%00.md", "C:\\file.md", "/pane/w1:p1", "#section"])("never turns %s into a local document request", (path) => {
    expect(localFilePath(path)).toBeNull();
  });
  it("parses a path with spaces and removes line references without making a navigation URL", () => {
    expect(parseInline("[Read me](</project/My Report.md:12>)")).toEqual([{ kind: "file", path: "/project/My Report.md", spans: [{ kind: "text", text: "Read me" }] }]);
  });
  it("preserves external links", () => {
    expect(parseInline("[PDF](https://example.com/a.pdf)")[0]).toMatchObject({ kind: "link", href: "https://example.com/a.pdf" });
  });
  it("accepts line numbers on a relative file instead of mistaking them for a URL scheme", () => {
    expect(localFilePath("report.pdf:12")).toBe("report.pdf");
    expect(localFilePath("README.md:8:2")).toBe("README.md");
  });
});
