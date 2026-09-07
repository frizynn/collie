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
while the agent is working, disconnected, read-only, or awaiting a dialog. Operator-required
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
mirror remains accessible under Live terminal; the full History route remains available.
