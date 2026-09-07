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
