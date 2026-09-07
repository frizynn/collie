import { describe, expect, test } from "bun:test";
import { parseCodexTranscript } from "./codex.ts";
import { parseClaudeTranscript } from "./claude.ts";
import { pageEntries } from "./store.ts";

const jsonl = (...rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join("\n");
const cx = (type: string, payload: unknown) => ({ type, timestamp: "2026-09-07T20:00:00.000Z", payload });
const speech = (role: string, text: string, phase?: string) => cx("response_item", { type: "message", role, content: [{ type: "text", text }], ...(phase ? { phase } : {}) });
const user = (uuid: string, extra = {}) => ({ type: "user", uuid, message: { content: "Actual human input" }, ...extra });
const assistant = (uuid: string, parentUuid: string, stop_reason: string | null, content: unknown[]) => ({ type: "assistant", uuid, parentUuid, timestamp: "2026-09-07T20:00:01.000Z", message: { stop_reason, content } });
const text = (value: string) => ({ type: "text", text: value });

describe("native Codex work turns", () => {
  test("groups work and final answer, preserves native duration and stable cursors through paging", () => {
    const rows = [
      cx("event_msg", { type: "task_started", turn_id: "turn-one", started_at: 1788815273 }),
      speech("user", "Question"), speech("assistant", "Working on it", "commentary"),
      cx("response_item", { type: "function_call", name: "read", call_id: "call-one", arguments: "{}" }),
      cx("response_item", { type: "function_call_output", call_id: "call-one", output: "Tool result" }),
      speech("assistant", "Final answer", "final_answer"),
      cx("event_msg", { type: "task_complete", turn_id: "turn-one", started_at: 1788815273, completed_at: 1788815277, duration_ms: 3477 }),
    ];
    const entries = parseCodexTranscript(jsonl(...rows));
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.turnId)).toEqual(Array(4).fill("turn-one"));
    expect(entries[1]!.phase).toBe("commentary");
    expect(entries[3]!.phase).toBe("final_answer");
    expect(entries[3]!.turn).toEqual({ status: "completed", startedAt: "2026-09-07T21:07:53.000Z", completedAt: "2026-09-07T21:07:57.000Z", durationMs: 3477 });
    expect(entries[2]!.parts[0]).toMatchObject({ kind: "tool", result: { text: "Tool result" } });
    const newest = pageEntries(entries, { limit: 1 }).window[0]!;
    expect(newest.turnId).toBe("turn-one");
    expect(newest.uuid).toBe(parseCodexTranscript(jsonl(...rows.slice(1))).at(-1)!.uuid);
    expect(pageEntries(entries, { limit: 2, before: newest.uuid }).window.every((entry) => entry.turnId === newest.turnId)).toBe(true);
  });
  test("a pending native turn is running, while unknown timing and orphan completion stay absent", () => {
    const rows = [cx("turn_context", { turn_id: "tail-turn" }), speech("assistant", "Working", "commentary")];
    expect(parseCodexTranscript(jsonl(...rows))[0]!.turn).toEqual({ status: "running" });
    const entries = parseCodexTranscript(jsonl(speech("assistant", "No start retained", "final_answer"), cx("event_msg", { type: "task_complete", turn_id: "unknown", duration_ms: 30 })));
    expect(entries[0]!.turnId).toBeUndefined();
    expect(entries[0]!.phase).toBe("final_answer");
  });
  test("completion cannot leak to a different turn and invalid durations are never inferred", () => {
    const entries = parseCodexTranscript(jsonl(
      cx("event_msg", { type: "task_started", turn_id: "old", started_at: -3 }), speech("assistant", "Old work"),
      cx("event_msg", { type: "task_started", turn_id: "new" }), speech("assistant", "New work"),
      cx("event_msg", { type: "task_complete", turn_id: "old", duration_ms: -1 }),
      speech("assistant", "Still new"), cx("event_msg", { type: "turn_aborted", turn_id: "new" }),
    ));
    expect(entries[0]!.turn).toEqual({ status: "completed" });
    expect(entries.slice(1).every((entry) => entry.turnId === "new" && entry.turn?.status === "aborted")).toBe(true);
  });
});

