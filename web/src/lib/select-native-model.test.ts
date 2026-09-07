import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPane, sendKeys } from "./api";
import { parseAnsi } from "./ansi";
import { selectNativeModel } from "./select-native-model";
import type { PaneReadResponse } from "./types";

vi.mock("./api", () => ({ fetchPane: vi.fn(), sendKeys: vi.fn() }));
const read = vi.mocked(fetchPane), send = vi.mocked(sendKeys);
const fixture = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");
const model = fixture("harness/codex/fixtures/model-picker.txt");
const reasoning = fixture("harness/codex/fixtures/model-reasoning.txt");
const approval = fixture("../fixtures/panes/codex--approval-exec.txt");
const claude = parseAnsi(fixture("../fixtures/panes/claude--menu-model-picker-moved.txt")).map((segment) => segment.text).join("");
const highlight = (text: string, row: number) => text.replace(/^([ \t]*)[›❯](?=\s*\d+\.)/gm, "$1 ")
  .replace(new RegExp(`^([ \\t]*)(${row}\\.)`, "m"), (_match, padding: string, number: string) => `${padding.slice(0, -2)}${text.includes("❯") ? "❯" : "›"} ${number}`);
const pane = (text: string): PaneReadResponse => ({ paneId: "one", text, revision: 0, truncated: false });
const sleep = vi.fn(async (_ms: number) => {});
const args = { paneId: "one", session: "qa", agent: "codex", requestedLines: 600, name: "gpt-5.6-terra", sleep };
const frames = (...texts: string[]) => { for (const text of texts) read.mockResolvedValueOnce(pane(text)); };

beforeEach(() => {
  read.mockReset(); send.mockReset(); sleep.mockClear();
  read.mockResolvedValue(pane(model)); send.mockResolvedValue({ ok: true });
});

