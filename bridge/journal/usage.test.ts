import { describe, expect, test } from "bun:test";
import { parseClaudeUsage, parseCodexUsage } from "./usage.ts";

const log = (...rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join("\n");
const date = "2026-09-07T11:00:00Z";
const event = (payload: unknown) => ({ type: "event_msg", timestamp: date, payload });
const codexUsage = {
  type: "token_count",
  info: {
    total_token_usage: { input_tokens: 20000, cached_input_tokens: 16000, output_tokens: 3000, total_tokens: 23000 },
    last_token_usage: { input_tokens: 4000, output_tokens: 500, total_tokens: 4500 },
    model_context_window: 258400,
  },
  rate_limits: { primary: { used_percent: 59, window_minutes: 10080, resets_at: 1789121696 } },
};
const claude = (usage: unknown, extra = {}) => ({
  type: "assistant", timestamp: date,
  message: { id: "same-api-message", model: "claude-example", usage }, ...extra,
});

describe("journal usage", () => {
  test("Codex separates cumulative tokens, current context, and provider limits", () => {
    const usage = parseCodexUsage(log(
      { type: "turn_context", timestamp: date, payload: { model: "gpt-example", effort: "high" } },
      event(codexUsage), event(codexUsage),
    ));
    expect(usage).toEqual({
      source: "journal", observedAt: date, model: "gpt-example", effort: "high",
      tokens: { scope: "session", input: 20000, cachedInput: 16000, output: 3000, total: 23000 },
      context: { usedTokens: 4500, windowTokens: 258400 },
      rateLimits: [{ name: "primary", usedPercent: 59, windowMinutes: 10080, resetsAt: 1789121696 }],
    });
  });

  test("malformed, partial, and absent metrics never become zero or invented limits", () => {
    expect(parseCodexUsage('null\n{}\n{"type":')).toBeUndefined();
    expect(parseCodexUsage(log(event({ type: "token_count", info: { total_token_usage: { total_tokens: -1 }, model_context_window: 0 } })))).toBeUndefined();
    expect(parseClaudeUsage(log(claude({ input_tokens: "100", output_tokens: -1 })))).toEqual({ source: "journal", model: "claude-example", observedAt: date });
  });

  test("tail-capped Codex log can report metrics without a model and refreshed null limits clear stale limits", () => {
    const usage = parseCodexUsage(log(event(codexUsage), event({ type: "token_count", rate_limits: null })));
    expect(usage?.model).toBeUndefined();
    expect(usage?.rateLimits).toBeUndefined();
    expect(usage?.tokens?.total).toBe(23000);
  });

  test("a model switch drops the previous model's context capacity", () => {
    const usage = parseCodexUsage(log(
      { type: "turn_context", payload: { model: "one" } }, event(codexUsage),
      { type: "turn_context", payload: { model: "two", effort: "low" } },
    ));
    expect(usage?.model).toBe("two");
    expect(usage?.context).toBeUndefined();
    expect(usage?.tokens?.total).toBe(23000);
  });

  test("Claude includes both cache categories and reports the last message, never a duplicate sum", () => {
    const row = claude({ input_tokens: 2, cache_read_input_tokens: 4260, cache_creation_input_tokens: 10308, output_tokens: 473 });
    const usage = parseClaudeUsage(log(row, row, claude({ output_tokens: 999 }, { isSidechain: true })));
    expect(usage?.tokens).toEqual({ scope: "last-message", input: 14570, cachedInput: 4260, output: 473, total: 15043 });
    expect(usage?.context).toEqual({ usedTokens: 14570 });
    expect(usage?.rateLimits).toBeUndefined();
  });

  test("Claude incomplete cache accounting does not pretend to know context usage", () => {
    const usage = parseClaudeUsage(log(claude({ input_tokens: 2, output_tokens: 15 })));
    expect(usage?.context).toBeUndefined();
    expect(usage?.tokens?.total).toBeUndefined();
    expect(usage?.tokens?.output).toBe(15);
  });
});
