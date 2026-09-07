# Codex command autocomplete — 2026-09-07

Captured from Codex 0.153.4 in the isolated Herdr session `collie-workbench-qa`, using a read-only
sandbox and an empty temporary directory. Fixtures crop away unrelated startup output and replace
the temporary cwd with `/tmp/collie-qa`; ANSI styling and widget rows remain intact.

## Verified behavior

- `sendGuardedReply("/model")` typed the command but returned `stalled`: autocomplete replaced the
  status row, so the adapter lost the input box before verification could submit.
- The resulting tail contains the bold `›` input marker, exactly `/model`, one blank row, and one
  matching `/model  choose what model and reasoning effort to use` suggestion. Enter opens the
  native **Select Model and Effort** dialog.
- Down then Enter opens the selected model's reasoning submenu. Escape twice closes it and keeps
  the original model; no model default was changed by this probe.
- `$build-agents` opens an insertion picker. Its explicit footer says **Press enter to insert or
  esc to close**. This is not a reply submission and remains refused by the reply grammar.
- `$build-agents ` followed by an actual request closes that picker and restores the normal
  composer/status pair. The regular draft extractor verifies the full invocation and request.
- After the correction, the same real `sendGuardedReply("/model")` returned `sent` and opened the
  picker. An ordinary guarded test prompt produced the requested `QA_OK` reply.
- The real `submitMenuKeys` path completed Down → Enter → Enter and the terminal reported
  `Model changed to gpt-5.6-sol low`. Reopening the picker and selecting gpt-6-astra / High restored
  the original model. The global Codex config SHA-256 was byte-identical before and after this
  change-and-restore test. The dedicated test pane was left idle with the picker closed.

## Acceptance boundary

The autocomplete acceptor requires one complete slash command, one exactly matching suggestion,
the observed blank separator, and the live bold prompt marker. Partial commands, multiple
suggestions, plain-text lookalikes, skill insertion, and model/reasoning dialogs remain refused.
The suggestion is chrome, not a statusline or part of the typed draft. No new key grammar is emitted.

The native model and reasoning pickers emit the shared `menu` contract only for the captured titles,
contiguous numbered options with one highlighted row, and the exact confirmation/back footer.
The exposed keys are Enter / Escape and the live-probed Up / Down navigation. No digit actions are
synthesised. Full region signatures (including the highlighted option) protect confirmation from
stale taps; navigating uses the existing shared identity guard.
