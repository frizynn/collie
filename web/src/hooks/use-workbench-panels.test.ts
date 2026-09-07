import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useWorkbenchPanels } from "./use-workbench-panels";

type Options = Parameters<typeof useWorkbenchPanels>[0];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<Options> = {}) {
  const openModel = vi.fn<Options["openModel"]>().mockResolvedValue(true);
  const dismissModel = vi.fn<Options["dismissModel"]>().mockResolvedValue({ ok: true });
  const onError = vi.fn();
  let options: Options = {
    scope: "one", modelPresent: false, otherDialogPresent: false, writable: true,
    openModel, dismissModel, onError, ...overrides,
  };
  const hook = renderHook((current) => useWorkbenchPanels(current), { initialProps: options });
  return {
    ...hook, openModel, dismissModel, onError,
    update: (patch: Partial<Options>) => { options = { ...options, ...patch }; hook.rerender(options); },
  };
}

describe("useWorkbenchPanels — exclusive native inspectors", () => {
  it("replaces Usage with Context without involving the agent", async () => {
    const { result, dismissModel, openModel } = setup();
    await act(async () => result.current.changePanel("usage"));
    expect(result.current.panel).toBe("usage");
    await act(async () => result.current.changePanel("context"));
    expect(result.current.panel).toBe("context");
    expect(dismissModel).not.toHaveBeenCalled();
    expect(openModel).not.toHaveBeenCalled();
  });

  it("hides Models immediately and waits for actual guarded cancellation before opening Usage", async () => {
    const pending = deferred<{ ok: boolean }>();
    const { result, dismissModel, update } = setup({ modelPresent: true });
    dismissModel.mockReturnValueOnce(pending.promise);
    expect(result.current.panel).toBe("model");
    let transition!: Promise<void>;
    act(() => { transition = result.current.changePanel("usage"); });
    expect(result.current.panel).toBeNull();
    expect(result.current.closing).toBe(true);
    expect(dismissModel).toHaveBeenCalledOnce();
    act(() => update({ modelPresent: false }));
    await act(async () => { pending.resolve({ ok: true }); await transition; });
    expect(result.current.panel).toBe("usage");
    expect(result.current.closing).toBe(false);
  });

  it("outside/focus dismissal waits for a pending /model opener, then cancels its actual picker", async () => {
    const opening = deferred<boolean>();
    const cancelling = deferred<{ ok: boolean }>();
    const { result, openModel, dismissModel, update } = setup();
    openModel.mockReturnValueOnce(opening.promise);
    dismissModel.mockReturnValueOnce(cancelling.promise);
    let open!: Promise<void>, close!: Promise<void>;
    act(() => { open = result.current.changePanel("model"); });
    expect(result.current.panel).toBe("model");
    act(() => { close = result.current.changePanel(null); });
    expect(result.current.panel).toBeNull();
    expect(result.current.closing).toBe(true);
    expect(dismissModel).not.toHaveBeenCalled();
    act(() => update({ modelPresent: true }));
    expect(result.current.panel).toBeNull();
    await act(async () => { opening.resolve(true); await open; });
    expect(dismissModel).toHaveBeenCalledOnce();
    await act(async () => { cancelling.resolve({ ok: true }); await close; });
    expect(result.current.panel).toBeNull();
    expect(result.current.closing).toBe(false);
  });

  it("shares one cancellation and only opens the last rapidly requested panel", async () => {
    const cancelling = deferred<{ ok: boolean }>();
    const { result, dismissModel, update } = setup({ modelPresent: true });
    dismissModel.mockReturnValueOnce(cancelling.promise);
    let usage!: Promise<void>, context!: Promise<void>;
    act(() => {
      usage = result.current.changePanel("usage");
      context = result.current.changePanel("context");
    });
    expect(dismissModel).toHaveBeenCalledOnce();
    expect(result.current.panel).toBeNull();
    act(() => update({ modelPresent: false }));
    await act(async () => { cancelling.resolve({ ok: true }); await Promise.all([usage, context]); });
    expect(result.current.panel).toBe("context");
  });

  it("does not reopen a failed /model attempt and reports rejected openers", async () => {
    const { result, openModel, onError } = setup();
    openModel.mockResolvedValueOnce(false);
    await act(async () => result.current.changePanel("model"));
    expect(result.current.panel).toBeNull();
    openModel.mockRejectedValueOnce(new Error("transport offline"));
    await act(async () => result.current.changePanel("model"));
    expect(result.current.panel).toBeNull();
    expect(onError).toHaveBeenCalledWith("transport offline");
  });
});

