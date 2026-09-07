import { useId, useState } from "react";
import { ChevronRight, TriangleAlert, Wrench } from "lucide-react";
import { splitHighlight } from "@/lib/transcript-search";
import type { TranscriptPart } from "@/lib/types";

type ToolPart = Extract<TranscriptPart, { kind: "tool" }>;
interface Props {
  calls: Array<{ id: string; part: ToolPart; entryId?: string }>;
  query?: string;
  active?: boolean;
  focusedEntryId?: string;
}

function matches(part: ToolPart, query: string) {
  const needle = query.trim().toLowerCase();
  return !!needle && [part.name, part.summary, part.result?.text ?? ""].some((text) => text.toLowerCase().includes(needle));
}

function Highlight({ text, query }: { text: string; query: string }) {
  return <>{splitHighlight(text, query).map((piece, index) => piece.hit
    ? <mark key={index} className="rounded-sm bg-amber-300/70 text-inherit dark:bg-amber-500/40">{piece.text}</mark>
    : <span key={index}>{piece.text}</span>)}</>;
}

function ToolRow({ id, part, entryId, query, active, focused }: { id: string; part: ToolPart; entryId?: string; query: string; active: boolean; focused: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const open = expanded || focused || matches(part, query);
  const status = part.result?.isError ? "Failed" : !part.result ? active ? "Running…" : "No output recorded" : null;
  return (
    <div data-tool={id} data-turn={entryId} className="min-w-0">
      <button
        type="button"
        data-work-toggle
        aria-label={[part.name, part.summary, status, part.result?.truncated ? "Truncated" : null].filter(Boolean).join(" ")}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs leading-5 outline-none hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 md:min-h-7"
      >
        <ChevronRight aria-hidden="true" className={`size-3.5 shrink-0 text-muted-foreground/65 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
        <span className="max-w-[45%] shrink-0 truncate font-medium"><Highlight text={part.name} query={query} /></span>
        {part.summary && <span className="min-w-0 flex-1 truncate text-muted-foreground/65"><Highlight text={part.summary} query={query} /></span>}
        {status && <span className={`shrink-0 text-[11px] ${part.result?.isError ? "text-destructive" : "text-muted-foreground"}`}>{status}</span>}
        {part.result?.truncated && <span className="shrink-0 text-[11px] text-muted-foreground">Truncated</span>}
      </button>
      {open && <div id={contentId} className="min-w-0 space-y-2 px-6 pb-2 text-xs">
        {part.summary && <pre className="min-w-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"><Highlight text={part.summary} query={query} /></pre>}
        {part.result ? <pre className="min-w-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"><Highlight text={part.result.text} query={query} />{part.result.truncated && <span className="text-muted-foreground">{"\n… output truncated"}</span>}</pre>
          : <p className="text-muted-foreground">{active ? "Running…" : "No output recorded"}</p>}
      </div>}
    </div>
  );
}

/** Consecutive tool activity; the parent assigns entry markers only to their first tool part. */
export function WorkLogTools({ calls, query = "", active = false, focusedEntryId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  if (calls.length === 0) return null;
  const open = expanded || calls.some(({ part, entryId }) => matches(part, query) || (!!focusedEntryId && entryId === focusedEntryId));
  const names = [...new Set(calls.map(({ part }) => part.name))];
  const errors = calls.filter(({ part }) => part.result?.isError).length;
  const truncated = calls.filter(({ part }) => part.result?.truncated).length;
  const label = `${calls.length} tool ${calls.length === 1 ? "call" : "calls"} · ${names.slice(0, 3).join(", ")}${names.length > 3 ? `, +${names.length - 3} more` : ""}`;
  return (
    <div className="work-log-tools min-w-0 text-foreground/85">
      <button
        type="button"
        data-work-toggle
        aria-label={[label, errors ? `${errors} ${errors === 1 ? "error" : "errors"}` : null, truncated ? `${truncated} truncated` : null].filter(Boolean).join(", ")}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs leading-5 outline-none hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 md:min-h-7"
      >
        <ChevronRight aria-hidden="true" className={`size-3.5 shrink-0 text-muted-foreground/65 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
        <Wrench aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/65" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{label}</span>
        {!!errors && <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-destructive"><TriangleAlert aria-hidden="true" className="size-3" />{errors} {errors === 1 ? "error" : "errors"}</span>}
        {!!truncated && <span className="shrink-0 text-[11px] text-muted-foreground">{truncated} truncated</span>}
      </button>
      {open && <div id={contentId} className="min-w-0 pl-3">
        {calls.map(({ id, part, entryId }) => <ToolRow key={id} id={id} part={part} entryId={entryId} query={query} active={active} focused={!!focusedEntryId && entryId === focusedEntryId} />)}
      </div>}
    </div>
  );
}
