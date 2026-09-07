# Collie Workbench

## Integration audit — 2026-09-07

Source checkouts: `frizynn/collie` at `5fd7a2f3ee429bf9c415dc4255e00b11f19ba59e`
and `frizynn/t3code` at `191a4ef754b2e679f74a49230b34b48e42688349`.
Both are MIT licensed. T3 and its upstream have diverged; this is a selective port,
not a merge between applications.

## Architecture

Keep Collie's Bun bridge, React Router, Herdr sessions, verified composer, identity/device
gates, journal containment, and PWA. Port T3's palette, typography, compact controls and
context meter with attribution. Add a responsive workspace/sidebar shell and make the real
agent conversation the primary pane surface. Keep the live pane reachable for approvals,
model pickers, agent menus, and shell work. No second agent engine or terminal emulator.

The browser reads a bounded live journal window. Long history remains an explicit request.
Polling pauses when hidden or idle-locked, and responses from a previous pane/session cannot
replace the selected conversation. Metrics come from journal events, never fixed model
catalog guesses: Codex cumulative usage and reported context/rate limits; Claude's last
reported message usage. Missing values stay unavailable; clipped logs are disclosed.
Model control uses the harness's real picker through the existing verified send path.

## Acceptance checks

- Desktop workspace navigation and mobile drawer preserve the selected Herdr session.
- Conversation shows actual user/assistant/tool turns; no demo transcript in runtime.
- Read-only, disconnected, hidden, and dialog states cannot bypass send protections.
- Usage distinguishes session totals, last-message usage, context and account limits.
- Existing bridge and web suites, TypeScript checks and production build pass.
- Browser QA checks desktop and narrow viewport, real local snapshot, and PWA assets.
- Private access uses loopback plus Tailscale Serve; never a public listener or Funnel.

## Delivery

Work is checkpointed on `feat/t3-workbench` in the user's fork. Functional checkpoints
follow the repository's fork contribution convention; the release/version decision stays
separate from the implementation. Operation and validation evidence will be appended here.

## Implemented and validated

Functional checkpoints: `cd39049` journal telemetry, `3f4b521` live conversation,
`f307141` T3 source/font port, `15737ab` integrated workbench and guarded model controls.
The shell uses explicit pane/session names, then tab/title fallbacks, to distinguish agents
sharing a project. Model selection opens the actual harness picker; it does not introduce a
second provider catalog or silently change the persisted default. Controls remain unavailable
while disconnected, read-only, or awaiting a dialog; the fresh send guard determines readiness
instead of relying on the delayed working/idle badge. Operator-required
model confirmations continue through the existing Agent command palette.

Verification on macOS:

- Backend: 724 tests passed, plus the sandboxed shell lifecycle suite.
- Frontend: 3,889 tests passed (30 existing TODOs), followed by 45 focused integration tests
  including three new telemetry cases. TypeScript on both sides and production PWA build pass.
- Real journal probe: Claude and Codex parsed successfully. Other harnesses were not installed.
- Real local bridge: connected, nine live agents, journal-derived Codex model/effort/tokens,
  context capacity and account limits returned by the existing history endpoint.
- Browser: production app over private HTTPS, 1440×900 and 390×844 viewports; no horizontal
  overflow, visible composer, mobile workspace drawer and usage details; secure context and
  active service worker. Fonts loaded as DM Sans; T3 JetBrains Mono is used for code.
- Guarded model sends are covered through the real client choreography against MSW. No model
  was changed in the operator's busy live sessions. Physical iPhone/Android Safari/Chrome
  interaction was not exercised; the mobile layout was checked in Chromium emulation.

## Run this checkout on macOS

```sh
bun install --frozen-lockfile
(cd web && bun install --frozen-lockfile)
bun run build
herdr plugin link /absolute/path/to/collie
herdr plugin action invoke start --plugin herdr.collie
herdr plugin action invoke url --plugin herdr.collie
```

Open the reported private HTTPS URL from the Mac or a phone connected to the same tailnet.
Use Safari's Add to Home Screen or Chrome's install action for the PWA. The bridge is supervised
by the `herdr.collie` LaunchAgent and starts at login. Rebuilds update frontend assets; use
`herdr plugin action invoke restart --plugin herdr.collie` after backend changes.

The App Store Tailscale build must be invoked through its real bundle executable; symlinking
that executable can crash its bundle-identity check. A local shell wrapper in `~/.local/bin`
can execute `/Applications/Tailscale.app/Contents/MacOS/Tailscale "$@"`. If launchd's reduced
PATH prevents automatic MagicDNS discovery, set the exact `COLLIE_PUBLIC_HOSTS` hostname in the
plugin's mode-0600 `.env`. Set `COLLIE_TRUSTED_USER` there to the owner's Tailscale login. Neither
machine-specific settings nor transcripts, screenshots, credentials, or built assets belong
in this repository.

Rollback: stop through the plugin action and check out the prior code checkpoint, rebuild,
then start again. No transcript or Herdr workspace migration was introduced. The original
mirror remains an explicit diagnostic option under Display settings > Raw terminal. The primary
agent view keeps conversation, history, controls and composing in one route.


## Native interaction correction (September 7)

The first delivery still switched from the journal to the terminal when a picker appeared.
That exposed a terminal-framed model menu and made history navigation feel disconnected from
composing. The workbench now leaves the conversation mounted and presents verified native
interaction panels above the composer:

- Model/reasoning rows use the live agent catalogue, native selection and explicit apply/cancel
  actions. Row movement uses a full observed-menu signature; it never sends model-number keys
  or implicitly persists a default. Codex slash autocomplete is recognized before verified submit.
