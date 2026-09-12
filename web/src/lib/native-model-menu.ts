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
  const codexModel = /^Select model and (?:reasoning )?effort$/i.test(menu.title);
  if (!menu.nav.upDown) return null;
  const text = lines.map((line) => line.segments.map((segment) => segment.text).join(""));
  const matches = text.map((line, index) => ({ match: /^\s*([❯›])?\s*([1-9]\d*)\.\s+(.+?)\s*$/.exec(line), index }))
    .filter((row): row is { match: RegExpExecArray; index: number } => row.match !== null);
  if (matches.length < 2 || matches.length > 20) return null;
  if (!matches.every(({ match }, index) => Number(match[2]) === index + 1)) return null;
  if (matches.filter(({ match }) => Boolean(match[1])).length !== 1) return null;
  const rows: NativeModelRow[] = [];
  for (const [index, { match, index: lineIndex }] of matches.entries()) {
    const [label = "", ...description] = match[3]!.split(/\s{2,}/);
    const raw = text[lineIndex]!;
    const separator = /\s{2,}(?=\S)/.exec(match[3]!);
    const prefix = /^\s*[❯›]?\s*[1-9]\d*\.\s+/.exec(raw)![0].length;
    const descriptionColumn = separator ? prefix + separator.index + separator[0].length : -1;
    const nextRow = matches[index + 1]?.index;
    // Only text aligned exactly with this row's description may wrap. Blank gaps, extra
    // selectable rows and marker-column text still make relative arrow movement ambiguous.
    let cursor = lineIndex + 1;
    while (cursor < (nextRow ?? text.length)) {
      const continuation = text[cursor]!;
      const aligned = descriptionColumn >= 0 && continuation.search(/\S/) === descriptionColumn &&
        !/^(?:[❯›]|[1-9]\d*\.)/.test(continuation.trimStart());
      if (!aligned) {
        if (nextRow !== undefined || continuation.trim() !== "") return null;
        break;
      }
      description.push(continuation.trim());
      cursor++;
    }
    // Codex decorates its default model only while another model is current. It is not part of
    // the slug: keeping it makes the cached gpt-6-astra candidate fail exact live-row matching.
    // Reasoning labels and Claude's "Default (recommended)" belong to different grammars.
    const name = label.replace(/[✔✓]/g, "").replace(/\s*\(current\)/gi, "").trim();
    rows.push({
      name: codexModel ? name.replace(/\s+\(default\)$/i, "") : name,
      description: description.join(" ").trim(),
      selected: Boolean(match[1]),
      current: /[✔✓]|\(current\)/i.test(label),
    });
  }
  if (rows.some((row) => !row.name)) return null;
  return { kind: reasoning ? "reasoning" : "model", rows, selectedIndex: rows.findIndex((row) => row.selected) };
}

/** A row is reached with arrows only; accepting it remains a separate footer action. */
export function modelRowKeys(selectedIndex: number, targetIndex: number, count: number): string[] {
  if (![selectedIndex, targetIndex, count].every(Number.isInteger) || selectedIndex < 0 || targetIndex < 0 || selectedIndex >= count || targetIndex >= count) return [];
  return Array<string>(Math.abs(targetIndex - selectedIndex)).fill(targetIndex > selectedIndex ? "Down" : "Up");
}
