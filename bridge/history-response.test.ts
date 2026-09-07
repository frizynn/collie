import { describe, expect, test, spyOn } from "bun:test";
import { historyResponse } from "./history-response.ts";
import type { TranscriptPage } from "./journal/types.ts";

const page = (text: string): Omit<TranscriptPage, "paneId"> => ({
  entries: [{ uuid: "one", ts: "", role: "assistant", parts: [{ kind: "text", text }] }],
  total: 1, hasMore: false, fileTruncated: false,
});

describe("conditional history response", () => {
  test("unchanged pages have an empty no-store 304 with no repeat JSON serialization", async () => {
    const data = page("An unchanged message");
    const first = historyResponse(data, "one", null, "gzip");
    const etag = first.headers.get("etag");
    expect(etag).not.toBeNull();
    const stringify = spyOn(JSON, "stringify");
    try {
      const unchanged = historyResponse(data, "one", etag, "gzip");
      expect(unchanged.status).toBe(304);
      expect(unchanged.headers.get("cache-control")).toBe("no-store");
      expect(unchanged.headers.get("etag")).toBe(etag);
      expect(await unchanged.text()).toBe("");
      expect(stringify).not.toHaveBeenCalled();
    } finally { stringify.mockRestore(); }
  });

  test("changed content, paging and pane identities do not reuse a stale representation", () => {
    const initial = page("one");
    const etag = historyResponse(initial, "one", null, null).headers.get("etag");
    expect(historyResponse(page("two"), "one", etag, null).status).toBe(200);
    expect(historyResponse({ ...initial, hasMore: true }, "one", etag, null).status).toBe(200);
    expect(historyResponse(initial, "two", etag, null).status).toBe(200);
  });
});