describe("useWorkbenchPanels — send ownership", () => {
  it("waits for model cancellation before permitting a draft send", async () => {
    const cancelling = deferred<{ ok: boolean }>();
    const { result, dismissModel, update } = setup({ modelPresent: true });
    dismissModel.mockReturnValueOnce(cancelling.promise);
    const sendDraft = vi.fn();
    let sending!: Promise<void>;
    act(() => { sending = result.current.prepareSend().then((ready) => { if (ready) sendDraft(); }); });
    expect(result.current.panel).toBeNull();
    expect(sendDraft).not.toHaveBeenCalled();
    act(() => update({ modelPresent: false }));
    await act(async () => { cancelling.resolve({ ok: true }); await sending; });
    expect(sendDraft).toHaveBeenCalledOnce();
  });

  it("never cancels an ordinary approval or authorizes its draft send", async () => {
    const { result, dismissModel, onError } = setup({ otherDialogPresent: true });
    let ready: boolean | undefined;
    await act(async () => { ready = await result.current.prepareSend(); });
    expect(ready).toBe(false);
    expect(dismissModel).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("approval or question"));
  });

  it("cannot open models or authorize a send when the pane is not writable", async () => {
    const { result, openModel, dismissModel } = setup({ writable: false });
    await act(async () => result.current.changePanel("model"));
    expect(result.current.panel).toBeNull();
    expect(openModel).not.toHaveBeenCalled();
    await act(async () => expect(await result.current.prepareSend()).toBe(false));
    expect(dismissModel).not.toHaveBeenCalled();
  });

  it("keeps the draft unsent and restores model controls when cancellation fails", async () => {
    const { result, dismissModel, onError } = setup({ modelPresent: true });
    dismissModel.mockResolvedValueOnce({ ok: false, error: "picker changed" });
    const sendDraft = vi.fn();
    await act(async () => { if (await result.current.prepareSend()) sendDraft(); });
    expect(sendDraft).not.toHaveBeenCalled();
    expect(result.current.panel).toBe("model");
    expect(result.current.closing).toBe(false);
    expect(onError).toHaveBeenCalledWith("picker changed");
  });

  it.each([
    { name: "another approval appeared", change: { modelPresent: false, otherDialogPresent: true } },
    { name: "write access was lost", change: { writable: false } },
  ])("refuses the pending send when $name during cancellation", async ({ change }) => {
    const cancelling = deferred<{ ok: boolean }>();
    const { result, dismissModel, update } = setup({ modelPresent: true });
    dismissModel.mockReturnValueOnce(cancelling.promise);
    let sending!: Promise<boolean>;
    act(() => { sending = result.current.prepareSend(); });
    act(() => update(change));
    await act(async () => { cancelling.resolve({ ok: true }); expect(await sending).toBe(false); });
  });

  it("a newer panel request supersedes a draft waiting on cancellation", async () => {
    const cancelling = deferred<{ ok: boolean }>();
    const { result, dismissModel, update } = setup({ modelPresent: true });
    dismissModel.mockReturnValueOnce(cancelling.promise);
    let sending!: Promise<boolean>, context!: Promise<void>;
    act(() => {
      sending = result.current.prepareSend();
      context = result.current.changePanel("context");
    });
    act(() => update({ modelPresent: false }));
    await act(async () => { cancelling.resolve({ ok: true }); expect(await sending).toBe(false); await context; });
    expect(result.current.panel).toBe("context");
  });
});

