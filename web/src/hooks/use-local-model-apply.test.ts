import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectNativeModel, type SelectNativeModelResult } from "@/lib/select-native-model";
import { submitMenuKeys } from "@/lib/menu-action";
import { waitForModelAction } from "@/lib/wait-for-model-action";
import { useLocalModelApply } from "./use-local-model-apply";

vi.mock("@/lib/select-native-model", () => ({ selectNativeModel: vi.fn() }));
vi.mock("@/lib/menu-action", () => ({ submitMenuKeys: vi.fn() }));
vi.mock("@/lib/wait-for-model-action", () => ({ waitForModelAction: vi.fn() }));
const observe = vi.mocked(waitForModelAction);
const select = vi.mocked(selectNativeModel), submit = vi.mocked(submitMenuKeys);
type Options = Parameters<typeof useLocalModelApply>[0];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const selected = (keys = ["s"]): Extract<SelectNativeModelResult, { ok: true }> => ({
  ok: true, name: "Opus (1M context)",
  pane: { paneId: "one", text: "live picker", revision: 47, truncated: false },
  menu: { kind: "model", rows: [{ name: "Opus (1M context)", description: "", selected: true, current: false }], selectedIndex: 0 },
  block: { kind: "menu", lines: [], menu: { title: "Select model", nav: { upDown: true }, signature: "fresh verified highlight",
    actions: [{ label: "Use this session only", keys }, { label: "Set as default", keys: ["Enter"] }] } },
});
function setup(overrides: Partial<Options> = {}) {
  const openCommand = vi.fn<Options["openCommand"]>().mockResolvedValue(true);
  const onApplied = vi.fn();
  let options: Options = { paneId: "one", session: "qa", agent: "claude", requestedLines: 600,
    writable: true, modelPresent: false, openCommand, onApplied, ...overrides };
  const hook = renderHook((current) => useLocalModelApply(current), { initialProps: options });
  return { ...hook, openCommand, onApplied,
    update: (patch: Partial<Options>) => { options = { ...options, ...patch }; hook.rerender(options); } };
}
beforeEach(() => { observe.mockReset(); observe.mockResolvedValue({ ok: true, kind: "closed", pane: selected().pane }); select.mockReset(); submit.mockReset(); select.mockResolvedValue(selected()); submit.mockResolvedValue({ status: "sent" }); });

