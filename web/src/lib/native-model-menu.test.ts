import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAnsi } from "./ansi";
import { splitLines, type MenuModel } from "./blocks";
import { parseNativeModelMenu, modelRowKeys } from "./native-model-menu";

const menu: MenuModel = { title: "Select model", actions: [{ label: "Apply", keys: ["Enter"] }], nav: { upDown: true }, signature: "screen" };
const claude = splitLines(parseAnsi(readFileSync(join(import.meta.dirname, "../fixtures/panes/claude--menu-model-picker-moved.txt"), "utf8")));

it("derives model labels, descriptions, applied model and cursor independently", () => {
  const result = parseNativeModelMenu(menu, claude)!;
  expect(result.rows).toHaveLength(5);
  expect(result.selectedIndex).toBe(2);
  expect(result.rows[0]).toEqual({ name: "Default (recommended)", description: "Opus 5 with 1M context · Best for everyday, complex tasks", selected: false, current: true });
  expect(result.rows[2]).toEqual({ name: "Fable", description: "Fable 5 · Most capable for your hardest and longest-running tasks", selected: true, current: false });
});

it.each([
  ["model-picker.txt", "Select Model and Effort", "gpt-6-astra", "model", 7],
  ["model-reasoning.txt", "Select Reasoning Level for gpt-5.6-sol", "Low (default)", "reasoning", 5],
])("parses captured Codex %s", (file, title, name, kind, count) => {
  const lines = splitLines(parseAnsi(readFileSync(join(import.meta.dirname, "harness/codex/fixtures", file as string), "utf8")));
  const result = parseNativeModelMenu({ ...menu, title: title as string }, lines)!;
  expect(result.kind).toBe(kind);
  expect(result.rows).toHaveLength(count as number);
  expect(result.rows[0]!.name).toBe(name);
  expect(result.selectedIndex).toBe(0);
});

it("declines unknown, incomplete or ambiguous row layouts", () => {
  expect(parseNativeModelMenu({ ...menu, title: "Settings" }, claude)).toBeNull();
  const parse = (body: string) => parseNativeModelMenu(menu, splitLines(parseAnsi(body)));
  expect(parse("❯ 1. A\n  3. C")).toBeNull();
  expect(parse("❯ 1. A\n❯ 2. B")).toBeNull();
  expect(parse("❯ 1. A\n  Other option\n  2. B")).toBeNull();
});

it("separates the Codex default model annotation from its slug without changing reasoning or Claude labels", () => {
  const lines = splitLines(parseAnsi("  1. gpt-6-astra (default)  Most capable model\n› 2. gpt-5.6-sol (current)  Everyday tasks"));
  const result = parseNativeModelMenu({ ...menu, title: "Select Model and Effort" }, lines)!;
  expect(result.rows[0]).toEqual({ name: "gpt-6-astra", description: "Most capable model", selected: false, current: false });
  expect(result.rows[1]).toMatchObject({ name: "gpt-5.6-sol", current: true, selected: true });
  const reasoning = splitLines(parseAnsi("  1. Medium (default)  Everyday tasks\n› 2. High (current)  Complex tasks"));
  expect(parseNativeModelMenu({ ...menu, title: "Select Reasoning Level for gpt-6-astra" }, reasoning)!.rows[0]!.name).toBe("Medium (default)");
  expect(parseNativeModelMenu(menu, lines)!.rows[0]!.name).toBe("gpt-6-astra (default)");
});

it("uses only relative arrows and refuses out-of-range positions", () => {
  expect(modelRowKeys(2, 4, 5)).toEqual(["Down", "Down"]);
  expect(modelRowKeys(4, 1, 5)).toEqual(["Up", "Up", "Up"]);
  expect(modelRowKeys(1, 1, 5)).toEqual([]);
  expect(modelRowKeys(0, 9, 5)).toEqual([]);
});
