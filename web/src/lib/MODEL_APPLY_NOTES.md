# Model settings verification — 2026-09-12

Probed from a 390 × 844 browser against separate panes in the isolated Herdr session
`collie-model-confirm-qa`. The terminal versions were Claude Code 2.1.269 and Codex 0.154.0.
No agent prompts were submitted and no user work pane was controlled.

- Claude's Fable 5.1 description wraps onto a second line at the test terminal width. Requiring
  consecutive physical rows rejected that otherwise valid model menu. The two new Claude
  fixtures preserve its ANSI output and crop unrelated terminal history.
- Moving from Sonnet to Haiku removes the effort arrows; moving back restores them. The previous
  identity comparison rejected this expected change after moving the highlight, before sending
  the session confirmation. Both captured transitions now have regression tests.
- The browser applied Haiku with `s`, then selected Sonnet and applied with `s`. The terminal
  reported each model change for the session. Changing effort from High to Medium and applying
  with `s` was verified by reopening the native picker and observing Medium.
- Codex requires its model selection followed by the reasoning confirmation. The browser
  selected gpt-5.6-sol / High and then gpt-6-astra / Extra high; the terminal reported each change
  and displayed the resulting model/effort in its live status row. The latter restored the
  model/effort observed when the test terminal started.
- Claude's settings.json was byte-identical across the session model and effort changes. Do not
  infer Codex default persistence from a key acknowledgement: its native picker owns that policy.
- A delayed-repaint integration test holds the old reasoning screen after each acknowledged key
  write. The next button stays disabled until fresh controls arrive, and completion is reported
  only after the recognized input composer returns. Closing a confirmed picker sends no Escape.

Wrapped text must align exactly with the preceding row's description column. Unnumbered choices,
blank gaps, hidden selection markers, changed footer actions, unknown dialogs and ambiguous model
labels remain refused. Every write retains the existing signature and prompt-binding guards.
