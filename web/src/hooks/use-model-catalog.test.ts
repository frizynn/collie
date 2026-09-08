import { act, renderHook, waitFor } from "@testing-library/react";
import { fetchModelCatalog } from "@/lib/api";
import { parseAnsi } from "@/lib/ansi";
import { splitLines, type MenuBlock } from "@/lib/blocks";
import { useModelCatalog } from "./use-model-catalog";

vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  fetchModelCatalog: vi.fn(),
}));

const fetchMock = vi.mocked(fetchModelCatalog);
const key = "collie.model-catalog.v2";
const options = { paneId: "w1:p1", session: "one", agent: "claude", enabled: true };
const scope = (value = options) => JSON.stringify([value.paneId, value.session, value.agent]);
const rows = [{ name: "Model A", description: "Available candidate" }];
const live: MenuBlock = {
  kind: "menu",
  menu: { title: "Select model", signature: "native", actions: [{ label: "Apply", keys: ["Enter"] }], nav: { upDown: true } },
  lines: splitLines(parseAnsi("❯ 1. Native A\n  2. Native B")),
};
type Response = Awaited<ReturnType<typeof fetchModelCatalog>>;
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ available: false, models: [] });
});

it("preloads once on mount and does not request again during local popup re-renders", async () => {
  fetchMock.mockResolvedValue({ available: true, models: rows });
  const { result, rerender } = renderHook(({ open: _open }) => useModelCatalog({ ...options }), { initialProps: { open: false } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual(rows);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(options.paneId, options.session, expect.any(AbortSignal));
  rerender({ open: true });
  rerender({ open: false });
  rerender({ open: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rehydrates a saved catalog immediately after remount, isolated by pane/session/agent", async () => {
  fetchMock.mockResolvedValueOnce({ available: true, models: rows });
  const first = renderHook(() => useModelCatalog(options));
  await waitFor(() => expect(first.result.current.rows).toEqual(rows));
  first.unmount();
  const pending = deferred();
  fetchMock.mockReturnValue(pending.promise);
  const second = renderHook((props) => useModelCatalog(props), { initialProps: options });
  expect(second.result.current.rows).toEqual(rows);
  expect(second.result.current.loading).toBe(true);
  for (const changed of [{ session: "two" }, { paneId: "w1:p2" }, { agent: "codex" }]) {
    second.rerender({ ...options, ...changed });
    expect(second.result.current.rows).toEqual([]);
  }
  second.rerender(options);
  expect(second.result.current.rows).toEqual(rows);
  second.unmount();
});

it("keeps observed native rows over late backend candidates, including persistence", async () => {
  const pending = deferred();
  fetchMock.mockReturnValue(pending.promise);
  const initialProps: typeof options & { live?: MenuBlock } = options;
  const { result, rerender } = renderHook((props) => useModelCatalog(props), { initialProps });
  rerender({ ...options, live });
  const nativeRows = [{ name: "Native A", description: "" }, { name: "Native B", description: "" }];
  expect(result.current.rows).toEqual(nativeRows);
  await act(async () => pending.resolve({ available: true, models: rows }));
  rerender(options);
  expect(result.current.rows).toEqual(nativeRows);
  expect(JSON.parse(localStorage.getItem(key)!)[0].rows).toEqual(nativeRows);
  expect(result.current.loading).toBe(false);
});

it("replaces pre-fix cache labels with canonical Codex slugs and reopens them synchronously", async () => {
  const codex = { ...options, agent: "codex" };
  localStorage.setItem("collie.model-catalog.v1", JSON.stringify([{ scope: scope(codex), at: Date.now(),
    rows: [{ name: "gpt-6-astra (default)", description: "Most capable model" }] }]));
  const pending = deferred();
  fetchMock.mockReturnValue(pending.promise);
  const initialProps: typeof codex & { live?: MenuBlock } = codex;
  const first = renderHook((props) => useModelCatalog(props), { initialProps });
  expect(first.result.current.rows).toEqual([]);
  first.rerender({ ...codex, live: { ...live, menu: { ...live.menu, title: "Select Model and Effort" },
    lines: splitLines(parseAnsi("  1. gpt-6-astra (default)  Most capable model\n› 2. gpt-5.6-sol (current)  Everyday tasks")) } });
  expect(first.result.current.rows.map((row) => row.name)).toEqual(["gpt-6-astra", "gpt-5.6-sol"]);
  first.unmount();
  const next = renderHook(() => useModelCatalog(codex));
  expect(next.result.current.rows.map((row) => row.name)).toEqual(["gpt-6-astra", "gpt-5.6-sol"]);
  next.unmount();
});

it("aborts superseded scopes and ignores their late results without caching them", async () => {
  const first = deferred();
  const second = deferred();
  fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result, rerender, unmount } = renderHook((props) => useModelCatalog(props), { initialProps: options });
  const firstSignal = fetchMock.mock.calls[0]![2]!;
  rerender({ ...options, session: "two" });
  expect(firstSignal.aborted).toBe(true);
  await act(async () => first.resolve({ available: true, models: rows }));
  expect(result.current.rows).toEqual([]);
  expect(result.current.loading).toBe(true);
  expect(localStorage.getItem(key)).toBeNull();
  await act(async () => second.resolve({ available: true, models: [{ name: "Session two", description: "" }] }));
  expect(result.current.rows[0]?.name).toBe("Session two");
  expect(JSON.parse(localStorage.getItem(key)!)).toHaveLength(1);
  const secondSignal = fetchMock.mock.calls[1]![2]!;
  unmount();
  expect(secondSignal.aborted).toBe(true);
});

it.each([
  ["empty rows", []],
  ["duplicate model names", [...rows, ...rows]],
  ["too many models", Array.from({ length: 101 }, (_, i) => ({ name: `Model ${i}`, description: "" }))],
  ["oversized model name", [{ name: "x".repeat(161), description: "" }]],
  ["oversized description", [{ name: "A", description: "x".repeat(601) }]],
  ["missing description", [{ name: "A" }]],
  ["invalid name", [{ name: 1, description: "" }]],
  ["nonobject rows", [null]],
])("rejects persisted %s", (_label, badRows) => {
  localStorage.setItem(key, JSON.stringify([{ scope: scope(), at: Date.now(), rows: badRows }]));
  const { result } = renderHook(() => useModelCatalog({ ...options, enabled: false }));
  expect(result.current.rows).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ["expired", -24 * 60 * 60 * 1000],
  ["future", 60_000],
])("rejects %s persisted timestamps", (_label, offset) => {
  localStorage.setItem(key, JSON.stringify([{ scope: scope(), at: Date.now() + Number(offset), rows }]));
  const { result } = renderHook(() => useModelCatalog({ ...options, enabled: false }));
  expect(result.current.rows).toEqual([]);
});

it.each(["{broken json", "{}", " ".repeat(100_001)])("ignores malformed or oversized storage payload %#", (raw) => {
  localStorage.setItem(key, raw);
  const { result } = renderHook(() => useModelCatalog({ ...options, enabled: false }));
  expect(result.current.rows).toEqual([]);
});

it("rehydrates only the latest eight saved scopes", () => {
  localStorage.setItem(key, JSON.stringify(Array.from({ length: 9 }, (_, i) => ({
    scope: scope({ ...options, session: String(i) }), at: Date.now(), rows,
  }))));
  const { result, rerender } = renderHook((props) => useModelCatalog(props), { initialProps: { ...options, session: "0", enabled: false } });
  expect(result.current.rows).toEqual([]);
  rerender({ ...options, session: "8", enabled: false });
  expect(result.current.rows).toEqual(rows);
});

it("settles an unavailable cold catalog without fabricated options or persistence", async () => {
  const { result } = renderHook(() => useModelCatalog(options));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rows).toEqual([]);
  expect(localStorage.getItem(key)).toBeNull();
});
