import type { BridgeStatus } from "./types";

export interface ConnState {
  /** Herdr link as last reported by the snapshot; undefined before the first successful poll. */
  bridge: BridgeStatus | undefined;
  /** The most recent snapshot fetch failed. */
  error: boolean;
}

// The one predicate for "is the data on screen not yet live" — snapshot error, no first snapshot yet,
// or Herdr disconnected. POLL-TRUTH ONLY: liveness is whether the snapshot
// path is healthy, and it deliberately does NOT consult navigator.onLine. A phone's onLine flag lies
// both ways — it stays true in airplane mode, and after an airplane cycle it can STICK false while the
// network is actually fine — so gating liveness on it galloped a phantom outage forever ("the dog is
// running yet the status says idle") while polls quietly succeeded. Polls always attempt; if they
// land, the data is live regardless of what onLine claims. onLine survives only as COPY selection
// (which not-live cause to name) in the ConnectionBanner — never as a liveness gate. The
// Collie mark gallops while this is true and rests when it's false, identically on every screen, so
// the header keeps this out of the per-poll fetch state. An in-flight request has not failed. Slow-
// load feedback belongs to the busy bar and header mark, not to connection health. Mirrors the
// not-"live" branches of the ConnectionBanner's tone resolver.
export function isConnecting({ bridge, error }: ConnState): boolean {
  return error || bridge === undefined || bridge === "disconnected";
}
