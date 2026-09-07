import { useCallback, useEffect, useRef, useState } from "react";

export type WorkbenchPanel = "model" | "usage" | "context" | null;
interface Options {
  scope: string;
  modelPresent: boolean;
  otherDialogPresent: boolean;
  writable: boolean;
  openModel: () => Promise<boolean>;
  dismissModel: (signal: AbortSignal) => Promise<{ ok: boolean; error?: string }>;
  onError: (message: string) => void;
}

/** One visible inspector; closing models also releases the agent's actual input ownership. */
export function useWorkbenchPanels(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [panel, setPanel] = useState<WorkbenchPanel>(null);
  const panelRef = useRef<WorkbenchPanel>(null);
  const [closing, setClosing] = useState(false);
  const [openingModel, setOpeningModel] = useState(false);
  const opening = useRef<Promise<boolean> | null>(null);
  const cancelling = useRef<Promise<boolean> | null>(null);
  const abort = useRef(new AbortController());
  const version = useRef(0);
  const suppressed = useRef(false);
  const wasModel = useRef(false);

  const show = useCallback((next: WorkbenchPanel) => {
    panelRef.current = next;
    setPanel(next);
  }, []);

  useEffect(() => {
    abort.current = new AbortController();
    opening.current = null;
    cancelling.current = null;
    suppressed.current = false;
    wasModel.current = false;
    setClosing(false);
    setOpeningModel(false);
    show(null);
    return () => { abort.current.abort(); version.current++; };
  }, [options.scope, show]);

  useEffect(() => {
    if (options.otherDialogPresent) show(null);
    else if (options.modelPresent && !suppressed.current) show("model");
    else if (!options.modelPresent && wasModel.current && !opening.current) {
      if (panelRef.current === "model") show(null);
    }
    if (!options.modelPresent && !opening.current && !cancelling.current) suppressed.current = false;
    wasModel.current = options.modelPresent;
  }, [options.scope, options.modelPresent, options.otherDialogPresent, show]);

  const releaseModel = useCallback((): Promise<boolean> => {
    if (cancelling.current) return cancelling.current;
    const signal = abort.current.signal;
    suppressed.current = true;
    setClosing(true);
    const operation = (async () => {
      try {
        if (opening.current) await opening.current;
        if (signal.aborted || !latest.current.writable) return false;
        const result = await latest.current.dismissModel(signal);
        if (signal.aborted) return false;
        if (!result.ok) {
          latest.current.onError(result.error ?? "Couldn't close the model picker. Your draft is safe.");
          suppressed.current = false;
          if (latest.current.modelPresent) show("model");
        }
        return result.ok;
      } catch (error) {
        if (!signal.aborted) {
          suppressed.current = false;
          if (latest.current.modelPresent) show("model");
          latest.current.onError(error instanceof Error ? error.message : "Couldn't close the model picker.");
        }
        return false;
      } finally {
        if (!signal.aborted) setClosing(false);
      }
    })();
    cancelling.current = operation;
    void operation.finally(() => {
      if (cancelling.current === operation) {
        cancelling.current = null;
        if (!latest.current.modelPresent && !opening.current) suppressed.current = false;
      }
    });
    return operation;
  }, [show]);

  const changePanel = useCallback(async (next: WorkbenchPanel) => {
    const request = ++version.current;
    const hadModel = panelRef.current === "model" || latest.current.modelPresent || opening.current || cancelling.current;
    show(null);
    if (hadModel && !(await releaseModel())) return;
    if (request !== version.current || abort.current.signal.aborted) return;
    if (next === "model") {
      if (!latest.current.writable || latest.current.otherDialogPresent) return;
      suppressed.current = false;
      show("model");
      setOpeningModel(true);
      const operation = latest.current.openModel();
      opening.current = operation;
      try {
        const sent = await operation;
        if (!sent && request === version.current) show(null);
      } catch (error) {
        if (request === version.current && !abort.current.signal.aborted) {
          show(null);
          latest.current.onError(error instanceof Error ? error.message : "Couldn't open models.");
        }
      } finally {
        if (opening.current === operation) { opening.current = null; setOpeningModel(false); }
      }
    } else show(next);
  }, [releaseModel, show]);

  const toggleModel = useCallback(() => {
    void changePanel(panelRef.current === "model" ? null : "model");
  }, [changePanel]);

  const prepareSend = useCallback(async () => {
    const request = ++version.current;
    const signal = abort.current.signal;
    const hadModel = panelRef.current === "model" || latest.current.modelPresent || opening.current || cancelling.current;
    show(null);
    if (hadModel) {
      const ready = await releaseModel();
      return ready && !signal.aborted && request === version.current && latest.current.writable && !latest.current.otherDialogPresent;
    }
    if (latest.current.otherDialogPresent) {
      latest.current.onError("An approval or question is waiting. Answer it before sending.");
      return false;
    }
    return !abort.current.signal.aborted && latest.current.writable;
  }, [releaseModel, show]);

  return { panel, closing, openingModel, changePanel, toggleModel, prepareSend };
}
