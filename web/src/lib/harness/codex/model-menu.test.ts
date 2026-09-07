import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseAnsi } from "../../ansi";
import { splitLines } from "../../blocks";
import { menusEqual, menusSameIdentity } from "../menu-model";
import { codexAdapter } from "./index";
import { detectModelMenuRegion } from "./model-menu";

const capture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", `${name}.txt`), "utf8");
const detect = (text: string) => detectModelMenuRegion(splitLines(parseAnsi(text)))?.model;

describe("Codex model/effort menus", () => {
  it.each(["model-picker", "model-reasoning"])("lifts only footer keys and probed arrows for %s", (name) => {
    const text = capture(name);
    const menu = detect(text)!;
    expect(menu).toBeDefined();
    expect(menu.actions).toEqual([
      { label: "Confirm", keys: ["Enter"] },
      { label: "Go back", keys: ["Escape"], cancel: true },
    ]);
    expect(menu.nav).toEqual({ upDown: true });
    const blocks = codexAdapter.buildBlocks(splitLines(parseAnsi(text)));
    expect(blocks.at(-1)?.kind).toBe("menu");
  });

  it("makes highlight drift invalidate confirmation while navigation retains the same identity", () => {
    const text = capture("model-picker");
    const moved = text.replace("› 1.", "  1.").replace("  2.", "› 2.");
    expect(menusEqual(detect(text)!, detect(moved)!)).toBe(false);
    expect(menusSameIdentity(detect(text)!, detect(moved)!)).toBe(true);
    expect(menusSameIdentity(detect(text)!, detect(capture("model-reasoning"))!)).toBe(false);
  });

  it("refuses changed footer/title, malformed lists and input-bearing pickers", () => {
    const text = capture("model-picker");
    for (const candidate of [
      text.replace("Select Model and Effort", "Unrecognised menu"),
      text.replace("Press enter to confirm", "Press enter to delete"),
      text.replace("› 1.", "  1."),
      text.replace("  2.", "› 2."),
      text.replace("  2.", "  9."),
      text.replace("  2.", "  Search:"),
      text + "› Type a message\n",
      capture("skill-picker"),
      capture("model-autocomplete"),
    ]) expect(detect(candidate)).toBeUndefined();
  });
});
