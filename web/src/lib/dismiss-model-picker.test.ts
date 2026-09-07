import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPane, sendKeys } from "./api";
import { dismissModelPicker } from "./dismiss-model-picker";
import type { PaneReadResponse } from "./types";

vi.mock("./api", () => ({ fetchPane: vi.fn(), sendKeys: vi.fn() }));
const read = vi.mocked(fetchPane), send = vi.mocked(sendKeys);
const fixture = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");
const model = fixture("harness/codex/fixtures/model-picker.txt");
const reasoning = fixture("harness/codex/fixtures/model-reasoning.txt");
const idle = fixture("../fixtures/panes/codex--v0150-idle.txt");
const approval = fixture("../fixtures/panes/codex--approval-exec.txt");
const trust = fixture("../fixtures/panes/codex--trust-prompt.txt");
const pane = (text: string): PaneReadResponse => ({ paneId: "one", text, revision: 0, truncated: false });
const args = { paneId: "one", session: "work", agent: "codex", requestedLines: 600, sleep: vi.fn(async () => {}) };

beforeEach(() => {
  vi.clearAllMocks(); read.mockReset(); send.mockReset();
  read.mockResolvedValue(pane(idle)); send.mockResolvedValue({ ok: true });
});

describe("dismissModelPicker", () => {
  it("unwinds reasoning then model, waits through lag, and confirms the actual composer", async () => {
    for (const text of [reasoning, reasoning, reasoning, model, model, idle]) read.mockResolvedValueOnce(pane(text));
    const result = await dismissModelPicker(args);
    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(args.sleep).toHaveBeenCalledTimes(1);
    for (const call of send.mock.calls) {
      expect(call.slice(0, 3)).toEqual(["one", ["Escape"], "work"]);
      expect(call[3]).toEqual(expect.any(String));
      expect(call[3]?.length).toBeGreaterThan(0);
    }
    for (const call of read.mock.calls) expect(call.slice(0, 3)).toEqual(["one", 600, "work"]);
  });

  it("already being at a positively recognized composer succeeds without keys", async () => {
    expect(await dismissModelPicker(args)).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("immediate confirmed transitions remove 700ms of fixed waits for two levels", async () => {
    let simulatedMs = 0;
    const frames = [reasoning, reasoning, model, model, idle];
    read.mockImplementation(async () => { simulatedMs += 20; return pane(frames.shift()!); });
    send.mockImplementation(async () => { simulatedMs += 20; return { ok: true }; });
    const result = await dismissModelPicker({ ...args, sleep: async (ms) => { simulatedMs += ms; } });
    expect(result).toEqual({ ok: true });
    expect(simulatedMs).toBe(140); // Previously 840ms: five reads, two writes, two fixed350ms waits.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("refuses a menu whose signature changed during the full freshness guard", async () => {
    read.mockResolvedValueOnce(pane(model));
    read.mockResolvedValueOnce(pane(reasoning));
    expect(await dismissModelPicker(args)).toMatchObject({ ok: false, reason: "changed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not repeat Escape when output never shows a transition", async () => {
    read.mockResolvedValue(pane(model));
    expect(await dismissModelPicker(args)).toMatchObject({ ok: false, reason: "timeout" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(10); // initial + full guard + eight verification reads
  });

  it.each([approval, trust, "An unknown dialog", model.replace("Select Model and Effort", "Select something else")])("never cancels permissions, trust or unrecognized screens", async (text) => {
    read.mockResolvedValue(pane(text));
    expect(await dismissModelPicker(args)).toMatchObject({ ok: false, reason: "different-dialog" });
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves a new permission dialog untouched after cancelling one model level", async () => {
    for (const text of [model, model, approval]) read.mockResolvedValueOnce(pane(text));
    expect(await dismissModelPicker(args)).toMatchObject({ ok: false, reason: "different-dialog" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops if write permission disappears during the guard read", async () => {
    let writable = true;
    read.mockResolvedValueOnce(pane(model));
    read.mockImplementationOnce(async () => { writable = false; return pane(model); });
    expect(await dismissModelPicker({ ...args, canWrite: () => writable })).toMatchObject({ ok: false, reason: "not-writable" });
    expect(send).not.toHaveBeenCalled();
  });

  it("passes abort through all reads and stops before writing if aborted during the guard", async () => {
    const controller = new AbortController();
    read.mockResolvedValueOnce(pane(model));
    read.mockImplementationOnce(async () => { controller.abort(); return pane(model); });
    expect(await dismissModelPicker({ ...args, signal: controller.signal })).toMatchObject({ ok: false, reason: "aborted" });
    expect(read.mock.calls.every((call) => call[3] === controller.signal)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("an unmount abort during transition waiting cannot issue another Escape", async () => {
    const controller = new AbortController();
    read.mockResolvedValue(pane(reasoning));
    expect(await dismissModelPicker({ ...args, signal: controller.signal, sleep: async () => { controller.abort(); } })).toMatchObject({ ok: false, reason: "aborted" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("maps a bridge prompt-binding refusal and never retries its write", async () => {
    read.mockResolvedValue(pane(model));
    send.mockResolvedValue({ ok: false, code: "prompt_changed", error: "changed" });
    expect(await dismissModelPicker(args)).toMatchObject({ ok: false, reason: "changed" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

it("bounds changing-menu cancellation to three levels", async () => {
  const second = model.replace("gpt-6-astra", "gpt-other");
  const third = model.replace("gpt-6-astra", "gpt-third");
  for (const text of [reasoning, reasoning, model, model, second, second, third]) read.mockResolvedValueOnce(pane(text));
  expect(await dismissModelPicker(args)).toMatchObject({ ok: false, reason: "timeout" });
  expect(send).toHaveBeenCalledTimes(3);
});

it("an already aborted or read-only caller performs no reads or writes", async () => {
  const controller = new AbortController(); controller.abort();
  expect(await dismissModelPicker({ ...args, signal: controller.signal })).toMatchObject({ ok: false, reason: "aborted" });
  expect(await dismissModelPicker({ ...args, canWrite: () => false })).toMatchObject({ ok: false, reason: "not-writable" });
  expect(read).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});
