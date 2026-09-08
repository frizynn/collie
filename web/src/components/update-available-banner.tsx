import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpCircle, X } from "lucide-react";

import { checkForUpdate } from "@/lib/pwa";
import { useSelfUpdate } from "@/lib/self-update";
import { useServerBuild } from "@/lib/server-build";

// Browser refresh is separate from installing a release. The notice never shifts the conversation;
// dismiss it for this build while automatic refresh waits for safe idle.
export function UpdateAvailableBanner() {
  const show = useSelfUpdate();
  const build = useServerBuild();
  const [dismissed, setDismissed] = useState<string>();
  if (!show || dismissed === build) return null;

  return createPortal(<div role="status"
    className="fixed z-40 flex w-max max-w-[calc(100vw-24px)] items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
    style={{ top: "calc(env(safe-area-inset-top) + 56px)", right: "max(12px, env(safe-area-inset-right))" }}>
    <ArrowUpCircle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    <span>Interface updated</span>
    <button type="button" onClick={() => void checkForUpdate()} className="min-h-11 rounded-md px-2 font-medium hover:bg-muted">Reload</button>
    <button type="button" onClick={() => setDismissed(build)} aria-label="Dismiss update notice" className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"><X aria-hidden="true" className="size-4" /></button>
  </div>, document.body);
}
