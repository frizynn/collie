import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, TerminalSquare } from "lucide-react";

import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import { TranscriptView } from "@/components/transcript-view";
import { fetchHistory } from "@/lib/api";
import type { AgentStatus, PaneHistoryResponse } from "@/lib/types";

interface LiveConversationProps {
  paneId: string;
  session?: string;
  agent?: string;
  status?: AgentStatus;
  revision: number;
  refreshToken: number;
  onOpenTerminal: () => void;
}

/** Live, UI-first projection of the harness journal. The terminal stays the transport and fallback. */
export function LiveConversation({
  paneId,
  session,
  agent,
  status,
  revision,
  refreshToken,
  onOpenTerminal,
}: LiveConversationProps) {
  const [response, setResponse] = useState<PaneHistoryResponse | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetchHistory(paneId, { limit: 5000 }, session, controller.signal)
      .then(setResponse)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(true);
      });
    return () => controller.abort();
  }, [paneId, session, revision, refreshToken, retry]);

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
    <ChatMessageList dep={dep} className="px-3 py-5 sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
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
