import { ChevronDown, Cpu, Gauge } from "lucide-react";
import { WorkbenchContextMeter } from "@/components/workbench-context-meter";
import type { SessionTelemetry } from "@/lib/types";

interface Props {
  telemetry?: SessionTelemetry;
  stale?: boolean;
  modelAvailable: boolean;
  disabled: boolean;
  onChooseModel: () => void;
  onCompact?: () => void;
}

function tokens(value: number | undefined): string {
  return value === undefined ? "Not reported" : value.toLocaleString();
}

export function WorkbenchTelemetry({ telemetry, stale, modelAvailable, disabled, onChooseModel, onCompact }: Props) {
  const context = telemetry?.context;
  return (
    <div className="workbench-telemetry flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
      <button
        type="button"
        className="flex min-h-11 max-w-full items-center gap-2 rounded-md px-2 text-foreground hover:bg-accent disabled:opacity-50"
        disabled={disabled || !modelAvailable}
        onClick={onChooseModel}
        aria-label="Choose model"
        title={modelAvailable ? "Open the agent's model picker" : "This agent does not expose a model picker"}
      >
        <Cpu className="size-3.5 shrink-0" />
        <span className="truncate">{telemetry?.model ?? "Model not reported"}</span>
        {telemetry?.effort && <span className="text-muted-foreground">{telemetry.effort}</span>}
        <ChevronDown className="size-3 shrink-0" />
      </button>
      <WorkbenchContextMeter usedTokens={context?.usedTokens ?? null} maxTokens={context?.windowTokens ?? null}
        onCompact={onCompact} compactDisabled={disabled} />
      <details className="group relative min-w-0">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-2 hover:bg-accent">
          <Gauge className="size-3.5" />
          <span>Usage{stale ? " · stale" : ""}</span>
        </summary>
        <div className="fixed inset-x-4 bottom-32 z-20 mx-auto mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0">
          <p className="mb-3 font-medium">Last reported usage</p>
          {stale && <p className="mb-2 text-status-blocked">Refreshing failed. These values may be out of date.</p>}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <dt>Input tokens</dt><dd className="text-right tabular-nums">{tokens(telemetry?.tokens?.input)}</dd>
            <dt>Output tokens</dt><dd className="text-right tabular-nums">{tokens(telemetry?.tokens?.output)}</dd>
            <dt>Cached input</dt><dd className="text-right tabular-nums">{tokens(telemetry?.tokens?.cachedInput)}</dd>
            <dt>Total tokens</dt><dd className="text-right tabular-nums">{tokens(telemetry?.tokens?.total)}</dd>
            <dt>Scope</dt><dd className="text-right">{telemetry?.tokens?.scope === "session" ? "Session" : telemetry?.tokens ? "Last message" : "Not reported"}</dd>
            <dt>Context used</dt><dd className="text-right tabular-nums">{tokens(context?.usedTokens)}</dd>
            <dt>Context window</dt><dd className="text-right tabular-nums">{tokens(context?.windowTokens)}</dd>
          </dl>
          <div className="mt-3 border-t border-border pt-3">
            {telemetry?.rateLimits?.length ? telemetry.rateLimits.map((limit) => (
              <div key={limit.name} className="mb-2">
                <div className="flex justify-between gap-2"><span>{limit.windowMinutes ? `${limit.windowMinutes / 60}h window` : limit.name}</span><span>{limit.usedPercent}% used</span></div>
                <progress aria-label={`${limit.name} rate limit used`} className="h-1 w-full" max={100} value={limit.usedPercent} />
                {limit.resetsAt !== undefined && <p className="mt-1 text-muted-foreground">Resets {new Date(limit.resetsAt * 1000).toLocaleString()}</p>}
              </div>
            )) : <p>Account limits not reported by this agent.</p>}
          </div>
          {telemetry?.observedAt && <p className="mt-2 text-muted-foreground">Reported {new Date(telemetry.observedAt).toLocaleString()}</p>}
          {telemetry?.fileTruncated && <p className="mt-2 text-status-blocked">Only the tail of this session log is available.</p>}
        </div>
      </details>
      <span className="ml-auto tabular-nums">{telemetry?.tokens?.total !== undefined ? `${tokens(telemetry.tokens.total)} tokens` : "Tokens not reported"}</span>
    </div>
  );
}
