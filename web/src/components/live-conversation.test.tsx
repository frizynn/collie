import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { fixtureTranscript } from "@/test/handlers";
import type { PaneHistoryResponse } from "@/lib/types";
import { LiveConversation } from "./live-conversation";

beforeAll(() => {
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = vi.fn();
});

describe("LiveConversation", () => {
  it("renders the existing transcript and links older turns in the active session", () => {
    render(<MemoryRouter><LiveConversation paneId="w1:p1" session="work" agent="codex" history={{ paneId: "w1:p1", available: true, entries: fixtureTranscript, hasMore: true, total: 100, fileTruncated: false }} loading={false} error={false} /></MemoryRouter>);
    expect(screen.getByText("what changed today?")).toBeInTheDocument();
    expect(screen.getByText("One commit: abc1234.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open full history/ })).toHaveAttribute("href", "/pane/w1%3Ap1/history?s=work");
    expect(screen.queryByText("abc1234 fix")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bash.*git log/ }));
    expect(screen.getByText("abc1234 fix")).toBeInTheDocument();
  });

  it("keeps a last good transcript visible during a refresh failure and retries explicitly", () => {
    const retry = vi.fn();
    render(<MemoryRouter><LiveConversation paneId="w1:p1" history={{ paneId: "w1:p1", available: true, entries: fixtureTranscript, hasMore: false, total: 2, fileTruncated: false }} loading={false} error onRetry={retry} /></MemoryRouter>);
    expect(screen.getByText("what changed today?")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing the last update");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("describes an unavailable journal without inventing conversation content", () => {
    render(<MemoryRouter><LiveConversation paneId="w1:p1" history={{ paneId: "w1:p1", available: false, reason: "no-log" }} loading={false} error={false} /></MemoryRouter>);
    expect(screen.getByText("Waiting for the first conversation entry…")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("holds the reading window while scrolled up and resumes at the latest turn", () => {
    const initial: PaneHistoryResponse = { paneId: "w1:p1", available: true, entries: fixtureTranscript, hasMore: false, total: 2, fileTruncated: false };
    const view = (history: PaneHistoryResponse) => <MemoryRouter><LiveConversation paneId="w1:p1" history={history} loading={false} error={false} /></MemoryRouter>;
    const { container, rerender } = render(view(initial));
    const scroller = container.querySelector(".overflow-y-auto")!;
    Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 100 } });
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    rerender(view({ ...initial, entries: [{ uuid: "new", ts: "", role: "assistant", parts: [{ kind: "text", text: "New latest turn" }] }] }));
    expect(screen.getByText("what changed today?")).toBeInTheDocument();
    expect(screen.queryByText("New latest turn")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scroll to latest" }));
    expect(screen.getByText("New latest turn")).toBeInTheDocument();
    expect(screen.queryByText("what changed today?")).not.toBeInTheDocument();
  });
});
