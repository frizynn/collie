import { useCallback, useEffect, useRef, useState } from "react";
import { waitForNativeModelMenu } from "@/lib/wait-for-native-model-menu";
import type { PaneReadResponse } from "@/lib/types";

interface Options {
  paneId: string;
  session?: string;
  agent?: string;
  requestedLines: number;
  text: string;
  revision: number;
}

/** Read the picker immediately after its command, without waiting for the ordinary route poll. */
export function useModelMenuSource(options: Options) {
  const scope = JSON.stringify([options.paneId, options.session, options.agent]);
  const latest = useRef(options);
  latest.current = options;
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const route = useRef({ scope, text: options.text, generation: 0 });
  if (route.current.scope !== scope || route.current.text !== options.text) {
    route.current = { scope, text: options.text, generation: route.current.generation + 1 };
  }
  const requestedGeneration = useRef(-1);
  const [observed, setObserved] = useState<{ scope: string; baseText: string; pane: PaneReadResponse } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, [scope]);
  useEffect(() => {
    if (requestedGeneration.current !== route.current.generation) request.current?.abort();
    setObserved((current) => current && (current.scope !== scope || current.baseText !== options.text) ? null : current);
  }, [scope, options.text]);
  useEffect(() => {
    if (!observed) return;
    const timer = setTimeout(() => setObserved((current) => current === observed ? null : current), 2_000);
    return () => clearTimeout(timer);
  }, [observed]);
  const refresh = useCallback(async () => {
    if (!mounted.current || route.current.scope !== scope) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const initial = latest.current;
    const generation = route.current.generation;
    requestedGeneration.current = generation;
    const result = await waitForNativeModelMenu({ ...initial, signal: controller.signal });
    if (controller.signal.aborted || request.current !== controller || route.current.generation !== generation) return;
    if (latest.current.text !== initial.text || latest.current.paneId !== initial.paneId || latest.current.session !== initial.session || latest.current.agent !== initial.agent) return;
    if (result.ok) setObserved({ scope, baseText: initial.text, pane: result.pane });
  }, [scope]);
  const clear = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setObserved(null);
  }, []);
  // A guarded action has already waited for this repaint. Publish its text and revision together
  // so another tap cannot confirm the old highlight while ordinary route polling catches up.
  const isCurrent = useCallback(() => mounted.current && route.current.scope === scope, [scope]);
  const observe = useCallback((pane: PaneReadResponse) => {
    if (!isCurrent() || pane.paneId !== latest.current.paneId) return;
    request.current?.abort();
    request.current = null;
    setObserved({ scope, baseText: latest.current.text, pane });
  }, [scope, isCurrent]);
  // Herdr may report revision=0. Text handoff also works on those versions: any route update
  // supersedes the short-lived read, especially an approval arriving from another client.
  const current = observed?.scope === scope && observed.baseText === options.text ? observed.pane : options;
  return { text: current.text, revision: current.revision, refresh, clear, observe, isCurrent, scope };
}
