import type { AgentStatus, TranscriptEntry } from "./types";

export interface WorkTurn {
  kind: "work";
  id: string;
  entries: TranscriptEntry[];
  activity: TranscriptEntry[];
  answer: TranscriptEntry | null;
  active: boolean;
  settled: boolean;
  interrupted: boolean;
  startedAt?: string;
  durationMs?: number;
}
export type WorkTimelineRow = { kind: "message"; entry: TranscriptEntry } | WorkTurn;
const validTime = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? value : undefined;

export function formatWorkDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Group work without rewriting journal entries or moving user/system content into an agent fold. */
export function buildWorkTimeline(entries: TranscriptEntry[], status?: AgentStatus): WorkTimelineRow[] {
  const rows: WorkTimelineRow[] = [];
  let group: TranscriptEntry[] = [];
  let userBoundary: TranscriptEntry | undefined;
  let systemBoundary = "";
  const usedTurnIds = new Set<string>();
  const lastAssistant = entries.findLast((entry) => entry.role === "assistant");

  function flush(bounded: boolean) {
    if (!group.length) return;
    const original = group;
    group = [];
    const first = original[0]!;
    const last = original.at(-1)!;
    const native = original.findLast((entry) => entry.turn)?.turn;
    const isLatest = last.uuid === lastAssistant?.uuid && !bounded;
    const active = isLatest && status === "working" && native?.status !== "completed" && native?.status !== "aborted";
    const explicitFinal = original.findLast((entry) => entry.phase === "final_answer" && entry.parts.some((part) => part.kind === "text"));
    const settled = !!explicitFinal || native?.status === "completed" || native?.status === "aborted" || (bounded && native?.status !== "running") ||
      (isLatest && native?.status !== "running" && status !== undefined && status !== "working" && status !== "blocked" && status !== "unknown");
    const hasWork = original.some((entry) => entry.phase === "commentary" || entry.parts.some((part) => part.kind !== "text"));
    // Old logs with only unclassified prose do not give us permission to hide earlier answers.
    if (!hasWork) { rows.push(...original.map((entry) => ({ kind: "message" as const, entry }))); return; }
    const terminal = explicitFinal ?? (!active && settled ? original.findLast((entry) =>
      entry.phase !== "commentary" && entry.parts.some((part) => part.kind === "text") && !entry.parts.some((part) => part.kind === "tool"),
    ) : undefined);
    const answer = terminal ? { ...terminal, parts: terminal.parts.filter((part) => part.kind === "text") } : null;
    const activity = original.flatMap((entry) => {
      if (entry !== terminal) return [entry];
      const parts = entry.parts.filter((part) => part.kind !== "text");
      return parts.length ? [{ ...entry, parts }] : [];
    });
    const startedAt = validTime(native?.startedAt) ?? validTime(userBoundary?.ts);
    const end = validTime(native?.completedAt) ?? (settled ? validTime(last.ts) : undefined);
    const measured = typeof native?.durationMs === "number" && Number.isFinite(native.durationMs) && native.durationMs >= 0 ? native.durationMs : undefined;
    const elapsed = startedAt && end ? Date.parse(end) - Date.parse(startedAt) : undefined;
    const durationMs = measured ?? (elapsed !== undefined && elapsed >= 0 ? elapsed : undefined);
    const baseId = first.turnId ?? userBoundary?.uuid ?? `orphan:${first.uuid}`;
    const id = usedTurnIds.has(baseId) ? `${baseId}:after:${systemBoundary || first.uuid}` : baseId;
    usedTurnIds.add(baseId);
    rows.push({ kind: "work", id,
      entries: original, activity, answer, active, settled, interrupted: native?.status === "aborted",
      ...(startedAt ? { startedAt } : {}), ...(durationMs !== undefined ? { durationMs } : {}) });
  }

  for (const entry of entries) {
    if (entry.role !== "assistant") {
      flush(true);
      rows.push({ kind: "message", entry });
      userBoundary = entry.role === "user" ? entry : undefined;
      systemBoundary = entry.uuid;
      continue;
    }
    const before = group.at(-1);
    if (before && (before.phase === "final_answer" || before.turnId !== entry.turnId || (!entry.turnId && before.ts.slice(0, 10) !== entry.ts.slice(0, 10)))) {
      flush(true);
      userBoundary = undefined;
    }
    group.push(entry);
  }
  flush(false);
  return rows;
}
