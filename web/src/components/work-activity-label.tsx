import { useEffect, useRef } from "react";
import { isLocked, useLocked } from "@/lib/idle";
import { formatWorkDuration } from "@/lib/work-timeline";

/** Only this text node ticks; the transcript never re-renders for the elapsed label. */
export function WorkActivityLabel({ startedAt, thinking = false }: { startedAt?: string; thinking?: boolean }) {
  const text = useRef<HTMLSpanElement>(null);
  const locked = useLocked();
  const start = startedAt ? Date.parse(startedAt) : NaN;
  const label = () => `${thinking ? "Thinking" : "Working"}${Number.isFinite(start) && start <= Date.now() ? ` for ${formatWorkDuration(Date.now() - start)}` : "…"}`;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => { if (text.current) text.current.textContent = label(); };
    const sync = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (document.hidden || isLocked()) return;
      update();
      if (Number.isFinite(start)) timer = setInterval(update, 1000);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => { if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", sync); };
  }, [startedAt, thinking, locked]);
  return <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
    <span aria-hidden="true" className="flex items-center gap-0.5 motion-safe:animate-pulse"><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /></span>
    <span ref={text} className="tabular-nums">{label()}</span>
  </span>;
}
