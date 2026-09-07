import type { MenuBlock } from "./blocks";
import { parseNativeModelMenu } from "./native-model-menu";

const MAX_SCOPES = 8;
const TTL_MS = 15 * 60 * 1000;

export function isCacheableModelMenu(block: MenuBlock | undefined): block is MenuBlock {
  return !!block && parseNativeModelMenu(block.menu, block.lines)?.kind === "model";
}

// Copy only the menu payload. Never retain the pane, its output, or conversation history.
function copyMenu(block: MenuBlock): MenuBlock {
  return {
    kind: "menu",
    menu: {
      title: block.menu.title,
      signature: block.menu.signature,
      actions: block.menu.actions.map((action) => ({ ...action, keys: [...action.keys] })),
      nav: {
        ...block.menu.nav,
        ...(block.menu.nav.leftRight ? { leftRight: { ...block.menu.nav.leftRight } } : {}),
      },
    },
    lines: block.lines.map((line) => ({
      ...(line.noWrap ? { noWrap: true as const } : {}),
      segments: line.segments.map((segment) => ({ ...segment, style: { ...segment.style } })),
    })),
  };
}

/** Display-only snapshots: cached signatures must never authorize terminal actions. */
export function createModelMenuCache(now: () => number = Date.now) {
  const entries = new Map<string, { block: MenuBlock; observedAt: number }>();
  return {
    get(scope: string): MenuBlock | null {
      const entry = entries.get(scope);
      return entry && now() - entry.observedAt < TTL_MS ? entry.block : null;
    },
    remember(scope: string, block: MenuBlock | undefined): void {
      if (!scope || !isCacheableModelMenu(block)) return;
      const observedAt = now();
      for (const [key, entry] of entries) {
        if (observedAt - entry.observedAt >= TTL_MS) entries.delete(key);
      }
      // Updating an observed scope moves it to the newest position. Reads never extend TTL.
      entries.delete(scope);
      entries.set(scope, { block: copyMenu(block), observedAt });
      if (entries.size > MAX_SCOPES) entries.delete(entries.keys().next().value!);
    },
  };
}
