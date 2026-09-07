import { parseAnsi } from "./ansi";
import { splitLines, type MenuBlock } from "./blocks";
import { createModelMenuCache } from "./model-menu-cache";

function model(title = "Select model"): MenuBlock {
  return {
    kind: "menu",
    menu: { title, signature: "model-screen", actions: [{ label: "Apply", keys: ["Enter"] }], nav: { upDown: true, leftRight: { verb: "Adjust", label: "effort" } } },
    lines: splitLines(parseAnsi("❯ 1. Model A\n  2. Model B")),
  };
}

it("retains a detached menu snapshot scoped to the exact pane/session/agent", () => {
  const cache = createModelMenuCache();
  const source = model();
  const expected = structuredClone(source);
  cache.remember("pane/session/claude", source);
  source.lines[0]!.segments[0]!.text = "Changed";
  source.lines[0]!.segments[0]!.style.color = "red";
  source.menu.actions[0]!.keys.push("Escape");
  source.menu.nav.leftRight!.label = "changed";
  expect(cache.get("pane/session/claude")).toEqual(expected);
  expect(cache.get("pane/other-session/claude")).toBeNull();
  expect(cache.get("pane/session/codex")).toBeNull();
  expect(cache.get("")).toBeNull();
});

it("rejects reasoning, unknown and partial menus without replacing a valid catalog", () => {
  const cache = createModelMenuCache();
  cache.remember("known", model());
  for (const invalid of [model("Select Reasoning Level for gpt-6-astra"), model("Settings"), { ...model(), lines: splitLines(parseAnsi("❯ 1. Loading")) }]) {
    cache.remember("unknown", invalid);
    cache.remember("known", invalid);
  }
  expect(cache.get("unknown")).toBeNull();
  expect(cache.get("known")?.menu.title).toBe("Select model");
});

it("expires 15 minutes after observation even if read repeatedly", () => {
  let time = 0;
  const cache = createModelMenuCache(() => time);
  cache.remember("pane", model());
  time = 15 * 60 * 1000 - 1;
  expect(cache.get("pane")).not.toBeNull();
  time += 1;
  expect(cache.get("pane")).toBeNull();
  cache.remember("pane", model());
  expect(cache.get("pane")).not.toBeNull();
});

it("bounds memory to the eight most recently observed scopes", () => {
  const cache = createModelMenuCache();
  for (let i = 0; i < 8; i++) cache.remember(String(i), model());
  cache.remember("0", model());
  cache.remember("8", model());
  expect(cache.get("0")).not.toBeNull();
  expect(cache.get("1")).toBeNull();
  for (let i = 2; i <= 8; i++) expect(cache.get(String(i))).not.toBeNull();
});
