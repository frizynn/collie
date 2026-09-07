import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { clearStatus, pauseStatus, resumeStatus, useStatus, type StatusTone } from "@/lib/status";

const TONE: Record<StatusTone, string> = {
  info: "text-muted-foreground",
  success: "text-status-done",
  warn: "text-status-working",
  error: "text-status-blocked",
};
const ICONS = { info: Info, success: CheckCircle2, warn: AlertTriangle, error: AlertCircle } as const;

/** One app-wide, nonmodal notification surface, styled after T3's top-right toasts. */
export function StatusArea() {
  const status = useStatus();
  const card = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  useEffect(() => {
    hovered.current = card.current?.matches(":hover") ?? false;
    focused.current = card.current?.contains(document.activeElement) ?? false;
    if (!status) return;
    const sync = () => {
      if (document.hidden || hovered.current || focused.current) pauseStatus(status.id);
      else resumeStatus(status.id);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [status]);

  const syncInteraction = () => {
    if (!status) return;
    if (document.hidden || hovered.current || focused.current) pauseStatus(status.id);
    else resumeStatus(status.id);
  };
  const Icon = status ? ICONS[status.tone] : Info;
  return createPortal(
    <section aria-label="Notifications" data-notification-viewport=""
      className="pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)_+_10.25rem)] z-50 w-[calc(100%-2rem)] max-w-90 md:right-[max(2rem,env(safe-area-inset-right))] md:top-[calc(env(safe-area-inset-top)_+_7.5rem)]">
      {status && <div ref={card} key={status.id} role={status.tone === "error" ? "alert" : "status"} aria-atomic="true"
        onMouseEnter={() => { hovered.current = true; syncInteraction(); }}
        onMouseLeave={() => { hovered.current = false; syncInteraction(); }}
        onFocus={() => { focused.current = true; syncInteraction(); }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) { focused.current = false; syncInteraction(); }
        }}
        className="pointer-events-auto relative rounded-lg border border-foreground/10 bg-popover text-popover-foreground shadow-[0_16px_40px_-18px_rgb(0_0_0_/_55%)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
        <div className="flex items-start gap-2.5 py-3 pl-3.5 pr-11">
          <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", TONE[status.tone])} />
          <div className="max-h-[min(16rem,40dvh)] min-w-0 overflow-y-auto overscroll-contain text-sm leading-5 [overflow-wrap:anywhere]">
            <p className="whitespace-pre-wrap font-medium">{status.text}</p>
            {status.description && <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{status.description}</p>}
          </div>
        </div>
        <button type="button" aria-label="Dismiss notification" onClick={() => clearStatus(status.id)}
          className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>}
    </section>, document.body,
  );
}
