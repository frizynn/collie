import { fireEvent, render, screen } from "@testing-library/react";
import { WorkbenchTelemetry } from "./workbench-telemetry";

it("leaves unreported context and limits unknown", () => {
  render(<WorkbenchTelemetry modelAvailable={false} disabled={false} onChooseModel={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Choose model" })).toBeDisabled();
  fireEvent.click(screen.getByText("Usage"));
  expect(screen.getByText("Account limits not reported by this agent.")).toBeVisible();
  expect(screen.getByText("Tokens not reported")).toBeVisible();
  expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
});

it("distinguishes last-message totals from context and flags stale or clipped metrics", () => {
  render(<WorkbenchTelemetry modelAvailable disabled={false} stale onChooseModel={vi.fn()}
    telemetry={{ source: "journal", model: "reported-model", tokens: { scope: "last-message", input: 100, output: 20, total: 120 }, context: { usedTokens: 100 }, fileTruncated: true }} />);
  fireEvent.click(screen.getByText("Usage · stale"));
  expect(screen.getByText("Last message")).toBeVisible();
  expect(screen.getByText(/values may be out of date/)).toBeVisible();
  expect(screen.getByText(/Only the tail/)).toBeVisible();
});

it("keeps a disabled model control from initiating a terminal action", () => {
  const choose = vi.fn();
  render(<WorkbenchTelemetry modelAvailable disabled onChooseModel={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
  expect(choose).not.toHaveBeenCalled();
});
