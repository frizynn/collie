import { createRef } from "react";
import type { KeyboardEvent } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSkills } from "@/lib/api";
import type { PaneSkillsResponse } from "@/lib/types";
import { useSkillComposer } from "./use-skill-composer";

vi.mock("@/lib/api", () => ({ fetchSkills: vi.fn() }));
const fetchMock = vi.mocked(fetchSkills);
const catalog = (paneId: string, name: string): PaneSkillsResponse => ({
  paneId, available: true, trigger: "$", total: 1, truncated: false,
  skills: [{ name, description: `Description for ${name}`, invocation: `$${name}`, source: "user" }],
});
const defaults = { paneId: "one", session: "work", agent: "codex", input: "$", enabled: true };

function setup(props = defaults) {
  const updateInput = vi.fn();
  const inputRef = createRef<HTMLTextAreaElement>();
  const hook = renderHook((current) => useSkillComposer({ ...current, inputRef, updateInput }), { initialProps: props });
  return { ...hook, updateInput };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(catalog("one", "review"));
});

describe("useSkillComposer", () => {
  it("does not fetch until a focused enabled input contains a trigger at its caret", async () => {
    const { result, rerender } = setup({ ...defaults, input: "hello" });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => result.current.onFocus());
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => rerender({ ...defaults, enabled: false }));
    await act(async () => result.current.onSelect(1));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => rerender(defaults));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("one", "work", expect.any(AbortSignal));
    expect(result.current.open).toBe(true);
  });

  it.each(["pane", "session"] as const)("aborts an outgoing %s and ignores its late catalog", async (change) => {
    let resolveOld!: (value: PaneSkillsResponse) => void;
    let resolveNew!: (value: PaneSkillsResponse) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
    const { result, rerender } = setup();
    await act(async () => result.current.onFocus());
    const signal = fetchMock.mock.calls[0]![2]!;
    await act(async () => rerender({ ...defaults, ...(change === "pane" ? { paneId: "two" } : { session: "personal" }) }));
    expect(signal.aborted).toBe(true);
    expect(result.current.skills).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => resolveNew(catalog("two", "new-scope-skill")));
    expect(result.current.skills.map((s) => s.name)).toEqual(["new-scope-skill"]);
    await act(async () => resolveOld(catalog("one", "old-scope-skill")));
    expect(result.current.skills.map((s) => s.name)).toEqual(["new-scope-skill"]);
  });

  it("aborts its in-flight catalog when unmounted", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { result, unmount } = setup();
    await act(async () => result.current.onFocus());
    const signal = fetchMock.mock.calls[0]![2]!;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("shows fetch errors, retries explicitly, and caches the recovered catalog across query changes", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { result, rerender } = setup();
    await act(async () => result.current.onFocus());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.skills).toEqual([]);
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => rerender({ ...defaults, input: "$rev" }));
    await act(async () => result.current.onSelect(4));
    expect(result.current.skills.map((s) => s.name)).toEqual(["review"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => result.current.onBlur());
    expect(result.current.open).toBe(false);
    await act(async () => result.current.onFocus());
    expect(result.current.open).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not intercept IME composition or modified send keys", async () => {
    const { result, updateInput } = setup();
    await act(async () => result.current.onFocus());
    const preventDefault = vi.fn(), stopPropagation = vi.fn();
    for (const modifiers of [{ nativeEvent: { isComposing: true } }, { metaKey: true }, { ctrlKey: true }]) {
      const event = { key: "Enter", nativeEvent: { isComposing: false }, preventDefault, stopPropagation, ...modifiers } as unknown as KeyboardEvent<HTMLTextAreaElement>;
      expect(result.current.onKeyDown(event)).toBe(false);
    }
    expect(preventDefault).not.toHaveBeenCalled();
    expect(updateInput).not.toHaveBeenCalled();
  });
});
