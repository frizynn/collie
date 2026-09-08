# Conversation workbench

Nenu presents agent sessions as a native conversation interface while Herdr's terminal pane remains
the source of truth. This document describes the stable product contract and the boundary around the
T3 Code-inspired presentation.

## Goals

- Keep reading and replying comfortable on desktop and phone.
- Render agent conversations, reasoning summaries, tools, prompts, and final responses as distinct
  semantic elements.
- Make model, reasoning, skill, command, context, and usage controls available without leaving the
  conversation.
- Preserve every terminal interaction guard. Native UI must never create a less safe send path.
- Keep idle rendering and menus inexpensive through local metadata, bounded parsing, and lazy assets.

## Rendering model

The bridge exposes pane output and journal-backed history. The client turns known structures into a
timeline:

- operator messages and final agent answers remain visually primary;
- active reasoning has a compact progress treatment;
- completed reasoning and tool activity fold into one expandable work summary;
- repeated tool calls are summarized instead of becoming a wall of cards;
- unknown output remains available through the terminal mirror fallback.

Journal data improves structure but never authorizes terminal input. Live sends still use the current
pane, prompt binding, and the existing guarded keystroke choreography.

## Provider-aware controls

Nenu treats agent CLIs as different interfaces:

- **Codex CLI:** `$` opens searchable skills and Codex-specific commands.
- **Claude Code:** `/` opens Claude skills and commands.
- Model and reasoning menus are preloaded from local metadata when available, then reconciled with a
  verified live picker before applying a selection.
- Context and usage show only values reported by the agent. Missing limits are described as unknown;
  Nenu does not invent account data.

Closing a drawer or picker restores the composer immediately. A stale native picker is cancelled
before ordinary text can be sent, preventing replies from landing inside terminal UI.

## Files and documents

File references can open in a contained preview surface:

- Markdown renders as readable document content.
- Images render directly.
- PDFs load PDF.js only when needed, render one page at a time, cancel stale work, and release worker
  resources when closed.

The bridge resolves real paths and rejects anything outside approved project roots. A preview URL is
not a general filesystem endpoint.

## Mobile contract

- One layout owner applies safe-area insets for notches and standalone PWA chrome.
- Opening drawers, pickers, previews, or the keyboard must not shift the page's global scroll.
- The sidebar always has a visible way back after it is collapsed.
- Touch targets remain usable without turning the interface into oversized cards.
- Motion communicates entry, exit, progress, and selection; `prefers-reduced-motion` disables
  nonessential animation.

## Performance contract

- Model and command catalogs are local-first and cached per pane/provider.
- History transfer and React updates are skipped when their revision has not changed.
- Expensive document code is split from the main bundle.
- Elapsed-time updates are isolated from the conversation tree.
- Terminal parsing is bounded and falls back safely when a structure is unknown.

## Attribution boundary

The visual hierarchy, surface palette, conversation grouping, model-row treatment, command
completion behavior, and compact notification style were adapted from MIT-licensed T3 Code. Nenu
retains its own React Router application, Herdr transport, state engine, terminal parsers, and guarded
write path. Exact upstream files and license text are listed in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

The implementation history and validation record from the original port are archived in
[T3-WORKBENCH-IMPLEMENTATION.md](archive/T3-WORKBENCH-IMPLEMENTATION.md). That archive is evidence,
not the current product specification.
