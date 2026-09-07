import { useEffect, useMemo, useRef, useState } from "react";
import { fetchModelCatalog } from "@/lib/api";
import { parseNativeModelMenu } from "@/lib/native-model-menu";
import type { MenuBlock } from "@/lib/blocks";

export interface ModelCatalogRow { name: string; description: string }
const KEY = "collie.model-catalog.v1";
const TTL = 24 * 60 * 60 * 1000;
type Entry = { scope: string; at: number; rows: ModelCatalogRow[] };
function validRows(value: unknown): value is ModelCatalogRow[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((row) =>
    row && typeof row.name === "string" && row.name.length > 0 && row.name.length <= 160 &&
    typeof row.description === "string" && row.description.length <= 600,
  ) && new Set(value.map((row) => row.name)).size === value.length;
}
function readEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 100_000) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is Entry =>
      entry && typeof entry.scope === "string" && typeof entry.at === "number" &&
      Date.now() >= entry.at && Date.now() - entry.at < TTL && validRows(entry.rows),
    ).slice(-8) : [];
  } catch { return []; }
}
function remember(scope: string, rows: ModelCatalogRow[]) {
  if (!validRows(rows)) return;
  try {
    const entries = [...readEntries().filter((entry) => entry.scope !== scope), { scope, at: Date.now(), rows }].slice(-8);
    while (entries.length > 1 && JSON.stringify(entries).length > 100_000) entries.shift();
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch { /* Private mode / quota: memory state still works. */ }
}

/** Preload read-only candidates on entry; a saved catalogue opens synchronously after reload. */
export function useModelCatalog(options: { paneId: string; session?: string; agent?: string; live?: MenuBlock; enabled: boolean }) {
  const scope = JSON.stringify([options.paneId, options.session, options.agent]);
  const [catalog, setCatalog] = useState<Entry | null>(() => readEntries().find((entry) => entry.scope === scope) ?? null);
  const [loadingScope, setLoadingScope] = useState<string | null>(null);
  const observed = useMemo(() => {
    if (!options.live) return null;
    const parsed = parseNativeModelMenu(options.live.menu, options.live.lines);
    return parsed?.kind === "model" ? parsed.rows.map(({ name, description }) => ({ name, description })) : null;
  }, [options.live]);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    setCatalog(readEntries().find((entry) => entry.scope === scope) ?? null);
    if (!options.enabled) { setLoadingScope(null); return; }
    setLoadingScope(scope);
    void fetchModelCatalog(options.paneId, options.session, controller.signal).then((result) => {
      if (controller.signal.aborted || generation.current !== request || !result.available || !validRows(result.models)) return;
      remember(scope, result.models);
      setCatalog({ scope, at: Date.now(), rows: result.models });
    }).catch(() => { /* Existing candidates remain usable; Apply always verifies against the CLI. */ })
      .finally(() => { if (!controller.signal.aborted) setLoadingScope((value) => value === scope ? null : value); });
    return () => controller.abort();
  }, [scope, options.enabled, options.paneId, options.session]);
  useEffect(() => {
    if (!observed) return;
    generation.current++;
    remember(scope, observed);
    setCatalog({ scope, at: Date.now(), rows: observed });
  }, [scope, observed]);
  return { rows: observed ?? (catalog?.scope === scope ? catalog.rows : []), loading: loadingScope === scope };
}