describe("selectNativeModel", () => {
  it("uses a fresh full guard, sends only relative arrows, then returns the verified menu", async () => {
    frames(model, model, highlight(model, 3));
    const result = await selectNativeModel(args);
    expect(result).toMatchObject({ ok: true, name: args.name, menu: { selectedIndex: 2 } });
    if (!result.ok) throw new Error(result.error);
    expect(result.block.menu.signature).toContain("› 3.");
    expect(send).toHaveBeenCalledExactlyOnceWith("one", ["Down", "Down"], "qa", expect.stringContaining("› 1."));
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not send a key when the requested row is already highlighted", async () => {
    expect(await selectNativeModel({ ...args, name: "gpt-6-astra" })).toMatchObject({ ok: true, name: "gpt-6-astra" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["gpt-5.6", "GPT-5.6-TERRA", "gpt-5.6-terra ", "GPT 5.6 Terra"])("refuses unmatched Codex name %s without keys", async (name) => {
    expect(await selectNativeModel({ ...args, name })).toMatchObject({ ok: false, reason: "unknown-model" });
    expect(send).not.toHaveBeenCalled();
  });

  it("matches the finite Claude alias against the unique full live label", async () => {
    frames(claude, claude, highlight(claude, 2));
    const result = await selectNativeModel({ ...args, agent: "claude", name: "Opus" });
    if (!result.ok) throw new Error(`${result.reason}: ${result.error}`);
    expect(result).toMatchObject({ ok: true, name: "Opus (1M context)" });
    expect(send).toHaveBeenCalledExactlyOnceWith("one", ["Up"], "qa", expect.any(String));
  });

  it("keeps supplemental Claude names exact and does not infer model versions", async () => {
    read.mockResolvedValue(pane(claude));
    expect(await selectNativeModel({ ...args, agent: "claude", name: "Fable" })).toMatchObject({ ok: true, name: "Fable" });
    expect(await selectNativeModel({ ...args, agent: "claude", name: "fable" })).toMatchObject({ ok: false, reason: "unknown-model" });
    expect(await selectNativeModel({ ...args, agent: "claude", name: "Opus 5" })).toMatchObject({ ok: false, reason: "unknown-model" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["Default (recommended)", "Default"])("resolves the canonical default candidate to the exact live label %s", async (name) => {
    const view = claude.replace("Default (recommended)", name);
    frames(view, view, highlight(view, 1));
    expect(await selectNativeModel({ ...args, agent: "claude", name: "Default (recommended)" })).toMatchObject({ ok: true, name });
    expect(send).toHaveBeenCalledExactlyOnceWith("one", ["Up", "Up"], "qa", expect.any(String));
  });

  it("refuses ambiguous default rows instead of preferring the exact catalogue label", async () => {
    read.mockResolvedValue(pane(claude.replace("Fable                    ", "Default                  ")));
    expect(await selectNativeModel({ ...args, agent: "claude", name: "Default (recommended)" })).toMatchObject({ ok: false, reason: "unknown-model" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["Default (custom)", "default", "Default model"])("never fuzzily matches an unexpected default row %s", async (name) => {
    read.mockResolvedValue(pane(claude.replace("Default (recommended)", name)));
    expect(await selectNativeModel({ ...args, agent: "claude", name: "Default (recommended)" })).toMatchObject({ ok: false, reason: "unknown-model" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects ambiguous canonical aliases and duplicate exact labels", async () => {
    read.mockResolvedValue(pane(claude.replace("Fable                    ", "Opus                     ")));
    expect(await selectNativeModel({ ...args, agent: "claude", name: "Opus" })).toMatchObject({ ok: false, reason: "unknown-model" });
    read.mockResolvedValue(pane(model.replace("gpt-5.6-sol", "gpt-5.6-terra")));
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "unknown-model" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([highlight(model, 2), model.replace("gpt-5.6-sol", "other-model")])("refuses changed highlights or rows during the full guard", async (changed) => {
    frames(model, changed);
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "changed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("waits through unchanged readback without sending the movement again", async () => {
    frames(model, model, model, highlight(model, 3));
    expect(await selectNativeModel(args)).toMatchObject({ ok: true });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(75);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("bounds unchanged readback and never confirms a swallowed movement", async () => {
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "timeout" });
    expect(read).toHaveBeenCalledTimes(8);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([75, 150, 300, 450, 600]);
  });

  it.each([
    highlight(model, 2),
    highlight(model, 3).replace("gpt-5.6-sol", "other-model"),
    highlight(model, 3).replace("gpt-5.6-sol", "REORDER").replace("gpt-5.6-terra", "gpt-5.6-sol").replace("REORDER", "gpt-5.6-terra"),
    reasoning,
  ])("refuses a different highlight, reordered rows or successor menu during readback", async (changed) => {
    frames(model, model, changed);
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "changed" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([reasoning, approval])("leaves an existing reasoning or permission dialog untouched", async (text) => {
    read.mockResolvedValue(pane(text));
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "different-dialog" });
    expect(send).not.toHaveBeenCalled();
  });

  it("stops readback at a new approval without sending any confirmation", async () => {
    frames(model, model, approval);
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "different-dialog" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rechecks writability during the actual guard read", async () => {
    let writable = true;
    frames(model);
    read.mockImplementationOnce(async () => { writable = false; return pane(model); });
    expect(await selectNativeModel({ ...args, canWrite: () => writable })).toMatchObject({ ok: false, reason: "not-writable" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects late readback after scope abort and passes the signal to every read", async () => {
    const controller = new AbortController();
    frames(model, model);
    read.mockImplementationOnce(async () => { controller.abort(); return pane(highlight(model, 3)); });
    expect(await selectNativeModel({ ...args, signal: controller.signal })).toMatchObject({ ok: false, reason: "aborted" });
    expect(read.mock.calls.every((call) => call[3] === controller.signal)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not start after cancellation or without write access", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await selectNativeModel({ ...args, signal: controller.signal })).toMatchObject({ ok: false, reason: "aborted" });
    expect(await selectNativeModel({ ...args, canWrite: () => false })).toMatchObject({ ok: false, reason: "not-writable" });
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("propagates a bridge race or write error without retrying", async () => {
    send.mockResolvedValueOnce({ ok: false, code: "prompt_changed", error: "changed" });
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "changed" });
    send.mockRejectedValueOnce(new Error("Disconnected"));
    expect(await selectNativeModel(args)).toMatchObject({ ok: false, reason: "error", error: "Disconnected" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
