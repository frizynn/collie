import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { fetchPane } from "./api";
import { parseAnsi } from "./ansi";
import { splitLines } from "./blocks";
import { adapterFor } from "./harness/registry";
import { waitForModelAction } from "./wait-for-model-action";
import type { PaneReadResponse } from "./types";

vi.mock("./api", () => ({ fetchPane: vi.fn() }));
const read = vi.mocked(fetchPane);
const fixture = (path: string) => readFileSync(`src/${path}`, "utf8");
const codex = fixture("lib/harness/codex/fixtures/model-picker.txt");
const reasoning = fixture("lib/harness/codex/fixtures/model-reasoning.txt");
const idle = fixture("fixtures/panes/codex--v0150-idle.txt");
const claude = fixture("fixtures/panes/claude--menu-model-picker.txt");
const approval = fixture("fixtures/panes/codex--approval-exec.txt");
const pane = (text: string): PaneReadResponse => ({ paneId: "one", text, revision: 0, truncated: false });
function menu(text: string, agent = "codex") {
  const block = adapterFor(agent)!.buildBlocks(splitLines(parseAnsi(text))).find((block) => block.kind === "menu");
  if (!block || block.kind !== "menu") throw Error("Missing fixture menu");
  return block.menu;
}
const sleep = vi.fn(async () => {});
const args = { paneId: "one", session: "qa", agent: "codex", requestedLines: 600, previous: menu(codex), sleep };
beforeEach(() => { read.mockReset(); sleep.mockClear(); });

it("waits past an acknowledged but unchanged picker and a partial repaint", async () => {
  read.mockResolvedValueOnce(pane(codex)).mockResolvedValueOnce(pane("")).mockResolvedValue(pane(reasoning));
  const result = await waitForModelAction(args);
  expect(result).toMatchObject({ ok: true, kind: "menu", menu: { kind: "reasoning" }, pane: { text: reasoning } });
  expect(read).toHaveBeenCalledTimes(3);
});

it("confirms completion only after recognizing the input composer", async () => {
  read.mockResolvedValueOnce(pane(reasoning)).mockResolvedValueOnce(pane("partial repaint")).mockResolvedValue(pane(idle));
  expect(await waitForModelAction({ ...args, previous: menu(reasoning) })).toMatchObject({ ok: true, kind: "closed", pane: { text: idle } });
});

it.each(["codex", "claude"])("does not claim success for an unchanged %s selector", async (agent) => {
  const text = agent === "codex" ? codex : claude;
  read.mockResolvedValue(pane(text));
  expect(await waitForModelAction({ ...args, agent, previous: menu(text, agent) })).toMatchObject({ ok: false, reason: "timeout" });
  expect(read).toHaveBeenCalledTimes(8);
});

it("returns fresh effort controls only after their observed label changes", async () => {
  const changed = claude.replace(/Medium/g, "High");
  expect(changed).not.toBe(claude);
  read.mockResolvedValueOnce(pane(claude)).mockResolvedValue(pane(changed));
  expect(await waitForModelAction({ ...args, agent: "claude", previous: menu(claude, "claude") })).toMatchObject({ ok: true, kind: "menu", pane: { text: changed } });
});

it("stops for another dialog without touching it", async () => {
  read.mockResolvedValue(pane(approval));
  expect(await waitForModelAction(args)).toMatchObject({ ok: false, reason: "different-dialog" });
  expect(read).toHaveBeenCalledOnce();
});

it("refuses responses from another pane", async () => {
  read.mockResolvedValue({ ...pane(idle), paneId: "other" });
  expect(await waitForModelAction(args)).toMatchObject({ ok: false, reason: "error" });
});

it("discards a successful response after cancellation", async () => {
  const controller = new AbortController();
  read.mockImplementation(async () => { controller.abort(); return pane(idle); });
  expect(await waitForModelAction({ ...args, signal: controller.signal })).toMatchObject({ ok: false, reason: "aborted" });
});

it("bounds unrecognized output and reports read failures without retrying keys", async () => {
  read.mockResolvedValue(pane("unknown"));
  expect(await waitForModelAction(args)).toMatchObject({ ok: false, reason: "timeout" });
  read.mockRejectedValueOnce(new Error("403"));
  expect(await waitForModelAction(args)).toMatchObject({ ok: false, reason: "error", error: "403" });
});
