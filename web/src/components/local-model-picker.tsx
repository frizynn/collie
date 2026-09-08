import { useId, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

interface Props {
  rows: { name: string; description: string }[];
  currentModel?: string;
  disabled?: boolean;
  onApply: (name: string) => Promise<void>;
  onCancel: () => void;
}

// Row presentation adapted from T3 Code ModelListRow.tsx (MIT; THIRD_PARTY_NOTICES.md).
// Choosing a row edits only local state. The parent owns fresh-menu validation and transport.
export function LocalModelPicker({ rows, currentModel, disabled, onApply, onCancel }: Props) {
  const id = useId();
  const [selection, setSelection] = useState<string | undefined>(() =>
    rows.find((row) => row.name === currentModel)?.name ?? rows[0]?.name,
  );
  const selectionRef = useRef(selection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = rows.find((row) => row.name === selection)
    ?? rows.find((row) => row.name === currentModel)
    ?? rows[0];
  const locked = !!disabled || busy;

  function choose(index: number, focus = false) {
    if (locked || inFlight.current || !rows[index]) return;
    // Apply can follow another click before React commits the selected radio.
    selectionRef.current = rows[index].name;
    setSelection(rows[index].name);
    setError(null);
    if (focus) buttons.current[index]?.focus({ preventScroll: true });
  }

  async function apply() {
    const intended = rows.find((row) => row.name === selectionRef.current) ?? selected;
    if (locked || inFlight.current || !intended) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onApply(intended.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply this model. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="local-model-picker min-w-0 text-popover-foreground" aria-busy={busy}>
      <div role="radiogroup" aria-label="Available models" className="max-h-[min(24rem,45dvh)] overflow-y-auto overscroll-contain p-1.5">
        {rows.map((row, index) => (
          <button
            key={row.name}
            ref={(node) => { buttons.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={selected?.name === row.name}
            aria-label={row.name}
            aria-describedby={row.description ? `${id}-description-${index}` : undefined}
            tabIndex={selected?.name === row.name ? 0 : -1}
            disabled={locked}
            onClick={() => choose(index)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % rows.length;
              else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index + rows.length - 1) % rows.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = rows.length - 1;
              else return;
              event.preventDefault();
              choose(next, true);
            }}
            className={`group relative flex min-h-11 w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${selected?.name === row.name ? "bg-foreground/[0.08] text-foreground" : ""}`}
          >
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border" aria-hidden="true">
              {selected?.name === row.name && <span className="size-2 rounded-full bg-foreground" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-medium leading-snug">{row.name}</span>
                {row.name === currentModel && <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">Current</span>}
              </span>
              {row.description && <span id={`${id}-description-${index}`} className="mt-1 block text-xs leading-snug text-muted-foreground">{row.description}</span>}
            </span>
            {selected?.name === row.name && <Check aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
          </button>
        ))}
        {rows.length === 0 && <p className="px-2.5 py-3 text-xs text-muted-foreground">No models available yet.</p>}
      </div>
      {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive [overflow-wrap:anywhere]">{error}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-xs font-medium text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">Cancel</button>
        <button type="button" disabled={locked || !selected} onClick={() => void apply()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {busy && <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />}
          {busy ? "Applying…" : "Use model"}
        </button>
      </div>
    </div>
  );
}
