import { ChevronRight } from "lucide-react";
import type { MenuModel, StyledLine } from "@/lib/blocks";
import { MENU_ARROW_ROW, parseKeyHintFooter } from "@/lib/harness/menu-hints";
import { PURE_HORIZONTAL_RULE_GLYPH_CLASS } from "@/lib/rule-glyphs";

const OUTER_RULE = new RegExp(`^[${PURE_HORIZONTAL_RULE_GLYPH_CLASS}┌┐└┘╭╮╰╯┏┓┗┛╔╗╚╝\\s]{3,}$`, "u");

function isRenderedFooter(text: string, menu: MenuModel): boolean {
  const hints = parseKeyHintFooter(text);
  // Keep unsupported hints visible. Only hide the footer when every segment has a native action.
  if (hints.length > 0 && text.split(/\s+·\s+/).length === hints.length && hints.length === menu.actions.length) {
    return hints.every((hint, index) => hint.label === menu.actions[index]?.label &&
      hint.keys.join("\n") === menu.actions[index]?.keys.join("\n"));
  }
  return text === "Press enter to confirm or esc to go back" &&
    menu.actions.some((action) => action.label === "Confirm" && action.keys.join() === "Enter") &&
    menu.actions.some((action) => action.label === "Go back" && action.keys.join() === "Escape");
}

/** Display structure only: static rows cannot infer a key recipe from numbering or a cursor. */
export function NativeMenuContent({ menu, lines }: { menu: MenuModel; lines: StyledLine[] }) {
  const text = lines.map((line) => line.segments.map((segment) => segment.text).join("").trimEnd());
  while (text.length && (!text[0]?.trim() || OUTER_RULE.test(text[0]!))) text.shift();
  while (text.length && (!text.at(-1)?.trim() || OUTER_RULE.test(text.at(-1)!))) text.pop();
  if (text[0]?.trim() === menu.title) text.shift();
  if (text.length && isRenderedFooter(text.at(-1)!.trim(), menu)) text.pop();
  const rows = text.filter((line) => line.trim()).filter((line) => {
    const arrow = MENU_ARROW_ROW.exec(line);
    return !arrow || !menu.nav.leftRight || arrow[1]?.trim() !== menu.nav.leftRight.label || arrow[2]?.trim() !== menu.nav.leftRight.verb;
  });

  return (
    <div className="max-h-[min(24rem,45dvh)] space-y-1 overflow-y-auto break-words text-xs leading-relaxed">
      {rows.map((line, index) => {
        // Strip paired Unicode box sides, leaving all subject/command text between them intact.
        const content = line.replace(/^\s*[│┃║]\s?(.*?)\s?[│┃║]$/u, "$1");
        const option = /^\s*([❯›])?\s*(?:(\d+)\.\s+)?(.+)$/u.exec(content);
        if (option && (option[1] || option[2])) {
          const selected = Boolean(option[1]);
          const [label = "", ...description] = option[3]!.split(/\s{2,}/);
          return (
            <div key={index} className={`flex min-h-11 items-start gap-2 rounded-md px-2.5 py-2 ${selected ? "bg-accent text-accent-foreground" : "bg-muted/30"}`}>
              {selected ? <ChevronRight className="mt-0.5 size-3.5 shrink-0" aria-label="Highlighted" /> : <span className="w-3.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{option[2] && <span className="mr-1.5 text-muted-foreground">{option[2]}.</span>}{label}</p>
                {description.length > 0 && <p className="mt-0.5 text-muted-foreground">{description.join(" ")}</p>}
              </div>
            </div>
          );
        }
        return <p key={index} className="whitespace-pre-wrap px-2.5 py-1 text-muted-foreground">{content}</p>;
      })}
    </div>
  );
}
