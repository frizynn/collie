import { useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Loader2, MessageSquare } from "lucide-react";

import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import { TranscriptView } from "@/components/transcript-view";
import { historyPath } from "@/lib/nav";
import type { PaneHistoryResponse } from "@/lib/types";

interface LiveConversationProps {
  paneId: string;
  session?: string;
  agent?: string;
  history: PaneHistoryResponse | null;
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
}

const UNAVAILABLE_COPY = {
  disabled: "Conversation history is disabled on this bridge.",
  "no-session": "This pane has no conversation session yet.",
  "no-log": "Waiting for the first conversation entry…",
};

/** Journal prose and tool calls, rendered through the existing safe transcript renderer. */
export function LiveConversation({
  paneId,
  session,
  agent,
  history,
  loading,
  error,
  onRetry,
}: LiveConversationProps) {
  const scope = JSON.stringify([paneId, session]);
  // A rolling window drops its oldest entries as new turns arrive. Hold the displayed window while
  // reading upward so a background poll cannot remove the turn under the reader's eyes.
  const [frozen, setFrozen] = useState<{ scope: string; history: PaneHistoryResponse | null } | null>(null);
  const shown = frozen?.scope === scope ? frozen.history : history;
  const entries = shown?.available ? shown.entries : [];
  let emptyCopy = "Waiting for the first conversation entry…";
  if (loading) emptyCopy = "Loading conversation…";
  else if (shown && !shown.available) emptyCopy = UNAVAILABLE_COPY[shown.reason];
  else if (error) emptyCopy = "Use Terminal to inspect the live pane.";
  return (
    <section aria-label="Live conversation" className="flex h-full min-h-0 min-w-0 flex-col">
      {error && (
        <div role="status" className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
          <span>{entries.length ? "Conversation refresh failed. Showing the last update." : "Couldn't load the conversation."}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-md px-3 font-medium hover:bg-muted">
              Retry
            </button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ChatMessageList
          key={scope}
          dep={entries}
          onAtBottomChange={(atBottom) => setFrozen(atBottom ? null : { scope, history: shown })}
          className="px-4 py-6 sm:px-8"
        >
          <div className="mx-auto w-full max-w-3xl">
            {entries.length > 0 ? (
              <>
                {shown?.available && (shown.hasMore || shown.fileTruncated) && (
                  <div className="mb-6 text-center">
                    <Link to={historyPath(paneId, session)} className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      Open full history <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                )}
                <TranscriptView entries={entries} agent={agent} />
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 px-4 py-16 text-center text-sm text-muted-foreground">
                {loading ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" /> : <MessageSquare className="size-5" />}
                <p>{emptyCopy}</p>
              </div>
            )}
          </div>
        </ChatMessageList>
      </div>
    </section>
  );
}