describe("useWorkbenchPanels — pane/session lifetime", () => {
  it("aborts old cancellation on scope change and lets the new scope open immediately", async () => {
    const cancelling = deferred<{ ok: boolean }>();
    const { result, dismissModel, update, onError } = setup({ modelPresent: true });
    dismissModel.mockReturnValueOnce(cancelling.promise);
    let old!: Promise<void>;
    act(() => { old = result.current.changePanel("usage"); });
    const oldSignal = dismissModel.mock.calls[0]![0];
    act(() => update({ scope: "two", modelPresent: false }));
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.closing).toBe(false);
    await act(async () => result.current.changePanel("context"));
    expect(result.current.panel).toBe("context");
    await act(async () => { cancelling.resolve({ ok: false }); await old; });
    expect(result.current.panel).toBe("context");
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores a late opener from the old scope without dismissing anything in the new scope", async () => {
    const opening = deferred<boolean>();
    const { result, openModel, dismissModel, update, onError } = setup();
    openModel.mockReturnValueOnce(opening.promise);
    let old!: Promise<void>;
    act(() => { old = result.current.changePanel("model"); });
    act(() => update({ scope: "two" }));
    await act(async () => result.current.changePanel("usage"));
    await act(async () => { opening.reject(new Error("old request failed")); await old; });
    expect(result.current.panel).toBe("usage");
    expect(dismissModel).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows the new scope's existing model picker even when both scopes report modelPresent", () => {
    const { result, update } = setup({ modelPresent: true });
    expect(result.current.panel).toBe("model");
    act(() => update({ scope: "two" }));
    expect(result.current.panel).toBe("model");
  });

  it("aborts cancellation on unmount and cannot authorize a late draft send", async () => {
    const cancelling = deferred<{ ok: boolean }>();
    const { result, dismissModel, unmount, onError } = setup({ modelPresent: true });
    dismissModel.mockReturnValueOnce(cancelling.promise);
    let sending!: Promise<boolean>;
    act(() => { sending = result.current.prepareSend(); });
    const signal = dismissModel.mock.calls[0]![0];
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { cancelling.resolve({ ok: true }); expect(await sending).toBe(false); });
    expect(onError).not.toHaveBeenCalled();
  });

  it("cannot start deferred dismissal after unmount while /model is still opening", async () => {
    const opening = deferred<boolean>();
    const { result, openModel, dismissModel, unmount, onError } = setup();
    openModel.mockReturnValueOnce(opening.promise);
    let open!: Promise<void>, close!: Promise<void>;
    act(() => {
      open = result.current.changePanel("model");
      close = result.current.changePanel(null);
    });
    unmount();
    await act(async () => { opening.resolve(true); await Promise.all([open, close]); });
    expect(dismissModel).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("useWorkbenchPanels — local model browsing versus CLI ownership", () => {
  it.each(["usage", "context", null] as const)("closes local browsing to %s without cancelling any remote input", async (next) => {
    const beforeDismissModel = vi.fn(async () => {});
    const { result, dismissModel } = setup({ modelInputActive: () => false, beforeDismissModel });
    await act(async () => result.current.changePanel("model"));
    expect(result.current.panel).toBe("model");
    await act(async () => result.current.changePanel(next));
    expect(result.current.panel).toBe(next);
    expect(beforeDismissModel).not.toHaveBeenCalled();
    expect(dismissModel).not.toHaveBeenCalled();
  });

  it("permits sending after local browsing without remote cancellation", async () => {
    const beforeDismissModel = vi.fn(async () => {});
    const { result, dismissModel } = setup({ modelInputActive: () => false, beforeDismissModel });
    await act(async () => result.current.changePanel("model"));
    await act(async () => { expect(await result.current.prepareSend()).toBe(true); });
    expect(result.current.panel).toBeNull();
    expect(beforeDismissModel).not.toHaveBeenCalled();
    expect(dismissModel).not.toHaveBeenCalled();
  });

  it("waits for the pending Apply to stop, then dismisses the real picker before opening another panel", async () => {
    const applying = deferred<void>();
    const closing = deferred<{ ok: boolean }>();
    const beforeDismissModel = vi.fn(() => applying.promise);
    const { result, dismissModel, update } = setup({ modelInputActive: () => true, beforeDismissModel });
    dismissModel.mockReturnValueOnce(closing.promise);
    let change!: Promise<void>;
    act(() => { change = result.current.changePanel("usage"); });
    expect(beforeDismissModel).toHaveBeenCalledOnce();
    expect(dismissModel).not.toHaveBeenCalled();
    expect(result.current.panel).toBeNull();
    expect(result.current.closing).toBe(true);
    act(() => update({ modelPresent: true }));
    expect(result.current.panel).toBeNull();
    await act(async () => { applying.resolve(); await applying.promise; });
    expect(dismissModel).toHaveBeenCalledOnce();
    expect(result.current.panel).toBeNull();
    await act(async () => { closing.resolve({ ok: true }); await change; });
    expect(result.current.panel).toBe("usage");
  });

  it("holds a draft until pending Apply cancellation and actual picker dismissal both finish", async () => {
    const applying = deferred<void>();
    const closing = deferred<{ ok: boolean }>();
    const beforeDismissModel = vi.fn(() => applying.promise);
    const { result, dismissModel } = setup({ modelInputActive: () => true, beforeDismissModel });
    dismissModel.mockReturnValueOnce(closing.promise);
    let sending!: Promise<boolean>, finished = false;
    act(() => { sending = result.current.prepareSend().then((ready) => { finished = true; return ready; }); });
    expect(dismissModel).not.toHaveBeenCalled();
    await act(async () => { applying.resolve(); await applying.promise; });
    expect(dismissModel).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    await act(async () => { closing.resolve({ ok: true }); expect(await sending).toBe(true); });
  });

  it("does not dismiss the new scope after an old pending Apply cancellation completes", async () => {
    const applying = deferred<void>();
    const { result, dismissModel, update } = setup({ modelInputActive: () => true, beforeDismissModel: () => applying.promise });
    let change!: Promise<void>;
    act(() => { change = result.current.changePanel("usage"); });
    act(() => update({ scope: "another", modelInputActive: () => false }));
    await act(async () => { applying.resolve(); await change; });
    expect(dismissModel).not.toHaveBeenCalled();
    expect(result.current.panel).toBeNull();
  });
});