- Approval, question, preview and generic menu content is native. Approval subjects retain the
  signed command/diff/reason so hiding terminal output cannot conceal what would be approved.
- `$` in Codex and `/` in Claude open a minimal skill list with actual count and filtering.
  Catalogues are loaded on demand, bounded and scoped to pane/session/project. Choosing a skill
  only inserts into the local draft; keyboard focus and existing surrounding text survive.
- Context details provide an explicit Compact context action using the same guarded command path.
- Older messages and transcript search stay in the live route. Reading position and draft survive
  incoming polling and opening models. Sending a message explicitly returns to the latest turn.
- Temporary disconnection blocks writes but leaves the local draft editable. Toolbar commands
  cannot arm a later forced message send if the agent refuses the command.

Performance evidence: a real 60-entry Claude response previously transferred 54,323 raw bytes
(16,092 gzip bytes) on an unchanged poll. Conditional requests now return 304 with no body and
skip repeated JSON/gzip generation. Ten unchanged polls produced zero hook renders; ten unrelated
parent updates produced zero TranscriptView renders. Changed history still renders. Hidden/locked
clients stop conversation polling. Authentication, source containment, file stat and HTTP request
headers still cost work; this does not establish zero machine consumption or a whole-app 10x gain.
Caches are bounded and memory-only, and concurrent late responses cannot restore history after
an authorization failure or supersede a newer unavailable response.

Browser verification used an isolated Codex QA session: a real prompt answered QA_OK; model and
reasoning changed through guarded actions and were restored with byte-identical global config.
The native browser rows were exercised separately. With a 45-line reply scrolled to the top,
completing a skill and opening models left scrollTop at zero and the draft unchanged. Native
compact completed in that QA session and updated reported context. The user's existing Claude
model picker was inspected without sending it actions: conversation stayed mounted, five native
model rows were visible, and there were zero terminal pre elements. Desktop1440x900 and mobile
390x844 had no horizontal overflow. Actual mobile Safari hardware remains untested.

Final local validation: 3,965 frontend tests passed in the full suite (30 existing TODOs),
then the 12-case live-conversation suite passed with two additional search/history regressions.
The final backend suite passed 741 tests and the shell lifecycle checks. Both TypeScript targets
and the production PWA build passed. Codex's actual `compacted` envelope now renders one native
completion summary; replacement/guardian history remains internal and is never displayed.


## Picker lifecycle and latency correction (September 8)

The stuck overlays had two separate owners: Usage used an uncontrolled details element,
while hiding a model panel did not release the CLI's real input ownership. The workbench now
controls Model, Context and Usage through one panel state. Following T3's controlled
ProviderModelPicker and dismissible Base UI popover behavior, inspectors close on outside
interaction, Escape, their trigger or an explicit close button. They do not trap focus or lock
scroll; entering the composer dismisses the inspector and preserves the caret and draft.
The single shared panel controller is Collie's implementation, not copied T3 state management.

Closing models verifies the live menu, sends only its advertised Escape cancellation, and
verifies the resulting input state. Sending waits for that release; unrelated permissions or
questions cannot be dismissed by this path. Pane/session changes, disconnects, superseding
requests and route changes abort pending work. The fast read also tracks route generations,
because Herdr can return revision zero: an A → permission B → A transition must not resurrect
an old model response. Draft edits made while a send is pending are preserved.

The most recently observed model catalogue is cached in memory for 15 minutes, bounded to eight
pane/session/agent scopes. Cached rows appear immediately but remain disabled until a fresh
menu is verified. No transcript, disk persistence, background prefetch or cache timer is added.
A bounded immediate read after opening removes the wait for the ordinary route poll. Closing
nested menus reads immediately after Escape instead of paying a fixed delay at every level.

In the isolated Codex browser session, one cold opening displayed the panel in 3 ms and enabled
seven actual rows in 687 ms. One warm reopening displayed cached rows in 3 ms and verified them
in 443 ms. These are local samples, not a whole-app speed multiplier. Two-level cancellation
unit timing removed 700 ms of mandatory waiting. Live checks also confirmed Usage/model
exclusion and a real PANEL_OK reply sent after dismissing models through the composer.
Regression tests cover overlay dismissal/focus, shared cancellation, permission preservation,
cache expiry/isolation, stale reads, unmounts and edits during send. Physical mobile Safari and
voice recognition hardware have not been exercised.

Validation for this correction: all 4,039 frontend tests passed (30 existing TODOs), including
33 lifecycle/fast-read race cases. Bridge, frontend and worker TypeScript checks passed.


## Notification surface correction (September 8)

All transient feedback now uses one root-level portal, styled after T3's compact top-right
toast viewport, neutral surface, small tone icon, title/body typography and explicit close.
The full-width in-flow chat status row and route-specific renderers are removed. Collie's
mobile top offset clears its additional navigation rows. Text wraps inside a bounded scroller;
the close button has a 44px target and selecting text does not dismiss an error. Notifications
never take focus or lock scrolling. Persistent connection/update/read-only states keep their
existing dedicated surfaces.

There is still only one bounded notification, with no dependency, event queue or background
polling added. Hover, focus and page visibility pause the remaining lifetime. Stale dismiss
handlers cannot clear a newer notice. Background agent transitions cannot replace a foreground
error, simultaneous transitions are summarized once with input requests prioritized, and a
session switch resets the comparison baseline. Native model opening no longer emits a second
loading toast over the picker.

Validation: 4,057 frontend tests passed (30 existing TODOs); build and TypeScript checks passed.
An isolated real Codex message answered TOAST_OK; the success card left textarea focus intact.
At 390x844 the card was 358px wide with no horizontal overflow, and closing it left conversation
bounds identical. At 1440x900 it was bounded to 360px. Physical mobile Safari remains untested.
