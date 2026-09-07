import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseAnsi } from "@/lib/ansi";
import { splitLines, type PromptModel } from "@/lib/blocks";
import { adapterFor } from "@/lib/harness";
import { PromptSelectBlock } from "./prompt-select-block";
import { promptRequestContext } from "./prompt-request-context";

function fixture(name: string, agent: string): PromptModel {
  const text = readFileSync(join(import.meta.dirname, "..", "fixtures", "panes", name), "utf8");
  const block = adapterFor(agent)!.buildBlocks(splitLines(parseAnsi(text))).find((b) => b.kind === "prompt-select");
  if (block?.kind !== "prompt-select") throw Error("Missing fixture prompt");
  return block.prompt;
}

describe("native approval request context", () => {
  it("retains the Codex command, environment, and reason alongside native approve/reject choices", () => {
    const prompt = fixture("codex--approval-exec.txt", "codex");
    const { container } = render(<PromptSelectBlock prompt={prompt} onAction={vi.fn()} />);
    const context = screen.getByLabelText("Request details");
    expect(context).toHaveTextContent("Environment: local");
    expect(context).toHaveTextContent("Reason: Do you want to allow creating /tmp/collie-codex-probe.txt outside the sandbox?");
    expect(context).toHaveTextContent("$ touch /tmp/collie-codex-probe.txt");
    expect(context).not.toHaveTextContent("1. Yes");
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.getByRole("button", { name: /Yes, proceed/ })).toBeInTheDocument();
  });

  it("preserves the Claude approval subject that previously lived only above the raw dialog", () => {
    const prompt = fixture("claude--permission-bash.txt", "claude");
    render(<PromptSelectBlock prompt={prompt} onAction={vi.fn()} />);
    expect(screen.getByLabelText("Request details")).toHaveTextContent("mkfifo fixture-fifo");
    expect(screen.getByLabelText("Request details")).toHaveTextContent("Create a named pipe (FIFO)");
    expect(screen.getByText(prompt.question)).toBeInTheDocument();
  });

  it("retains exact diff lines and escapes markup while removing only owned chrome", () => {
    const prompt = fixture("claude--permission-bash.txt", "claude");
    const diff = "- old line\n+ <img src=x onerror=bad>\n    preserve indentation";
    const model = { ...prompt, signature: `──────\n${diff}\n${prompt.question}\n  1. ${prompt.options[0]!.label}\n  2. No` };
    const { container } = render(<PromptSelectBlock prompt={model} onAction={vi.fn()} />);
    expect(promptRequestContext(model)).toBe(diff);
    expect(screen.getByLabelText("Request details").textContent).toContain(diff);
    expect(container.querySelector("img")).toBeNull();
  });

  it("does not silently discard signed content when an unfamiliar option shape appears", () => {
    const prompt = fixture("claude--permission-bash.txt", "claude");
    const model = { ...prompt, signature: "Command: inspect example\n[a] Approve" };
    expect(promptRequestContext(model)).toBe(model.signature);
  });
});
