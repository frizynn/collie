import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseAnsi } from "@/lib/ansi";
import { splitLines } from "@/lib/blocks";
import { claudeBuildBlocks } from "@/lib/harness/claude";
import { detectModelMenuRegion } from "@/lib/harness/codex/model-menu";
import { MenuBlock } from "./menu-block";

function claudeMenu() {
  const lines = splitLines(parseAnsi(readFileSync(join(import.meta.dirname, "../fixtures/panes/claude--menu-model-picker-moved.txt"), "utf8")));
  const block = claudeBuildBlocks(lines).find((block) => block.kind === "menu");
  if (!block || block.kind !== "menu") throw new Error("Missing model menu fixture");
  return block;
}

it("renders native model rows without terminal frames and moves with a full freshness guard", async () => {
  const block = claudeMenu();
  const onAction = vi.fn();
  const { container } = render(<MenuBlock menu={block.menu} lines={block.lines} onAction={onAction} />);
  expect(container.querySelector("pre")).toBeNull();
  expect(screen.getAllByRole("radio")).toHaveLength(5);
  expect(screen.getByRole("radio", { name: /Fable/ })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: /Default.*Current/ })).toHaveAttribute("aria-checked", "false");
  await userEvent.click(screen.getByRole("radio", { name: /Haiku/ }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith({ keys: ["Down", "Down"], nav: false });
  expect(screen.getByRole("radio", { name: /Fable/ })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText("Medium")).toBeInTheDocument();
});

it("keeps applying the session/default choice explicit and never sends digits", async () => {
  const block = claudeMenu();
  const onAction = vi.fn();
  render(<MenuBlock menu={block.menu} lines={block.lines} onAction={onAction} />);
  await userEvent.click(screen.getByRole("radio", { name: /Fable/ }));
  expect(onAction).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Use this session only" }));
  expect(onAction).toHaveBeenLastCalledWith({ keys: ["s"], nav: false });
  await userEvent.click(screen.getByRole("button", { name: "Set as default" }));
  expect(onAction).toHaveBeenLastCalledWith({ keys: ["Enter"], nav: false });
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onAction).toHaveBeenLastCalledWith({ keys: ["Escape"], nav: false });
});

it("renders Codex reasoning as native choices and confirms only on the footer button", async () => {
  const lines = splitLines(parseAnsi(readFileSync(join(import.meta.dirname, "../lib/harness/codex/fixtures/model-reasoning.txt"), "utf8")));
  const detected = detectModelMenuRegion(lines)!;
  const onAction = vi.fn();
  const { container } = render(<MenuBlock menu={detected.model} lines={lines} onAction={onAction} />);
  expect(container.querySelector("pre")).toBeNull();
  await userEvent.click(screen.getByRole("radio", { name: /^High$/ }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith({ keys: ["Down", "Down"], nav: false });
  await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(onAction).toHaveBeenLastCalledWith({ keys: ["Enter"], nav: false });
});

it("disables every model and footer action for a read-only pane", () => {
  const block = claudeMenu();
  render(<MenuBlock menu={block.menu} lines={block.lines} onAction={vi.fn()} disabled />);
  for (const element of [...screen.getAllByRole("radio"), ...screen.getAllByRole("button")]) expect(element).toBeDisabled();
});
