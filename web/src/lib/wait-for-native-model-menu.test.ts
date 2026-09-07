import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPane } from "./api";
import { waitForNativeModelMenu } from "./wait-for-native-model-menu";
import type { PaneReadResponse } from "./types";

vi.mock("./api", () => ({ fetchPane: vi.fn() }));
const read = vi.mocked(fetchPane);
const fixture = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");
const model = fixture("harness/codex/fixtures/model-picker.txt");
const reasoning = fixture("harness/codex/fixtures/model-reasoning.txt");
const idle = fixture("../fixtures/panes/codex--v0150-idle.txt");
const approval = fixture("../fixtures/panes/codex--approval-exec.txt");
const pane = (text: string): PaneReadResponse => ({ paneId: "one", text, revision: 0, truncated: false });
const sleep = vi.fn(async (_ms: number) => {});
const args = { paneId: "one", session: "work", agent: "codex", requestedLines: 600, sleep };

beforeEach(() => { read.mockReset(); sleep.mockClear(); });

describe("waitForNativeModelMenu", () => {
  it.each([model, reasoning])("returns the actual observed controls without a fixed initial delay", async (text) => {
    const actual = pane(text);
    read.mockResolvedValue(actual);
    const result = await waitForNativeModelMenu(args);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.pane).toBe(actual);
    expect(result.block.menu.signature).toBeTruthy();
    expect(result.menu.rows.length).toBeGreaterThan(1);
    expect(read).toHaveBeenCalledExactlyOnceWith("one", 600, "work", undefined);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("observes a delayed repaint in 75ms rather than waiting a normal route poll", async () => {
    let simulatedMs = 0;
    read.mockImplementation(async () => { simulatedMs += 20; return pane(simulatedMs >= 100 ? model : idle); });
    const result = await waitForNativeModelMenu({ ...args, sleep: async (ms) => { simulatedMs += ms; } });
    expect(result.ok).toBe(true);
    expect(simulatedMs).toBe(115); // 2 × 20ms reads + 75ms backoff; fixture-specific, not live latency.
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("bounds a missing picker to six reads and 1575ms of backoff", async () => {
    read.mockResolvedValue(pane(idle));
    expect(await waitForNativeModelMenu(args)).toMatchObject({ ok: false, reason: "timeout" });
    expect(read).toHaveBeenCalledTimes(6);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([75, 150, 300, 450, 600]);
  });

  it("stops on another recognized dialog without waiting or writing", async () => {
    read.mockResolvedValue(pane(approval));
    expect(await waitForNativeModelMenu(args)).toMatchObject({ ok: false, reason: "different-dialog" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rejects an out-of-scope response", async () => {
    read.mockResolvedValue({ ...pane(model), paneId: "other" });
    expect(await waitForNativeModelMenu(args)).toMatchObject({ ok: false, reason: "error" });
  });

  it("aborts every scoped read and rejects a late successful response after a pane switch", async () => {
    const controller = new AbortController();
    read.mockImplementation(async () => { controller.abort(); return pane(model); });
    expect(await waitForNativeModelMenu({ ...args, signal: controller.signal })).toMatchObject({ ok: false, reason: "aborted" });
    expect(read).toHaveBeenCalledExactlyOnceWith("one", 600, "work", controller.signal);
  });

  it("an abort during backoff prevents further reads", async () => {
    const controller = new AbortController();
    read.mockResolvedValue(pane(idle));
    expect(await waitForNativeModelMenu({ ...args, signal: controller.signal, sleep: async () => { controller.abort(); } })).toMatchObject({ ok: false, reason: "aborted" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not read for an already aborted or unsupported caller", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await waitForNativeModelMenu({ ...args, signal: controller.signal })).toMatchObject({ ok: false, reason: "aborted" });
    expect(await waitForNativeModelMenu({ ...args, agent: "unknown" })).toMatchObject({ ok: false, reason: "unsupported" });
    expect(read).not.toHaveBeenCalled();
  });

  it("reports a transport error without repeating the command or retrying auth failures", async () => {
    read.mockRejectedValue(new Error("403"));
    expect(await waitForNativeModelMenu(args)).toMatchObject({ ok: false, reason: "error", error: "403" });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
