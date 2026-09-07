import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { waitForNativeModelMenu, type WaitForNativeModelMenuResult } from "@/lib/wait-for-native-model-menu";
import type { PaneReadResponse } from "@/lib/types";
import { useModelMenuSource } from "./use-model-menu-source";

vi.mock("@/lib/wait-for-native-model-menu", () => ({ waitForNativeModelMenu: vi.fn() }));
const waitMock = vi.mocked(waitForNativeModelMenu);
type Options = Parameters<typeof useModelMenuSource>[0];
const base: Options = { paneId: "w1:p1", session: "qa", agent: "codex", requestedLines: 600, text: "idle composer", revision: 0 };

function success(text = "native model picker", revision = 0): WaitForNativeModelMenuResult {
  const pane: PaneReadResponse = { paneId: "w1:p1", text, revision, truncated: false };
  // The wait helper owns validated block/menu derivation; this hook consumes only its pane pair.
  return { ok: true, pane } as WaitForNativeModelMenuResult;
}

function pendingResult() {
  let resolve!: (value: WaitForNativeModelMenuResult) => void;
  const promise = new Promise<WaitForNativeModelMenuResult>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => { vi.useFakeTimers(); waitMock.mockReset(); waitMock.mockResolvedValue(success()); });
afterEach(() => vi.useRealTimers());

function setup() {
  let options = base;
  const hook = renderHook((current) => useModelMenuSource(current), { initialProps: options });
  return { ...hook, update: (patch: Partial<Options>) => { options = { ...options, ...patch }; hook.rerender(options); } };
}

describe("useModelMenuSource", () => {
  it.each([0, 47])("immediately supplies the fresh text/revision pair when Herdr reports revision=%i", async (revision) => {
    waitMock.mockResolvedValueOnce(success("fresh picker", revision));
    const { result } = setup();
    expect(waitMock).not.toHaveBeenCalled();
    await act(async () => result.current.refresh());
    expect(waitMock).toHaveBeenCalledWith(expect.objectContaining({ paneId: "w1:p1", session: "qa", agent: "codex", requestedLines: 600, signal: expect.any(AbortSignal) }));
    expect(result.current.text).toBe("fresh picker");
    expect(result.current.revision).toBe(revision);
  });

  it.each(["route model frame", "permission approval"])('hands off to the route as soon as its text changes to "%s"', async (text) => {
    const { result, update } = setup();
    await act(async () => result.current.refresh());
    act(() => update({ text, revision: 0 }));
    expect(result.current.text).toBe(text);
    expect(result.current.revision).toBe(0);
  });

  it("expires the injected frame after exactly two seconds when the route stays identical", async () => {
    const { result } = setup();
    await act(async () => result.current.refresh());
    act(() => { vi.advanceTimersByTime(1_999); });
    expect(result.current.text).toBe("native model picker");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.text).toBe(base.text);
  });

  it("clear aborts a pending read and a late successful response cannot reopen the picker", async () => {
    const pending = pendingResult();
    waitMock.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refresh(); });
    const signal = waitMock.mock.calls[0]![0].signal!;
    act(() => result.current.clear());
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(success()); await refreshing; });
    expect(result.current.text).toBe(base.text);
  });

  it("clear retires an observed picker even if cancellation returns to byte-identical composer text", async () => {
    const { result, update } = setup();
    await act(async () => result.current.refresh());
    act(() => result.current.clear());
    act(() => update({ text: base.text, revision: 0 }));
    expect(result.current.text).toBe(base.text);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current.text).toBe(base.text);
  });

  it.each(["paneId", "session", "agent"] as const)("aborts the old %s and ignores its late observation", async (key) => {
    const pending = pendingResult();
    waitMock.mockReturnValueOnce(pending.promise);
    const { result, update } = setup();
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refresh(); });
    const signal = waitMock.mock.calls[0]![0].signal!;
    act(() => update({ [key]: "different", text: "new scope composer" }));
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(success()); await refreshing; });
    expect(result.current.text).toBe("new scope composer");
  });

  it("aborts a pending read on unmount", async () => {
    const pending = pendingResult();
    waitMock.mockReturnValueOnce(pending.promise);
    const { result, unmount } = setup();
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refresh(); });
    const signal = waitMock.mock.calls[0]![0].signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(success()); await refreshing; });
  });

  it("a second refresh supersedes the first even when both responses arrive successfully", async () => {
    const first = pendingResult(), second = pendingResult();
    waitMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = setup();
    let older!: Promise<void>, newer!: Promise<void>;
    act(() => { older = result.current.refresh(); newer = result.current.refresh(); });
    expect(waitMock.mock.calls[0]![0].signal!.aborted).toBe(true);
    await act(async () => { second.resolve(success("newer picker", 2)); await newer; });
    await act(async () => { first.resolve(success("older picker", 1)); await older; });
    expect(result.current.text).toBe("newer picker");
    expect(result.current.revision).toBe(2);
  });

  it("a permission arriving during the immediate read cannot be overwritten by its late model frame", async () => {
    const pending = pendingResult();
    waitMock.mockReturnValueOnce(pending.promise);
    const { result, update } = setup();
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refresh(); });
    act(() => update({ text: "permission approval", revision: 0 }));
    await act(async () => { pending.resolve(success()); await refreshing; });
    expect(result.current.text).toBe("permission approval");
  });

  it("a route handoff is permanent even if that route later returns to the original composer within TTL", async () => {
    const { result, update } = setup();
    await act(async () => result.current.refresh());
    act(() => update({ text: "permission approval" }));
    expect(result.current.text).toBe("permission approval");
    act(() => update({ text: base.text }));
    expect(result.current.text).toBe(base.text);
  });

  it("retires a pending read on a route change even if the route returns to identical text before it resolves", async () => {
    const pending = pendingResult();
    waitMock.mockReturnValueOnce(pending.promise);
    const { result, update } = setup();
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refresh(); });
    act(() => update({ text: "permission approval", revision: 0 }));
    act(() => update({ text: base.text, revision: 0 }));
    await act(async () => { pending.resolve(success()); await refreshing; });
    expect(result.current.text).toBe(base.text);
  });

  it("cannot resurrect an observed picker by switching away and back to its scope within TTL", async () => {
    const { result, update } = setup();
    await act(async () => result.current.refresh());
    act(() => update({ paneId: "w2:p1", text: "other pane" }));
    act(() => update(base));
    expect(result.current.text).toBe(base.text);
  });
});
