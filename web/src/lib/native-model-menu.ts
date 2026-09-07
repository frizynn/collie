import type { MenuModel, StyledLine } from "./blocks";

export interface NativeModelRow {
  name: string;
  description: string;
  selected: boolean;
  current: boolean;
}

export interface NativeModelMenu {
  kind: "model" | "reasoning";
  rows: NativeModelRow[];
  selectedIndex: number;
}

/** Lift only fully understood, sequential model rows; unrelated menus keep their generic renderer. */
export function parseNativeModelMenu(menu: MenuModel, lines: StyledLine[]): NativeModelMenu | null {
  const reasoning = /^Select Reasoning Level for [a-zA-Z0-9_.-]+$/i.test(menu.title);
  if (!reasoning && !/^Select model(?: and (?:reasoning )?effort)?$/i.test(menu.title)) return null;
  if (!menu.nav.upDown) return null;
  const text = lines.map((line) => line.segments.map((segment) => segment.text).join(""));
  const matches = text.map((line, index) => ({ match: /^\s*([❯›])?\s*([1-9]\d*)\.\s+(.+?)\s*$/.exec(line), index }))
    .filter((row): row is { match: RegExpExecArray; index: number } => row.match !== null);
  if (matches.length < 2 || matches.length > 20) return null;
  if (!matches.every(({ match }, index) => Number(match[2]) === index + 1)) return null;
  if (matches.filter(({ match }) => Boolean(match[1])).length !== 1) return null;
  // Gaps may be a wrapped description, an unnumbered selectable row, or a different layout.
  // Relative row movement is safe only when every intervening row is understood.
  if (!matches.every((row, index) => index === 0 || row.index === matches[index - 1]!.index + 1)) return null;
  const rows = matches.map(({ match }) => {
    const [label = "", ...description] = match[3]!.split(/\s{2,}/);
    return {
      name: label.replace(/[✔✓]/g, "").replace(/\s*\(current\)/gi, "").trim(),
      description: description.join(" ").trim(),
      selected: Boolean(match[1]),
      current: /[✔✓]|\(current\)/i.test(label),
    };
  });
  if (rows.some((row) => !row.name)) return null;
  return { kind: reasoning ? "reasoning" : "model", rows, selectedIndex: rows.findIndex((row) => row.selected) };
}

/** A row is reached with arrows only; accepting it remains a separate footer action. */
export function modelRowKeys(selectedIndex: number, targetIndex: number, count: number): string[] {
  if (![selectedIndex, targetIndex, count].every(Number.isInteger) || selectedIndex < 0 || targetIndex < 0 || selectedIndex >= count || targetIndex >= count) return [];
  return Array<string>(Math.abs(targetIndex - selectedIndex)).fill(targetIndex > selectedIndex ? "Down" : "Up");
}
