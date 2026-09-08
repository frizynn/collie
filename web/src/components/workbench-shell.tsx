import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Folder, House, PanelLeft, Search, Settings, Terminal } from "lucide-react";

import { SessionSwitcher } from "@/components/session-switcher";
import { BottomSheet } from "@/components/ui/sheet";
import type { HomeData } from "@/lib/loaders";
import { homePath, panePath, settingsPath, spacePath } from "@/lib/nav";
import { paneDisplayName, STATUS_LABEL } from "@/lib/types";
import type { AgentView } from "@/lib/types";

function threadLabel(pane: AgentView): string {
  return pane.paneLabel || pane.sessionName || pane.tabLabel || pane.terminalTitle || paneDisplayName(pane);
}

// Layout adapted from T3 Code AppSidebarLayout / SidebarChrome at 191a4ef.
// Routing, session selection and pane lifecycle remain owned by Nenu.
export function WorkbenchShell({ data, children }: { data: HomeData; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarId = useId();
  const expandButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const wasCollapsed = useRef(false);
  useEffect(() => {
    if (collapsed) expandButton.current?.focus({ preventScroll: true });
    else if (wasCollapsed.current) collapseButton.current?.focus({ preventScroll: true });
    wasCollapsed.current = collapsed;
  }, [collapsed]);
  const location = useLocation();
  // A new route closes the drawer synchronously, including browser Back/Forward.
  const [drawerLocation, setDrawerLocation] = useState(location.key);
  if (drawerLocation !== location.key) {
    setDrawerLocation(location.key);
    if (mobileOpen) setMobileOpen(false);
  }

  return (
    <div className="workbench-shell" data-sidebar-collapsed={collapsed}>
      <aside id={sidebarId} className="workbench-sidebar" aria-label="Workspace sidebar">
        <div className="workbench-brand-row">
          <Link to={homePath(data.session)} className="workbench-brand">
            <img src="/nenu-mark.png" alt="" width="22" height="22" className="nenu-mark" />
            <span>Nenu <span className="font-normal text-muted-foreground">Code</span></span>
          </Link>
          <button ref={collapseButton} type="button" className="workbench-icon-button" aria-label="Collapse sidebar" aria-expanded={!collapsed} aria-controls={sidebarId} onClick={() => setCollapsed(true)}>
            <PanelLeft aria-hidden="true" size={17} />
          </button>
        </div>
        <WorkspaceNavigation data={data} />
      </aside>

      {collapsed && <div className="workbench-sidebar-rail">
        <button ref={expandButton} type="button" className="workbench-expand workbench-icon-button" aria-label="Expand sidebar" aria-expanded="false" aria-controls={sidebarId} onClick={() => setCollapsed(false)}><PanelLeft aria-hidden="true" size={18} /></button>
      </div>}

      <div className="workbench-main">
        <div className="workbench-mobile-bar">
          <button type="button" className="workbench-icon-button" aria-label="Open workspaces" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
            <PanelLeft aria-hidden="true" size={18} />
          </button>
          <Link to={homePath(data.session)} className="workbench-brand">
            <img src="/nenu-mark.png" alt="" width="22" height="22" className="nenu-mark" />
            <span>Nenu <span className="font-normal text-muted-foreground">Code</span></span>
          </Link>
          <SessionSwitcher sessions={data.sessions ?? []} current={data.session} />
        </div>
        {children}
      </div>

      <BottomSheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Workspaces">
        <WorkspaceNavigation data={data} onNavigate={() => setMobileOpen(false)} />
      </BottomSheet>
    </div>
  );
}

function WorkspaceNavigation({ data, onNavigate }: { data: HomeData; onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const { paneId, spaceId } = useParams();
  const needle = query.trim().toLocaleLowerCase();
  const panes = [...data.agents, ...data.shellPanes];
  const groups = data.workspaces.map((space) => ({
    ...space,
    panes: panes.filter((pane) => pane.workspaceId === space.workspaceId &&
      (!needle || `${space.label} ${threadLabel(pane)} ${pane.cwd} ${pane.agent}`.toLocaleLowerCase().includes(needle))),
  })).filter((space) => !needle || space.panes.length > 0 || space.label.toLocaleLowerCase().includes(needle));

  return (
    <nav className="workbench-navigation" aria-label="Projects and agents">
      <div className="workbench-nav-top">
        <Link className="workbench-nav-action" to={homePath(data.session)} onClick={onNavigate}><House aria-hidden="true" size={16} />Overview</Link>
        <label className="workbench-search">
          <Search aria-hidden="true" size={15} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads…" aria-label="Search projects and agents" />
        </label>
      </div>
      <div className="workbench-projects">
        <div className="workbench-section-label">Projects <span>{data.workspaces.length}</span></div>
        {groups.map((space) => (
          <section className="workbench-project" key={space.workspaceId}>
            <Link className="workbench-project-title" to={spacePath(space.workspaceId, data.session)} onClick={onNavigate} aria-current={spaceId === space.workspaceId ? "page" : undefined}>
              <Folder aria-hidden="true" size={15} /><span>{space.label || `Workspace ${space.number}`}</span><span className="workbench-count" aria-hidden="true">{space.panes.length}</span>
            </Link>
            {space.panes.map((pane) => (
              <Link key={pane.paneId} className="workbench-thread" to={panePath(pane.paneId, data.session)} onClick={onNavigate} aria-current={paneId === pane.paneId ? "page" : undefined} title={`${threadLabel(pane)} · ${pane.agent} · ${STATUS_LABEL[pane.status]}`}>
                {pane.kind === "shell" ? <Terminal aria-hidden="true" size={13} /> : <span className="workbench-status-dot" data-status={pane.status} aria-hidden="true" />}
                <span className="workbench-thread-name">{threadLabel(pane)}</span>
                <span className="sr-only"> · {STATUS_LABEL[pane.status]}</span>
              </Link>
            ))}
            {space.panes.length === 0 && <div className="workbench-empty-project">No active threads</div>}
          </section>
        ))}
        {groups.length === 0 && <p className="workbench-empty-project">{needle ? "No matching threads" : "Your Herdr workspaces will appear here."}</p>}
      </div>
      <div className="workbench-sidebar-footer">
        <SessionSwitcher sessions={data.sessions ?? []} current={data.session} />
        <Link className="workbench-nav-action" to={settingsPath(data.session)} onClick={onNavigate}><Settings aria-hidden="true" size={16} />Settings</Link>
      </div>
    </nav>
  );
}
