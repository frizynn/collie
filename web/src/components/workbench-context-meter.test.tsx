import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkbenchContextMeter } from "./workbench-context-meter";

it("does not represent missing measurements as zero context usage", async () => {
  render(<WorkbenchContextMeter usedTokens={null} maxTokens={null} />);
  await userEvent.click(screen.getByRole("button", { name: "Context usage: Unknown" }));
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByText("Unknown / Unknown")).toBeInTheDocument();
});

it("bounds the ring when the reported usage exceeds the window", async () => {
  render(<WorkbenchContextMeter usedTokens={250_000} maxTokens={200_000} />);
  await userEvent.click(screen.getByRole("button", { name: "Context window 100% used" }));
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("250k / 200k")).toBeInTheDocument();
});
