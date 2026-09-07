import { render, screen } from "@testing-library/react";
import { parseAnsi } from "@/lib/ansi";
import { splitLines, type MenuModel } from "@/lib/blocks";
import { NativeMenuContent } from "./native-menu-content";

const menu: MenuModel = {
  title: "Review changes", signature: "screen", nav: { upDown: true },
  actions: [{ label: "Apply", keys: ["Enter"] }, { label: "Cancel", keys: ["Escape"], cancel: true }],
};

it("retains the subject and command context as native text without inventing clickable options", () => {
  const lines = splitLines(parseAnsi("▔▔▔▔▔▔\nReview changes\nThis affects production settings.\n  config: { enabled: false }\n❯ 1. Keep settings  Leave the current value\n  2. Apply settings  Change the saved value\nEnter to apply · Esc to cancel\n▔▔▔▔▔▔"));
  const { container } = render(<NativeMenuContent menu={menu} lines={lines} />);
  expect(container.querySelector("pre")).toBeNull();
  expect(container.textContent).not.toContain("▔");
  expect(screen.getByText("This affects production settings.")).toBeInTheDocument();
  expect(screen.getByText("config: { enabled: false }").textContent).toBe("  config: { enabled: false }");
  expect(screen.getByText("Leave the current value")).toBeInTheDocument();
  expect(screen.getByLabelText("Highlighted")).toBeInTheDocument();
  expect(screen.queryByText("Enter to apply · Esc to cancel")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});

it("retains unsupported footer hints and treats embedded markup as literal text", () => {
  const footer = "Enter to apply · 1 to save permanently · Esc to cancel";
  const lines = splitLines(parseAnsi(`Review changes\n<img src=x onerror=alert(1)>\n${footer}`));
  const { container } = render(<NativeMenuContent menu={menu} lines={lines} />);
  expect(screen.getByText(footer)).toBeInTheDocument();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
});
