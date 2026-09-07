import { useCallback, useEffect, useRef, useState } from "react";

import { fetchHistory, isApiErrorStatus } from "@/lib/api";
import { isLocked, useLocked } from "@/lib/idle";
import type { PaneHistoryResponse } from "@/lib/types";

interface LiveConversationOptions {
  paneId: string;
  session?: string;
  enabled: boolean;
  busy?: boolean;
}

interface ConversationState {
  scope: string;
  history: PaneHistoryResponse | null;
  loading: boolean;
  error: boolean;
}

/** A small, newest-anchored journal window; the history route owns older turns. */
export function useLiveConversation({
  paneId,
  session,
  enabled,
  busy = false,
}: LiveConversationOptions) {
  const scope = JSON.stringify([paneId, session ?? null]);
  const [state, setState] = useState<ConversationState>({
    scope,
    history: null,
    loading: false,
    error: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const refreshRef = useRef<() => void>(() => {});
  const locked = useLocked();

  useEffect(() => {
    if (!enabled || !paneId || locked) return;
    let disposed = false;
    const publish = (next: ConversationState) => { stateRef.current = next; setState(next); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;

    const schedule = () => {
      clearTimeout(timer);
      if (!disposed && !document.hidden && !isLocked()) {
        timer = setTimeout(() => void poll(), busyRef.current ? 4_000 : 12_000);
      }
    };

    async function poll() {
      if (disposed || document.hidden || isLocked() || request) return;
      clearTimeout(timer);
      const controller = new AbortController();
      request = controller;
      if (stateRef.current.scope !== scope || !stateRef.current.history) {
        publish({ scope, history: null, loading: true, error: false });
      }
      try {
        const history = await fetchHistory(paneId, { limit: 60 }, session, controller.signal);
        if (!disposed && !controller.signal.aborted) {
          const previous = stateRef.current;
          if (previous.scope !== scope || previous.history !== history || previous.loading || previous.error) {
            publish({ scope, history, loading: false, error: false });
          }
        }
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          const authError = isApiErrorStatus(error, 401) || isApiErrorStatus(error, 403);
          publish({ ...stateRef.current, history: authError ? null : stateRef.current.history, loading: false, error: true });
        }
      } finally {
        if (request === controller) request = undefined;
        if (!disposed) schedule();
      }
    }

    const wake = () => void poll();
    const visibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        request?.abort();
        request = undefined;
      } else {
        wake();
      }
    };
    refreshRef.current = wake;
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", visibility);
    wake();
    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
      refreshRef.current = () => {};
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [paneId, session, scope, enabled, locked]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const current = state.scope === scope && enabled;
  return {
    history: current ? state.history : null,
    loading: current && !locked ? state.loading : false,
    error: current ? state.error : false,
    refresh,
  };
}
