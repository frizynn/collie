import { useState } from "react";
import { BottomSheet } from "@/components/ui/sheet";

// Adapted from T3 Code ContextWindowMeter.tsx and contextWindow.ts at 191a4ef.
// MIT, Copyright (c) 2026 T3 Tools Inc. See THIRD_PARTY_NOTICES.md.
export function formatContextTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return "Unknown";
  if (value < 1_000) return `${Math.round(value)}`;
  if (value < 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

export function WorkbenchContextMeter({ usedTokens, maxTokens, totalProcessedTokens = null }: {
  usedTokens: number | null;
  maxTokens: number | null;
  totalProcessedTokens?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const used = usedTokens !== null && Number.isFinite(usedTokens) && usedTokens >= 0 ? usedTokens : null;
  const max = maxTokens !== null && Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : null;
  const percentage = used !== null && max !== null ? Math.min(100, (used / max) * 100) : null;
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - ((percentage ?? 0) / 100) * circumference;
  const label = percentage === null ? `Context usage: ${formatContextTokens(used)}` : `Context window ${Math.round(percentage)}% used`;
  const usageColor = percentage !== null && percentage > 90 ? "var(--destructive)" : "var(--muted-foreground)";

  return <>
    <button type="button" className="workbench-context-trigger" aria-label={label} title={label} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" width="22" height="22" className="-rotate-90" aria-hidden="true">
        <circle cx="12" cy="12" r={radius} fill="none" stroke="color-mix(in oklab, var(--muted-foreground) 24%, transparent)" strokeWidth="3" />
        {percentage !== null && <circle cx="12" cy="12" r={radius} fill="none" stroke={usageColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />}
      </svg>
      <span>{percentage === null ? "Context" : `${Math.round(percentage)}%`}</span>
    </button>
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Context window">
      <div className="space-y-3 text-sm">
        <div className="flex justify-between gap-4"><span>Tokens used</span><span className="tabular-nums">{formatContextTokens(used)} / {formatContextTokens(max)}</span></div>
        {percentage !== null && <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Context window usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)}><div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: usageColor }} /></div>}
        {totalProcessedTokens !== null && <div className="flex justify-between gap-4 text-muted-foreground"><span>Total processed</span><span>{formatContextTokens(totalProcessedTokens)}</span></div>}
        {percentage === null && <p className="text-xs text-muted-foreground">This agent has not reported a complete context measurement.</p>}
      </div>
    </BottomSheet>
  </>;
}
