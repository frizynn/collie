import type { MenuModel, StyledLine } from "../../blocks";
import { isBlank, lastNonBlankIndex, lineText, regionSignature, rstrip, skipBlanksUp } from "./markers";

const FOOTER = "  Press enter to confirm or esc to go back";
const MODEL_TITLE = "  Select Model and Effort";
const MODEL_SUBTITLE = "  Access legacy models by running codex -m <model_name> or in your config.toml";
const REASONING_TITLE = /^ {2}Select Reasoning Level for [a-zA-Z0-9_.-]+$/;
const OPTION = /^(›| ) ([1-9]\d*)\. {1,2}\S.*$/;
const MAX_OPTIONS = 20;

/** Only the model/effort dialogs captured in SLASH_NOTES.md; every other Codex menu stays raw. */
export function detectModelMenuRegion(lines: StyledLine[]): { model: MenuModel; startLine: number } | null {
  const texts = lines.map((line) => rstrip(lineText(line)));
  const footer = lastNonBlankIndex(texts);
  if (texts[footer] !== FOOTER) return null;

  let cursor = skipBlanksUp(texts, footer - 1);
  const options: RegExpExecArray[] = [];
  while (cursor >= 0 && options.length < MAX_OPTIONS) {
    const option = OPTION.exec(texts[cursor]!);
    if (!option) break;
    options.unshift(option);
    cursor--;
  }
  if (options.length < 2 || options.filter((option) => option[1] === "›").length !== 1) return null;
  if (!options.every((option, index) => Number(option[2]) === index + 1)) return null;
  if (cursor < 0 || !isBlank(texts[cursor]!)) return null;

  let titleRow = skipBlanksUp(texts, cursor);
  if (texts[titleRow] === MODEL_SUBTITLE) titleRow--;
  const title = texts[titleRow] ?? "";
  if (title !== MODEL_TITLE && !REASONING_TITLE.test(title)) return null;
  // Model title/subtitle are a fixed pair. A foreign paragraph under a familiar title is no menu.
  if (title === MODEL_TITLE && texts[titleRow + 1] !== MODEL_SUBTITLE) return null;

  return {
    startLine: titleRow,
    model: {
      title: title.trim(),
      actions: [
        { label: "Confirm", keys: ["Enter"] },
        { label: "Go back", keys: ["Escape"], cancel: true },
      ],
      nav: { upDown: true },
      signature: regionSignature(lines, titleRow, footer + 1),
    },
  };
}
