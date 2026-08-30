import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PaneHistoryResponse, TranscriptEntry } from "@/lib/types";
import { LiveConversation } from "./live-conversation";

const api = vi.hoisted(() => ({ fetchHistory: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchHistory: api.fetchHistory, RECENT_HISTORY_LIMIT: 25 }));

vi.mock("@/components/transcript-view", () => ({
  TranscriptView: ({ entries }: { entries: TranscriptEntry[] }) => (
    <div data-testid="entries">{entries.map((entry) => entry.uuid).join(",")}</div>
  ),
}));

const entry = (uuid: string): TranscriptEntry => ({
  uuid,
  ts: "2026-08-30T12:00:00.000Z",
  role: "user",
  parts: [{ kind: "text", text: uuid }],
});

const page = (
  uuids: string[],
  hasMore = true,
): Extract<PaneHistoryResponse, { available: true }> => ({
  paneId: "w1:p1",
  available: true,
  entries: uuids.map(entry),
  hasMore,
  total: 100,
  fileTruncated: false,
});

beforeAll(() => {
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

function renderConversation(revision = 1) {
  return render(
    <LiveConversation
      paneId="w1:p1"
      agent="codex"
      status="working"
      revision={revision}
      refreshToken={0}
      onOpenTerminal={() => {}}
    />,
  );
}

describe("LiveConversation performance", () => {
  beforeEach(() => api.fetchHistory.mockReset());

  it("loads only the newest 25 entries initially", async () => {
    api.fetchHistory.mockResolvedValue(page(["e3", "e4"]));
    renderConversation();

    await waitFor(() =>
      expect(api.fetchHistory).toHaveBeenCalledWith(
        "w1:p1",
        { limit: 25 },
        undefined,
        expect.any(AbortSignal),
      ),
    );
  });

  it("uses navigation-prefetched history without issuing a duplicate request", async () => {
    render(
      <LiveConversation
        paneId="w1:p1"
        agent="codex"
        status="working"
        revision={1}
        refreshToken={0}
        initialResponse={page(["e3", "e4"])}
        onOpenTerminal={() => {}}
      />,
    );

    expect(await screen.findByTestId("entries")).toHaveTextContent("e3,e4");
    expect(api.fetchHistory).not.toHaveBeenCalled();
  });

  it("coalesces revision changes while a history request is still running", async () => {
    let resolveFirst!: (value: PaneHistoryResponse) => void;
    const first = new Promise<PaneHistoryResponse>((resolve) => {
      resolveFirst = resolve;
    });
    api.fetchHistory.mockReturnValueOnce(first).mockResolvedValue(page(["e4", "e5"]));

    const { rerender } = renderConversation(1);
    await waitFor(() => expect(api.fetchHistory).toHaveBeenCalledTimes(1));

    rerender(
      <LiveConversation
        paneId="w1:p1"
        agent="codex"
        status="working"
        revision={2}
        refreshToken={0}
        onOpenTerminal={() => {}}
      />,
    );
    rerender(
      <LiveConversation
        paneId="w1:p1"
        agent="codex"
        status="working"
        revision={3}
        refreshToken={0}
        onOpenTerminal={() => {}}
      />,
    );
    expect(api.fetchHistory).toHaveBeenCalledTimes(1);

    await act(async () => resolveFirst(page(["e3", "e4"])));
    await waitFor(() => expect(api.fetchHistory).toHaveBeenCalledTimes(2));
  });

  it("loads older entries only when requested and prepends them", async () => {
    api.fetchHistory
      .mockResolvedValueOnce(page(["e3", "e4"]))
      .mockResolvedValueOnce(page(["e1", "e2"], false));
    renderConversation();

    expect(await screen.findByTestId("entries")).toHaveTextContent("e3,e4");
    await userEvent.click(screen.getByRole("button", { name: /load older messages/i }));

    await waitFor(() =>
      expect(api.fetchHistory).toHaveBeenLastCalledWith(
        "w1:p1",
        { limit: 50, before: "e3" },
        undefined,
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByTestId("entries")).toHaveTextContent("e1,e2,e3,e4");
  });
});
