import { useState } from "react";
import { Link, useNavigate, useRouteLoaderData } from "react-router";
import { ArrowUpRight, Folder, Plus } from "lucide-react";

import { AgentIcon } from "@/components/agent-icon";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { SpaceOverview } from "@/components/space-overview";
import { NewSpaceSheet } from "@/components/new-space-sheet";
import { openForCount, useDashPrefs } from "@/hooks/use-dash-prefs";
import { useSpaceActions } from "@/hooks/use-spaces";
import { ROOT_ROUTE_ID, type HomeData } from "@/lib/loaders";
import { panePath, spacePath } from "@/lib/nav";
import { triage } from "@/lib/triage";
import { isReadOnly, paneDisplayName, STATUS_LABEL } from "@/lib/types";

// T3's index route centers the next useful action. Existing Nenu sessions are opened explicitly;
// creating a workspace uses the established shell flow, without claiming to have started an agent.
export function HomeRoute() {
  const data = useRouteLoaderData(ROOT_ROUTE_ID) as HomeData;
  const navigate = useNavigate();
  const { newSpace } = useSpaceActions();
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { prefs, setSpacesOpen } = useDashPrefs();
  const ordered = triage(data.agents).flatMap((section) => section.agents);
  const visible = showAll ? ordered : ordered.slice(0, 8);
  const canCreate = !isReadOnly(data.device) && !data.error && data.bridge === "connected";
  const spacesOpen = openForCount(prefs.spacesOpen, data.workspaces.length);

  return <div className="workbench-home flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border px-5 text-xs text-muted-foreground">
      <span className="font-medium">Overview</span>
      <span>{data.workspaces.length} {data.workspaces.length === 1 ? "project" : "projects"}</span>
    </header>
    <ReadOnlyBanner device={data.device} />
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-10">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">What should we work on?</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {data.error ? "Showing your last workspace snapshot. Reconnect to see current activity."
              : data.bridge !== "connected" ? "Waiting for your workspaces to connect."
              : ordered.length ? "Continue a thread or open a project."
              : data.workspaces.length ? "Open a project to start or resume an agent."
              : "Create a workspace to start your first thread."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" disabled={!canCreate} onClick={() => setNewSpaceOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Plus aria-hidden="true" className="size-3.5" />New workspace
            </button>
            {data.workspaces.length > 0 && <label className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border border-border px-3 text-xs text-muted-foreground">
              <Folder aria-hidden="true" className="size-3.5 shrink-0" />
              <select aria-label="Open project" value="" onChange={(event) => { if (event.target.value) navigate(spacePath(event.target.value, data.session)); }} className="h-10 min-w-0 max-w-64 bg-background py-2 pr-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="" disabled>Open project…</option>
                {data.workspaces.map((space) => <option key={space.workspaceId} value={space.workspaceId}>{space.label || `Workspace ${space.number}`}</option>)}
              </select>
            </label>}
          </div>
        </div>

        {ordered.length > 0 && <section aria-label="Threads">
          <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground"><h2 className="font-medium">Your threads</h2><span>{ordered.length}</span></div>
          <div className="space-y-0.5">
            {visible.map((agent) => <Link key={agent.paneId} to={panePath(agent.paneId, data.session)} className="group flex min-h-16 min-w-0 items-center gap-3 rounded-md px-2 py-2.5 hover:bg-accent/40">
              <AgentIcon agent={agent.agent} className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{agent.paneLabel || agent.sessionName || agent.tabLabel || agent.terminalTitle || paneDisplayName(agent)}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{agent.workspaceLabel} · {agent.agent}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"><span className="workbench-status-dot" data-status={agent.status} aria-hidden="true" />{STATUS_LABEL[agent.status]}</span>
              <ArrowUpRight aria-hidden="true" className="hidden size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 sm:block" />
            </Link>)}
          </div>
          {ordered.length > 8 && <button type="button" className="mt-2 min-h-11 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer threads" : `Show all ${ordered.length} threads`}</button>}
        </section>}

        <SpaceOverview
          workspaces={data.workspaces}
          tabs={data.tabs}
          agents={data.agents}
          shellPanes={data.shellPanes}
          onOpen={(workspaceId) => navigate(spacePath(workspaceId, data.session))}
          onOpenPane={(paneId) => navigate(panePath(paneId, data.session))}
          onNewSpace={() => setNewSpaceOpen(true)}
          open={spacesOpen}
          onOpenChange={setSpacesOpen}
        />
      </div>
    </main>
    <NewSpaceSheet open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} onCreate={newSpace} />
  </div>;
}
