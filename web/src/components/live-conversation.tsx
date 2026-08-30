import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, TerminalSquare } from "lucide-react";

import {
  ChatMessageList,
  type ChatMessageListHandle,
} from "@/components/ui/chat/chat-message-list";
import { TranscriptView } from "@/components/transcript-view";
import { fetchHistory, RECENT_HISTORY_LIMIT } from "@/lib/api";
import type { AgentStatus, PaneHistoryResponse } from "@/lib/types";

interface LiveConversationProps {
  paneId: string;
  session?: string;
  agent?: string;
  status?: AgentStatus;
  revision: number;
  refreshToken: number;
  initialResponse?: PaneHistoryResponse;
  onOpenTerminal: () => void;
}

// The recent tail is the hot path. A measured 1037-entry Codex session was 700 KB over gzip, while
// its newest 25 entries were 6 KB. Older pages remain available on demand without taxing every poll.
export const OLDER_HISTORY_PAGE_SIZE = 50;

function mergeLatest(
  current: PaneHistoryResponse | null,
  latest: PaneHistoryResponse,
): PaneHistoryResponse {
  if (!latest.available || !current?.available) return latest;
  const latestIds = new Set(latest.entries.map((entry) => entry.uuid));
  const older = current.entries.filter((entry) => !latestIds.has(entry.uuid));
  return {
    ...latest,
    entries: [...older, ...latest.entries],
    // Loading the latest tail says nothing about whether the user's oldest loaded page has a
    // predecessor. Preserve that pagination boundary until an older-page request advances it.
    hasMore: current.hasMore,
  };
}

function prependOlder(
  current: PaneHistoryResponse | null,
  older: PaneHistoryResponse,
): PaneHistoryResponse {
  if (!older.available || !current?.available) return current ?? older;
  const currentIds = new Set(current.entries.map((entry) => entry.uuid));
  return {
    ...current,
    entries: [...older.entries.filter((entry) => !currentIds.has(entry.uuid)), ...current.entries],
    hasMore: older.hasMore,
    total: Math.max(current.total, older.total),
    fileTruncated: current.fileTruncated || older.fileTruncated,
  };
}

/** Live, UI-first projection of the harness journal. The terminal stays the transport and fallback. */
export function LiveConversation({
  paneId,
  session,
  agent,
  status,
  revision,
  refreshToken,
  initialResponse,
  onOpenTerminal,
}: LiveConversationProps) {
  const [response, setResponse] = useState<PaneHistoryResponse | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<ChatMessageListHandle>(null);
  const requestLatestRef = useRef<() => void>(() => {});
  const olderControllerRef = useRef<AbortController | null>(null);
  const lastRevision = useRef(revision);
  const lastRefreshToken = useRef(refreshToken);

  // One long-lived loader per pane. Revisions can arrive faster than a 13,000 km request completes,
  // so they queue one follow-up instead of aborting and restarting the request every 1.5 seconds.
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let running = false;
    let queued = false;

    const loadLatest = async () => {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      do {
        queued = false;
        setError(false);
        try {
          const latest = await fetchHistory(
            paneId,
            { limit: RECENT_HISTORY_LIMIT },
            session,
            controller.signal,
          );
          if (!disposed) setResponse((current) => mergeLatest(current, latest));
        } catch (cause: unknown) {
          if (cause instanceof DOMException && cause.name === "AbortError") break;
          if (!disposed) setError(true);
        }
      } while (queued && !disposed);
      running = false;
    };

    requestLatestRef.current = () => void loadLatest();
    lastRevision.current = revision;
    lastRefreshToken.current = refreshToken;
    setResponse(retry === 0 ? (initialResponse ?? null) : null);
    setError(false);
    // Navigation prefetches this tail in parallel with the terminal pane. If that prefetch failed,
    // fall back to the same loader here. Retry always performs a fresh request.
    if (retry > 0 || initialResponse === undefined) void loadLatest();
    return () => {
      disposed = true;
      controller.abort();
      olderControllerRef.current?.abort();
      requestLatestRef.current = () => {};
    };
    // revision and refreshToken are handled by the coalescing effect below. Adding them here would
    // restore the abort loop this effect is designed to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, session, retry]);

  useEffect(() => {
    if (lastRevision.current === revision && lastRefreshToken.current === refreshToken) return;
    lastRevision.current = revision;
    lastRefreshToken.current = refreshToken;
    requestLatestRef.current();
  }, [revision, refreshToken]);

  const loadOlder = async () => {
    if (!response?.available || response.entries.length === 0 || loadingOlder) return;
    const controller = new AbortController();
    olderControllerRef.current = controller;
    const scroll = listRef.current?.getScrollElement();
    const heightBefore = scroll?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const older = await fetchHistory(
        paneId,
        { limit: OLDER_HISTORY_PAGE_SIZE, before: response.entries[0]!.uuid },
        session,
        controller.signal,
      );
      setResponse((current) => prependOlder(current, older));
      // Keep the first previously-visible message under the user's finger after prepending rows.
      requestAnimationFrame(() => {
        const element = listRef.current?.getScrollElement();
        if (element) element.scrollTop += element.scrollHeight - heightBefore;
      });
    } catch (cause: unknown) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(true);
    } finally {
      if (olderControllerRef.current === controller) olderControllerRef.current = null;
      setLoadingOlder(false);
    }
  };

  const dep = useMemo(() => {
    if (!response?.available) return "empty";
    const last = response.entries.at(-1);
    return `${response.entries.length}:${last?.uuid ?? ""}:${status ?? "unknown"}`;
  }, [response, status]);

  const agentLabel = agent ? `${agent.charAt(0).toUpperCase()}${agent.slice(1)}` : "Agent";

  if (error && response === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">The conversation could not be loaded.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
          <button
            type="button"
            onClick={onOpenTerminal}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <TerminalSquare className="size-4" />
            Open terminal
          </button>
        </div>
      </div>
    );
  }

  if (response === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading conversation…
      </div>
    );
  }

  if (!response.available || response.entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-11 items-center justify-center rounded-full border bg-muted/40">
          <TerminalSquare className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">No conversation yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Collie will show messages, tool activity, code and images here as the agent works.</p>
        </div>
        <button type="button" onClick={onOpenTerminal} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium">
          <TerminalSquare className="size-4" />
          Open terminal
        </button>
      </div>
    );
  }

  return (
    <ChatMessageList ref={listRef} dep={dep} className="px-3 py-5 sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
        {response.hasMore && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium disabled:opacity-60"
            >
              {loadingOlder && <Loader2 className="size-4 animate-spin" />}
              Load older messages
            </button>
          </div>
        )}
        {response.fileTruncated && (
          <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            The oldest part of this large session is outside the readable journal window.
          </p>
        )}
        <TranscriptView entries={response.entries} agent={agent} />
        {status === "working" && (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 flex min-h-10 items-center gap-2 px-1 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            <span>{agentLabel} is thinking…</span>
          </div>
        )}
      </div>
    </ChatMessageList>
  );
}
