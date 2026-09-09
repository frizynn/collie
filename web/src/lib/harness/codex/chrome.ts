// Codex's chrome is boxless: a `› ` prompt row (wrapping onto two-space-indented continuation
// rows) with the dot-separated status row directly beneath, sitting at the buffer tail. The
// dialogs (trust / approval / ask) REPLACE that pair entirely — their own footer becomes the
// tail — so locating the composer is also the composer-vs-modal discriminator. A submitted
// message echoes into the transcript with the same `› ` prefix, which is why the walk anchors
// on the STATUS row at the tail and only then looks up for the prompt row: an echo higher in
// the transcript never has the status row directly beneath it. Pure; no pane access.

import type { StyledLine } from "../../blocks";
import {
  isBlank,
  isStatusRow,
  lastNonBlankIndex,
  lineText,
  PLACEHOLDER,
  promptText,
  rstrip,
  skipBlanksUp,
} from "./markers";

export interface ComposerBox {
  /** The `› ` prompt row. */
  promptRow: number;
  /** The status or exact-command autocomplete row at the tail. */
  statusRow: number;
  /** A verified command suggestion replaces status while the slash command is being typed. */
  autocomplete?: true;
}

// A draft wraps onto indented continuation rows between the prompt row and the status row.
// Captured drafts show one; the bound is slack for longer phone-typed messages. 8 stranded a
// wrap (locateComposer returned null and the app reported a dialog). Same 100 as omp/Grok/
// Claude. A run deeper than this is not a composer (fail closed — locateComposer returns null).
const MAX_DRAFT_ROWS = 100;

// A continuation row is the composer's TWO-SPACE GUTTER followed by the draft's own text — and
// that text may ITSELF begin with spaces. Type two spaces mid-sentence, or let a soft wrap land
// inside a run of them, and Codex paints a four-space-indented row that is a perfectly healthy
// continuation. The old `/^ {2}\S/` demanded a non-space at column 2, read that row as foreign,
// and made `locateComposer` return null — which refused EVERY send in the pane with "the input
// box isn't on screen — a menu or dialog is probably up" for as long as the draft sat there. That
// is a DEADLOCK, not a transient: the refusal is itself what keeps the draft from being sent, so
// the pane never recovers on its own. Only the gutter is asserted here, because only the gutter is
// the renderer's; what the walk actually bounds the run with is the blank row above it (`isBlank`,
// checked first in the same test), and Codex separates every section of a screen with one. A `› `
// or `• ` row still starts at column 0, so neither can pass as a continuation.
const CONTINUATION = /^ {2}\s*\S/;
const PROMPT_PREFIX = "› ";

// Codex 0.153.4 replaces its statusline with this ONE suggestion after a complete slash command.
// Enter executes that exact command. Partial/multiple suggestions and skill insertion pickers do
// not establish that meaning, so they stay refused. See SLASH_NOTES.md and the captured fixtures.
const COMMAND_SUGGESTION = /^ {2}(\/[a-z][a-z0-9_-]*) {2,}\S.{0,250}$/;

function locateCommandAutocomplete(lines: StyledLine[], texts: string[], tail: number): ComposerBox | null {
  const command = COMMAND_SUGGESTION.exec(texts[tail] ?? "")?.[1];
  if (!command) return null;
  const promptRow = skipBlanksUp(texts, tail - 1);
  // One or two blank rows separate the command from its suggestion in the observed renderer.
  if (promptRow < 0 || promptRow === tail - 1 || promptText(texts[promptRow]!) !== command) return null;
  if (promptRow > 0 && !isBlank(texts[promptRow - 1]!)) return null;
  // The live composer marker is bold. A plain-text transcript lookalike must not claim a composer.
  const marker = lines[promptRow]!.segments.find((segment) => segment.text.length > 0);
  if (!marker?.text.startsWith("›") || marker.bold !== true) return null;
  return { promptRow, statusRow: tail, autocomplete: true };
}

/** The exact placeholder text is still a valid thing an operator might deliberately type. Codex
 * distinguishes its empty hint by painting the whole body dim, so extraction should use that
 * renderer evidence too instead of discarding an ordinary non-dim draft with those words. */
