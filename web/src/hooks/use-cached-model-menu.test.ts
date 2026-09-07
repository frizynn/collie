import { renderHook } from "@testing-library/react";
import { parseAnsi } from "@/lib/ansi";
import { splitLines, type MenuBlock } from "@/lib/blocks";
import { useCachedModelMenu } from "./use-cached-model-menu";

const live: MenuBlock = {
  kind: "menu",
  menu: { title: "Select model", signature: "live", actions: [{ label: "Confirm", keys: ["Enter"] }], nav: { upDown: true } },
  lines: splitLines(parseAnsi("❯ 1. Model A\n  2. Model B")),
};

it("returns live models immediately and same-scope cached rows across loading/remounts", () => {
  const { result, rerender, unmount } = renderHook(
    ({ scope, block }: { scope: string; block: MenuBlock | undefined }) => useCachedModelMenu(scope, block),
    { initialProps: { scope: "hook-session-a", block: live as MenuBlock | undefined } },
  );
  expect(result.current).toBe(live);
  rerender({ scope: "hook-session-a", block: undefined });
  expect(result.current).toEqual(live);
  expect(result.current).not.toBe(live);
  rerender({ scope: "hook-session-b", block: undefined });
  expect(result.current).toBeNull();
  rerender({ scope: "", block: live });
  expect(result.current).toBeNull();
  unmount();
  const reopened = renderHook(() => useCachedModelMenu("hook-session-a", undefined));
  expect(reopened.result.current).toEqual(live);
});