describe("native Claude work turns", () => {
  test("a new response after a final creates a continuation group and preserves the earlier duration", () => {
    const entries = parseClaudeTranscript(jsonl(
      user("human"), assistant("first-final", "human", "end_turn", [text("First complete answer")]),
      assistant("continuation-work", "first-final", "tool_use", [{ type: "tool_use", id: "continued-tool", name: "Read", input: {} }]),
      { type: "system", subtype: "turn_duration", parentUuid: "first-final", durationMs: 1234 },
      { type: "user", uuid: "continued-result", parentUuid: "continuation-work", message: { content: [{ type: "tool_result", tool_use_id: "continued-tool", content: "Output" }] } },
      assistant("second-final", "continued-result", "end_turn", [text("Second complete answer")]),
      { type: "system", subtype: "turn_duration", parentUuid: "second-final", durationMs: 678 },
    ));
    expect(entries[1]).toMatchObject({ phase: "final_answer", turnId: "cl-human", turn: { status: "completed", durationMs: 1234 } });
    expect(entries[2]).toMatchObject({ turnId: "cl-continuation-work", turn: { status: "completed", durationMs: 678 } });
    expect(entries[2]!.parts[0]).toMatchObject({ kind: "tool", result: { text: "Output" } });
    expect(entries[3]).toMatchObject({ phase: "final_answer", turnId: "cl-continuation-work", turn: { durationMs: 678 } });
  });
  test("consecutive distinct finals are separate, while duplicate UUIDs stay in their original group", () => {
    const first = assistant("first", "human", "end_turn", [text("First answer")]);
    const entries = parseClaudeTranscript(jsonl(user("human"), first,
      assistant("second", "first", "end_turn", [text("Second answer")]), first,
      { type: "system", subtype: "turn_duration", parentUuid: "first", durationMs: 123 },
    ));
    expect(entries.map((entry) => entry.turnId)).toEqual(["cl-human", "cl-human", "cl-second", "cl-human"]);
    expect(entries[1]!.turn?.durationMs).toBe(123);
    expect(entries[2]!.turn?.durationMs).toBeUndefined();
  });
  test("distinct row UUIDs from the same API response keep thinking and final chunks together", () => {
    const thinking = assistant("thinking-chunk", "human", "end_turn", [{ type: "thinking", thinking: "Persisted summary" }]);
    const final = assistant("final-chunk", "thinking-chunk", "end_turn", [text("Final answer")]);
    const entries = parseClaudeTranscript(jsonl(user("human"),
      { ...thinking, message: { ...thinking.message, id: "msg_response" } },
      { ...final, message: { ...final.message, id: "msg_response" } },
      assistant("next-response", "final-chunk", "end_turn", [text("Next answer")]),
    ));
    expect(entries.map((entry) => entry.turnId)).toEqual(["cl-human", "cl-human", "cl-human", "cl-next-response"]);
    expect(entries[1]!.phase).toBeUndefined();
    expect(entries[2]!.phase).toBe("final_answer");
  });
  test("follows hidden tool-result parent links and attaches exact native duration to the final group", () => {
    const entries = parseClaudeTranscript(jsonl(
      user("human-one"),
      assistant("work-one", "human-one", "tool_use", [text("Checking"), { type: "tool_use", id: "tool-one", name: "Read", input: {} }]),
      { type: "user", uuid: "result-one", parentUuid: "work-one", message: { content: [{ type: "tool_result", tool_use_id: "tool-one", content: "Read output" }] } },
      assistant("final-one", "result-one", "end_turn", [text("Done")]),
      { type: "system", subtype: "turn_duration", parentUuid: "final-one", uuid: "duration-one", timestamp: "2026-09-07T20:00:03.000Z", durationMs: 14277 },
    ));
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.turnId)).toEqual(Array(3).fill("cl-human-one"));
    expect(entries[1]!.phase).toBe("commentary");
    expect(entries[2]!.phase).toBe("final_answer");
    expect(entries[2]!.turn).toEqual({ status: "completed", completedAt: "2026-09-07T20:00:03.000Z", durationMs: 14277 });
    expect(entries[1]!.parts[1]).toMatchObject({ kind: "tool", result: { text: "Read output" } });
    expect(pageEntries(entries, { limit: 1 }).window[0]!.turnId).toBe("cl-human-one");
  });
  test("a late duration follows its actual parent, without completing the next human turn", () => {
    const entries = parseClaudeTranscript(jsonl(
      user("first"), assistant("first-answer", "first", "end_turn", [text("First")]),
      user("second"), assistant("second-work", "second", "tool_use", [text("Still working")]),
      { type: "system", subtype: "turn_duration", parentUuid: "first-answer", durationMs: 600 },
      assistant("second-more", "second-work", "tool_use", [text("More work")]),
    ));
    expect(entries[1]!.turn?.durationMs).toBe(600);
    expect(entries.at(-1)!.turn).toEqual({ status: "running" });
    expect(entries.at(-1)!.turnId).toBe("cl-second");
  });
  test("does not invent completion, timing, or a group for a clipped human anchor", () => {
    const entries = parseClaudeTranscript(jsonl(
      assistant("orphan", "missing", "end_turn", [text("Final from clipped history")]),
      user("actual"), assistant("uncertain", "actual", null, [text("Unclassified")]),
      { type: "system", subtype: "turn_duration", parentUuid: "unknown", durationMs: 500 },
      { type: "system", subtype: "turn_duration", parentUuid: "uncertain", durationMs: -4 },
    ));
    expect(entries[0]!.phase).toBe("final_answer");
    expect(entries.every((entry) => entry.turn === undefined)).toBe(true);
    expect(entries[2]!.phase).toBeUndefined();
  });
  test("excludes sidechain duration and injected notes from the human grouping", () => {
    const entries = parseClaudeTranscript(jsonl(
      user("human"), assistant("work", "human", "tool_use", [text("Work")]),
      { type: "system", subtype: "turn_duration", parentUuid: "work", isSidechain: true, durationMs: 999 },
      user("notice", { parentUuid: "work", message: { content: "<task-notification><summary>Background finished</summary></task-notification>" } }),
    ));
    expect(entries[1]!.turn).toEqual({ status: "running" });
    expect(entries[2]!.role).toBe("note");
    expect(entries[2]!.turnId).toBeUndefined();
  });
});
