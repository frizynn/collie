import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkbenchContextMeter } from "./workbench-context-meter";

it("does not represent missing measurements as zero context usage", async () => {
  render(<WorkbenchContextMeter usedTokens={null} maxTokens={null} />);
  await userEvent.click(screen.getByRole("button", { name: "Context usage: Unknown" }));
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByText("Context usage is not available yet.")).toBeInTheDocument();
  expect(screen.queryByText("Unknown / Unknown")).not.toBeInTheDocument();
});

it("bounds the ring when the reported usage exceeds the window", async () => {
  render(<WorkbenchContextMeter usedTokens={250_000} maxTokens={200_000} />);
  await userEvent.click(screen.getByRole("button", { name: "Context window 100% used" }));
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("250k / 200k")).toBeInTheDocument();
});


it("compacts only on the explicit native action and closes the context sheet", async () => {
  const compact = vi.fn();
  render(<WorkbenchContextMeter usedTokens={100} maxTokens={200} onCompact={compact} />);
  await userEvent.click(screen.getByRole("button", { name: "Context window 50% used" }));
  expect(compact).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Compact context" }));
  expect(compact).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
