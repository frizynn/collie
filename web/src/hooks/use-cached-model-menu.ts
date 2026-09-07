import { useEffect, useMemo } from "react";
import type { MenuBlock } from "@/lib/blocks";
import { createModelMenuCache, isCacheableModelMenu } from "@/lib/model-menu-cache";

const modelMenus = createModelMenuCache();

/** Instant display of a previously observed catalog; callers must disable cached actions. */
export function useCachedModelMenu(scope: string, liveBlock: MenuBlock | undefined): MenuBlock | null {
  const recognized = useMemo(() => isCacheableModelMenu(liveBlock), [liveBlock]);
  useEffect(() => {
    if (recognized) modelMenus.remember(scope, liveBlock);
  }, [scope, liveBlock, recognized]);

  if (!scope) return null;
  return recognized ? liveBlock! : modelMenus.get(scope);
}
