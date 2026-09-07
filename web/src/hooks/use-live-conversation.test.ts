import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchHistory } from "@/lib/api";
import { setLocked } from "@/lib/idle";
import type { PaneHistoryResponse } from "@/lib/types";
import { useLiveConversation } from "./use-live-conversation";

vi.mock("@/lib/api", () => ({ fetchHistory: vi.fn() }));
const fetchMock = vi.mocked(fetchHistory);
const history = (paneId: string): PaneHistoryResponse => ({
  paneId,
  available: true,
  entries: [],
  hasMore: false,
  total: 0,
  fileTruncated: false,
});

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(history("w1:p1"));
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  setLocked(false);
});

afterEach(() => {
  vi.useRealTimers();
  setLocked(false);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("useLiveConversation", () => {
  it("bounds busy polls to the newest 60 turns and never overlaps requests", async () => {
    let resolve!: (value: PaneHistoryResponse) => void;
    fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result, unmount } = renderHook(() => useLiveConversation({ paneId: "w1:p1", session: "work", enabled: true, busy: true }));
    expect(fetchMock).toHaveBeenCalledWith("w1:p1", { limit: 60 }, "work", expect.any(AbortSignal));
    await act(async () => {
      result.current.refresh();
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(history("w1:p1")));
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("aborts a previous session and ignores its late result", async () => {
    let resolve!: (value: PaneHistoryResponse) => void;
    fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result, rerender, unmount } = renderHook(({ session }) => useLiveConversation({ paneId: "w1:p1", session, enabled: true }), { initialProps: { session: "one" } });
    const oldSignal = fetchMock.mock.calls[0]![3]!;
    fetchMock.mockResolvedValue(history("new-session"));
    await act(async () => rerender({ session: "two" }));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolve(history("old-session")));
    expect(result.current.history?.paneId).toBe("new-session");
    unmount();
  });

  it("pauses while hidden or locked, then immediately catches up on resume", async () => {
    const { unmount } = renderHook(() => useLiveConversation({ paneId: "w1:p1", enabled: true }));
    await act(async () => {});
    await act(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => setLocked(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => setLocked(false));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("retains the last good conversation during errors and uses idle cadence", async () => {
    const { result, unmount } = renderHook(() => useLiveConversation({ paneId: "w1:p1", enabled: true }));
    await act(async () => {});
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(result.current.error).toBe(true);
    expect(result.current.history?.paneId).toBe("w1:p1");
    await act(async () => result.current.refresh());
    expect(result.current.error).toBe(false);
    unmount();
  });

  it("does not fetch when disabled and clears another pane's displayed history", async () => {
    const { result, rerender, unmount } = renderHook(({ paneId, enabled }) => useLiveConversation({ paneId, enabled }), { initialProps: { paneId: "w1:p1", enabled: true } });
    await act(async () => {});
    await act(async () => rerender({ paneId: "w2:p1", enabled: false }));
    expect(result.current.history).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });
});