describe("useLocalModelApply", () => {
  it("owns no CLI input and performs no reads or writes before explicit Apply", () => {
    const { result, update, openCommand } = setup();
    act(() => update({ requestedLines: 900 }));
    expect(result.current.inputActive()).toBe(false);
    expect(openCommand).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("explicit advanced/fallback Load tracks input ownership but never selects or confirms a model", async () => {
    const opening = deferred<boolean>();
    const onLoaded = vi.fn();
    const { result, openCommand, onApplied } = setup({ onLoaded });
    openCommand.mockReturnValue(opening.promise);
    let loading!: Promise<void>;
    act(() => { loading = result.current.load(); });
    expect(result.current.inputActive()).toBe(true);
    expect(onLoaded).not.toHaveBeenCalled();
    await act(async () => { opening.resolve(true); await loading; });
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("loading advanced settings reuses an existing picker without another slash command", async () => {
    const onLoaded = vi.fn();
    const { result, openCommand } = setup({ onLoaded, modelPresent: true });
    await act(async () => result.current.load());
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(openCommand).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("closing a pending Load waits for opening and prevents a late refresh from resurrecting settings", async () => {
    const opening = deferred<boolean>();
    const onLoaded = vi.fn();
    const { result, openCommand } = setup({ onLoaded });
    openCommand.mockReturnValue(opening.promise);
    let loading!: Promise<void>, cancelling!: Promise<void>;
    act(() => { loading = result.current.load(); });
    const rejected = expect(loading).rejects.toThrow("cancelled");
    act(() => { cancelling = result.current.cancel(); });
    await act(async () => { opening.resolve(true); await rejected; await cancelling; });
    expect(onLoaded).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("Claude uses only the advertised session action with the fresh selected signature", async () => {
    const { result, openCommand, onApplied } = setup();
    await act(async () => result.current.apply("Opus"));
    expect(openCommand).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ paneId: "one", session: "qa", agent: "claude", name: "Opus" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ keys: ["s"], nav: false, detectedRevision: 47,
      menu: selected().block.menu }));
    expect(onApplied).toHaveBeenCalledOnce();
    expect(result.current.inputActive()).toBe(false);
    result.current.released();
    expect(result.current.inputActive()).toBe(false);
  });

  it("Codex confirms the model once and leaves the following reasoning choice to the native flow", async () => {
    const next = selected(["Enter"]); next.name = "gpt-6-astra";
    select.mockResolvedValue(next);
    const reasoning = { ...next, kind: "menu" as const };
    reasoning.menu.kind = "reasoning"; reasoning.block.menu.title = "Select Reasoning Level for gpt-6-astra";
    observe.mockResolvedValue(reasoning);
    const onReasoning = vi.fn();
    const { result, openCommand, onApplied } = setup({ agent: "codex", modelPresent: true, onReasoning });
    await act(async () => result.current.apply("gpt-6-astra"));
    expect(openCommand).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ keys: ["Enter"], agent: "codex", nav: false }));
    expect(onApplied).not.toHaveBeenCalled();
    expect(onReasoning).toHaveBeenCalledWith(next.pane);
    expect(select).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "default-only Claude menu", agent: "claude", actions: [{ label: "Set as default", keys: ["Enter"] }] },
    { name: "cancel key masquerading as session action", agent: "claude", actions: [{ label: "Cancel", keys: ["s"], cancel: true }] },
    { name: "unsupported harness", agent: "other", actions: [{ label: "Apply", keys: ["Enter"] }] },
  ])("refuses $name without falling back to Enter", async ({ agent, actions }) => {
    const view = selected(); view.block.menu.actions = actions;
    select.mockResolvedValue(view);
    const { result, onApplied } = setup({ agent });
    await act(async () => { await expect(result.current.apply("Opus")).rejects.toThrow("supported session model action"); });
    expect(submit).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("refuses readonly Apply before opening the CLI", async () => {
    const { result, openCommand } = setup({ writable: false });
    await act(async () => { await expect(result.current.apply("Opus")).rejects.toThrow("cancelled"); });
    expect(openCommand).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(result.current.inputActive()).toBe(false);
  });

  it.each(["cancel", "readonly"])("%s during opening waits for the opener and prevents selection", async (stop) => {
    const opening = deferred<boolean>();
    const { result, openCommand, update, onApplied } = setup();
    openCommand.mockReturnValue(opening.promise);
    let apply!: Promise<void>, cancelling: Promise<void> | undefined;
    act(() => { apply = result.current.apply("Opus"); });
    const rejected = expect(apply).rejects.toThrow("cancelled");
    let cancelled = false;
    if (stop === "cancel") act(() => { cancelling = result.current.cancel().then(() => { cancelled = true; }); });
    else act(() => update({ writable: false }));
    await act(async () => { await Promise.resolve(); });
    expect(cancelled).toBe(false);
    expect(select).not.toHaveBeenCalled();
    await act(async () => { opening.resolve(true); await rejected; await cancelling; });
    expect(select).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("cancel during selection aborts its signal and prevents even a successful late commit", async () => {
    const selecting = deferred<SelectNativeModelResult>();
    select.mockReturnValue(selecting.promise);
    const { result, onApplied } = setup({ modelPresent: true });
    let apply!: Promise<void>, cancelled!: Promise<void>;
    act(() => { apply = result.current.apply("Opus"); });
    const rejected = expect(apply).rejects.toThrow("cancelled");
    act(() => { cancelled = result.current.cancel(); });
    expect(select.mock.calls[0]![0].signal!.aborted).toBe(true);
    expect(select.mock.calls[0]![0].canWrite!()).toBe(false);
    await act(async () => { selecting.resolve(selected()); await rejected; await cancelled; });
    expect(submit).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it.each(["paneId", "session", "agent", "unmount"])("aborts in-flight selection on %s change and ignores its late response", async (field) => {
    const selecting = deferred<SelectNativeModelResult>();
    select.mockReturnValue(selecting.promise);
    const { result, update, unmount, onApplied } = setup({ modelPresent: true });
    let apply!: Promise<void>;
    act(() => { apply = result.current.apply("Opus"); });
    const rejected = expect(apply).rejects.toThrow("cancelled");
    if (field === "unmount") unmount();
    else act(() => update({ [field]: "other" }));
    expect(select.mock.calls[0]![0].signal!.aborted).toBe(true);
    await act(async () => { selecting.resolve(selected()); await rejected; });
    expect(submit).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("shares one promise for duplicate Apply clicks and does not queue the second model", async () => {
    const opening = deferred<boolean>();
    const { result, openCommand } = setup();
    openCommand.mockReturnValue(opening.promise);
    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = result.current.apply("Opus"); second = result.current.apply("Haiku"); });
    expect(first).toBe(second);
    await act(async () => { opening.resolve(true); await first; });
    expect(openCommand).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "Opus" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("propagates failed opening, unknown models and a changed commit without reporting applied", async () => {
    const { result, openCommand, onApplied } = setup();
    openCommand.mockResolvedValueOnce(false);
    await act(async () => { await expect(result.current.apply("Opus")).rejects.toThrow("Could not open"); });
    expect(select).not.toHaveBeenCalled();
    select.mockResolvedValueOnce({ ok: false, reason: "unknown-model", error: "Unknown model" });
    await act(async () => { await expect(result.current.apply("Opus")).rejects.toThrow("Unknown model"); });
    expect(submit).not.toHaveBeenCalled();
    submit.mockResolvedValueOnce({ status: "changed" });
    await act(async () => { await expect(result.current.apply("Opus")).rejects.toThrow("picker changed"); });
    expect(onApplied).not.toHaveBeenCalled();
  });
});


it("does not report a key acknowledgement as a completed model change", async () => {
  const repaint = deferred<Awaited<ReturnType<typeof waitForModelAction>>>();
  observe.mockReturnValueOnce(repaint.promise);
  const { result, onApplied } = setup({ modelPresent: true });
  let applying!: Promise<void>;
  await act(async () => { applying = result.current.apply("Opus"); });
  expect(submit).toHaveBeenCalledOnce();
  expect(onApplied).not.toHaveBeenCalled();
  await act(async () => { repaint.resolve({ ok: false, reason: "timeout", error: "Not confirmed" }); await expect(applying).rejects.toThrow("Not confirmed"); });
  expect(onApplied).not.toHaveBeenCalled();
});

it("ignores an acknowledgement arriving after cancellation", async () => {
  const repaint = deferred<Awaited<ReturnType<typeof waitForModelAction>>>();
  observe.mockReturnValueOnce(repaint.promise);
  const { result, onApplied } = setup({ modelPresent: true });
  let applying!: Promise<void>;
  await act(async () => { applying = result.current.apply("Opus"); });
  let cancelled!: Promise<void>;
  act(() => { cancelled = result.current.cancel(); });
  await act(async () => { repaint.resolve({ ok: true, kind: "closed", pane: selected().pane }); await expect(applying).rejects.toThrow("cancelled"); await cancelled; });
  expect(onApplied).not.toHaveBeenCalled();
});