function isEmptyPlaceholder(line: StyledLine): boolean {
  const text = rstrip(lineText(line));
  if (promptText(text) !== PLACEHOLDER) return false;

  const bodyStart = PROMPT_PREFIX.length;
  const bodyEnd = bodyStart + PLACEHOLDER.length;
  let offset = 0;
  let sawBody = false;
  for (const segment of line.segments) {
    const next = offset + segment.text.length;
    if (Math.max(offset, bodyStart) < Math.min(next, bodyEnd)) {
      sawBody = true;
      if (segment.dim !== true) return false;
    }
    offset = next;
    if (offset >= bodyEnd) break;
  }
  return sawBody;
}

/** The composer at the buffer tail, or null (a dialog owns the screen, or the frame is torn). */
export function locateComposer(lines: StyledLine[]): ComposerBox | null {
  const texts = lines.map((l) => rstrip(lineText(l)));
  const statusRow = lastNonBlankIndex(texts);
  if (statusRow < 0) return null;
  if (!isStatusRow(texts[statusRow]!, lines[statusRow])) {
    return locateCommandAutocomplete(lines, texts, statusRow);
  }

  // One blank row separates the prompt/draft run from the status row. Deliberate paragraph breaks
  // inside a multiline draft are blank too, so the bounded walk must cross them rather than treating
  // them as a dialog. Every non-blank row between the prompt and status still has to be a renderer-
  // owned continuation, which keeps the status anchor fail-closed.
  const top = skipBlanksUp(texts, statusRow - 1);
  if (top < 0) return null;
  for (let i = top; i >= 0 && top - i < MAX_DRAFT_ROWS; i--) {
    const t = texts[i]!;
    if (promptText(t) !== null) return { promptRow: i, statusRow };
    if (isBlank(t)) continue;
    // A foreign-shaped or nested status row means this status row is not under a composer.
    if (!CONTINUATION.test(t) || isStatusRow(t, lines[i])) return null;
  }
  return null;
}

/**
 * Return `lines` with the composer (prompt row through status row) removed from the tail.
 * Unchanged input is the SAME REFERENCE, so callers can treat `result === lines` as "no chrome".
 */
export function stripChrome(lines: StyledLine[]): StyledLine[] {
  const box = locateComposer(lines);
  if (box === null) return lines;
  return lines.slice(0, box.promptRow);
}

/** The status row, styled, for the strip above the phone composer. Empty when no composer. */
export function extractStatusLines(lines: StyledLine[]): StyledLine[] {
  const box = locateComposer(lines);
  if (box === null || box.autocomplete) return [];
  return [lines[box.statusRow]!];
}

/**
 * The user's draft stranded in the composer: the `› ` row's text plus wrapped continuation
 * rows, joined with single spaces (Codex word-wraps — verified against the typed original on
 * the draft-wrapped capture). The placeholder is not a draft. Null = no composer / empty.
 *
 * Load-bearing: registering this adapter switches Codex panes from one-shot send to
 * type-then-verify, and THIS is the verify half.
 */
export function extractInputDraft(lines: StyledLine[]): string | null {
  const box = locateComposer(lines);
  if (box === null) return null;
  const texts = lines.map((l) => rstrip(lineText(l)));
  const first = promptText(texts[box.promptRow]!) ?? "";
  const parts = [first.trim()];
  for (let i = box.promptRow + 1; i < box.statusRow; i++) {
    parts.push(texts[i]!.trim());
  }
  const draft = parts.filter((p) => p !== "").join(" ");
  if (draft === "" || (draft === PLACEHOLDER && isEmptyPlaceholder(lines[box.promptRow]!))) {
    return null;
  }
  return draft;
}

/** Typing reaches the composer only when the composer is on screen — every dialog replaces it. */
export function composerReady(lines: StyledLine[]): boolean {
  return locateComposer(lines) !== null;
}

/** The literal on-screen prompt/draft run a destructive write is bound to. Ending at the last draft
 * continuation keeps a wrapped message inside the bridge's bounded tail window; naming only the
 * first `›` row would permanently 409 once six or more non-blank wrap rows sat beneath it. */
export function composerPrompt(lines: StyledLine[]): string | null {
  const box = locateComposer(lines);
  if (box === null) return null;
  let end = box.statusRow;
  while (end > box.promptRow + 1 && isBlank(lineText(lines[end - 1]!))) end--;
  return lines
    .slice(box.promptRow, end)
    .map((line) => rstrip(lineText(line)))
    .join("\n");
}
